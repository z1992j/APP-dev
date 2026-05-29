'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn, fmtNumber } from '@/lib/utils';

type Range = '7' | '30' | '90';

export default function DataPage() {
  const [team, setTeam] = useState<{ totals: Record<string, number>; accounts: any[] } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [chosen, setChosen] = useState('');
  const [metrics, setMetrics] = useState<Record<string, number>>({
    followers: 0, impressions: 0, likes: 0, saves: 0, comments: 0, msgs: 0, posts: 0,
  });
  const [filing, setFiling] = useState(false);
  const [range, setRange] = useState<Range>('7');
  const [trendAccount, setTrendAccount] = useState('');
  const [series, setSeries] = useState<any[]>([]);
  const [trendMetric, setTrendMetric] = useState<string>('followers');

  async function reload() {
    try {
      const [t, accs] = await Promise.all([Api.teamData(), Api.listAccounts()]);
      setTeam(t);
      setAccounts(accs);
      if (accs.length > 0 && !chosen) setChosen(accs[0].id);
      if (accs.length > 0 && !trendAccount) setTrendAccount(accs[0].id);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }

  async function loadTrend() {
    if (!trendAccount) return;
    const from = new Date(Date.now() - Number(range) * 86400_000).toISOString().slice(0, 10);
    try {
      const res = await Api.accountData(trendAccount, from);
      setSeries(res.series);
    } catch {
      setSeries([]);
    }
  }

  useEffect(() => { reload(); }, []);
  useEffect(() => { loadTrend(); }, [trendAccount, range]);

  async function submit() {
    if (!chosen) return toast('请选账号', 'info');
    setFiling(true);
    try {
      await Api.reportData({
        accountId: chosen,
        bucketDate: new Date().toISOString().slice(0, 10),
        metrics,
      });
      toast('已保存填报', 'success');
      await reload();
      await loadTrend();
    } catch (e: any) {
      toast(e?.message ?? '保存失败', 'error');
    } finally {
      setFiling(false);
    }
  }

  const interaction =
    (team?.totals.likes ?? 0) + (team?.totals.saves ?? 0) + (team?.totals.comments ?? 0);

  const trendValues = series.map((s) => {
    const m = s.metrics as Record<string, number>;
    return m[trendMetric] ?? 0;
  });
  const trendMax = Math.max(...trendValues, 1);
  const trendDates = series.map((s) => {
    const d = new Date(s.bucketDate);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">数据</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="总粉丝" value={fmtNumber(team?.totals.followers)} />
        <Stat label="总曝光" value={fmtNumber(team?.totals.impressions)} />
        <Stat label="总互动" value={fmtNumber(interaction)} />
        <Stat label="账号数" value={String(accounts.length)} />
      </div>

      {/* Trend Chart */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>趋势</CardTitle>
          <div className="flex gap-2">
            {(['7', '30', '90'] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={cn('px-3 py-1 rounded-full text-xs', range === r ? 'bg-brand-500 text-white' : 'bg-ink-100/60')}>
                {r}天
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <select
            value={trendAccount}
            onChange={(e) => setTrendAccount(e.target.value)}
            className="bg-ink-100/60 rounded-md px-2 py-1 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.nickname}</option>
            ))}
          </select>
          <select
            value={trendMetric}
            onChange={(e) => setTrendMetric(e.target.value)}
            className="bg-ink-100/60 rounded-md px-2 py-1 text-sm"
          >
            {[['followers', '粉丝'], ['impressions', '曝光'], ['likes', '点赞'], ['saves', '收藏'], ['comments', '评论'], ['posts', '发布']].map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>

        {series.length === 0 ? (
          <div className="text-ink-500 text-sm text-center py-8">暂无数据，请先填报</div>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {trendValues.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs text-ink-500">{fmtNumber(v)}</div>
                <div
                  className="w-full bg-brand-400 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${(v / trendMax) * 100}%` }}
                />
                <div className="text-xs text-ink-400">{trendDates[i]}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Filing */}
      <Card>
        <CardTitle>今日填报（30 秒）</CardTitle>
        <div className="mb-4">
          <div className="text-xs text-ink-500 mb-2">选择账号</div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setChosen(a.id)}
                className={
                  'px-3 py-1.5 rounded-full text-sm ' +
                  (chosen === a.id ? 'bg-brand-500 text-white' : 'bg-ink-100/60')
                }
              >
                {a.nickname}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(
            [
              ['followers', '粉丝总数'],
              ['impressions', '今日曝光'],
              ['likes', '今日点赞'],
              ['saves', '今日收藏'],
              ['comments', '今日评论'],
              ['msgs', '今日私信'],
              ['posts', '今日发布'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="text-xs text-ink-500 mb-1">{label}</div>
              <Input
                type="number"
                value={metrics[key] || ''}
                onChange={(e) => setMetrics((m) => ({ ...m, [key]: Number(e.target.value) || 0 }))}
              />
            </div>
          ))}
        </div>

        <Button onClick={submit} disabled={filing} className="mt-4">
          {filing ? '保存中…' : '保存今日填报'}
        </Button>
      </Card>

      {/* Account summary */}
      <Card>
        <CardTitle>账号汇总</CardTitle>
        {accounts.length === 0 ? (
          <div className="text-ink-500 text-sm">还没有账号档案</div>
        ) : (
          <div className="divide-y divide-ink-100">
            {accounts.map((a) => (
              <div key={a.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-medium">{a.nickname}</div>
                  <div className="text-xs text-ink-500">{a.vertical ?? '未设置'}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setTrendAccount(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  查看趋势
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}
