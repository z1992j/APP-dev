import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.module';
import { ErrCode } from '../common/errors';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(teamId: bigint) {
    return this.prisma.xhsAccount.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    teamId: bigint,
    data: { nickname: string; xhsUrl?: string; vertical?: string; persona?: Record<string, unknown> },
  ) {
    // Plan-based quota
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('team not found');
    const count = await this.prisma.xhsAccount.count({ where: { teamId, isActive: true } });
    const limit = QUOTA[team.plan] ?? 1;
    if (count >= limit) {
      throw new ForbiddenException({
        code: ErrCode.QUOTA_EXCEEDED,
        message: `账号档案已达 ${limit} 个上限，升级套餐解锁更多`,
      });
    }
    return this.prisma.xhsAccount.create({
      data: {
        teamId,
        nickname: data.nickname,
        xhsUrl: data.xhsUrl,
        vertical: data.vertical,
        persona: (data.persona ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(teamId: bigint, id: bigint, data: Record<string, unknown>) {
    await this.assertOwn(teamId, id);
    return this.prisma.xhsAccount.update({
      where: { id },
      data: data as Prisma.XhsAccountUpdateInput,
    });
  }

  async remove(teamId: bigint, id: bigint) {
    await this.assertOwn(teamId, id);
    return this.prisma.xhsAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertOwn(teamId: bigint, id: bigint) {
    const a = await this.prisma.xhsAccount.findFirst({
      where: { id, teamId },
    });
    if (!a) throw new NotFoundException('account not found');
  }
}

const QUOTA: Record<string, number> = {
  free: 1,
  personal: 5,
  starter: 10,
  pro: 50,
  enterprise: 999,
};
