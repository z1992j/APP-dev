// Thin wrapper over wx.request with auth + JSON.
// Streaming (SSE) uses RequestTask.onChunkReceived (since base 2.20.2).

interface AppGlobal {
  globalData: {
    apiBase: string;
    token: string;
    user: unknown;
    team: unknown;
  };
}

function app() {
  return getApp<AppGlobal>();
}

export interface ApiError {
  code?: number;
  message: string;
}

export function request<T = unknown>(
  method: WechatMiniprogram.RequestOption['method'],
  path: string,
  body?: unknown,
): Promise<T> {
  const a = app();
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${a.globalData.apiBase}${path}`,
      method,
      data: body,
      header: a.globalData.token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${a.globalData.token}` }
        : { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          const data = res.data as { code?: number; message?: string };
          reject({ code: data?.code, message: data?.message ?? `HTTP ${res.statusCode}` });
        }
      },
      fail: (err) => reject({ message: err.errMsg }),
    });
  });
}

export const Api = {
  wxLogin: (code: string) => request<{ token: string; user: any; team: any }>('POST', '/auth/wx-login', { code }),
  myTeams: () => request<any[]>('GET', '/auth/teams'),
  switchTeam: (teamId: string) =>
    request<{ token: string; team: any }>('POST', '/auth/switch-team', { teamId }),

  // teams
  currentTeam: () => request<any>('GET', '/teams/current'),
  listMembers: () => request<any[]>('GET', '/teams/members'),
  createInvite: (role: string) => request<{ code: string; expiresIn: number }>('POST', '/teams/invites', { role }),
  acceptInvite: (code: string) => request<any>('POST', '/teams/invites/accept', { code }),

  // drafts: review
  submitReview: (id: string) => request<any>('POST', `/drafts/${id}/submit-review`),
  reviewDraft: (id: string, decision: 'approve' | 'reject' | 'comment', comment?: string) =>
    request<any>('POST', `/drafts/${id}/review`, { decision, comment }),

  // accounts
  listAccounts: () => request<any[]>('GET', '/accounts'),
  createAccount: (data: any) => request<any>('POST', '/accounts', data),
  updateAccount: (id: string, data: any) => request<any>('PUT', `/accounts/${id}`, data),

  // drafts
  listDrafts: (params: { status?: string; cursor?: string } = {}) => {
    const q = Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return request<{ items: any[]; nextCursor: string | null }>('GET', `/drafts${q ? `?${q}` : ''}`);
  },
  getDraft: (id: string) => request<any>('GET', `/drafts/${id}`),
  createDraft: (data: any) => request<any>('POST', '/drafts', data),
  updateDraft: (id: string, data: any) => request<any>('PUT', `/drafts/${id}`, data),
  scheduleDraft: (id: string, scheduleAt: string) =>
    request<any>('POST', `/drafts/${id}/schedule`, { scheduleAt }),
  handoffDraft: (id: string) => request<any>('POST', `/drafts/${id}/handoff`),
  publishedDraft: (id: string, publishedUrl: string) =>
    request<any>('POST', `/drafts/${id}/published`, { publishedUrl }),

  // ai
  aiRewrite: (text: string, instruction: string) =>
    request<{ text: string }>('POST', '/ai/rewrite', { text, instruction }),

  // lint
  lint: (text: string, title?: string) =>
    request<{ passed: boolean; violations: any[]; version: number }>('POST', '/lint', { text, title }),

  // inspire
  inspireSearch: (q: string, vertical?: string) =>
    request<{ angles: any[]; userNotes: any[] }>(
      'GET',
      `/inspire/search?q=${encodeURIComponent(q)}${vertical ? `&vertical=${encodeURIComponent(vertical)}` : ''}`,
    ),
  inspireOembed: (url: string) => request<any>('POST', '/inspire/oembed', { url }),
  inspirePool: (noteFp: string) => request<any>('POST', '/inspire/pool', { noteFp }),

  // data
  reportData: (data: { accountId: string; bucketDate: string; metrics: Record<string, number> }) =>
    request<any>('POST', '/data/report', data),
  teamData: () => request<any>('GET', '/data/team'),

  // media
  signMedia: (kind: 'image' | 'video', ext: string, size: number) =>
    request<{ key: string; uploadUrl: string; publicUrl: string; ttl: number }>(
      'POST',
      '/media/sign',
      { kind, ext, size },
    ),
};

// Streaming AI write via onChunkReceived (SSE)
export function aiWriteStream(
  body: { topic: string; accountIds: string[]; style: string; words: number; refNoteFp?: string },
  onDelta: (evt: any) => void,
): Promise<void> {
  const a = app();
  return new Promise<void>((resolve, reject) => {
    const task = wx.request({
      url: `${a.globalData.apiBase}/ai/write`,
      method: 'POST',
      data: body,
      enableChunked: true,
      header: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${a.globalData.token}`,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject({ message: `HTTP ${res.statusCode}` });
      },
      fail: (err) => reject({ message: err.errMsg }),
    });

    let buf = '';
    const decoder = new TextDecoder();
    task.onChunkReceived((res) => {
      buf += decoder.decode(new Uint8Array(res.data));
      const lines = buf.split('\n\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/^data: (.*)$/m);
        if (!m) continue;
        const payload = m[1];
        if (payload === '[DONE]') return;
        try {
          onDelta(JSON.parse(payload));
        } catch {
          // ignore
        }
      }
    });
  });
}
