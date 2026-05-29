import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma.module';

const AI_DM_SYSTEM = `你是小红书品牌官号客服，私信回复要：
- 控制在 50~150 字
- 友好、专业、口语化
- 可以引导咨询但不能留微信/电话等外部联系方式
- 不要承诺具体效果 / 价格折扣
- 不出现极限词、医疗暗示
仅输出纯文本。`;

@Injectable()
export class DmService {
  private readonly log = new Logger('DmService');
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: cfg.get<string>('DEEPSEEK_API_KEY') ?? '',
      baseURL: cfg.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/anthropic',
    });
    this.model = cfg.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-v4-pro';
  }

  async listConversations(teamId: bigint, filter: { accountId?: string; status?: string; cursor?: string }) {
    const items = await this.prisma.dmConversation.findMany({
      where: {
        teamId,
        ...(filter.accountId ? { accountId: BigInt(filter.accountId) } : {}),
        ...(filter.status ? { status: filter.status } : { status: 'active' }),
        ...(filter.cursor ? { id: { lt: BigInt(filter.cursor) } } : {}),
      },
      orderBy: { lastAt: 'desc' },
      take: 30,
    });
    const nextCursor = items.length === 30 ? items[items.length - 1].id.toString() : null;
    return { items, nextCursor };
  }

  async getMessages(teamId: bigint, conversationId: bigint, cursor?: string) {
    const conv = await this.prisma.dmConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.teamId !== teamId) throw new NotFoundException('conversation not found');

    const items = await this.prisma.dmMessage.findMany({
      where: {
        conversationId,
        ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    if (conv.unreadCount > 0) {
      await this.prisma.dmConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    }

    const nextCursor = items.length === 50 ? items[items.length - 1].id.toString() : null;
    return { items: items.reverse(), nextCursor };
  }

  async sendMessage(teamId: bigint, conversationId: bigint, content: string) {
    const conv = await this.prisma.dmConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.teamId !== teamId) throw new ForbiddenException('not your conversation');

    const msg = await this.prisma.dmMessage.create({
      data: {
        conversationId,
        direction: 'outbound',
        content,
        msgType: 'text',
        sentAt: new Date(),
      },
    });

    await this.prisma.dmConversation.update({
      where: { id: conversationId },
      data: { lastMessage: content, lastAt: new Date() },
    });

    return msg;
  }

  async generateAiReply(teamId: bigint, conversationId: bigint) {
    const conv = await this.prisma.dmConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.teamId !== teamId) throw new ForbiddenException('not your conversation');

    const recent = await this.prisma.dmMessage.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'desc' },
      take: 10,
    });

    const chatHistory = recent.reverse().map((m) =>
      `${m.direction === 'inbound' ? conv.peerName : '我'}：${m.content}`
    ).join('\n');

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 300,
      system: AI_DM_SYSTEM,
      messages: [{
        role: 'user',
        content: `以下是与用户"${conv.peerName}"的私信对话记录：\n\n${chatHistory}\n\n请针对最后一条消息写一条得体的回复。`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return { suggestion: text };
  }

  async archiveConversation(teamId: bigint, conversationId: bigint) {
    const conv = await this.prisma.dmConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.teamId !== teamId) throw new ForbiddenException('not your conversation');
    await this.prisma.dmConversation.update({
      where: { id: conversationId },
      data: { status: 'archived' },
    });
    return { ok: true };
  }

  async unreadStats(teamId: bigint) {
    const result = await this.prisma.dmConversation.aggregate({
      where: { teamId, status: 'active', unreadCount: { gt: 0 } },
      _sum: { unreadCount: true },
      _count: { _all: true },
    });
    return {
      totalUnread: result._sum.unreadCount ?? 0,
      unreadConversations: result._count._all,
    };
  }
}
