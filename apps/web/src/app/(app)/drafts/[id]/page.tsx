'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

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

interface Violation {
  text: string;
  start: number;
  end: number;
  level: 'red' | 'yellow' | 'info';
  category: string;
  suggestion?: string;
}

export default function DraftEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [lintOpen, setLintOpen] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [lintPassed, setLintPassed] = useState(true);
  const [lintLoading, setLintLoading] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Api.getDraft(id)
      .then((d) => {
        setDraft(d);
        setTitle(d.title ?? '');
        setBody(d.body ?? '');
      })
      .catch((e) => toast(e.message ?? '加载失败', 'error'));
  }, [id]);

  function queueSave(nextTitle: string, nextBody: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await Api.updateDraft(id, {
          kind: draft?.kind ?? 'image',
          title: nextTitle,
          body: nextBody,
          media: draft?.media ?? [],
          hashtags: draft?.hashtags ?? [],
        });
        setSavedAt(new Date());
      } catch (e: any) {
        toast(e?.message ?? '保存失败', 'error');
      } finally {
        setSaving(false);
      }
    }, 1200);
  }

  function onTitleChange(v: string) {
    setTitle(v);
    queueSave(v, body);
  }
  function onBodyChange(v: string) {
    setBody(v);
    queueSave(title, v);
  }

  async function runLint() {
    setLintOpen(true);
    setLintLoading(true);
    try {
      const res = await Api.lint(body, title);
      setViolations(res.violations);
      setLintPassed(res.passed);
    } catch (e: any) {
      toast(e?.message ?? '检查失败', 'error');
    } finally {
      setLintLoading(false);
    }
  }

  function applyFix(idx: number) {
    const v = violations[idx];
    if (!v?.suggestion) return;
    const combined = `${title}\n${body}`;
    const replaced = combined.replace(v.text, v.suggestion);
    const [t, ...rest] = replaced.split('\n');
    setTitle(t);
    setBody(rest.join('\n'));
    queueSave(t, rest.join('\n'));
    setTimeout(runLint, 200);
  }

  async function handoff() {
    try {
      await Api.handoffDraft(id);
      // Open creator.xiaohongshu.com in a new tab
      const url = 'https://creator.xiaohongshu.com/publish/publish';
      // Copy text first
      const text = [title, body].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(text); toast('已复制文案', 'success'); } catch { /* */ }
      window.open(url, '_blank', 'noopener');
      const fresh = await Api.getDraft(id);
      setDraft(fresh);
    } catch (e: any) {
      toast(e?.message ?? '发布失败', 'error');
    }
  }

  async function submitPublished() {
    if (!publishedUrl.trim()) return;
    try {
      await Api.publishedDraft(id, publishedUrl.trim());
      toast('已记录笔记链接', 'success');
      const fresh = await Api.getDraft(id);
      setDraft(fresh);
      setPublishedUrl('');
    } catch (e: any) {
      toast(e?.message ?? '链接无效', 'error');
    }
  }

  async function submitForReview() {
    try {
      await Api.submitReview(id);
      toast('已提交审稿', 'success');
      const fresh = await Api.getDraft(id);
      setDraft(fresh);
    } catch (e: any) {
      toast(e?.message ?? '提交失败', 'error');
    }
  }

  async function autoPublish() {
    if (!confirm('确认通过自动化容器发布到小红书？\n（消耗今日 1 次发帖配额）')) return;
    try {
      const r = await Api.autoPublish(id);
      toast(`自动发布完成（${r.status}）`, 'success');
      const fresh = await Api.getDraft(id);
      setDraft(fresh);
    } catch (e: any) {
      toast(e?.message ?? '自动发布失败', 'error');
    }
  }

  if (!draft) return <div className="text-ink-500">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-ink-500 hover:text-ink-900">
            ←
          </button>
          <h1 className="text-xl font-semibold">编辑草稿</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-ink-100/60 text-ink-700">
            {STATUS_LABEL[draft.status] ?? draft.status}
          </span>
        </div>
        <div className="text-xs text-ink-500">
          {saving ? '保存中…' : savedAt ? `已保存于 ${savedAt.toLocaleTimeString()}` : '已自动保存'}
        </div>
      </div>

      <Card>
        <div className="text-xs text-ink-500 mb-1">账号：{draft.account?.nickname}</div>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="标题（≤20 字，带 emoji 易爆）" />
          <Textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="正文……"
            rows={10}
          />
          {draft.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {draft.hashtags.map((h: string) => (
                <span key={h} className="px-2 py-0.5 bg-brand-100 text-brand-600 text-xs rounded">
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Image management */}
      {draft.media?.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>图片（{draft.media.length}张）</CardTitle>
            <div className="text-xs text-ink-500">拖拽可排序，点击设封面（第一张为封面）</div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {(draft.media as Array<{ url?: string; key?: string; src?: string }>).map((m, i) => {
              const src = m.url || m.key || '';
              return (
                <div key={i} className={cn(
                  'relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all',
                  i === 0 ? 'border-brand-500' : 'border-ink-100 hover:border-brand-300',
                )} onClick={() => {
                  if (i === 0) return;
                  const next = [...draft.media];
                  const [moved] = next.splice(i, 1);
                  next.unshift(moved);
                  setDraft({ ...draft, media: next });
                  Api.updateDraft(id, { ...draft, media: next }).catch(() => {});
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                  />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-brand-500 text-white text-xs px-1.5 py-0.5 rounded">封面</span>
                  )}
                  <span className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1 rounded">{i + 1}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button variant="ghost" onClick={runLint}>
          🔎 检查违禁词
        </Button>
        <Button variant="outline" onClick={submitForReview}>
          提交审稿
        </Button>
        <Button variant="outline" onClick={handoff}>
          手动发布 (跳 creator.xhs)
        </Button>
        <Button onClick={autoPublish}>⚡ 自动发布</Button>
      </div>

      <Card>
        <CardTitle>已发布？记录笔记链接</CardTitle>
        <div className="text-xs text-ink-500 mb-3">
          粘贴你刚发的笔记链接（xiaohongshu.com / xhslink.com），我们会自动绑定到这条草稿。
        </div>
        <div className="flex gap-2">
          <Input
            value={publishedUrl}
            onChange={(e) => setPublishedUrl(e.target.value)}
            placeholder="https://www.xiaohongshu.com/explore/..."
          />
          <Button onClick={submitPublished} variant="ghost">
            记录
          </Button>
        </div>
        {draft.publishedUrl && (
          <div className="mt-3 text-sm">
            已发布：
            <a className="text-brand-500 hover:underline" href={draft.publishedUrl} target="_blank" rel="noreferrer">
              {draft.publishedUrl}
            </a>
          </div>
        )}
      </Card>

      <Sheet open={lintOpen} onClose={() => setLintOpen(false)} title="违禁词检查">
        {lintLoading ? (
          <div className="text-ink-500 text-center py-10">检查中…</div>
        ) : !violations.length ? (
          <div className="text-emerald-600 text-center py-10">无问题 ✓</div>
        ) : (
          <div className="space-y-3">
            <div className={cn('text-sm', lintPassed ? 'text-emerald-600' : 'text-accent-red')}>
              {lintPassed ? '通过' : `发现 ${violations.length} 处需要处理`}
            </div>
            {violations.map((v, i) => (
              <div
                key={`${v.start}-${v.text}`}
                className="rounded-lg bg-ink-100/40 p-3 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{v.level === 'red' ? '🔴' : v.level === 'yellow' ? '🟡' : '⚪'}</span>
                  <span className="font-medium">"{v.text}"</span>
                  <span className="text-xs text-ink-500">{v.category}</span>
                </div>
                {v.suggestion && (
                  <>
                    <div className="text-ink-700 mb-2">建议改为：{v.suggestion}</div>
                    <Button size="sm" variant="ghost" onClick={() => applyFix(i)}>
                      一键替换
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
