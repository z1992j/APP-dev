// BullMQ 队列基础设施。三个 queue + 三个 worker。
// Redis 连接走 REDIS_URL；本地测试 / Codespaces 都能用。

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { PublishProcessor } from './publish.processor';
import { CommentSweepProcessor } from './comment-sweep.processor';
import { CommentReplyProcessor } from './comment-reply.processor';
import { QueueScheduler } from './queue.scheduler';
import { AutomationModule } from '../automation/automation.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            ...(u.password ? { password: u.password } : {}),
            db: Number(u.pathname.replace('/', '') || 0),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
            removeOnFail: { age: 30 * 24 * 3600 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.PUBLISH },
      { name: QUEUE_NAMES.COMMENT_SWEEP },
      { name: QUEUE_NAMES.COMMENT_REPLY },
    ),
    AutomationModule,
    AuthModule,
  ],
  providers: [
    PublishProcessor,
    CommentSweepProcessor,
    CommentReplyProcessor,
    QueueScheduler,
  ],
  exports: [BullModule],
})
export class QueueModule {}
