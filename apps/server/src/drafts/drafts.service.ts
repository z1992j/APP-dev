import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.module';
import { ErrCode } from '../common/errors';
import { clampLimit } from '../common/pagination';

const ALLOWED_HOSTS = ['xiaohongshu.com', 'xhslink.com', 'www.xiaohongshu.com'];

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    teamId: bigint,
    opts: { status?: string; accountId?: string; cursor?: string; limit?: number },
  ) {
    const take = clampLimit(opts.limit, 20);
    const items = await this.prisma.draft.findMany({
      where: {
        teamId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.accountId ? { accountId: BigInt(opts.accountId) } : {}),
        ...(opts.cursor ? { id: { lt: BigInt(opts.cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take,
      include: { account: { select: { id: true, nickname: true } } },
    });
    const nextCursor = items.length === take ? items[items.length - 1].id.toString() : null;
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

  async update(
    teamId: bigint,
    id: bigint,
    data: {
      accountId?: string | null;
      kind?: 'image' | 'video';
      title?: string;
      body?: string;
      media?: unknown[];
      hashtags?: string[];
    },
  ) {
    await this.get(teamId, id);
    // Whitelist: never let callers patch teamId / status / publishedAt /
    // publishedUrl / aiMeta — those have dedicated lifecycle methods.
    const patch: Prisma.DraftUpdateInput = {};
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.title !== undefined) patch.title = data.title;
    if (data.body !== undefined) patch.body = data.body;
    if (data.media !== undefined) patch.media = data.media as Prisma.InputJsonValue;
    if (data.hashtags !== undefined) patch.hashtags = data.hashtags;
    if (data.accountId !== undefined) {
      patch.account = data.accountId
        ? { connect: { id: BigInt(String(data.accountId)) } }
        : { disconnect: true };
    }
    return this.prisma.draft.update({ where: { id }, data: patch });
  }

  async schedule(teamId: bigint, id: bigint, scheduleAt: Date) {
    const d = await this.get(teamId, id);
    if (scheduleAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: ErrCode.BAD_INPUT, message: '排期时间必须在未来' });
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
        code: ErrCode.INVALID_LINK,
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

  async submitReview(teamId: bigint, id: bigint, authorId: bigint) {
    const d = await this.get(teamId, id);
    if (!['draft', 'rejected'].includes(d.status)) {
      throw new BadRequestException({
        code: ErrCode.BAD_INPUT,
        message: '当前状态不能提交评审',
      });
    }
    await this.prisma.auditLog.create({
      data: {
        teamId,
        actorId: authorId,
        action: 'draft.submit_review',
        targetType: 'draft',
        targetId: d.id,
      },
    });
    return this.prisma.draft.update({
      where: { id: d.id },
      data: { status: 'in_review' },
    });
  }

  async review(
    teamId: bigint,
    reviewerId: bigint,
    id: bigint,
    role: string,
    dto: { decision: string; comment?: string },
  ) {
    if (!REVIEWER_ROLES.has(role)) {
      throw new ForbiddenException({ code: ErrCode.NO_REVIEW_PERMISSION, message: '当前角色无评审权限' });
    }
    const d = await this.get(teamId, id);
    const review = await this.prisma.draftReview.create({
      data: {
        draftId: d.id,
        reviewerId,
        decision: dto.decision,
        comment: dto.comment,
      },
    });
    let nextStatus: string | undefined;
    if (dto.decision === 'approve') nextStatus = 'approved';
    else if (dto.decision === 'reject') nextStatus = 'rejected';
    if (nextStatus) {
      await this.prisma.draft.update({
        where: { id: d.id },
        data: { status: nextStatus },
      });
      await this.prisma.auditLog.create({
        data: {
          teamId,
          actorId: reviewerId,
          action: `draft.${dto.decision}`,
          targetType: 'draft',
          targetId: d.id,
        },
      });
    }
    return review;
  }
}

const REVIEWER_ROLES = new Set(['owner', 'admin', 'reviewer']);

function safeParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
