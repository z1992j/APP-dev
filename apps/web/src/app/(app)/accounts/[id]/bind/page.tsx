'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';

interface BindStatus {
  status: string;
  workerHealth: string;
  loginStatus?: { is_logged_in: boolean; username?: string };
  port?: number;
  lastUsedAt?: string;
}

export default function BindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = use(params);
  const router = useRouter();
  const [account, setAccount] = useState<any>(null);
  const [status, setStatus] = useState<BindStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const accs = await Api.listAccounts();
      setAccount(accs.find((a: any) => a.id === accountId) ?? null);
      const s = await Api.autoStatus(accountId);
      setStatus(s);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [accountId]);

  function startPolling() {
    setPolling(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await Api.autoPoll(accountId);
        if (r.isLoggedIn) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
          setQr(null);
          toast(`登录成功${r.username ? `（${r.username}）` : ''}`, 'success');
          await loadStatus();
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
  }

  async function onBind() {
    setBinding(true);
    try {
      const r = await Api.autoBind(accountId);
      if (r.isLoggedIn) {
        toast('账号已登录', 'success');
        await loadStatus();
        return;
      }
      if (r.img) {
        setQr(r.img);
        startPolling();
        toast('请用小红书 App 扫码', 'info');
      } else {
        toast('未获取到二维码', 'error');
      }
    } catch (e: any) {
      toast(e?.message ?? '绑定失败', 'error');
    } finally {
      setBinding(false);
    }
  }

  async function onUnbind() {
    if (!confirm('解绑会停止该账号的自动化容器，确认？')) return;
    setUnbinding(true);
    try {
      await Api.autoUnbind(accountId);
      toast('已解绑', 'success');
      setQr(null);
      if (pollRef.current) clearInterval(pollRef.current);
      setPolling(false);
      await loadStatus();
    } catch (e: any) {
      toast(e?.message ?? '解绑失败', 'error');
    } finally {
      setUnbinding(false);
    }
  }

  const loggedIn = status?.loginStatus?.is_logged_in ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-ink-500 hover:text-ink-900">
          ←
        </button>
        <h1 className="text-2xl font-semibold">绑定 XHS 账号 — 自动化</h1>
      </div>

      <Card>
        <CardTitle>账号</CardTitle>
        <div className="text-base">{account?.nickname ?? '加载中…'}</div>
        <div className="text-xs text-ink-500 mt-1">{account?.vertical ?? '未设置赛道'}</div>
      </Card>

      <Card>
        <CardTitle>状态</CardTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Info label="会话状态" value={statusLabel(status?.status)} />
          <Info label="Worker 健康" value={healthLabel(status?.workerHealth)} />
          <Info label="登录" value={loggedIn ? `✅ ${status?.loginStatus?.username ?? '已登录'}` : '⏸ 未登录'} />
          <Info label="端口" value={status?.port ? String(status.port) : '-'} />
        </div>
      </Card>

      <Card>
        <CardTitle>绑定流程</CardTitle>
        <ol className="text-sm text-ink-700 list-decimal pl-5 space-y-1 mb-4">
          <li>点「开始绑定」→ 服务端自动启动账号专属 Docker 容器</li>
          <li>显示二维码 → 用小红书 App 扫码（扫码后等 2~3 秒）</li>
          <li>登录成功 cookie 即持久化到容器卷，后续无需重复</li>
          <li>过期或异地登录会回到「未登录」状态</li>
        </ol>

        <div className="flex gap-2">
          <Button onClick={onBind} disabled={binding || loggedIn}>
            {binding ? '启动中…' : loggedIn ? '已登录' : '开始绑定 / 重新扫码'}
          </Button>
          <Button onClick={onUnbind} variant="danger" disabled={unbinding}>
            {unbinding ? '停止中…' : '解绑 + 停止容器'}
          </Button>
          <Button onClick={loadStatus} variant="ghost">刷新状态</Button>
        </div>

        {qr && (
          <div className="mt-6 flex flex-col items-center">
            <div className="rounded-lg bg-white p-4 border border-ink-100 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="login QR" className="w-56 h-56 object-contain" />
            </div>
            <div className="text-xs text-ink-500 mt-2">
              {polling ? '等待扫码中…（每 2s 自动检查）' : '请用小红书 App 扫码登录'}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          ⚠️ <b>自动化能力使用须知</b>：本系统在你的授权下代为操作你提供的账号；操作行为风险由你自行承担，
          不得用于违反《小红书社区规范》或法律法规的行为。系统已内置每账号日发帖 ≤3、最小间隔 30 分钟等节流保护。
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ink-500">{label}</div>
      <div className="font-medium mt-1">{value}</div>
    </div>
  );
}

function statusLabel(s?: string): string {
  switch (s) {
    case 'needs_bind': return '未绑定';
    case 'needs_login': return '未登录';
    case 'qrcode_ready': return '等待扫码';
    case 'active': return '✅ 活跃';
    case 'challenged': return '⚠️ 验证码';
    case 'banned': return '🚫 已封号';
    case 'stopped': return '已停止';
    default: return s ?? '-';
  }
}

function healthLabel(h?: string): string {
  switch (h) {
    case 'healthy': return '✅ 健康';
    case 'unhealthy': return '⚠️ 异常';
    case 'starting': return '🔄 启动中';
    case 'stopped': return '⏸ 已停止';
    case 'dead': return '❌ 死掉';
    case 'none': return '无';
    default: return h ?? '-';
  }
}
