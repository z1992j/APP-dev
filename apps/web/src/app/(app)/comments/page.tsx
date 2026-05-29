'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn, fmtDateTime } from '@/lib/utils';

const STATUSES: Array<{ key: string; label: string; tone: string }> = [
  { key: '', label: '全部', tone: 'bg-ink-100/60' },
  { key: 'new', label: '新评论', tone: 'bg-amber-100 text-amber-700' },
  { key: 'replied', label: '已回复', tone: 'bg-emerald-100 text-emerald-700' },
  { key: 'flagged', label: '需关注', tone: 'bg-red-100 text-red-700' },
  { key: 'ignored', label: '已忽略', tone: 'bg-ink-100/60' },
];

interface Stats { new: number; replied: number; ignored: number; flagged: number }

export default function CommentsPage() {
  const [status, setStatus] = useState('new');
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [groupByNote, setGroupByNote] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload(reset = true) {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        Api.listComments({ status: status || undefined, cursor: reset ? undefined : cursor ?? undefined }),
        Api.commentStats(),
      ]);
      setItems((cur) => (reset ? list.items : [...cur, ...list.items]));
      setCursor(list.nextCursor);
      setStats({ new: s.new ?? 0, replied: s.replied ?? 0, ignored: s.ignored ?? 0, flagged: s.flagged ?? 0 });
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(true); }, [status]);

  async function onSweep() {
    try {
      const r = await Api.triggerCommentSweep();
      toast(`已为 ${r.queued} 个账号入队扫描`, 'success');
    } catch (e: any) {
      toast(e?.message ?? '触发失败', 'error');
    }
  }

  async function submitReply() {
    if (!replyOpen) return;
    if (!replyText.trim()) return toast('请填写回复内容', 'info');
    try {
      await Api.replyComment(replyOpen.id, replyText);
      toast('已入队回复', 'success');
      setReplyOpen(null);
      setReplyText('');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '回复失败', 'error');
    }
  }

  async function onAutoReply(id: string) {
    try {
      const r = await Api.autoReplyComment(id);
      if (r.matched) toast('已匹配规则，回复入队', 'success');
      else toast('未匹配任何规则，标记 flagged', 'info');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '自动回复失败', 'error');
    }
  }

  async function onIgnore(id: string) {
    try {
      await Api.ignoreComment(id);
      toast('已忽略', 'success');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '操作失败', 'error');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function batchIgnore() {
    if (selected.size === 0) return;
    try {
      await Promise.all([...selected].map((id) => Api.ignoreComment(id)));
      toast(`已忽略 ${selected.size} 条`, 'success');
      setSelected(new Set());
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '批量操作失败', 'error');
    }
  }

  async function batchAutoReply() {
    if (selected.size === 0) return;
    try {
      await Promise.all([...selected].map((id) => Api.autoReplyComment(id)));
      toast(`已为 ${selected.size} 条触发自动回复`, 'success');
      setSelected(new Set());
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '批量操作失败', 'error');
    }
  }

  const grouped = groupByNote
    ? items.reduce<Record<string, any[]>>((acc, c) => {
        const key = c.noteUrl || c.noteId || 'unknown';
        (acc[key] ??= []).push(c);
        return acc;
      }, {})
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">评论</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setGroupByNote(!groupByNote)}>
            {groupByNote ? '平铺' : '按笔记分组'}
          </Button>
          <Button variant="ghost" onClick={onSweep}>立即扫描</Button>
          <Button variant="outline" onClick={() => setRulesOpen(true)}>自动回复规则</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2">
          <span className="text-sm text-brand-700">已选 {selected.size} 条</span>
          <Button size="sm" onClick={batchAutoReply}>批量自动回复</Button>
          <Button size="sm" variant="outline" onClick={batchIgnore}>批量忽略</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="新评论" value={stats?.new ?? 0} tone="text-amber-700" />
        <Stat label="已回复" value={stats?.replied ?? 0} tone="text-emerald-700" />
        <Stat label="需关注" value={stats?.flagged ?? 0} tone="text-red-700" />
        <Stat label="已忽略" value={stats?.ignored ?? 0} tone="text-ink-700" />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
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
            <p>暂无评论。</p>
            <p className="text-xs mt-2">
              已绑定 + 已发布笔记的账号每 15 分钟自动扫描评论；也可以点上方「立即扫描」手动触发。
            </p>
          </div>
        </Card>
      ) : groupByNote && grouped ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([noteKey, comments]) => (
            <Card key={noteKey}>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-ink-100">
                <span className="text-sm font-medium truncate flex-1">
                  {noteKey !== 'unknown' ? (
                    <a href={noteKey} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">{noteKey}</a>
                  ) : '未知笔记'}
                </span>
                <span className="text-xs text-ink-500">{comments.length} 条评论</span>
              </div>
              <div className="space-y-3">
                {comments.map((c: any) => (
                  <CommentRow key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)} onReply={() => setReplyOpen(c)} onAutoReply={() => onAutoReply(c.id)} onIgnore={() => onIgnore(c.id)} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CommentRow c={c} selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)} onReply={() => setReplyOpen(c)} onAutoReply={() => onAutoReply(c.id)} onIgnore={() => onIgnore(c.id)} />
            </Card>
          ))}
        </div>
      )}

      {cursor && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => reload(false)} disabled={loading}>
            {loading ? '加载中…' : '加载更多'}
          </Button>
        </div>
      )}

      <Sheet
        open={!!replyOpen}
        onClose={() => { setReplyOpen(null); setReplyText(''); }}
        title="回复评论"
      >
        {replyOpen && (
          <div className="space-y-3">
            <div className="rounded-lg bg-ink-100/40 p-3 text-sm">
              <div className="text-xs text-ink-500 mb-1">{replyOpen.authorName} 说</div>
              <div className="leading-6 whitespace-pre-wrap">{replyOpen.content}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">回复（≤ 200 字）</div>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                maxLength={200}
                placeholder="亲～感谢支持～"
              />
            </div>
            <div className="text-xs text-ink-500">
              ⚠️ 回复将经过节流（每账号每分钟最多 1 条）。无活跃 worker 则任务会失败。
            </div>
            <Button onClick={submitReply} className="w-full">提交回复</Button>
          </div>
        )}
      </Sheet>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

function CommentRow({ c, selected, onToggle, onReply, onAutoReply, onIgnore }: {
  c: any; selected: boolean; onToggle: () => void; onReply: () => void; onAutoReply: () => void; onIgnore: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {(c.status === 'new' || c.status === 'flagged') && (
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{c.authorName}</span>
          <span className="text-ink-500 text-xs">{fmtDateTime(c.publishedAt)}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded', STATUSES.find((s) => s.key === c.status)?.tone ?? 'bg-ink-100/60')}>
            {STATUSES.find((s) => s.key === c.status)?.label ?? c.status}
          </span>
          {c.sentiment && (
            <span className={cn('text-xs px-2 py-0.5 rounded',
              c.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
              c.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-ink-100/60 text-ink-600',
            )}>
              {c.sentiment === 'positive' ? '正面' : c.sentiment === 'negative' ? '负面' : '中性'}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm whitespace-pre-wrap leading-6">{c.content}</div>
        {c.reply && (
          <div className="mt-2 px-3 py-2 bg-emerald-50 border-l-2 border-emerald-300 text-xs rounded-r">
            <span className="text-emerald-700 font-medium">回复：</span>{c.reply}
          </div>
        )}
        {(c.status === 'new' || c.status === 'flagged') && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={onReply}>回复</Button>
            <Button size="sm" variant="ghost" onClick={onAutoReply}>自动回</Button>
            <Button size="sm" variant="outline" onClick={onIgnore}>忽略</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={cn('text-2xl font-bold mt-1', tone)}>{value}</div>
    </Card>
  );
}

function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rules, setRules] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function reload() {
    try {
      setRules(await Api.listRules());
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }

  useEffect(() => { if (open) reload(); }, [open]);

  async function remove(id: string) {
    if (!confirm('删除该规则？')) return;
    await Api.deleteRule(id);
    toast('已删除', 'success');
    await reload();
  }

  return (
    <Sheet open={open} onClose={onClose} title="自动回复规则" widthClass="w-[520px]">
      <div className="space-y-3">
        <Button onClick={() => setEditing({})} className="w-full">+ 新建规则</Button>

        {rules.length === 0 ? (
          <div className="text-ink-500 text-sm text-center py-6">
            还没有规则。<br />
            <span className="text-xs">规则会按 priority 倒序匹配，命中触发词即入队回复。</span>
          </div>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{r.name}</div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setEditing(r)} className="text-brand-500">编辑</button>
                  <button onClick={() => remove(r.id)} className="text-accent-red">删除</button>
                </div>
              </div>
              <div className="text-xs text-ink-500">
                优先级 {r.priority} · {r.enabled ? '启用' : '已停用'} · {r.replyMode === 'ai' ? 'AI 生成' : '模板'}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(r.triggers as string[]).map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 bg-ink-100/60 rounded">{t}</span>
                ))}
              </div>
              {r.template && (
                <div className="mt-2 text-xs text-ink-700 bg-ink-100/30 p-2 rounded">{r.template}</div>
              )}
            </div>
          ))
        )}
      </div>

      <RuleEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
        onSaved={async () => { setEditing(null); await reload(); }}
      />
    </Sheet>
  );
}

function RuleEditor({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: any;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [triggers, setTriggers] = useState('');
  const [replyMode, setReplyMode] = useState<'template' | 'ai'>('template');
  const [template, setTemplate] = useState('');
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setTriggers(((initial?.triggers as string[]) ?? []).join('\n'));
    setReplyMode(initial?.replyMode ?? 'template');
    setTemplate(initial?.template ?? '');
    setPriority(initial?.priority ?? 0);
  }, [open, initial]);

  async function save() {
    if (!name.trim()) return toast('请填规则名称', 'info');
    const triggerArr = triggers.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);
    if (triggerArr.length === 0) return toast('请填至少一个触发词', 'info');
    if (replyMode === 'template' && !template.trim()) return toast('模板模式需要回复内容', 'info');
    try {
      const payload = {
        name: name.trim(),
        triggers: triggerArr,
        replyMode,
        template: replyMode === 'template' ? template.trim() : undefined,
        priority,
      };
      if (initial?.id) await Api.updateRule(initial.id, payload);
      else await Api.createRule(payload);
      toast('已保存', 'success');
      await onSaved();
    } catch (e: any) {
      toast(e?.message ?? '保存失败', 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? '编辑规则' : '新建规则'}>
      <div className="space-y-4">
        <Field label="规则名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：价格咨询" />
        </Field>
        <Field label="触发词（每行一个或逗号分隔）">
          <Textarea
            value={triggers}
            onChange={(e) => setTriggers(e.target.value)}
            rows={4}
            placeholder={'多少钱\n价格\n报价'}
          />
        </Field>
        <Field label="回复方式">
          <div className="flex gap-2">
            {(['template', 'ai'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setReplyMode(m)}
                className={
                  'px-3 py-1.5 rounded-md text-sm ' +
                  (replyMode === m ? 'bg-brand-500 text-white' : 'bg-ink-100/60')
                }
              >
                {m === 'template' ? '固定模板' : 'AI 智能回复'}
              </button>
            ))}
          </div>
        </Field>
        {replyMode === 'template' && (
          <Field label="模板内容（≤ 300 字）">
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder="亲～价格请私信咨询哦～"
            />
          </Field>
        )}
        <Field label="优先级（越大越先匹配）">
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) || 0)}
          />
        </Field>
        <Button onClick={save} className="w-full">保存</Button>
      </div>
    </Sheet>
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
