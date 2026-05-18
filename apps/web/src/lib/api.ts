// Thin REST client. Token stored in localStorage for MVP; production should
// switch to httpOnly cookie + CSRF.

const STORAGE_KEY = 'redmatrix:auth';

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
  const token = loadAuth()?.token;
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

// Server-sent events for streaming AI write.
export async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (evt: any) => void,
): Promise<void> {
  const token = loadAuth()?.token;
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  // automation (Phase 2)
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
  teamData: () =>
    request<{ totals: Record<string, number>; accounts: any[] }>('GET', '/data/team'),
};
