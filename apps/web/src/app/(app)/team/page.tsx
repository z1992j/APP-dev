'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';

const ROLES = ['editor', 'reviewer', 'admin', 'viewer'];

export default function TeamPage() {
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [role, setRole] = useState('editor');
  const [invite, setInvite] = useState<{ code: string; expiresIn: number } | null>(null);
  const [accept, setAccept] = useState('');

  async function reload() {
    try {
      const [t, m] = await Promise.all([Api.currentTeam(), Api.listMembers()]);
      setTeam(t);
      setMembers(m);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }
  useEffect(() => { reload(); }, []);

  async function createInvite() {
    try {
      const res = await Api.createInvite(role);
      setInvite(res);
    } catch (e: any) {
      toast(e?.message ?? '创建失败', 'error');
    }
  }

  async function acceptInvite() {
    if (!accept.trim()) return;
    try {
      await Api.acceptInvite(accept.trim());
      toast('加入成功', 'success');
      setAccept('');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '邀请码无效', 'error');
    }
  }

  async function changeRole(userId: string, newRole: string) {
    try {
      await Api.changeRole(userId, newRole);
      toast('已更新角色', 'success');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '更新失败', 'error');
    }
  }

  async function remove(userId: string) {
    if (!confirm('确定移除该成员？')) return;
    try {
      await Api.removeMember(userId);
      toast('已移除', 'success');
      await reload();
    } catch (e: any) {
      toast(e?.message ?? '移除失败', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">团队</h1>

      <Card>
        <CardTitle>团队信息</CardTitle>
        {team ? (
          <div className="grid grid-cols-3 gap-4">
            <Info label="名称" value={team.name} />
            <Info label="套餐" value={team.plan} />
            <Info label="席位 / 总数" value={`${team._count?.members ?? '?'} / ${team.seats}`} />
          </div>
        ) : (
          <div className="text-ink-500">加载中…</div>
        )}
      </Card>

      <Card>
        <CardTitle>邀请成员</CardTitle>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-ink-500">角色</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 px-3 rounded-lg bg-ink-100/60 text-sm focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Button onClick={createInvite}>生成邀请码</Button>
        </div>
        {invite && (
          <div className="mt-3 rounded-lg bg-brand-100 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-xl tracking-widest">{invite.code}</div>
              <div className="text-xs text-ink-500 mt-1">
                角色 <b>{role}</b>，7 天内有效。复制后发给被邀请的同事。
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(invite.code);
                toast('已复制', 'success');
              }}
            >
              复制
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>接受邀请</CardTitle>
        <div className="flex gap-2">
          <Input
            value={accept}
            onChange={(e) => setAccept(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            className="font-mono tracking-widest"
          />
          <Button onClick={acceptInvite} variant="ghost">
            加入
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>成员 ({members.length})</CardTitle>
        <div className="divide-y divide-ink-100">
          {members.map((m) => (
            <div key={m.userId} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{m.user?.nickname ?? `user#${m.userId}`}</div>
                <div className="text-xs text-ink-500">加入于 {new Date(m.joinedAt).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                {m.role === 'owner' ? (
                  <span className="text-xs px-2 py-1 bg-brand-100 text-brand-600 rounded">owner</span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                      className="h-8 px-2 rounded-md bg-ink-100/60 text-sm focus:outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => remove(m.userId)}>
                      移除
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}
