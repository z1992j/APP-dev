export const QUEUE_NAMES = {
  PUBLISH: 'publish',
  COMMENT_SWEEP: 'comment-sweep',
  COMMENT_REPLY: 'comment-reply',
} as const;

export interface PublishJobData {
  teamId: string;
  userId: string;
  draftId: string;
  accountId: string;
}

export interface CommentSweepJobData {
  teamId: string;
  accountId: string;
  noteUrl?: string;     // 限定扫某条；省略 = 扫该账号所有近期笔记
}

export interface CommentReplyJobData {
  teamId: string;
  commentId: string;     // 我们 DB 里的 XhsComment.id
  ruleId?: string;       // 命中的规则 id
  replyText: string;
}

// Default per-account throttle (production override per session)
export const DEFAULT_PUBLISH_MIN_INTERVAL_MS = 30 * 60 * 1000;
export const DEFAULT_COMMENT_MIN_INTERVAL_MS = 60 * 1000;
