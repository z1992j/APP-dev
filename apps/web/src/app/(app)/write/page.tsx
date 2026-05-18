'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Api, streamSSE } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const STYLES = ['种草', '干货', '吐槽', '故事'];
const WORDS = [80, 200, 500, 1000];

interface ResultBlock {
  accountId: string;
  nickname: string;
  rawBuffer: string;
  done: boolean;
  result: { titles?: string[]; body?: string; hashtags?: string[] } | null;
  selectedTitleIdx: number;
  error?: string;
}

function WritePageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [topic, setTopic] = useState(sp.get('topic') ?? '');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [style, setStyle] = useState<string>(STYLES[0]);
  const [words, setWords] = useState<number>(WORDS[1]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<ResultBlock[]>([]);

  useEffect(() => {
    Api.listAccounts()
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) setSelected([list[0].id]);
        else {
          toast('请先创建至少一个账号档案', 'info');
          router.push('/accounts');
        }
      })
      .catch((e) => toast(e.message, 'error'));
  }, [router]);

  function toggleAccount(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function onGenerate() {
    if (!topic.trim()) return toast('请填主题', 'info');
    if (selected.length === 0) return toast('至少选 1 个账号', 'info');

    const initial: ResultBlock[] = selected.map((id) => ({
      accountId: id,
      nickname: accounts.find((a) => a.id === id)?.nickname ?? id,
      rawBuffer: '',
      done: false,
      result: null,
      selectedTitleIdx: 0,
    }));
    setResults(initial);
    setGenerating(true);

    try {
      await streamSSE(
        '/ai/write',
        {
          topic: topic.trim(),
          accountIds: selected,
          style,
          words,
        },
        (evt) => {
          setResults((cur) => {
            const next = [...cur];
            const idx = next.findIndex((r) => r.accountId === evt.accountId);
            if (idx === -1) return next;
            if (evt.type === 'delta') {
              next[idx] = { ...next[idx], rawBuffer: next[idx].rawBuffer + evt.text };
            } else if (evt.type === 'account.done') {
              next[idx] = { ...next[idx], done: true, result: evt.result ?? null };
            } else if (evt.type === 'account.error') {
              next[idx] = { ...next[idx], done: true, error: evt.message };
            }
            return next;
          });
        },
      );
    } catch (err: any) {
      toast(err?.message ?? '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function saveAsDraft(block: ResultBlock) {
    if (!block.result) return;
    const title = block.result.titles?.[block.selectedTitleIdx] ?? '';
    const body =
      (block.result.body ?? '') +
      (block.result.hashtags?.length ? '\n\n' + block.result.hashtags.join(' ') : '');
    try {
      const draft = await Api.createDraft({
        accountId: block.accountId,
        kind: 'image',
        title,
        body,
        hashtags: block.result.hashtags ?? [],
      });
      toast('已保存到草稿', 'success');
      router.push(`/drafts/${draft.id}`);
    } catch (err: any) {
      toast(err?.message ?? '保存失败', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">AI 写作</h1>

      <Card>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-ink-500 mb-1">主题</div>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="春日通勤穿搭，预算 500"
              rows={2}
            />
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-2">
              发给哪些账号？（多选 = 一稿生成多版）
            </div>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    selected.includes(a.id)
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-ink-100 text-ink-700 hover:border-brand-500',
                  )}
                >
                  {a.nickname}
                  {a.vertical ? `（${a.vertical}）` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-ink-500 mb-2">风格</div>
              <div className="flex gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm',
                      style === s ? 'bg-brand-500 text-white' : 'bg-ink-100/60',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-2">字数</div>
              <div className="flex gap-2">
                {WORDS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWords(w)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm',
                      words === w ? 'bg-brand-500 text-white' : 'bg-ink-100/60',
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={onGenerate} disabled={generating} size="lg" className="w-full">
            {generating ? '⚡ 生成中…' : '⚡ 生成'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {results.map((r, idx) => (
          <Card key={r.accountId}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">{r.nickname}</div>
              <div className="text-xs text-ink-500">
                {r.error ? '失败' : r.done ? '完成 ✓' : '生成中…'}
              </div>
            </div>

            {r.result ? (
              <>
                <div className="text-xs text-ink-500 mb-2">标题候选</div>
                <div className="space-y-2 mb-4">
                  {(r.result.titles ?? []).map((t, ti) => (
                    <div
                      key={ti}
                      onClick={() => {
                        setResults((cur) => {
                          const next = [...cur];
                          next[idx] = { ...next[idx], selectedTitleIdx: ti };
                          return next;
                        });
                      }}
                      className={cn(
                        'px-4 py-2 rounded-lg cursor-pointer text-sm',
                        r.selectedTitleIdx === ti
                          ? 'bg-brand-100 border border-brand-500'
                          : 'bg-ink-100/40 hover:bg-ink-100',
                      )}
                    >
                      {t}
                    </div>
                  ))}
                </div>

                <div className="text-xs text-ink-500 mb-2">正文</div>
                <div className="bg-ink-100/40 rounded-lg p-3 text-sm whitespace-pre-wrap leading-6 mb-3">
                  {r.result.body}
                </div>

                {r.result.hashtags && r.result.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {r.result.hashtags.map((h) => (
                      <span key={h} className="px-2 py-0.5 bg-brand-100 text-brand-600 text-xs rounded">
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                <Button onClick={() => saveAsDraft(r)} className="w-full">
                  保存到草稿 →
                </Button>
              </>
            ) : (
              <div className="bg-ink-100/40 rounded-lg p-3 text-sm whitespace-pre-wrap text-ink-500 min-h-[120px]">
                {r.error ?? r.rawBuffer ?? '等待生成…'}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function WritePage() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-500">加载中…</div>}>
      <WritePageInner />
    </Suspense>
  );
}
