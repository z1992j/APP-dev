// REST client. Auth token sent as httpOnly cookie (set by server) + Bearer header fallback.
// User profile (id/nickname/team) kept in localStorage for UI; token itself is NOT in localStorage.

const STORAGE_KEY = 'redmatrix:auth';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');

export interface AuthState {
  token: string;
  user: { id: string; nickname?: string; avatarUrl?: string };
  team: { id: string; role: string };
}

export function loadAuth(): AuthState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function saveAuth(s: AuthState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(public code: number | undefined, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let data: any = {};
    try { data = await res.json(); } catch { /* ignore */ }
    throw new ApiError(data?.code, data?.message ?? `HTTP ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (evt: any) => void,
): Promise<void> {
  const res = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new ApiError(undefined, `stream failed: HTTP ${res.status}`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() ?? '';
    for (const ev of events) {
      const line = ev.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return;
      try { onEvent(JSON.parse(payload)); } catch { /* ignore */ }
    }
  }
}

export const Api = {
  // auth
  wxLogin: (code: string) =>
    request<{ token: string; user: AuthState['user']; team: AuthState['team'] }>(
      'POST', '/auth/wx-login', { code },
    ),
  myTeams: () => request<Array<{ teamId: string; name: string; plan: string; role: string }>>('GET', '/auth/teams'),
  switchTeam: (teamId: string) =>
    request<{ token: string; team: AuthState['team'] }>('POST', '/auth/switch-team', { teamId }),

  // teams
  currentTeam: () => request<any>('GET', '/teams/current'),
  listMembers: () => request<any[]>('GET', '/teams/members'),
  createInvite: (role: string) =>
    request<{ code: string; role: string; expiresIn: number }>('POST', '/teams/invites', { role }),
  acceptInvite: (code: string) => request<any>('POST', '/teams/invites/accept', { code }),
  changeRole: (userId: string, role: string) =>
    request<any>('POST', `/teams/members/${userId}/role`, { role }),
  removeMember: (userId: string) => request<any>('DELETE', `/teams/members/${userId}`),

  // accounts
  listAccounts: () => request<any[]>('GET', '/accounts'),
  createAccount: (data: any) => request<any>('POST', '/accounts', data),
  updateAccount: (id: string, data: any) => request<any>('PUT', `/accounts/${id}`, data),
  deleteAccount: (id: string) => request<any>('DELETE', `/accounts/${id}`),

  // drafts
  listDrafts: (params: { status?: string; cursor?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.cursor) q.set('cursor', params.cursor);
    const qs = q.toString();
    return request<{ items: any[]; nextCursor: string | null }>(
      'GET', `/drafts${qs ? `?${qs}` : ''}`,
    );
  },
  getDraft: (id: string) => request<any>('GET', `/drafts/${id}`),
  createDraft: (data: any) => request<any>('POST', '/drafts', data),
  updateDraft: (id: string, data: any) => request<any>('PUT', `/drafts/${id}`, data),
  scheduleDraft: (id: string, scheduleAt: string) =>
    request<any>('POST', `/drafts/${id}/schedule`, { scheduleAt }),
  handoffDraft: (id: string) => request<any>('POST', `/drafts/${id}/handoff`),
  publishedDraft: (id: string, publishedUrl: string) =>
    request<any>('POST', `/drafts/${id}/published`, { publishedUrl }),
  submitReview: (id: string) => request<any>('POST', `/drafts/${id}/submit-review`),
  reviewDraft: (id: string, decision: 'approve' | 'reject' | 'comment', comment?: string) =>
    request<any>('POST', `/drafts/${id}/review`, { decision, comment }),

  // lint
  lint: (text: string, title?: string) =>
    request<{ passed: boolean; violations: any[]; version: number }>(
      'POST', '/lint', { text, title },
    ),

  // inspire
  inspireSearch: (q: string, vertical?: string) => {
    const qs = new URLSearchParams({ q });
    if (vertical) qs.set('vertical', vertical);
    return request<{ angles: any[]; userNotes: any[] }>('GET', `/inspire/search?${qs}`);
  },
  inspireOembed: (url: string) => request<any>('POST', '/inspire/oembed', { url }),
  inspirePool: (noteFp: string) => request<any>('POST', '/inspire/pool', { noteFp }),

  // ai
  aiRewrite: (text: string, instruction: string) =>
    request<{ text: string }>('POST', '/ai/rewrite', { text, instruction }),

  // imitate (Phase 1)
  imitateParse: (url: string) =>
    request<{
      url: string;
      title?: string;
      body?: string;
      author?: string;
      images: Array<{ src: string; w?: number; h?: number }>;
      empty?: boolean;
      hint?: string;
    }>('POST', '/imitate/parse', { url }),

  // comments (Phase 3-A)
  listComments: (params: { status?: string; accountId?: string; cursor?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.cursor) q.set('cursor', params.cursor);
    const qs = q.toString();
    return request<{ items: any[]; nextCursor: string | null }>(
      'GET', `/comments${qs ? `?${qs}` : ''}`,
    );
  },
  commentStats: () => request<Record<string, number>>('GET', '/comments/stats'),
  triggerCommentSweep: (accountId?: string) =>
    request<{ queued: number }>('POST', '/comments/sweep', { accountId }),
  replyComment: (id: string, text: string) =>
    request<{ queued: boolean }>('POST', `/comments/${id}/reply`, { text }),
  ignoreComment: (id: string) =>
    request<any>('POST', `/comments/${id}/ignore`),
  autoReplyComment: (id: string) =>
    request<{ matched: boolean; ruleId?: string }>('POST', `/comments/${id}/auto-reply`),
  listRules: () => request<any[]>('GET', '/comment-rules'),
  createRule: (data: {
    name: string;
    triggers: string[];
    replyMode: 'template' | 'ai';
    template?: string;
    accountId?: string;
    priority?: number;
  }) => request<any>('POST', '/comment-rules', data),
  updateRule: (id: string, data: any) =>
    request<any>('PUT', `/comment-rules/${id}`, data),
  deleteRule: (id: string) =>
    request<any>('DELETE', `/comment-rules/${id}`),

  // automation (Phase 2)
  autoBatchStatus: () =>
    request<Record<string, { status: string; workerHealth: string; lastUsedAt: string | null }>>(
      'GET', '/automation/sessions/batch-status',
    ),
  autoWorkerHealth: () =>
    request<{ dockerAvailable: boolean; workers: any[] }>('GET', '/automation/workers/health'),
  autoStatus: (accountId: string) =>
    request<{
      status: string;
      workerHealth: string;
      port?: number;
      loginStatus?: { is_logged_in: boolean; username?: string };
      qrcodeAt?: string;
      lastUsedAt?: string;
    }>('GET', `/automation/sessions/${accountId}/status`),
  autoBind: (accountId: string) =>
    request<{ isLoggedIn: boolean; img?: string; timeout?: string }>(
      'POST',
      `/automation/sessions/${accountId}/bind`,
    ),
  autoPoll: (accountId: string) =>
    request<{ isLoggedIn: boolean; username?: string; workerHealth: string }>(
      'GET',
      `/automation/sessions/${accountId}/poll`,
    ),
  autoUnbind: (accountId: string) =>
    request<{ ok: true }>('DELETE', `/automation/sessions/${accountId}`),
  autoPublish: (draftId: string) =>
    request<{ status: string; noteUrl?: string }>(
      'POST',
      `/automation/drafts/${draftId}/publish`,
    ),

  // data
  reportData: (data: { accountId: string; bucketDate: string; metrics: Record<string, number> }) =>
    request<any>('POST', '/data/report', data),
  accountData: (accountId: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return request<{ series: any[] }>('GET', `/data/account/${accountId}${qs ? `?${qs}` : ''}`);
  },
  teamData: () =>
    request<{ totals: Record<string, number>; accounts: any[] }>('GET', '/data/team'),

  // dm (Phase 5)
  dmConversations: (params: { accountId?: string; status?: string; cursor?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.status) q.set('status', params.status);
    if (params.cursor) q.set('cursor', params.cursor);
    const qs = q.toString();
    return request<{ items: any[]; nextCursor: string | null }>('GET', `/dm/conversations${qs ? `?${qs}` : ''}`);
  },
  dmMessages: (convId: string, cursor?: string) => {
    const q = cursor ? `?cursor=${cursor}` : '';
    return request<{ items: any[]; nextCursor: string | null }>('GET', `/dm/conversations/${convId}/messages${q}`);
  },
  dmSend: (convId: string, content: string) =>
    request<any>('POST', `/dm/conversations/${convId}/send`, { content }),
  dmAiSuggest: (convId: string) =>
    request<{ suggestion: string }>('POST', `/dm/conversations/${convId}/ai-suggest`),
  dmArchive: (convId: string) =>
    request<{ ok: boolean }>('POST', `/dm/conversations/${convId}/archive`),
  dmStats: () =>
    request<{ totalUnread: number; unreadConversations: number }>('GET', '/dm/stats'),
};
