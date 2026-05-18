'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';

const TABS = [
  { key: 'user', label: '用户协议' },
  { key: 'privacy', label: '隐私政策' },
  { key: 'sub', label: '订阅协议' },
];

export default function SettingsPage() {
  const [tab, setTab] = useState('user');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">设置</h1>
      <Card>
        <CardTitle>协议中心</CardTitle>
        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'px-3 py-1.5 rounded-full text-sm ' +
                (tab === t.key ? 'bg-brand-500 text-white' : 'bg-ink-100/60')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'user' && (
          <Article title="RedMatrix 用户协议" meta="最近更新：2026-05">
            <H>1. 服务说明</H>
            <P>
              RedMatrix 是面向小红书博主与团队的内容协作工具。提供选题、AI 写作、违禁词检测、草稿管理、数据填报等功能。
              本服务不提供自动登录或代用户发布小红书账号的能力，所有发布动作由用户在小红书 App 或创作者后台手动完成。
            </P>
            <H>2. 您的责任</H>
            <P>
              您对在本服务中创建的内容负责，不得创作或上传违反《广告法》、《互联网信息服务管理办法》及小红书社区规则的内容。
              您不得借助本服务进行黑产、刷量、批量虚假账号等违规活动。
            </P>
            <H>3. 我们的责任</H>
            <P>
              我们提供工具但不为内容效果（曝光、转化、商务变现等）作出担保。
              AI 生成内容可能包含偏差或不准确信息，请您发布前自行复核。
            </P>
            <H>4. 终止</H>
            <P>您可以随时注销账号，注销后您的草稿和数据将在 30 日内删除。我们也保留对违规账号的暂停或终止服务的权利。</P>
          </Article>
        )}

        {tab === 'privacy' && (
          <Article title="隐私政策" meta="最近更新：2026-05">
            <H>1. 我们收集的信息</H>
            <P>
              · 微信登录提供的 openid、unionid、昵称、头像。<br />
              · 您主动填写的账号档案、人设、文案、图片视频。<br />
              · 您的运营数据（粉丝、互动等），仅在您主动填报时收集。<br />
              · 系统级日志（IP、设备型号、调用时间）用于安全审计。
            </P>
            <P>
              <b>我们不收集您的小红书账号密码、Cookie 或任何登录凭证。</b>
            </P>
            <H>2. 信息用途</H>
            <P>· 提供选题、AI 写作、数据看板等功能。<br />· 为团队管理者提供协作所需的成员信息可见性。<br />· 用于内容安全合规性检查。</P>
            <H>3. 信息共享</H>
            <P>
              · 您的文案在调用 AI 写作时会传输至 DeepSeek 等 AI 服务商进行处理，仅用于本次生成请求。<br />
              · 您上传的图片视频存储于腾讯云对象存储。<br />
              · 法律法规要求或政府机关合法要求时。
            </P>
            <H>4. 您的权利</H>
            <P>您可随时查看与导出全部数据、删除任意账号档案或草稿、注销账号（数据 30 日内删除）。</P>
          </Article>
        )}

        {tab === 'sub' && (
          <Article title="订阅与退订协议" meta="最近更新：2026-05">
            <H>1. 订阅</H>
            <P>
              您可以选择按月或按年订阅个人 Pro / 团队 Starter / 团队 Pro。
              订阅金额通过微信支付一次性收取，订阅期内您可使用对应套餐功能。
            </P>
            <H>2. 自动续费</H>
            <P>如您开启了自动续费，将在每个订阅期结束前 24 小时自动从微信支付扣款续期。您可随时关闭。</P>
            <H>3. 退订</H>
            <P>
              · 自订阅之日起 7 天内未使用核心功能可申请全额退款。<br />
              · 已使用核心功能（AI 写作 / 数据填报等）后不支持退款，但您可随时关闭自动续费。
            </P>
          </Article>
        )}
      </Card>
    </div>
  );
}

function Article({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <article>
      <div className="text-xl font-bold">{title}</div>
      <div className="text-xs text-ink-500 mt-1 mb-4">{meta}</div>
      <div className="space-y-3">{children}</div>
    </article>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold mt-4 mb-1">{children}</div>;
}
function P({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-ink-700 leading-7">{children}</div>;
}
