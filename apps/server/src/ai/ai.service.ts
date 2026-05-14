import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma.module';
import {
  buildSystem,
  buildUserMessage,
  REWRITE_SYSTEM,
} from './prompts';

interface WriteResult {
  titles: string[];
  body: string;
  hashtags: string[];
}

@Injectable()
export class AiService {
  private readonly log = new Logger('AiService');
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.client = new Anthropic({
      apiKey: cfg.get<string>('ANTHROPIC_API_KEY') ?? '',
    });
    this.model = cfg.get<string>('CLAUDE_MODEL') ?? 'claude-sonnet-4-6';
  }

  async *write(input: {
    teamId: bigint;
    userId: bigint;
    topic: string;
    accountIds: bigint[];
    style: string;
    words: number;
    refNoteFp?: string;
  }) {
    await this.assertQuota(input.teamId, input.userId);

    const accounts = await this.prisma.xhsAccount.findMany({
      where: { id: { in: input.accountIds }, teamId: input.teamId },
    });
    if (accounts.length === 0) {
      throw new ForbiddenException({ code: 40301, message: '未找到账号档案' });
    }

    let refExcerpt: string | undefined;
    if (input.refNoteFp) {
      const note = await this.prisma.inspireNote.findUnique({
        where: { fingerprint: input.refNoteFp },
      });
      if (note) {
        const payload = note.payload as Record<string, unknown>;
        refExcerpt = String(payload.body_excerpt ?? payload.excerpt ?? '').slice(0, 200);
      }
    }

    // Fan-out: one streaming generation per account
    for (const account of accounts) {
      yield { type: 'account.start', accountId: account.id.toString(), nickname: account.nickname };
      const { systemBlocks } = buildSystem(
        account.vertical,
        (account.persona as Record<string, unknown>) ?? {},
        input.style,
      );
      const system = systemBlocks.map((b) => ({
        type: 'text' as const,
        text: b.text,
        ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
      const userMsg = buildUserMessage(input.topic, input.words, refExcerpt);

      let buf = '';
      let inputTokens = 0;
      let cachedTokens = 0;
      let outputTokens = 0;

      try {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: 1500,
          system,
          messages: [{ role: 'user', content: userMsg }],
        });

        for await (const evt of stream) {
          if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
            buf += evt.delta.text;
            yield { type: 'delta', accountId: account.id.toString(), text: evt.delta.text };
          }
        }
        const finalMsg = await stream.finalMessage();
        inputTokens = finalMsg.usage?.input_tokens ?? 0;
        cachedTokens = finalMsg.usage?.cache_read_input_tokens ?? 0;
        outputTokens = finalMsg.usage?.output_tokens ?? 0;

        const parsed = safeParseJson<WriteResult>(buf);
        yield {
          type: 'account.done',
          accountId: account.id.toString(),
          result: parsed,
        };
      } catch (e) {
        this.log.error(`AI write failed for account ${account.id}: ${(e as Error).message}`);
        yield {
          type: 'account.error',
          accountId: account.id.toString(),
          message: '生成失败，请重试',
        };
      } finally {
        await this.recordUsage({
          teamId: input.teamId,
          userId: input.userId,
          kind: 'write',
          inputTokens,
          cachedTokens,
          outputTokens,
        });
      }
    }
  }

  async rewrite(input: {
    teamId: bigint;
    userId: bigint;
    text: string;
    instruction: string;
    accountId?: bigint;
  }) {
    await this.assertQuota(input.teamId, input.userId);
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 800,
      system: REWRITE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `改写要求：${input.instruction}\n\n原文：\n${input.text}`,
        },
      ],
    });
    const out = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('');
    await this.recordUsage({
      teamId: input.teamId,
      userId: input.userId,
      kind: 'rewrite',
      inputTokens: msg.usage?.input_tokens ?? 0,
      cachedTokens: msg.usage?.cache_read_input_tokens ?? 0,
      outputTokens: msg.usage?.output_tokens ?? 0,
    });
    return { text: out };
  }

  private async assertQuota(teamId: bigint, _userId: bigint) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new ForbiddenException('team missing');
    const limits: Record<string, number> = {
      free: Number(this.cfg.get('AI_FREE_DAILY') ?? 3),
      personal: Number(this.cfg.get('AI_PRO_DAILY') ?? 100),
      starter: Number(this.cfg.get('AI_TEAM_DAILY') ?? 1000),
      pro: Number(this.cfg.get('AI_TEAM_DAILY') ?? 1000),
      enterprise: 100000,
    };
    const limit = limits[team.plan] ?? 3;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const usedToday = await this.prisma.aiUsage.count({
      where: { teamId, kind: 'write', createdAt: { gte: since } },
    });
    if (usedToday >= limit) {
      throw new ForbiddenException({
        code: 40901,
        message: `今日 AI 写作已用完（${limit} 次），升级套餐解锁更多`,
      });
    }
  }

  private async recordUsage(d: {
    teamId: bigint;
    userId: bigint;
    kind: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
  }) {
    // Pricing (Claude Sonnet 4.6, 2026-05): input $3/M, cache hit $0.30/M, output $15/M.
    // costCents = USD * 100 * exchange_rate; here we keep USD cents.
    const costUsd =
      ((d.inputTokens - d.cachedTokens) * 3 +
        d.cachedTokens * 0.3 +
        d.outputTokens * 15) /
      1_000_000;
    await this.prisma.aiUsage.create({
      data: {
        teamId: d.teamId,
        userId: d.userId,
        kind: d.kind,
        provider: 'anthropic',
        model: this.model,
        promptTokens: d.inputTokens,
        cachedTokens: d.cachedTokens,
        outputTokens: d.outputTokens,
        costCents: Math.round(costUsd * 100),
      },
    });
  }
}

function safeParseJson<T>(s: string): T | null {
  // Find first { and last }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
