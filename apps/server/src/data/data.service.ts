import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.module';

@Injectable()
export class DataService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    teamId: bigint,
    input: { accountId: bigint; bucketDate: Date; metrics: Record<string, number> },
  ) {
    return this.prisma.dataPoint.upsert({
      where: {
        accountId_bucketDate_source: {
          accountId: input.accountId,
          bucketDate: input.bucketDate,
          source: 'user',
        },
      },
      update: { metrics: input.metrics },
      create: {
        teamId,
        accountId: input.accountId,
        bucketDate: input.bucketDate,
        source: 'user',
        metrics: input.metrics,
      },
    });
  }

  async account(teamId: bigint, accountId: bigint, from?: string, to?: string) {
    const where = {
      teamId,
      accountId,
      ...(from ? { bucketDate: { gte: new Date(from) } } : {}),
      ...(to ? { bucketDate: { lte: new Date(to) } } : {}),
    };
    const series = await this.prisma.dataPoint.findMany({
      where,
      orderBy: { bucketDate: 'asc' },
    });
    return { series };
  }

  async team(teamId: bigint, from?: string, to?: string) {
    const accounts = await this.prisma.xhsAccount.findMany({
      where: { teamId, isActive: true },
    });
    const where = {
      teamId,
      ...(from ? { bucketDate: { gte: new Date(from) } } : {}),
      ...(to ? { bucketDate: { lte: new Date(to) } } : {}),
    };
    const series = await this.prisma.dataPoint.findMany({
      where,
      orderBy: { bucketDate: 'asc' },
    });
    const totals = aggregate(series.map((s) => s.metrics as Record<string, number>));
    return {
      totals,
      accounts: accounts.map((a) => ({
        id: a.id.toString(),
        nickname: a.nickname,
        vertical: a.vertical,
      })),
    };
  }
}

function aggregate(points: Record<string, number>[]) {
  const out: Record<string, number> = {};
  for (const p of points) {
    for (const k of Object.keys(p)) {
      out[k] = (out[k] ?? 0) + Number(p[k] ?? 0);
    }
  }
  return out;
}
