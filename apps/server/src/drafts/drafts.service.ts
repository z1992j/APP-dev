import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.module';

const ALLOWED_HOSTS = ['xiaohongshu.com', 'xhslink.com', 'www.xiaohongshu.com'];

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    teamId: bigint,
    opts: { status?: string; accountId?: string; cursor?: string },
  ) {
    const items = await this.prisma.draft.findMany({
      where: {
        teamId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.accountId ? { accountId: BigInt(opts.accountId) } : {}),
        ...(opts.cursor ? { id: { lt: BigInt(opts.cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 20,
      include: { account: { select: { id: true, nickname: true } } },
    });
    const nextCursor = items.length === 20 ? items[items.length - 1].id.toString() : null;
    return { items, nextCursor };
  }

  async get(teamId: bigint, id: bigint) {
    const d = await this.prisma.draft.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, nickname: true, persona: true } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!d || d.teamId !== teamId) throw new NotFoundException('draft not found');
    return d;
  }

  create(
    teamId: bigint,
    authorId: bigint,
    data: {
      accountId?: string;
      kind: 'image' | 'video';
      title?: string;
      body?: string;
      media?: unknown[];
      hashtags?: string[];
    },
  ) {
    return this.prisma.draft.create({
      data: {
        teamId,
        authorId,
        accountId: data.accountId ? BigInt(data.accountId) : null,
        kind: data.kind,
        title: data.title,
        body: data.body,
        media: (data.media ?? []) as object,
        hashtags: data.hashtags ?? [],
        status: 'draft',
      },
    });
  }

  async update(teamId: bigint, id: bigint, data: Record<string, unknown>) {
    await this.get(teamId, id);
    const patch: Record<string, unknown> = { ...data };
    if (data.accountId !== undefined) {
      patch.accountId = data.accountId ? BigInt(String(data.accountId)) : null;
    }
    return this.prisma.draft.update({ where: { id }, data: patch });
  }

  async schedule(teamId: bigint, id: bigint, scheduleAt: Date) {
    const d = await this.get(teamId, id);
    if (scheduleAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 40001, message: '排期时间必须在未来' });
    }
    return this.prisma.draft.update({
      where: { id: d.id },
      data: { scheduleAt, status: 'scheduled' },
    });
  }

  async handoff(teamId: bigint, id: bigint) {
    const d = await this.get(teamId, id);
    await this.prisma.auditLog.create({
      data: {
        teamId,
        actorId: d.authorId,
        action: 'draft.handoff',
        targetType: 'draft',
        targetId: d.id,
      },
    });
    return this.prisma.draft.update({
      where: { id: d.id },
      data: { status: 'handed_off', handedOffAt: new Date() },
    });
  }

  async published(teamId: bigint, id: bigint, url: string) {
    const d = await this.get(teamId, id);
    const u = safeParseUrl(url);
    if (!u || !ALLOWED_HOSTS.includes(u.hostname)) {
      throw new BadRequestException({
        code: 40001,
        message: '链接必须是小红书域名（xiaohongshu.com / xhslink.com）',
      });
    }
    return this.prisma.draft.update({
      where: { id: d.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedUrl: url,
      },
    });
  }

  async review(
    teamId: bigint,
    reviewerId: bigint,
    id: bigint,
    dto: { decision: string; comment?: string },
  ) {
    const d = await this.get(teamId, id);
    const review = await this.prisma.draftReview.create({
      data: {
        draftId: d.id,
        reviewerId,
        decision: dto.decision,
        comment: dto.comment,
      },
    });
    if (dto.decision === 'approve') {
      await this.prisma.draft.update({
        where: { id: d.id },
        data: { status: 'approved' },
      });
    } else if (dto.decision === 'reject') {
      await this.prisma.draft.update({
        where: { id: d.id },
        data: { status: 'draft' },
      });
    }
    return review;
  }
}

function safeParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
