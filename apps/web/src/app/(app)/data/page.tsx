'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { fmtNumber } from '@/lib/utils';

export default function DataPage() {
  const [team, setTeam] = useState<{ totals: Record<string, number>; accounts: any[] } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [chosen, setChosen] = useState('');
  const [metrics, setMetrics] = useState<Record<string, number>>({
    followers: 0, impressions: 0, likes: 0, saves: 0, comments: 0, msgs: 0, posts: 0,
  });
  const [filing, setFiling] = useState(false);

  async function reload() {
    try {
      const [t, accs] = await Promise.all([Api.teamData(), Api.listAccounts()]);
      setTeam(t);
      setAccounts(accs);
      if (accs.length > 0 && !chosen) setChosen(accs[0].id);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }
  useEffect(() => { reload(); }, []);

  async function submit() {
    if (!chosen) return toast('请选账号', 'info');
    setFiling(true);
    try {
      await Api.reportData({
        accountId: chosen,
        bucketDate: new Date().toISOString().slice(0, 10),
        metrics,
      });
      toast('已保存填报 ✓', 'success');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '保存失败', 'error');
    } finally {
      setFiling(false);
    }
  }

  const interaction =
    (team?.totals.likes ?? 0) + (team?.totals.saves ?? 0) + (team?.totals.comments ?? 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">数据</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="总粉丝" value={fmtNumber(team?.totals.followers)} />
        <Stat label="总曝光" value={fmtNumber(team?.totals.impressions)} />
        <Stat label="总互动" value={fmtNumber(interaction)} />
        <Stat label="账号数" value={String(accounts.length)} />
      </div>

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

      <Card>
        <CardTitle>账号汇总</CardTitle>
        {accounts.length === 0 ? (
          <div className="text-ink-500 text-sm">还没有账号档案</div>
        ) : (
          <div className="divide-y divide-ink-100">
            {accounts.map((a) => (
              <div key={a.id} className="py-3 flex justify-between">
                <div>
                  <div className="font-medium">{a.nickname}</div>
                  <div className="text-xs text-ink-500">{a.vertical ?? '未设置'}</div>
                </div>
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
