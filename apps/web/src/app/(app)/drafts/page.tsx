'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn, fmtDateTime } from '@/lib/utils';

const STATUS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'in_review', label: '待审' },
  { key: 'approved', label: '已审' },
  { key: 'scheduled', label: '已排期' },
  { key: 'due', label: '到期' },
  { key: 'handed_off', label: '待回填' },
  { key: 'published', label: '已发布' },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-ink-100/60 text-ink-700',
  in_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-amber-100 text-amber-700',
  due: 'bg-amber-200 text-amber-800',
  handed_off: 'bg-brand-100 text-brand-600',
  published: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  in_review: '待审',
  approved: '已审',
  scheduled: '已排期',
  due: '到期',
  handed_off: '待回填',
  published: '已发布',
  rejected: '已驳回',
};

export default function DraftsPage() {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(reset = true) {
    setLoading(true);
    try {
      const res = await Api.listDrafts({
        status: status || undefined,
        cursor: reset ? undefined : cursor ?? undefined,
      });
      setItems((cur) => (reset ? res.items : [...cur, ...res.items]));
      setCursor(res.nextCursor);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(true); }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">草稿</h1>
        <Link href="/write">
          <Button>+ 新建草稿</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm',
              status === s.key ? 'bg-brand-500 text-white' : 'bg-ink-100/60',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {items.length === 0 && !loading ? (
        <Card>
          <div className="text-ink-500 text-center py-10">
            还没有草稿。从「灵感」或「AI 写作」开始第一篇吧。
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Link key={d.id} href={`/drafts/${d.id}`}>
              <Card className="hover:border-brand-500 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.title || '(未命名)'}</div>
                    <div className="text-xs text-ink-500 mt-1">
                      {d.account?.nickname}{d.scheduleAt ? `  ·  ${fmtDateTime(d.scheduleAt)}` : ''}
                    </div>
                    <div className="text-sm text-ink-700 mt-2 line-clamp-2">{d.body}</div>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded shrink-0',
                      STATUS_STYLE[d.status] ?? 'bg-ink-100/60 text-ink-700',
                    )}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {cursor && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => load(false)} disabled={loading}>
            {loading ? '加载中…' : '加载更多'}
          </Button>
        </div>
      )}
    </div>
  );
}
