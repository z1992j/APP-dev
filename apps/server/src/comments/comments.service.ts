import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma.module';
import { QUEUE_NAMES, CommentReplyJobData, CommentSweepJobData } from '../queue/queue.constants';
import { personaBlock } from '../ai/prompts';

const AI_REPLY_SYSTEM = `你是小红书品牌官号客服，回复要：
- 控制在 30~80 字
- 友好、口语化、不要用感叹号轰炸
- 不要承诺具体效果 / 价格折扣
- 不出现极限词、医疗暗示
- 避免引导加微信、留电话等违规导流
仅输出纯文本，不要 JSON、不要 markdown。`;

@Injectable()
export class CommentsService {
  private readonly log = new Logger('CommentsService');
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.COMMENT_REPLY)
    private readonly replyQueue: Queue<CommentReplyJobData>,
    @InjectQueue(QUEUE_NAMES.COMMENT_SWEEP)
    private readonly sweepQueue: Queue<CommentSweepJobData>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: cfg.get<string>('DEEPSEEK_API_KEY') ?? '',
      baseURL: cfg.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/anthropic',
    });
    this.model = cfg.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-v4-pro';
  }

  // ── 列表与单条 ─────────────────────────────────────────────────────
  async list(
    teamId: bigint,
    filter: { status?: string; accountId?: string; sentiment?: string; cursor?: string },
  ) {
    const items = await this.prisma.xhsComment.findMany({
      where: {
        teamId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.accountId ? { accountId: BigInt(filter.accountId) } : {}),
        ...(filter.sentiment ? { sentiment: filter.sentiment } : {}),
        ...(filter.cursor ? { id: { lt: BigInt(filter.cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 30,
    });
    const nextCursor = items.length === 30 ? items[items.length - 1].id.toString() : null;
    return { items, nextCursor };
  }

  async stats(teamId: bigint) {
    const grouped = await this.prisma.xhsComment.groupBy({
      by: ['status'],
      where: { teamId },
      _count: { _all: true },
    });
    const out: Record<string, number> = { new: 0, replied: 0, ignored: 0, flagged: 0 };
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  }

  // ── 手动触发扫描 ───────────────────────────────────────────────────
  async triggerSweep(teamId: bigint, accountId?: bigint) {
    if (accountId) {
      const a = await this.prisma.xhsAccount.findUnique({ where: { id: accountId } });
      if (!a || a.teamId !== teamId) throw new ForbiddenException('account not in team');
      await this.sweepQueue.add('manual-sweep', {
        teamId: teamId.toString(),
        accountId: accountId.toString(),
      });
      return { queued: 1 };
    }
    const accs = await this.prisma.xhsAccount.findMany({ where: { teamId } });
    for (const a of accs) {
      await this.sweepQueue.add('manual-sweep', {
        teamId: teamId.toString(),
        accountId: a.id.toString(),
      });
    }
    return { queued: accs.length };
  }

  // ── 人工 / 规则匹配回复 ─────────────────────────────────────────────
  async replyManual(teamId: bigint, commentId: bigint, text: string) {
    const c = await this.prisma.xhsComment.findUnique({ where: { id: commentId } });
    if (!c || c.teamId !== teamId) throw new NotFoundException('comment not found');
    if (!text.trim()) throw new BadRequestException({ code: 40001, message: '回复内容不能为空' });
    await this.replyQueue.add(
      'reply',
      { teamId: teamId.toString(), commentId: commentId.toString(), replyText: text.trim() },
    );
    return { queued: true };
  }

  async markIgnored(teamId: bigint, commentId: bigint) {
    const c = await this.prisma.xhsComment.findUnique({ where: { id: commentId } });
    if (!c || c.teamId !== teamId) throw new NotFoundException('comment not found');
    return this.prisma.xhsComment.update({
      where: { id: commentId },
      data: { status: 'ignored' },
    });
  }

  /** 给一条评论匹配规则并入队（自动回复入口）。无规则命中 → 标记 flagged。 */
  async autoReply(teamId: bigint, commentId: bigint) {
    const c = await this.prisma.xhsComment.findUnique({ where: { id: commentId } });
    if (!c || c.teamId !== teamId) throw new NotFoundException('comment not found');
    if (c.status !== 'new') return { skipped: c.status };

    const rules = await this.prisma.commentRule.findMany({
      where: {
        teamId,
        enabled: true,
        OR: [{ accountId: c.accountId }, { accountId: null }],
      },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });

    const matched = rules.find((r) =>
      (r.triggers as string[]).some((t) =>
        t && c.content.toLowerCase().includes(t.toLowerCase()),
      ),
    );

    if (!matched) {
      await this.prisma.xhsComment.update({
        where: { id: commentId },
        data: { status: 'flagged' },
      });
      return { matched: false };
    }

    const replyText =
      matched.replyMode === 'ai'
        ? await this.generateAiReply(c, matched.aiPersona as Record<string, unknown> | null)
        : (matched.template ?? '').trim();

    if (!replyText) {
      await this.prisma.xhsComment.update({
        where: { id: commentId },
        data: { status: 'flagged' },
      });
      return { matched: true, ruleId: matched.id.toString(), error: 'empty reply' };
    }

    await this.prisma.xhsComment.update({
      where: { id: commentId },
      data: { ruleId: matched.id },
    });
    await this.replyQueue.add('reply', {
      teamId: teamId.toString(),
      commentId: commentId.toString(),
      ruleId: matched.id.toString(),
      replyText,
    });
    return { matched: true, ruleId: matched.id.toString() };
  }

  private async generateAiReply(
    c: Awaited<ReturnType<typeof this.prisma.xhsComment.findUnique>>,
    persona: Record<string, unknown> | null,
  ): Promise<string> {
    if (!c) return '';
    try {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 220,
        thinking: { type: 'disabled' },
        system: [
          { type: 'text', text: AI_REPLY_SYSTEM },
          { type: 'text', text: `【账号人设】\n${personaBlock(persona ?? {})}` },
        ] as Anthropic.TextBlockParam[],
        messages: [
          {
            role: 'user',
            content: `请针对下面这条小红书评论写一句友好得体的回复：\n\n用户：${c.authorName}\n内容：${c.content}`,
          },
        ],
      } as Anthropic.MessageCreateParamsNonStreaming);
      return msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('')
        .trim();
    } catch (e) {
      this.log.warn(`AI reply gen failed: ${(e as Error).message}`);
      return '';
    }
  }

  // ── 规则 CRUD ──────────────────────────────────────────────────────
  listRules(teamId: bigint) {
    return this.prisma.commentRule.findMany({
      where: { teamId },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });
  }

  createRule(
    teamId: bigint,
    data: {
      name: string;
      triggers: string[];
      replyMode: 'template' | 'ai';
      template?: string;
      accountId?: string;
      priority?: number;
    },
  ) {
    return this.prisma.commentRule.create({
      data: {
        teamId,
        name: data.name,
        triggers: data.triggers,
        replyMode: data.replyMode,
        template: data.template ?? null,
        accountId: data.accountId ? BigInt(data.accountId) : null,
        priority: data.priority ?? 0,
      },
    });
  }

  async updateRule(teamId: bigint, id: bigint, data: Record<string, unknown>) {
    const r = await this.prisma.commentRule.findUnique({ where: { id } });
    if (!r || r.teamId !== teamId) throw new NotFoundException('rule not found');
    const patch: Record<string, unknown> = { ...data };
    if (data.accountId !== undefined) {
      patch.accountId = data.accountId ? BigInt(String(data.accountId)) : null;
    }
    return this.prisma.commentRule.update({
      where: { id },
      data: patch as any,
    });
  }

  async deleteRule(teamId: bigint, id: bigint) {
    const r = await this.prisma.commentRule.findUnique({ where: { id } });
    if (!r || r.teamId !== teamId) throw new NotFoundException('rule not found');
    return this.prisma.commentRule.delete({ where: { id } });
  }
}
