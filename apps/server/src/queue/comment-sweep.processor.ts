// 周期性拉取「我方账号」笔记下的评论，落库到 XhsComment。
// 仅扫描已 published 且最近 7 天的笔记，避免对 worker 造成洪流。

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, CommentSweepJobData } from './queue.constants';
import { AutomationService } from '../automation/automation.service';
import { PrismaService } from '../prisma.module';
import { XhsMcpClient } from '../automation/xhs-mcp-client';

@Processor(QUEUE_NAMES.COMMENT_SWEEP, { concurrency: 2 })
export class CommentSweepProcessor extends WorkerHost {
  private readonly log = new Logger('CommentSweep');

  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<CommentSweepJobData>) {
    const { teamId, accountId } = job.data;
    this.log.log(`sweep job ${job.id} account=${accountId}`);

    const session = await this.prisma.xhsSession.findUnique({
      where: { accountId: BigInt(accountId) },
    });
    if (!session?.workerPort || session.status !== 'active') {
      this.log.warn(`account ${accountId} no active worker, skipping`);
      return { skipped: true };
    }

    const since = new Date(Date.now() - 7 * 86400_000);
    const notes = await this.prisma.draft.findMany({
      where: {
        teamId: BigInt(teamId),
        accountId: BigInt(accountId),
        status: 'published',
        publishedAt: { gte: since },
        publishedUrl: { not: null },
      },
      take: 20,
    });
    if (notes.length === 0) {
      return { sweptNotes: 0 };
    }

    const client = new XhsMcpClient(`http://127.0.0.1:${session.workerPort}`);
    let totalNew = 0;
    for (const note of notes) {
      const feedId = extractFeedId(note.publishedUrl!);
      if (!feedId) continue;
      try {
        const detail = await client.feedDetail(feedId, undefined, true);
        const comments = extractComments(detail);
        for (const c of comments) {
          try {
            await this.prisma.xhsComment.create({
              data: {
                teamId: BigInt(teamId),
                accountId: BigInt(accountId),
                noteUrl: note.publishedUrl!,
                noteId: feedId,
                commentId: c.id,
                parentId: c.parentId,
                authorName: c.authorName,
                authorId: c.authorId,
                content: c.content,
                likedCount: c.likedCount ?? 0,
                publishedAt: c.publishedAt ?? new Date(),
                status: 'new',
                sentiment: classifySentiment(c.content),
              },
            });
            totalNew += 1;
          } catch (e: any) {
            // unique violation (already seen) — skip
            if (!String(e?.message ?? '').includes('Unique')) {
              this.log.warn(`save comment failed: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        this.log.warn(`feed_detail ${feedId} failed: ${e.message}`);
      }
    }
    this.log.log(`account ${accountId} swept ${notes.length} notes, ${totalNew} new comments`);
    return { sweptNotes: notes.length, newComments: totalNew };
  }
}

function extractFeedId(url: string): string | null {
  const m = url.match(/\/explore\/([a-f0-9]+)/i) ?? url.match(/\/discovery\/item\/([a-f0-9]+)/i);
  return m?.[1] ?? null;
}

interface Comment {
  id: string;
  parentId?: string;
  authorName: string;
  authorId: string;
  content: string;
  likedCount?: number;
  publishedAt?: Date;
}

// Defensive — xhs-mcp comment payload shape may vary across versions
function extractComments(detail: any): Comment[] {
  const list = detail?.comments?.list ?? detail?.commentList ?? detail?.comments ?? [];
  if (!Array.isArray(list)) return [];
  const out: Comment[] = [];
  for (const c of list) {
    if (!c?.id) continue;
    out.push({
      id: String(c.id),
      parentId: c.parentId ? String(c.parentId) : undefined,
      authorName: String(c.user?.nickname ?? c.author ?? c.userName ?? '匿名'),
      authorId: String(c.user?.userId ?? c.authorId ?? c.userId ?? ''),
      content: String(c.content ?? c.text ?? ''),
      likedCount: Number(c.likedCount ?? c.likes ?? 0),
      publishedAt: c.createTime ? new Date(c.createTime) : undefined,
    });
    // include nested replies
    const subs = c.subComments ?? c.replies ?? [];
    for (const sub of subs) {
      if (!sub?.id) continue;
      out.push({
        id: String(sub.id),
        parentId: String(c.id),
        authorName: String(sub.user?.nickname ?? sub.author ?? '匿名'),
        authorId: String(sub.user?.userId ?? sub.authorId ?? ''),
        content: String(sub.content ?? sub.text ?? ''),
        likedCount: Number(sub.likedCount ?? sub.likes ?? 0),
        publishedAt: sub.createTime ? new Date(sub.createTime) : undefined,
      });
    }
  }
  return out;
}

const POS_WORDS = ['好', '棒', '赞', '喜欢', '爱', '太好了', '推荐', '种草', '绝了', '宝藏', '感谢', '谢谢', '太棒', '优秀', '满意', '值得', '必买', '回购', '心动', '入手'];
const NEG_WORDS = ['差', '难吃', '坑', '骗', '假', '垃圾', '差评', '退款', '投诉', '失望', '恶心', '难看', '不好', '烂', '吐槽', '后悔', '踩雷', '翻车', '智商税', '割韭菜'];

function classifySentiment(text: string): string {
  const lower = text.toLowerCase();
  let posScore = 0;
  let negScore = 0;
  for (const w of POS_WORDS) { if (lower.includes(w)) posScore++; }
  for (const w of NEG_WORDS) { if (lower.includes(w)) negScore++; }
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}
