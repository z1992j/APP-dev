import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.module';

const INVITE_TTL_MS = 7 * 86400 * 1000;

@Injectable()
export class TeamsService {
  // in-process cache; production move to Redis
  private invites = new Map<
    string,
    { teamId: bigint; role: string; inviterId: bigint; createdAt: number; note?: string }
  >();

  constructor(private readonly prisma: PrismaService) {}

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
        code: 40901,
        message: `团队席位已满（${seatLimit}），升级套餐解锁更多`,
      });
    }
    // 6-char alphanumeric code
    const code = randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    this.invites.set(code, { teamId, role, inviterId, createdAt: Date.now(), note });
    this.gcInvites();
    return { code, role, expiresIn: INVITE_TTL_MS / 1000 };
  }

  async acceptInvite(userId: bigint, code: string) {
    const upper = code.trim().toUpperCase();
    const inv = this.invites.get(upper);
    if (!inv) throw new NotFoundException({ code: 40401, message: '邀请码无效或已过期' });
    if (Date.now() - inv.createdAt > INVITE_TTL_MS) {
      this.invites.delete(upper);
      throw new BadRequestException({ code: 40001, message: '邀请码已过期' });
    }
    const existing = await this.prisma.teamMember.findFirst({
      where: { teamId: inv.teamId, userId },
    });
    if (existing) {
      throw new ConflictException({ code: 40901, message: '已是该团队成员' });
    }
    const member = await this.prisma.teamMember.create({
      data: { teamId: inv.teamId, userId, role: inv.role },
    });
    this.invites.delete(upper);
    await this.prisma.auditLog.create({
      data: {
        teamId: inv.teamId,
        actorId: inv.inviterId,
        action: 'team.invite_accepted',
        targetType: 'user',
        targetId: userId,
        meta: { role: inv.role },
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

  private gcInvites() {
    const cutoff = Date.now() - INVITE_TTL_MS;
    for (const [code, inv] of this.invites) {
      if (inv.createdAt < cutoff) this.invites.delete(code);
    }
  }
}

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  personal: 1,
  starter: 5,
  pro: 30,
  enterprise: 999,
};
