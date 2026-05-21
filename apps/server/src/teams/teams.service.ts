import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../prisma.module';
import { ErrCode } from '../common/errors';
import { REDIS_CLIENT } from '../common/redis.module';

const INVITE_TTL_SEC = 7 * 86400;
const INVITE_KEY_PREFIX = 'redmatrix:invite:';

interface InvitePayload {
  teamId: string;
  role: string;
  inviterId: string;
  note?: string;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async current(teamId: bigint) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { _count: { select: { members: true, accounts: true } } },
    });
    if (!team) throw new NotFoundException('team not found');
    return team;
  }

  rename(teamId: bigint, name: string) {
    return this.prisma.team.update({ where: { id: teamId }, data: { name } });
  }

  members(teamId: bigint) {
    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async createInvite(teamId: bigint, inviterId: bigint, role: string, note?: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('team');
    const seatLimit = SEAT_LIMITS[team.plan] ?? 1;
    const usedSeats = await this.prisma.teamMember.count({ where: { teamId } });
    if (usedSeats >= seatLimit) {
      throw new ForbiddenException({
        code: ErrCode.QUOTA_EXCEEDED,
        message: `团队席位已满（${seatLimit}），升级套餐解锁更多`,
      });
    }
    // 6-char alphanumeric code; collision after 36^6 ≈ 2.2B is acceptable
    const code = randomBytes(4)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();
    const payload: InvitePayload = {
      teamId: teamId.toString(),
      role,
      inviterId: inviterId.toString(),
      note,
    };
    await this.redis.set(
      INVITE_KEY_PREFIX + code,
      JSON.stringify(payload),
      'EX',
      INVITE_TTL_SEC,
    );
    return { code, role, expiresIn: INVITE_TTL_SEC };
  }

  async acceptInvite(userId: bigint, code: string) {
    const upper = code.trim().toUpperCase();
    const raw = await this.redis.get(INVITE_KEY_PREFIX + upper);
    if (!raw) {
      throw new NotFoundException({ code: ErrCode.INVITE_INVALID, message: '邀请码无效或已过期' });
    }
    let inv: InvitePayload;
    try {
      inv = JSON.parse(raw) as InvitePayload;
    } catch {
      throw new BadRequestException({ code: ErrCode.BAD_INPUT, message: '邀请码格式损坏' });
    }
    const inviteTeamId = BigInt(inv.teamId);
    const inviterId = BigInt(inv.inviterId);
    const existing = await this.prisma.teamMember.findFirst({
      where: { teamId: inviteTeamId, userId },
    });
    if (existing) {
      throw new ConflictException({ code: ErrCode.ALREADY_MEMBER, message: '已是该团队成员' });
    }
    const member = await this.prisma.teamMember.create({
      data: { teamId: inviteTeamId, userId, role: inv.role },
    });
    await this.redis.del(INVITE_KEY_PREFIX + upper);
    await this.prisma.auditLog.create({
      data: {
        teamId: inviteTeamId,
        actorId: inviterId,
        action: 'team.invite_accepted',
        targetType: 'user',
        targetId: userId,
        meta: { role: inv.role, ...(inv.note ? { note: inv.note } : {}) },
      },
    });
    return member;
  }

  async changeRole(teamId: bigint, userId: bigint, role: string) {
    const m = await this.prisma.teamMember.findFirst({ where: { teamId, userId } });
    if (!m) throw new NotFoundException('member not found');
    if (m.role === 'owner') throw new ForbiddenException('cannot demote owner');
    return this.prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role },
    });
  }

  async removeMember(teamId: bigint, userId: bigint, actorId: bigint) {
    const m = await this.prisma.teamMember.findFirst({ where: { teamId, userId } });
    if (!m) throw new NotFoundException('member not found');
    if (m.role === 'owner') throw new ForbiddenException('cannot remove owner');
    if (userId === actorId) throw new BadRequestException('cannot remove self via this API');
    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
    await this.prisma.auditLog.create({
      data: {
        teamId,
        actorId,
        action: 'team.member_removed',
        targetType: 'user',
        targetId: userId,
      },
    });
    return { ok: true };
  }

}

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  personal: 1,
  starter: 5,
  pro: 30,
  enterprise: 999,
};
