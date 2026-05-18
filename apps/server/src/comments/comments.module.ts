import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommentsController } from './comments.controller';
import { CommentRulesController } from './comment-rules.controller';
import { CommentsService } from './comments.service';
import { AuthModule } from '../auth/auth.module';
import { QUEUE_NAMES } from '../queue/queue.constants';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.COMMENT_REPLY },
      { name: QUEUE_NAMES.COMMENT_SWEEP },
    ),
  ],
  controllers: [CommentsController, CommentRulesController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
