'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { cn, fmtDateTime } from '@/lib/utils';

export default function DmPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [stats, setStats] = useState<{ totalUnread: number; unreadConversations: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    try {
      const [res, s] = await Promise.all([Api.dmConversations(), Api.dmStats()]);
      setConversations(res.items);
      setStats(s);
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error');
    }
  }

  async function loadMessages(convId: string) {
    try {
      const res = await Api.dmMessages(convId);
      setMessages(res.items);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: any) {
      toast(e?.message ?? '加载消息失败', 'error');
    }
  }

  useEffect(() => { loadConversations(); }, []);

  function selectConv(conv: any) {
    setActiveConv(conv);
    setMessages([]);
    loadMessages(conv.id);
  }

  async function onSend() {
    if (!input.trim() || !activeConv) return;
    setSending(true);
    try {
      await Api.dmSend(activeConv.id, input.trim());
      setInput('');
      await loadMessages(activeConv.id);
      await loadConversations();
    } catch (e: any) {
      toast(e?.message ?? '发送失败', 'error');
    } finally {
      setSending(false);
    }
  }

  async function onAiSuggest() {
    if (!activeConv) return;
    setSuggesting(true);
    try {
      const res = await Api.dmAiSuggest(activeConv.id);
      setInput(res.suggestion);
      toast('AI 建议已填入，可修改后发送', 'success');
    } catch (e: any) {
      toast(e?.message ?? 'AI 生成失败', 'error');
    } finally {
      setSuggesting(false);
    }
  }

  async function onArchive() {
    if (!activeConv) return;
    if (!confirm('归档该会话？')) return;
    try {
      await Api.dmArchive(activeConv.id);
      toast('已归档', 'success');
      setActiveConv(null);
      setMessages([]);
      await loadConversations();
    } catch (e: any) {
      toast(e?.message ?? '归档失败', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">私信</h1>
          {stats && stats.totalUnread > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {stats.totalUnread} 条未读
            </span>
          )}
        </div>
        <Button variant="ghost" onClick={loadConversations}>刷新</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4 min-h-[500px]">
        {/* Conversation list */}
        <Card className="overflow-y-auto max-h-[600px]">
          {conversations.length === 0 ? (
            <div className="text-ink-500 text-center py-10 text-sm">
              <p>暂无私信会话。</p>
              <p className="text-xs mt-2">私信功能需要 xhs-mcp 扩展支持私信 API。当前版本为数据结构预置，后续 Sprint 将接入实时私信抓取。</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConv(conv)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-ink-100/40 transition-colors',
                    activeConv?.id === conv.id && 'bg-brand-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{conv.peerName}</span>
                    {conv.unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full min-w-[20px] text-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 mt-1 truncate">{conv.lastMessage ?? '暂无消息'}</div>
                  {conv.lastAt && <div className="text-xs text-ink-400 mt-0.5">{fmtDateTime(conv.lastAt)}</div>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Chat area */}
        <Card className="flex flex-col">
          {activeConv ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-ink-100">
                <div>
                  <div className="font-medium">{activeConv.peerName}</div>
                  <div className="text-xs text-ink-500">ID: {activeConv.peerId}</div>
                </div>
                <Button size="sm" variant="outline" onClick={onArchive}>归档</Button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[300px] max-h-[400px]">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex',
                      msg.direction === 'outbound' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[70%] px-4 py-2 rounded-2xl text-sm',
                        msg.direction === 'outbound'
                          ? 'bg-brand-500 text-white rounded-br-sm'
                          : 'bg-ink-100/60 text-ink-900 rounded-bl-sm',
                      )}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      <div className={cn(
                        'text-xs mt-1',
                        msg.direction === 'outbound' ? 'text-brand-200' : 'text-ink-400',
                      )}>
                        {fmtDateTime(msg.sentAt)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="pt-3 border-t border-ink-100 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入消息…"
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
                    className="flex-1"
                  />
                  <Button onClick={onSend} disabled={sending || !input.trim()}>
                    {sending ? '发送中…' : '发送'}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={onAiSuggest} disabled={suggesting}>
                    {suggesting ? 'AI 思考中…' : 'AI 建议回复'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-ink-500 text-sm">
              选择左侧会话开始聊天
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
