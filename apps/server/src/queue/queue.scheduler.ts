// 给每个活跃 XhsSession 周期性派发 comment-sweep 任务。
// 默认每 15 分钟一次。

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma.module';
import { QUEUE_NAMES, CommentSweepJobData } from './queue.constants';

@Injectable()
export class QueueScheduler {
  private readonly log = new Logger('QueueScheduler');

  constructor(
    @InjectQueue(QUEUE_NAMES.COMMENT_SWEEP)
    private readonly sweepQueue: Queue<CommentSweepJobData>,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('*/15 * * * *')
  async tickCommentSweep() {
    const active = await this.prisma.xhsSession.findMany({
      where: { status: 'active', workerPort: { not: null } },
    });
    for (const s of active) {
      const account = await this.prisma.xhsAccount.findUnique({
        where: { id: s.accountId },
      });
      if (!account) continue;
      await this.sweepQueue.add(
        `sweep-${s.accountId}`,
        { teamId: account.teamId.toString(), accountId: s.accountId.toString() },
        { jobId: `sweep-${s.accountId}-${Math.floor(Date.now() / (15 * 60_000))}` },
      );
    }
    if (active.length > 0) {
      this.log.log(`enqueued sweep for ${active.length} account(s)`);
    }
  }
}
