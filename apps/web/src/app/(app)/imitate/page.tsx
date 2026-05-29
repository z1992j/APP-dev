'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Api, streamSSE } from '@/lib/api';
import { useAccountStore } from '@/lib/account-store';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface ParsedRef {
  url: string;
  title?: string;
  body?: string;
  author?: string;
  images: Array<{ src: string }>;
  empty?: boolean;
  hint?: string;
}

interface Result {
  title?: string;
  body?: string;
  hashtags?: string[];
  draftId?: string;
  draftUrl?: string;
}

const DEFAULT_EXTRA =
  '帮我参考这条小红书，文案文字稍作修改表达一致意思，城市、数字、运营商、套餐内容严格保持一致，语气更口语自然，适合蓝 V 发布，结尾简单引导咨询。';

export default function ImitatePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedRef | null>(null);
  const [parsing, setParsing] = useState(false);
  const { accounts, activeId: accountId, setActiveId: setAccountId, setAccounts } = useAccountStore();
  const [extra, setExtra] = useState(DEFAULT_EXTRA);
  const [generating, setGenerating] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchUrls, setBatchUrls] = useState('');
  const [batchResults, setBatchResults] = useState<Array<{ url: string; status: 'pending' | 'running' | 'done' | 'error'; draftId?: string; title?: string; error?: string }>>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    Api.listAccounts().then(setAccounts).catch((e) => toast(e.message, 'error'));
  }, []);

  async function onParse() {
    const u = url.trim();
    if (!u) return;
    setParsing(true);
    setParsed(null);
    setResult(null);
    setStreamBuf('');
    try {
      const r = await Api.imitateParse(u);
      setParsed(r);
      if (r.hint) toast(r.hint, 'info');
    } catch (e: any) {
      toast(e?.message ?? '解析失败', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function onGenerate() {
    if (!parsed) return toast('请先粘贴并解析参考链接', 'info');
    if (!accountId) return toast('请先创建一个账号档案', 'info');
    setGenerating(true);
    setStreamBuf('');
    setResult(null);
    try {
      await streamSSE(
        '/imitate/generate',
        { url: parsed.url, accountId, extraInstruction: extra },
        (evt) => {
          if (evt.type === 'delta') {
            setStreamBuf((s) => s + evt.text);
          } else if (evt.type === 'done') {
            setResult({
              title: evt.result?.title,
              body: evt.result?.body,
              hashtags: evt.result?.hashtags,
              draftId: evt.draftId,
              draftUrl: evt.draftUrl,
            });
            toast('已生成 + 保存到草稿', 'success');
          } else if (evt.type === 'error') {
            toast(evt.message ?? '生成失败', 'error');
          }
        },
      );
    } catch (e: any) {
      toast(e?.message ?? '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function onBatchGenerate() {
    const urls = batchUrls.split('\n').map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) return toast('请输入至少一个链接', 'info');
    if (!accountId) return toast('请先选择账号', 'info');
    setBatchRunning(true);
    setBatchResults(urls.map((u) => ({ url: u, status: 'pending' })));
    for (let i = 0; i < urls.length; i++) {
      setBatchResults((prev) => prev.map((r, j) => j === i ? { ...r, status: 'running' } : r));
      try {
        let draftId = '';
        let title = '';
        await streamSSE(
          '/imitate/generate',
          { url: urls[i], accountId, extraInstruction: extra },
          (evt) => {
            if (evt.type === 'done') {
              draftId = evt.draftId ?? '';
              title = evt.result?.title ?? '';
            }
          },
        );
        setBatchResults((prev) => prev.map((r, j) => j === i ? { ...r, status: 'done', draftId, title } : r));
      } catch (e: any) {
        setBatchResults((prev) => prev.map((r, j) => j === i ? { ...r, status: 'error', error: e?.message ?? '失败' } : r));
      }
    }
    setBatchRunning(false);
    toast(`批量仿写完成，共 ${urls.length} 条`, 'success');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">一键仿写</h1>
          <p className="text-sm text-ink-500 mt-1">
          粘贴小红书参考帖链接 → AI 按你的提示词改写，城市/数字/运营商/套餐严格不动，图片沿用参考 → 一键存到草稿。
        </p>
      </div>
        <Button variant="ghost" onClick={() => setBatchMode(!batchMode)}>
          {batchMode ? '单条模式' : '批量模式'}
        </Button>
      </div>

      {batchMode ? (
        <>
          <Card>
            <CardTitle>批量仿写</CardTitle>
            <div className="space-y-3">
              <Field label="参考链接（每行一个）">
                <Textarea
                  value={batchUrls}
                  onChange={(e) => setBatchUrls(e.target.value)}
                  rows={6}
                  placeholder={'https://www.xiaohongshu.com/explore/xxx\nhttps://www.xiaohongshu.com/explore/yyy\nhttps://www.xiaohongshu.com/explore/zzz'}
                />
              </Field>
              <Field label="发到哪个账号">
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAccountId(a.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm border transition-colors',
                        accountId === a.id
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'border-ink-100 text-ink-700 hover:border-brand-500',
                      )}
                    >
                      {a.nickname}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="提示词">
                <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} />
              </Field>
              <Button onClick={onBatchGenerate} disabled={batchRunning} size="lg" className="w-full">
                {batchRunning ? '批量生成中…' : '开始批量仿写'}
              </Button>
            </div>
          </Card>
          {batchResults.length > 0 && (
            <Card>
              <CardTitle>批量进度</CardTitle>
              <div className="space-y-2">
                {batchResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-ink-100 last:border-0">
                    <span className={cn(
                      'w-2.5 h-2.5 rounded-full shrink-0',
                      r.status === 'done' ? 'bg-emerald-500' :
                      r.status === 'running' ? 'bg-amber-400 animate-pulse' :
                      r.status === 'error' ? 'bg-red-500' : 'bg-ink-300'
                    )} />
                    <span className="truncate flex-1 text-ink-700">{r.url}</span>
                    {r.status === 'done' && r.title && <span className="text-xs text-ink-500 truncate max-w-[200px]">{r.title}</span>}
                    {r.status === 'done' && r.draftId && (
                      <button onClick={() => router.push(`/drafts/${r.draftId}`)} className="text-xs text-brand-500 hover:underline shrink-0">查看草稿</button>
                    )}
                    {r.status === 'error' && <span className="text-xs text-red-500">{r.error}</span>}
                    {r.status === 'pending' && <span className="text-xs text-ink-400">排队中</span>}
                    {r.status === 'running' && <span className="text-xs text-amber-600">生成中…</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
      <>

      <Card>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.xiaohongshu.com/explore/... 或 xhslink.com/..."
            onKeyDown={(e) => e.key === 'Enter' && onParse()}
          />
          <Button onClick={onParse} disabled={parsing || !url.trim()}>
            {parsing ? '解析中…' : '解析参考帖'}
          </Button>
        </div>
        <div className="text-xs text-ink-500 mt-2">
          仅做风格 / 语义参考，请遵守原作者著作权。仿写后的内容由你自行审核后发布。
        </div>
      </Card>

      {parsed && (
        <Card>
          <CardTitle>参考帖预览</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-[1fr,360px] gap-6">
            <div className="space-y-3">
              <Field label="标题">
                <div className="text-base font-medium">{parsed.title || '(未抓到)'}</div>
              </Field>
              <Field label="作者">
                <div className="text-sm">{parsed.author || '-'}</div>
              </Field>
              <Field label="正文摘要">
                <div className="text-sm bg-ink-100/30 rounded-lg p-3 whitespace-pre-wrap leading-6 max-h-[200px] overflow-y-auto">
                  {parsed.body || '(SSR 抓取受限，AI 仍可根据链接作风格参考)'}
                </div>
              </Field>
            </div>
            <Field label={`图片 (${parsed.images.length})`}>
              {parsed.images.length === 0 ? (
                <div className="text-ink-500 text-sm">未抓到图片</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {parsed.images.slice(0, 9).map((im, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={i}
                      src={im.src}
                      alt=""
                      className="aspect-square object-cover rounded-md border border-ink-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                  ))}
                </div>
              )}
            </Field>
          </div>
        </Card>
      )}

      {parsed && (
        <Card>
          <CardTitle>仿写配置</CardTitle>
          <div className="space-y-4">
            <Field label="发到哪个账号">
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border transition-colors',
                      accountId === a.id
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'border-ink-100 text-ink-700 hover:border-brand-500',
                    )}
                  >
                    {a.nickname}
                    {a.vertical ? `（${a.vertical}）` : ''}
                  </button>
                ))}
                {accounts.length === 0 && (
                  <span className="text-ink-500 text-sm">
                    还没账号档案，
                    <button className="text-brand-500 underline" onClick={() => router.push('/accounts')}>
                      去创建
                    </button>
                  </span>
                )}
              </div>
            </Field>

            <Field label="提示词（已预填用户提供的模板，可改）">
              <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={5} />
            </Field>

            <Button
              onClick={onGenerate}
              disabled={generating || !parsed || !accountId}
              size="lg"
              className="w-full"
            >
              {generating ? '⚡ 仿写生成中…' : '⚡ 开始仿写'}
            </Button>
          </div>
        </Card>
      )}

      {(streamBuf || result) && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>仿写结果</CardTitle>
            {result?.draftUrl && (
              <Button size="sm" variant="ghost" onClick={() => router.push(result.draftUrl!)}>
                打开草稿 →
              </Button>
            )}
          </div>

          {result ? (
            <div className="space-y-3">
              <Field label="标题">
                <div className="text-base font-medium">{result.title}</div>
              </Field>
              <Field label="正文">
                <div className="bg-ink-100/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-7">
                  {result.body}
                </div>
              </Field>
              {result.hashtags && result.hashtags.length > 0 && (
                <Field label="Hashtag">
                  <div className="flex flex-wrap gap-1">
                    {result.hashtags.map((h) => (
                      <span key={h} className="px-2 py-0.5 bg-brand-100 text-brand-600 text-xs rounded">
                        {h}
                      </span>
                    ))}
                  </div>
                </Field>
              )}
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                ⚠️ Phase 1 范围：图片地址直接引用参考帖，发布前请下载至本地或我们的对象存储。
                Phase 2 将自动下载并通过浏览器自动化发布。
              </div>
            </div>
          ) : (
            <div className="bg-ink-100/30 rounded-lg p-4 text-sm whitespace-pre-wrap text-ink-500 min-h-[120px]">
              {streamBuf || '生成中…'}
            </div>
          )}
        </Card>
      )}
      </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ink-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
