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
import { ErrCode } from '../common/errors';
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
        code: ErrCode.DOCKER_UNAVAILABLE,
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
    // Multi-tenant guard: findFirst with teamId scope so a forged draftId
    // from another team can never reach the publish path.
    const draft = await this.prisma.draft.findFirst({
      where: { id: draftId, teamId },
    });
    if (!draft) throw new NotFoundException('draft not found');
    if (!draft.accountId) throw new BadRequestException({ code: ErrCode.BAD_INPUT, message: '草稿未绑定账号' });
    await this.assertQuota(draft.accountId);

    const handle = await this.ensureWorker(teamId, draft.accountId);
    const client = new XhsMcpClient(handle.baseUrl);
    const login = await client.loginStatus();
    if (!login.is_logged_in) {
      throw new BadRequestException({ code: ErrCode.INVALID_LINK, message: '账号尚未登录，请先绑定扫码' });
    }

    const media = (draft.media as Array<{ url: string }>) ?? [];
    if (media.length === 0) throw new BadRequestException({ code: ErrCode.BAD_INPUT, message: '草稿无图片' });

    // Download all images first, then stream a single tar archive into the
    // worker container in one shot. Avoids N round-trips through dockerode.
    const downloads = await Promise.all(
      media.map((m, i) =>
        downloadImage(m.url).then((data) => ({
          name: `${draftId.toString()}-${i}.jpg`,
          data,
        })),
      ),
    );
    const localPaths = await this.pool
      .copyAssetsIn(draft.accountId, downloads)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        throw new InternalServerErrorException({
          code: ErrCode.IMAGE_DISPATCH_FAILED,
          message: `图片下载/分发失败：${msg}`,
        });
      });

    const result = await client.publish({
      title: draft.title ?? '',
      content: draft.body ?? '',
      images: localPaths,
      tags: draft.hashtags,
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.draft.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: now, publishedUrl: result?.post_id ?? null },
      }),
      this.prisma.xhsSession.update({
        where: { accountId: draft.accountId },
        data: { lastUsedAt: now },
      }),
      this.prisma.publishLog.create({
        data: { accountId: draft.accountId, draftId: draft.id, publishedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          teamId,
          actorId: userId,
          action: 'automation.publish',
          targetType: 'draft',
          targetId: draft.id,
          meta: { accountId: draft.accountId.toString(), result },
        },
      }),
    ]);
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
    const a = await this.prisma.xhsAccount.findFirst({
      where: { id: accountId, teamId },
    });
    if (!a) throw new ForbiddenException({ code: ErrCode.ACCOUNT_NOT_IN_TEAM, message: 'account not in team' });
  }

  private async assertQuota(accountId: bigint) {
    const session = await this.prisma.xhsSession.findUnique({ where: { accountId } });
    const quota = (session?.dailyQuota as Record<string, number>) ?? { posts: 3 };
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    // Indexed query on publish_log (accountId, publishedAt DESC) — fast even
    // when the audit_log grows huge.
    const count = await this.prisma.publishLog.count({
      where: { accountId, publishedAt: { gte: since } },
    });
    if (count >= (quota.posts ?? 3)) {
      throw new ForbiddenException({
        code: ErrCode.QUOTA_EXCEEDED,
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
