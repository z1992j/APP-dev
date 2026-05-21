import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma.module';
import {
  buildSystem,
  buildUserMessage,
  REWRITE_SYSTEM,
} from './prompts';
import { ErrCode } from '../common/errors';
import { pickUsage } from '../common/llm-usage';
import { safeParseJsonObject } from '../common/json';
import { AiUsageRecorder } from '../common/ai-usage.recorder';
import { EventQueue } from '../common/event-queue';
import { withRetry } from './llm-client';

type WriteEvent =
  | { type: 'account.start'; accountId: string; nickname: string }
  | { type: 'delta'; accountId: string; text: string }
  | { type: 'account.done'; accountId: string; result: WriteResult | null }
  | { type: 'account.error'; accountId: string; message: string };

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
    private readonly usage: AiUsageRecorder,
  ) {
    this.client = new Anthropic({
      apiKey: cfg.get<string>('DEEPSEEK_API_KEY') ?? '',
      baseURL: cfg.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/anthropic',
    });
    this.model = cfg.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-v4-pro';
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
      throw new ForbiddenException({ code: ErrCode.ACCOUNT_NOT_IN_TEAM, message: '未找到账号档案' });
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

    // Fan-out: stream all accounts in parallel; merge into one SSE channel.
    // PRD §5.3 target: 5 accounts ≤ 15s — serial fan-out blew past that.
    const queue = new EventQueue<WriteEvent>();
    const tasks = accounts.map((account) => this.runOneAccount(account, input, refExcerpt, queue));
    Promise.allSettled(tasks).finally(() => queue.close());

    let evt: WriteEvent | null;
    while ((evt = await queue.next()) !== null) {
      yield evt;
    }
  }

  private async runOneAccount(
    account: { id: bigint; nickname: string; vertical: string | null; persona: unknown },
    input: { teamId: bigint; userId: bigint; topic: string; words: number; style: string },
    refExcerpt: string | undefined,
    q: EventQueue<WriteEvent>,
  ): Promise<void> {
    const accountId = account.id.toString();
    q.push({ type: 'account.start', accountId, nickname: account.nickname });

    const { systemBlocks } = buildSystem(
      account.vertical,
      (account.persona as Record<string, unknown>) ?? {},
      input.style,
    );
    const system = systemBlocks.map((b) => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    })) as Anthropic.TextBlockParam[];
    const userMsg = buildUserMessage(input.topic, input.words, refExcerpt);

    let buf = '';
    let stats = { input: 0, cached: 0, output: 0 };
    try {
      // TODO(H6): streaming retries are tricky because we've already emitted
      // deltas to the client. For now we surface the failure as account.error;
      // a future improvement is to buffer deltas, retry on 5xx, and only
      // flush once the stream commits.
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 1500,
        // DeepSeek-v4-pro 默认开启 extended thinking,会让首 token 延迟 5~10s。
        thinking: { type: 'disabled' },
        system,
        messages: [{ role: 'user', content: userMsg }],
      } as Anthropic.MessageStreamParams);

      for await (const evt of stream) {
        if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
          buf += evt.delta.text;
          q.push({ type: 'delta', accountId, text: evt.delta.text });
        }
      }
      const finalMsg = await stream.finalMessage();
      stats = pickUsage(finalMsg.usage);

      const parsed = safeParseJsonObject<WriteResult>(buf);
      q.push({ type: 'account.done', accountId, result: parsed });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`AI write failed for account ${accountId}: ${msg}`);
      q.push({ type: 'account.error', accountId, message: '生成失败，请重试' });
    } finally {
      await this.usage.record({
        teamId: input.teamId,
        userId: input.userId,
        kind: 'write',
        provider: 'deepseek',
        model: this.model,
        stats,
      });
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
    const msg = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 800,
          thinking: { type: 'disabled' },
          system: REWRITE_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `改写要求：${input.instruction}\n\n原文：\n${input.text}`,
            },
          ],
        } as Anthropic.MessageCreateParamsNonStreaming),
      this.log,
    );
    const out = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('');
    await this.usage.record({
      teamId: input.teamId,
      userId: input.userId,
      kind: 'rewrite',
      provider: 'deepseek',
      model: this.model,
      stats: pickUsage(msg.usage),
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
        code: ErrCode.QUOTA_EXCEEDED,
        message: `今日 AI 写作已用完（${limit} 次），升级套餐解锁更多`,
      });
    }
  }

}
