'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Api } from '@/lib/api';
import { loadAuth, saveAuth, clearAuth } from '@/lib/api';
import { useAccountStore } from '@/lib/account-store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/inspire', label: '灵感', icon: '✨' },
  { href: '/write', label: 'AI 写作', icon: '✍️' },
  { href: '/imitate', label: '一键仿写', icon: '🪄' },
  { href: '/drafts', label: '草稿', icon: '📝' },
  { href: '/comments', label: '评论', icon: '💬' },
  { href: '/dm', label: '私信', icon: '✉️' },
  { href: '/data', label: '数据', icon: '📊' },
  { href: '/accounts', label: '账号档案', icon: '👥' },
  { href: '/workers', label: 'Worker 监控', icon: '🖥️' },
  { href: '/team', label: '团队', icon: '🏢' },
];

const BOTTOM = [
  { href: '/billing', label: '升级 Pro', icon: '⭐' },
  { href: '/settings', label: '设置', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState(() => loadAuth());
  const [teams, setTeams] = useState<any[]>([]);
  const { accounts, activeId, setAccounts, setActiveId } = useAccountStore();

  useEffect(() => {
    setAuth(loadAuth());
  }, [pathname]);

  useEffect(() => {
    if (!auth) return;
    Api.myTeams().then(setTeams).catch(() => undefined);
    Api.listAccounts().then(setAccounts).catch(() => undefined);
  }, [auth?.team.id]);

  async function onSwitchTeam(teamId: string) {
    try {
      const { token, team } = await Api.switchTeam(teamId);
      if (auth) {
        const next = { ...auth, token, team };
        saveAuth(next);
        setAuth(next);
        router.refresh();
      }
    } catch (e) {
      // silent
    }
  }

  function onSignOut() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-ink-100 bg-bg-card flex flex-col">
      <div className="px-5 py-5 border-b border-ink-100">
        <div className="text-lg font-bold tracking-tight">
          Red<span className="text-brand-500">Matrix</span>
        </div>
        <div className="text-xs text-ink-500 mt-1">小红书矩阵协作工作台</div>
      </div>

      {auth && teams.length > 0 && (
        <div className="px-5 pt-4">
          <div className="text-xs text-ink-500 mb-1">当前团队</div>
          <select
            className="w-full bg-ink-100/60 rounded-md px-2 py-1.5 text-sm focus:outline-none"
            value={auth.team.id}
            onChange={(e) => onSwitchTeam(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.name}（{t.role}）
              </option>
            ))}
          </select>
        </div>
      )}

      {auth && accounts.length > 0 && (
        <div className="px-5 pt-3">
          <div className="text-xs text-ink-500 mb-1">操作账号</div>
          <select
            className="w-full bg-ink-100/60 rounded-md px-2 py-1.5 text-sm focus:outline-none"
            value={activeId ?? ''}
            onChange={(e) => setActiveId(e.target.value || null)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}{a.vertical ? ` (${a.vertical})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <SideLink key={item.href} {...item} active={pathname?.startsWith(item.href)} />
        ))}
      </nav>

      <div className="px-3 py-4 space-y-1 border-t border-ink-100">
        {BOTTOM.map((item) => (
          <SideLink key={item.href} {...item} active={pathname?.startsWith(item.href)} />
        ))}
        {auth && (
          <button
            onClick={onSignOut}
            className="w-full text-left rounded-md px-3 py-2 text-sm text-ink-700 hover:bg-ink-100/60"
          >
            <span className="mr-2">↪</span>退出登录
          </button>
        )}
      </div>
    </aside>
  );
}

function SideLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-brand-100 text-brand-600 font-medium'
          : 'text-ink-700 hover:bg-ink-100/60',
      )}
    >
      <span className="w-5 text-center">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
