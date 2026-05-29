'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn, fmtDateTime } from '@/lib/utils';

export default function WorkersPage() {
  const [data, setData] = useState<{ dockerAvailable: boolean; workers: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setData(await Api.autoWorkerHealth());
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  const healthyCnt = data?.workers.filter((w) => w.workerHealth === 'healthy').length ?? 0;
  const activeCnt = data?.workers.filter((w) => w.status === 'active').length ?? 0;
  const totalCnt = data?.workers.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Worker 监控</h1>
        <Button variant="ghost" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard
          label="Docker"
          value={data?.dockerAvailable ? '可用' : '不可用'}
          tone={data?.dockerAvailable ? 'text-emerald-700' : 'text-red-700'}
        />
        <StatusCard label="活跃容器" value={`${healthyCnt} / ${totalCnt}`} tone="text-brand-700" />
        <StatusCard label="已登录账号" value={`${activeCnt} / ${totalCnt}`} tone="text-emerald-700" />
        <StatusCard label="总账号数" value={String(totalCnt)} tone="text-ink-700" />
      </div>

      {!data?.workers.length ? (
        <Card>
          <div className="text-ink-500 text-center py-10">
            <p>暂无 Worker。</p>
            <p className="text-xs mt-2">在「账号档案」页面绑定 XHS 账号后，Worker 会自动创建。</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.workers.map((w) => (
            <Card key={w.accountId} className="hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'w-3 h-3 rounded-full shrink-0',
                    w.workerHealth === 'healthy' ? 'bg-emerald-500' :
                    w.workerHealth === 'starting' ? 'bg-amber-400 animate-pulse' :
                    w.workerHealth === 'unhealthy' ? 'bg-amber-500' :
                    w.workerHealth === 'dead' ? 'bg-red-500' : 'bg-ink-300'
                  )} />
                  <div>
                    <div className="font-medium">{w.nickname}</div>
                    <div className="text-xs text-ink-500">Account ID: {w.accountId}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    w.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    w.status === 'qrcode_ready' ? 'bg-amber-100 text-amber-700' :
                    w.status === 'stopped' ? 'bg-ink-100/60 text-ink-700' :
                    w.status === 'banned' ? 'bg-red-100 text-red-700' : 'bg-ink-100/60',
                  )}>
                    {statusLabel(w.status)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 pt-3 border-t border-ink-100 text-sm">
                <Info label="Worker" value={healthLabel(w.workerHealth)} />
                <Info label="端口" value={w.port ? String(w.port) : '-'} />
                <Info label="容器" value={w.containerId ?? '-'} />
                <Info label="启动时间" value={w.startedAt ? fmtDateTime(w.startedAt) : '-'} />
                <Info label="最后活跃" value={w.lastUsedAt ? fmtDateTime(w.lastUsedAt) : '-'} />
              </div>

              <div className="mt-2 text-xs text-ink-500">
                日配额：{(w.dailyQuota as any)?.posts ?? 3} 帖/天
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={cn('text-xl font-bold mt-1', tone)}>{value}</div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-500">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'needs_bind': return '未绑定';
    case 'needs_login': return '未登录';
    case 'qrcode_ready': return '等待扫码';
    case 'active': return '在线';
    case 'challenged': return '需验证';
    case 'banned': return '已封号';
    case 'stopped': return '已停止';
    default: return s;
  }
}

function healthLabel(h: string): string {
  switch (h) {
    case 'healthy': return '健康';
    case 'unhealthy': return '异常';
    case 'starting': return '启动中';
    case 'dead': return '已停止';
    case 'none': return '无';
    default: return h;
  }
}
