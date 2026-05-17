'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { devLogin } from '@/lib/auth';
import { toast } from '@/components/ui/toast';

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp.get('from') ?? '/inspire';
  const [handle, setHandle] = useState('alice');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await devLogin(handle.trim() || 'tester');
      toast('登录成功', 'success');
      router.replace(from);
    } catch (err: any) {
      toast(err?.message ?? '登录失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-bg">
      <div className="w-full max-w-md bg-bg-card rounded-2xl shadow-card p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold tracking-tight">
            Red<span className="text-brand-500">Matrix</span>
          </div>
          <div className="text-sm text-ink-500 mt-1">小红书矩阵协作工作台</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <div className="text-xs text-ink-500 mb-1">开发者身份（dev 模式）</div>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="任意标识，如 alice"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '登录中…' : '进入工作台'}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-ink-100 space-y-2 text-xs text-ink-500">
          <div className="flex items-start gap-2">
            <span className="text-brand-500">·</span>
            <span>
              生产环境会接入手机号 + 微信扫码登录；当前为 dev 模式，输入任意标识即可创建账号
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-brand-500">·</span>
            <span>登录态保存在本机 localStorage</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-ink-500">加载中…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
