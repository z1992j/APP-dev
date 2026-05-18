// Async publish — 取代 automation.service 里同步发布的路径。
// 走 BullMQ 让我们能错峰、重试、跨实例分发。

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, PublishJobData, DEFAULT_PUBLISH_MIN_INTERVAL_MS } from './queue.constants';
import { AutomationService } from '../automation/automation.service';
import { PrismaService } from '../prisma.module';

@Processor(QUEUE_NAMES.PUBLISH, { concurrency: 1 })
export class PublishProcessor extends WorkerHost {
  private readonly log = new Logger('PublishProcessor');

  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>) {
    const { teamId, userId, draftId, accountId } = job.data;
    this.log.log(`publish job ${job.id} draft=${draftId} account=${accountId}`);

    // Per-account throttle: 最近一次发布 ≤30 分钟 → 延后
    const session = await this.prisma.xhsSession.findUnique({
      where: { accountId: BigInt(accountId) },
    });
    const minInterval =
      ((session?.dailyQuota as Record<string, unknown>)?.minIntervalMs as number) ??
      DEFAULT_PUBLISH_MIN_INTERVAL_MS;
    const lastAt = session?.lastUsedAt?.getTime() ?? 0;
    const wait = lastAt + minInterval - Date.now();
    if (wait > 0) {
      this.log.log(`account ${accountId} throttled, delay ${Math.ceil(wait / 1000)}s`);
      await job.moveToDelayed(Date.now() + wait, job.token);
      throw new Error('throttled, requeued');
    }

    const result = await this.automation.publishDraft(
      BigInt(teamId),
      BigInt(draftId),
      BigInt(userId),
    );
    return result;
  }
}
