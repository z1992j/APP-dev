// HTTP client for a single xiaohongshu-mcp worker instance.
// Each XHS account has its own worker on a dedicated port.

import axios, { AxiosInstance } from 'axios';

export interface PublishImageRequest {
  title: string;
  content: string;
  images: string[];          // local file paths inside the worker container
  tags?: string[];
  schedule_at?: string;
  is_original?: boolean;
  visibility?: string;
  products?: string[];
}

export interface LoginStatusResponse {
  is_logged_in: boolean;
  username?: string;
}

export interface LoginQrcodeResponse {
  timeout: string;
  is_logged_in: boolean;
  img?: string;              // data URL or raw URL
}

export interface CommentRequest {
  feed_id: string;
  xsec_token?: string;
  content: string;
}

export class XhsMcpClient {
  private readonly http: AxiosInstance;
  constructor(private readonly baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 90_000,
      validateStatus: (s) => s < 500,
    });
  }

  async health(): Promise<boolean> {
    try {
      const r = await this.http.get('/health', { timeout: 3000 });
      return r.status === 200;
    } catch {
      return false;
    }
  }

  loginStatus = () => this.http.get<LoginStatusResponse>('/api/v1/login/status').then(r => r.data);

  loginQrcode = () => this.http.get<LoginQrcodeResponse>('/api/v1/login/qrcode').then(r => r.data);

  deleteCookies = () => this.http.delete('/api/v1/login/cookies').then(r => r.data);

  publish = (req: PublishImageRequest) =>
    this.http.post('/api/v1/publish', req).then(r => r.data);

  feedDetail = (feedId: string, xsecToken?: string, loadAllComments = false) =>
    this.http.post('/api/v1/feeds/detail', { feed_id: feedId, xsec_token: xsecToken, load_all_comments: loadAllComments }).then(r => r.data);

  postComment = (req: CommentRequest) =>
    this.http.post('/api/v1/feeds/comment', req).then(r => r.data);

  replyComment = (req: { feed_id: string; comment_id: string; content: string; xsec_token?: string }) =>
    this.http.post('/api/v1/feeds/comment/reply', req).then(r => r.data);

  myProfile = () => this.http.get('/api/v1/user/me').then(r => r.data);
}
