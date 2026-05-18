'use client';

import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

const PLANS = [
  {
    key: 'personal',
    title: '个人 Pro',
    price: '¥29 / 月  ·  ¥279 / 年 (省 20%)',
    features: ['AI 写作 100 次/天', '5 个账号档案', '数据看板 + 排期', '违禁词无限检测'],
  },
  {
    key: 'starter',
    title: '团队 Starter',
    price: '¥99 / 席 / 月（3 席起）',
    features: ['协作 + 审稿', '10 个账号档案', '任务派发', '团队数据看板'],
  },
  {
    key: 'pro',
    title: '团队 Pro',
    price: '¥299 / 席 / 月',
    features: ['企业微信对接', '私信话术库', '变体生成', 'API 开放'],
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">升级 Pro</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((p) => (
          <Card key={p.key}>
            <CardTitle>{p.title}</CardTitle>
            <div className="text-brand-500 mb-4">{p.price}</div>
            <ul className="space-y-2 mb-5">
              {p.features.map((f) => (
                <li key={f} className="text-sm">✓ {f}</li>
              ))}
            </ul>
            <Button
              className="w-full"
              onClick={() => toast('微信支付集成中，敬请期待', 'info')}
            >
              立即升级
            </Button>
          </Card>
        ))}
      </div>
      <div className="text-xs text-ink-500">
        续费与退订规则查看《订阅协议》。AI 用量按月重置。
      </div>
    </div>
  );
}
