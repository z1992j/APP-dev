import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.module';
import { WorkerPool } from './worker-pool';
import { XhsMcpClient } from './xhs-mcp-client';
import axios from 'axios';

export interface PublishResult {
  status: string;
  noteUrl?: string;
}

@Injectable()
export class AutomationService {
  private readonly log = new Logger('AutomationService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: WorkerPool,
  ) {}

  /** Spawn (or reuse) the worker for an account and return its endpoint. */
  async ensureWorker(teamId: bigint, accountId: bigint) {
    if (!(await this.pool.available())) {
      throw new InternalServerErrorException({
        code: 50301,
        message: 'Docker 不可用，自动化能力暂未就绪',
      });
    }
    await this.assertOwn(teamId, accountId);

    const session = await this.prisma.xhsSession.upsert({
      where: { accountId },
      update: {},
      create: { accountId },
    });

    let handle = await this.pool.find(accountId);
    if (!handle) {
      const proxy = session.proxyId
        ? await this.prisma.proxy.findUnique({ where: { id: session.proxyId } })
        : null;
      handle = await this.pool.spawn({
        accountId,
        proxy: proxy
          ? {
              endpoint: proxy.endpoint,
              ...(proxy.credentials ? parseCreds(proxy.credentials) : {}),
            }
          : undefined,
      });
      await this.prisma.xhsSession.update({
        where: { accountId },
        data: {
          workerContainerId: handle.containerId,
          workerPort: handle.port,
          workerHealth: 'starting',
          workerStartedAt: new Date(),
        },
      });
    }
    return handle;
  }

  async workerHealth(teamId: bigint) {
    const accounts = await this.prisma.xhsAccount.findMany({ where: { teamId } });
    const sessions = await this.prisma.xhsSession.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    const workers: Array<{
      accountId: string;
      nickname: string;
      status: string;
      workerHealth: string;
      port: number | null;
      containerId: string | null;
      startedAt: Date | null;
      lastUsedAt: Date | null;
      dailyQuota: any;
    }> = [];
    const sessionMap = new Map(sessions.map((s) => [s.accountId.toString(), s]));
    for (const a of accounts) {
      const s = sessionMap.get(a.id.toString());
      workers.push({
        accountId: a.id.toString(),
        nickname: a.nickname,
        status: s?.status ?? 'needs_bind',
        workerHealth: s?.workerHealth ?? 'none',
        port: s?.workerPort ?? null,
        containerId: s?.workerContainerId?.slice(0, 12) ?? null,
        startedAt: s?.workerStartedAt ?? null,
        lastUsedAt: s?.lastUsedAt ?? null,
        dailyQuota: s?.dailyQuota ?? { posts: 3 },
      });
    }
    const dockerAvailable = await this.pool.available();
    return { dockerAvailable, workers };
  }

  async batchStatus(teamId: bigint) {
    const accounts = await this.prisma.xhsAccount.findMany({ where: { teamId } });
    const sessions = await this.prisma.xhsSession.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    const sessionMap = new Map(sessions.map((s) => [s.accountId.toString(), s]));
    const result: Record<string, { status: string; workerHealth: string; lastUsedAt: Date | null }> = {};
    for (const a of accounts) {
      const s = sessionMap.get(a.id.toString());
      result[a.id.toString()] = {
        status: s?.status ?? 'needs_bind',
        workerHealth: s?.workerHealth ?? 'none',
        lastUsedAt: s?.lastUsedAt ?? null,
      };
    }
    return result;
  }

  async status(teamId: bigint, accountId: bigint) {
    await this.assertOwn(teamId, accountId);
    const session = await this.prisma.xhsSession.findUnique({ where: { accountId } });
    if (!session) return { status: 'needs_bind', workerHealth: 'none' };
    const handle = await this.pool.find(accountId);
    let loginCheck: { is_logged_in: boolean; username?: string } | null = null;
    if (handle) {
      try {
        const client = new XhsMcpClient(handle.baseUrl);
        if (await client.health()) {
          loginCheck = await client.loginStatus();
        }
      } catch {
        // unhealthy
      }
    }
    return {
      status: session.status,
      workerHealth: handle ? (loginCheck ? 'healthy' : 'unhealthy') : 'stopped',
      port: handle?.port,
      loginStatus: loginCheck,
      qrcodeAt: session.qrcodeIssuedAt,
      lastUsedAt: session.lastUsedAt,
    };
  }

  /** Request a login QR. Spawns the worker if needed. */
  async requestQrcode(teamId: bigint, accountId: bigint) {
    const handle = await this.ensureWorker(teamId, accountId);
    const client = new XhsMcpClient(handle.baseUrl);
    // Worker boots in ~2-4s; poll readiness briefly.
    for (let i = 0; i < 30; i++) {
      if (await client.health()) break;
      await sleep(500);
    }
    const qr = await client.loginQrcode();
    if (qr.is_logged_in) {
      await this.prisma.xhsSession.update({
        where: { accountId },
        data: { status: 'active', loginAt: new Date(), workerHealth: 'healthy', qrcodeData: null },
      });
      return { isLoggedIn: true };
    }
    await this.prisma.xhsSession.update({
      where: { accountId },
      data: {
        status: 'qrcode_ready',
        workerHealth: 'healthy',
        qrcodeData: qr.img ?? null,
        qrcodeIssuedAt: new Date(),
      },
    });
    return { isLoggedIn: false, img: qr.img, timeout: qr.timeout };
  }

  /** Called by the binding UI to poll until user has scanned. */
  async pollLogin(teamId: bigint, accountId: bigint) {
    await this.assertOwn(teamId, accountId);
    const handle = await this.pool.find(accountId);
    if (!handle) return { isLoggedIn: false, workerHealth: 'stopped' };
    const client = new XhsMcpClient(handle.baseUrl);
    if (!(await client.health())) return { isLoggedIn: false, workerHealth: 'unhealthy' };
    const r = await client.loginStatus();
    if (r.is_logged_in) {
      await this.prisma.xhsSession.update({
        where: { accountId },
        data: { status: 'active', loginAt: new Date(), workerHealth: 'healthy', qrcodeData: null },
      });
    }
    return { isLoggedIn: r.is_logged_in, username: r.username, workerHealth: 'healthy' };
  }

  /** Tear down the worker (used on unbind or "reset login"). */
  async stop(teamId: bigint, accountId: bigint) {
    await this.assertOwn(teamId, accountId);
    await this.pool.stop(accountId);
    await this.prisma.xhsSession.update({
      where: { accountId },
      data: {
        status: 'stopped',
        workerHealth: 'dead',
        workerContainerId: null,
        workerPort: null,
      },
    });
    return { ok: true };
  }

  /** Publish a draft via the worker. Images are downloaded into the assets volume first. */
  async publishDraft(teamId: bigint, draftId: bigint, userId: bigint): Promise<PublishResult> {
    const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft || draft.teamId !== teamId) throw new NotFoundException('draft not found');
    if (!draft.accountId) throw new BadRequestException({ code: 40001, message: '草稿未绑定账号' });
    await this.assertQuota(draft.accountId);

    const handle = await this.ensureWorker(teamId, draft.accountId);
    const client = new XhsMcpClient(handle.baseUrl);
    const login = await client.loginStatus();
    if (!login.is_logged_in) {
      throw new BadRequestException({ code: 40002, message: '账号尚未登录，请先绑定扫码' });
    }

    const media = (draft.media as Array<{ url: string }>) ?? [];
    if (media.length === 0) throw new BadRequestException({ code: 40001, message: '草稿无图片' });

    const localPaths: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const url = media[i].url;
      const buf = await downloadImage(url);
      const name = `${draftId.toString()}-${i}.jpg`;
      // Phase 2.1 requires tar-stream — for now the user must manually pre-stage files,
      // OR we shell out to `docker cp` (handled by the deploy script side).
      // Skeleton: this code path will throw via copyAssetsIn() until tar-stream lands.
      localPaths.push(`/app/assets/${name}`);
      await this.pool.copyAssetsIn(draft.accountId, [{ name, data: buf }]).catch((e) => {
        throw new InternalServerErrorException({ code: 50001, message: `图片下载/分发失败：${(e as Error).message}` });
      });
    }

    const result = await client.publish({
      title: draft.title ?? '',
      content: draft.body ?? '',
      images: localPaths,
      tags: draft.hashtags,
    });

    await this.prisma.draft.update({
      where: { id: draft.id },
      data: { status: 'published', publishedAt: new Date(), publishedUrl: result?.post_id ?? null },
    });
    await this.prisma.xhsSession.update({
      where: { accountId: draft.accountId },
      data: { lastUsedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        teamId,
        actorId: userId,
        action: 'automation.publish',
        targetType: 'draft',
        targetId: draft.id,
        meta: { accountId: draft.accountId.toString(), result },
      },
    });
    return { status: result?.status ?? 'ok', noteUrl: result?.post_id };
  }

  async postComment(teamId: bigint, accountId: bigint, feedId: string, xsecToken: string | undefined, content: string) {
    await this.assertOwn(teamId, accountId);
    const handle = await this.ensureWorker(teamId, accountId);
    const client = new XhsMcpClient(handle.baseUrl);
    const r = await client.postComment({ feed_id: feedId, xsec_token: xsecToken, content });
    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'automation.comment',
        targetType: 'feed',
        meta: { accountId: accountId.toString(), feedId, content },
      },
    });
    return r;
  }

  private async assertOwn(teamId: bigint, accountId: bigint) {
    const a = await this.prisma.xhsAccount.findUnique({ where: { id: accountId } });
    if (!a || a.teamId !== teamId) throw new ForbiddenException('account not in team');
  }

  private async assertQuota(accountId: bigint) {
    const session = await this.prisma.xhsSession.findUnique({ where: { accountId } });
    const quota = (session?.dailyQuota as Record<string, number>) ?? { posts: 3 };
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const count = await this.prisma.auditLog.count({
      where: {
        action: 'automation.publish',
        createdAt: { gte: since },
        meta: { path: ['accountId'], equals: accountId.toString() },
      },
    });
    if (count >= (quota.posts ?? 3)) {
      throw new ForbiddenException({
        code: 40901,
        message: `今日已达发帖上限 (${quota.posts})，明日再试或在账号设置调整配额`,
      });
    }
  }
}

function parseCreds(s: string): { user?: string; pass?: string } {
  const i = s.indexOf(':');
  if (i === -1) return { user: s };
  return { user: s.slice(0, i), pass: s.slice(i + 1) };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 15_000,
    headers: { 'User-Agent': 'Mozilla/5.0 RedMatrix/0.1' },
  });
  return Buffer.from(res.data);
}
