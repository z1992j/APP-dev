'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';

const VERTICALS = ['', '穿搭', '美妆', '母婴', '美食', '通用'];

interface Angle { id: string; text: string; source: string }
interface UserNote {
  fingerprint?: string;
  url?: string;
  title?: string;
  source?: string;
}

export default function InspirePage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [vertical, setVertical] = useState('');
  const [loading, setLoading] = useState(false);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [pasteUrl, setPasteUrl] = useState('');

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await Api.inspireSearch(q.trim(), vertical || undefined);
      setAngles(res.angles);
      setUserNotes(res.userNotes);
    } catch (err: any) {
      toast(err?.message ?? '搜索失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onPaste() {
    if (!pasteUrl.trim()) return;
    try {
      const note = await Api.inspireOembed(pasteUrl.trim());
      toast('已收藏到选题池', 'success');
      setUserNotes([note, ...userNotes]);
      setPasteUrl('');
    } catch (err: any) {
      toast(err?.message ?? '链接无效', 'error');
    }
  }

  function onUseAngle(text: string) {
    router.push(`/write?topic=${encodeURIComponent(text)}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">灵感</h1>

      <Card>
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词，如 春日通勤穿搭"
          />
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value)}
            className="h-10 px-3 rounded-lg bg-ink-100/60 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {VERTICALS.map((v) => (
              <option key={v || 'all'} value={v}>
                {v || '全部赛道'}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={loading}>
            {loading ? '生成中…' : '搜索 / 生成角度'}
          </Button>
        </form>
        <div className="text-xs text-ink-500 mt-3">
          没有第三方数据源，所有选题角度由 AI 实时生成。你也可以粘贴小红书链接添加到选题池。
        </div>
      </Card>

      {angles.length > 0 && (
        <Card>
          <CardTitle>10 个选题角度</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {angles.map((a) => (
              <div
                key={a.id}
                className="flex justify-between items-center rounded-lg border border-ink-100 px-4 py-3 hover:border-brand-500 cursor-pointer transition-colors"
                onClick={() => onUseAngle(a.text)}
              >
                <span className="text-sm">{a.text}</span>
                <span className="text-xs text-brand-500 whitespace-nowrap ml-3">用这条写作 →</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>粘贴小红书链接收藏</CardTitle>
        <div className="flex gap-2">
          <Input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://www.xiaohongshu.com/explore/... 或 xhslink.com/..."
          />
          <Button onClick={onPaste} variant="ghost">
            收藏
          </Button>
        </div>
        {userNotes.length > 0 && (
          <div className="mt-4 divide-y divide-ink-100">
            {userNotes.map((n, i) => (
              <div key={n.fingerprint ?? i} className="py-2 text-sm break-all">
                <a href={n.url} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                  {n.url}
                </a>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
