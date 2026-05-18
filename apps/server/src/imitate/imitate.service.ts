import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.module';
import { fetchReferenceNote, RefNoteParsed } from './xhs-fetcher';
import { verticalKnowledge, personaBlock } from '../ai/prompts';

// Locked imitation prompt — uses the user's exact wording.
const IMITATE_INSTRUCTION = `帮我参考这条小红书，文案文字稍作修改表达一致意思，
城市、数字、运营商、套餐内容严格保持一致，
语气更口语自然，适合蓝 V 发布，
结尾简单引导咨询。`;

const HARD_OUTPUT = `【输出格式】
严格输出 JSON：{"title": "...", "body": "...", "hashtags": ["#...","#..."]}
不要解释、不要 Markdown、不要任何 JSON 之外的文字。`;

@Injectable()
export class ImitateService {
  private readonly log = new Logger('ImitateService');
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.anthropic = new Anthropic({ apiKey: cfg.get<string>('ANTHROPIC_API_KEY') ?? '' });
    this.model = cfg.get<string>('CLAUDE_MODEL') ?? 'claude-sonnet-4-6';
  }

  async parseUrl(url: string) {
    try {
      const parsed = await this.cacheGetOrFetch(url);
      const empty = !parsed.title && !parsed.body && parsed.images.length === 0;
      return {
        url: parsed.url,
        title: parsed.title,
        body: parsed.body,
        author: parsed.author,
        images: parsed.images.slice(0, 9),
        empty,
        hint: empty
          ? '页面 SSR 抓取受限，可能是私密笔记/视频/已下架。仿写仍可进行，AI 将以链接作为风格参考。'
          : undefined,
      };
    } catch (e) {
      throw new BadRequestException({ code: 40001, message: (e as Error).message });
    }
  }

  async *generate(input: {
    teamId: bigint;
    userId: bigint;
    url: string;
    accountId: bigint;
    extraInstruction?: string;
  }) {
    const account = await this.prisma.xhsAccount.findFirst({
      where: { id: input.accountId, teamId: input.teamId },
    });
    if (!account) throw new ForbiddenException({ code: 40301, message: '账号档案不属于当前团队' });

    const parsed = await this.cacheGetOrFetch(input.url);
    yield { type: 'parsed', ref: { title: parsed.title, body: parsed.body, images: parsed.images.slice(0, 9), author: parsed.author } };

    if (!parsed.body && !parsed.title) {
      throw new BadRequestException({ code: 40001, message: '参考帖无法解析正文（可能是私密或视频笔记）' });
    }

    const system = [
      { type: 'text' as const, text: '你是一位资深小红书内容编辑，擅长仿写。' },
      { type: 'text' as const, text: verticalKnowledge(account.vertical), cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: `【账号人设】\n${personaBlock(account.persona as Record<string, unknown>)}`, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: HARD_OUTPUT, cache_control: { type: 'ephemeral' as const } },
    ] as unknown as Anthropic.TextBlockParam[];

    const userMsg = [
      IMITATE_INSTRUCTION,
      input.extraInstruction ? `\n【额外要求】\n${input.extraInstruction}` : '',
      `\n【参考帖】`,
      parsed.title ? `标题：${parsed.title}` : '',
      parsed.author ? `作者：${parsed.author}` : '',
      parsed.body ? `正文：\n${parsed.body}` : '',
      `图片：${parsed.images.length} 张，将沿用参考帖图片`,
      `\n请输出 JSON。`,
    ].filter(Boolean).join('\n');

    let buf = '';
    let inputTokens = 0;
    let cachedTokens = 0;
    let outputTokens = 0;
    try {
      const stream = this.anthropic.messages.stream({
        model: this.model,
        max_tokens: 1600,
        system,
        messages: [{ role: 'user', content: userMsg }],
      });
      for await (const evt of stream) {
        if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
          buf += evt.delta.text;
          yield { type: 'delta', text: evt.delta.text };
        }
      }
      const finalMsg = await stream.finalMessage();
      const usage = finalMsg.usage as unknown as Record<string, number> | undefined;
      inputTokens = usage?.input_tokens ?? 0;
      cachedTokens = usage?.cache_read_input_tokens ?? 0;
      outputTokens = usage?.output_tokens ?? 0;
    } finally {
      await this.recordUsage(input.teamId, input.userId, inputTokens, cachedTokens, outputTokens);
    }

    const result = safeParseJson<{ title: string; body: string; hashtags: string[] }>(buf);
    if (!result) {
      yield { type: 'error', message: 'AI 输出 JSON 解析失败' };
      return;
    }

    // Create draft pre-filled. Media uses the reference image URLs directly.
    const media = parsed.images.slice(0, 9).map((im, idx) => ({
      url: im.src,
      key: '',                       // not in our COS yet; Phase 2 will download
      src: 'ref',                    // marker: came from reference
      order: idx,
    }));
    const draft = await this.prisma.draft.create({
      data: {
        teamId: input.teamId,
        authorId: input.userId,
        accountId: input.accountId,
        kind: 'image',
        title: result.title,
        body: (result.body ?? '') + (result.hashtags?.length ? `\n\n${result.hashtags.join(' ')}` : ''),
        hashtags: result.hashtags ?? [],
        media: media as object,
        status: 'draft',
        aiMeta: { source: 'imitate', refUrl: parsed.url, inputTokens, cachedTokens, outputTokens },
      },
    });

    yield { type: 'done', result, draftId: draft.id.toString(), draftUrl: `/drafts/${draft.id}` };
  }

  private async cacheGetOrFetch(url: string): Promise<RefNoteParsed> {
    const fingerprint = sha1(url);
    const cached = await this.prisma.refNote.findUnique({ where: { url } });
    if (cached && Date.now() - cached.fetchedAt.getTime() < 24 * 3600 * 1000) {
      return {
        url: cached.url,
        title: cached.title ?? undefined,
        body: cached.body ?? undefined,
        author: cached.author ?? undefined,
        images: (cached.images as any[]) ?? [],
      };
    }
    const fresh = await fetchReferenceNote(url);
    await this.prisma.refNote.upsert({
      where: { url },
      update: {
        fingerprint,
        title: fresh.title,
        body: fresh.body,
        author: fresh.author,
        images: fresh.images as object,
        fetchedAt: new Date(),
      },
      create: {
        url: fresh.url,
        fingerprint,
        title: fresh.title,
        body: fresh.body,
        author: fresh.author,
        images: fresh.images as object,
      },
    });
    return fresh;
  }

  private async recordUsage(teamId: bigint, userId: bigint, i: number, c: number, o: number) {
    const costUsd = ((i - c) * 3 + c * 0.3 + o * 15) / 1_000_000;
    await this.prisma.aiUsage.create({
      data: {
        teamId,
        userId,
        kind: 'imitate',
        provider: 'anthropic',
        model: this.model,
        promptTokens: i,
        cachedTokens: c,
        outputTokens: o,
        costCents: Math.round(costUsd * 100),
      },
    });
  }
}

function safeParseJson<T>(s: string): T | null {
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(s.slice(a, b + 1)) as T; } catch { return null; }
}
function sha1(s: string): string { return createHash('sha1').update(s).digest('hex'); }
