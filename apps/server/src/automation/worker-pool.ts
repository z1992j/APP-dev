// Per-account xiaohongshu-mcp worker lifecycle via Docker.
// Each XHS account gets one container with isolated cookies + isolated proxy IP.

import Docker from 'dockerode';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pack as tarPack } from 'tar-stream';
import { Readable } from 'stream';

const IMAGE_DEFAULT = 'xpzouying/xiaohongshu-mcp:latest';
const NETWORK_NAME = 'redmatrix-internal';
const PORT_RANGE = [18000, 18999] as const;

export interface WorkerSpec {
  accountId: bigint;
  proxy?: { endpoint: string; user?: string; pass?: string };
}

export interface WorkerHandle {
  containerId: string;
  port: number;
  baseUrl: string;
}

@Injectable()
export class WorkerPool {
  private readonly log = new Logger('WorkerPool');
  private readonly docker: Docker;
  private readonly image: string;
  private readonly host: string;

  constructor(private readonly cfg: ConfigService) {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.image = cfg.get<string>('XHS_MCP_IMAGE') ?? IMAGE_DEFAULT;
    this.host = cfg.get<string>('WORKER_HOST') ?? '127.0.0.1';
  }

  async available(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  containerName(accountId: bigint): string {
    return `xhs-mcp-acc-${accountId.toString()}`;
  }

  cookiesVolume(accountId: bigint): string {
    return `xhs-mcp-cookies-${accountId.toString()}`;
  }

  assetsVolume(accountId: bigint): string {
    return `xhs-mcp-assets-${accountId.toString()}`;
  }

  async find(accountId: bigint): Promise<WorkerHandle | null> {
    const name = this.containerName(accountId);
    try {
      const c = this.docker.getContainer(name);
      const info = await c.inspect();
      if (!info.State.Running) return null;
      const portBinding = info.NetworkSettings.Ports?.['18060/tcp']?.[0]?.HostPort;
      if (!portBinding) return null;
      const port = Number(portBinding);
      return { containerId: info.Id, port, baseUrl: `http://${this.host}:${port}` };
    } catch (e: any) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  async spawn(spec: WorkerSpec): Promise<WorkerHandle> {
    const port = await this.allocatePort();
    const name = this.containerName(spec.accountId);

    // Best-effort: ensure cookies/assets volumes exist
    for (const v of [this.cookiesVolume(spec.accountId), this.assetsVolume(spec.accountId)]) {
      try {
        await this.docker.createVolume({ Name: v });
      } catch (e: any) {
        if (e.statusCode !== 409) this.log.warn(`volume ${v} create: ${e.message}`);
      }
    }

    const env = [`XHS_PORT=18060`];
    if (spec.proxy?.endpoint) {
      const u = new URL(spec.proxy.endpoint);
      if (spec.proxy.user) u.username = spec.proxy.user;
      if (spec.proxy.pass) u.password = spec.proxy.pass;
      env.push(`XHS_PROXY=${u.toString()}`);
    }

    const container = await this.docker.createContainer({
      name,
      Image: this.image,
      Env: env,
      ExposedPorts: { '18060/tcp': {} },
      HostConfig: {
        PortBindings: { '18060/tcp': [{ HostPort: String(port) }] },
        Binds: [
          `${this.cookiesVolume(spec.accountId)}:/app/cookies`,
          `${this.assetsVolume(spec.accountId)}:/app/assets`,
        ],
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: 800 * 1024 * 1024, // 800 MB cap
      },
      Labels: {
        'redmatrix.role': 'xhs-mcp-worker',
        'redmatrix.account_id': spec.accountId.toString(),
      },
    });

    await container.start();
    const info = await container.inspect();
    this.log.log(`worker spawned: account=${spec.accountId} port=${port} container=${info.Id.slice(0, 12)}`);
    return { containerId: info.Id, port, baseUrl: `http://${this.host}:${port}` };
  }

  async stop(accountId: bigint): Promise<void> {
    const name = this.containerName(accountId);
    try {
      const c = this.docker.getContainer(name);
      await c.stop({ t: 5 }).catch(() => undefined);
      await c.remove({ force: true }).catch(() => undefined);
      this.log.log(`worker stopped: account=${accountId}`);
    } catch (e: any) {
      if (e.statusCode !== 404) throw e;
    }
  }

  async copyAssetsIn(accountId: bigint, files: Array<{ name: string; data: Buffer }>): Promise<string[]> {
    // Streams files into the assets volume via a helper alpine container.
    // Returns paths inside the worker container.
    const tarStream = await tarFromFiles(files);
    const helper = await this.docker.createContainer({
      Image: 'alpine:3.19',
      Cmd: ['/bin/true'],
      HostConfig: {
        Binds: [`${this.assetsVolume(accountId)}:/dest`],
        AutoRemove: true,
      },
    });
    await helper.start().catch(() => undefined);
    await helper.putArchive(tarStream, { path: '/dest' });
    return files.map((f) => `/app/assets/${f.name}`);
  }

  private async allocatePort(): Promise<number> {
    const used = new Set<number>();
    const list = await this.docker.listContainers({
      all: true,
      filters: { label: ['redmatrix.role=xhs-mcp-worker'] },
    });
    for (const c of list) {
      const p = c.Ports?.find((p) => p.PrivatePort === 18060)?.PublicPort;
      if (p) used.add(p);
    }
    for (let p = PORT_RANGE[0]; p <= PORT_RANGE[1]; p++) {
      if (!used.has(p)) return p;
    }
    throw new Error('no free worker port');
  }
}

async function tarFromFiles(files: Array<{ name: string; data: Buffer }>): Promise<Readable> {
  const pack = tarPack();
  for (const f of files) {
    pack.entry({ name: f.name, size: f.data.length, mode: 0o644 }, f.data);
  }
  pack.finalize();
  return pack;
}
