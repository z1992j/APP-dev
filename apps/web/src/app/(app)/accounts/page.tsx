'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';

const VERTICALS = ['穿搭', '美妆', '母婴', '美食', '通用'];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function reload() {
    try {
      setAccounts(await Api.listAccounts());
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">账号档案</h1>
        <Button onClick={() => setEditing({})}>+ 新建档案</Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <div className="text-ink-500 text-center py-10">
            还没有账号档案。<br />
            <span className="text-xs">账号档案的"人设"会喂给 AI 写作的 system prompt，强烈建议先建好。</span>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <Card
              key={a.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setEditing(a)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{a.nickname}</div>
                <span className="text-xs px-2 py-0.5 bg-ink-100/60 rounded">
                  {a.vertical ?? '未设置'}
                </span>
              </div>
              {a.persona?.intro && (
                <div className="text-sm text-ink-500 line-clamp-2">{a.persona.intro}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      <AccountSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
        onSaved={async () => {
          setEditing(null);
          await reload();
        }}
      />
    </div>
  );
}

function AccountSheet({
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
  const [nickname, setNickname] = useState('');
  const [vertical, setVertical] = useState('通用');
  const [xhsUrl, setXhsUrl] = useState('');
  const [city, setCity] = useState('');
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNickname(initial?.nickname ?? '');
    setVertical(initial?.vertical ?? '通用');
    setXhsUrl(initial?.xhsUrl ?? '');
    setCity(initial?.persona?.city ?? '');
    setIntro(initial?.persona?.intro ?? '');
  }, [open, initial]);

  async function save() {
    if (!nickname.trim()) return toast('请填昵称', 'info');
    setBusy(true);
    try {
      const payload = {
        nickname: nickname.trim(),
        vertical,
        xhsUrl: xhsUrl.trim() || undefined,
        persona: { city: city.trim(), intro: intro.trim() },
      };
      if (initial?.id) await Api.updateAccount(initial.id, payload);
      else await Api.createAccount(payload);
      toast('已保存', 'success');
      await onSaved();
    } catch (e: any) {
      toast(e?.message ?? '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm('确定删除这个档案？历史草稿不会删除。')) return;
    try {
      await Api.deleteAccount(initial.id);
      toast('已删除', 'success');
      await onSaved();
    } catch (e: any) {
      toast(e?.message ?? '删除失败', 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? '编辑账号档案' : '新建账号档案'}>
      <div className="space-y-4">
        <Field label="昵称">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </Field>
        <Field label="赛道">
          <div className="flex flex-wrap gap-2">
            {VERTICALS.map((v) => (
              <button
                key={v}
                onClick={() => setVertical(v)}
                className={
                  'px-3 py-1.5 rounded-full text-sm ' +
                  (vertical === v ? 'bg-brand-500 text-white' : 'bg-ink-100/60')
                }
              >
                {v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="主页链接（可空）">
          <Input
            value={xhsUrl}
            onChange={(e) => setXhsUrl(e.target.value)}
            placeholder="https://www.xiaohongshu.com/user/..."
          />
        </Field>
        <div className="pt-2 border-t border-ink-100">
          <div className="text-xs text-brand-500 mb-2">人设（影响 AI 写作）</div>
        </div>
        <Field label="城市">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="上海" />
        </Field>
        <Field label="自我介绍 / 风格">
          <Textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={4}
            placeholder="25 岁上海打工人，分享性价比通勤穿搭，预算 500 以下"
          />
        </Field>

        <div className="flex gap-2 pt-3">
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? '保存中…' : '保存'}
          </Button>
          {initial?.id && (
            <Button onClick={remove} variant="danger">
              删除
            </Button>
          )}
        </div>
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
