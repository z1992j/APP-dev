// 给一条评论发回复。规则匹配 + 模板填充 / AI 生成 在 comments.service 完成；
// 这里只负责真正调 xhs-mcp。

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, CommentReplyJobData, DEFAULT_COMMENT_MIN_INTERVAL_MS } from './queue.constants';
import { PrismaService } from '../prisma.module';
import { XhsMcpClient } from '../automation/xhs-mcp-client';

@Processor(QUEUE_NAMES.COMMENT_REPLY, { concurrency: 1 })
export class CommentReplyProcessor extends WorkerHost {
  private readonly log = new Logger('CommentReply');

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CommentReplyJobData>) {
    const { teamId, commentId, replyText } = job.data;
    const comment = await this.prisma.xhsComment.findUnique({
      where: { id: BigInt(commentId) },
    });
    if (!comment) throw new Error(`comment ${commentId} not found`);
    if (comment.status === 'replied') {
      this.log.warn(`comment ${commentId} already replied`);
      return { skipped: true };
    }

    const session = await this.prisma.xhsSession.findUnique({
      where: { accountId: comment.accountId },
    });
    if (!session?.workerPort || session.status !== 'active') {
      throw new Error(`account ${comment.accountId} no active worker`);
    }

    // Per-account throttle for comments
    const recent = await this.prisma.xhsComment.count({
      where: {
        accountId: comment.accountId,
        repliedAt: { gte: new Date(Date.now() - DEFAULT_COMMENT_MIN_INTERVAL_MS) },
      },
    });
    if (recent > 0) {
      await job.moveToDelayed(Date.now() + DEFAULT_COMMENT_MIN_INTERVAL_MS, job.token);
      throw new Error('comment-throttled, requeued');
    }

    const client = new XhsMcpClient(`http://127.0.0.1:${session.workerPort}`);
    await client.replyComment({
      feed_id: comment.noteId,
      comment_id: comment.commentId,
      content: replyText,
    });

    await this.prisma.xhsComment.update({
      where: { id: comment.id },
      data: { status: 'replied', reply: replyText, repliedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        teamId: BigInt(teamId),
        action: 'comment.replied',
        targetType: 'xhs_comment',
        targetId: comment.id,
        meta: { commentId: comment.commentId, replyText },
      },
    });
    return { ok: true };
  }
}
