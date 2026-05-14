# RedMatrix — 小红书矩阵协作小程序

面向小红书博主与轻量 MCN 的「移动协作 + AI 写作 + 半自动发布」工具。详细设计见 [`docs/prd/v1.0.md`](docs/prd/v1.0.md)。

## 仓库结构

```
.
├── apps/
│   ├── server/        NestJS 后端 + Prisma + PostgreSQL
│   └── miniprogram/   微信小程序（原生 + TypeScript）
├── deploy/            docker-compose 本地开发环境
└── docs/              产品 / 设计 / 调研文档
```

## 快速开始

### 1. 环境准备

- Node.js ≥ 20
- pnpm ≥ 9（或 npm）
- Docker + Docker Compose
- 微信开发者工具
- Claude API Key

### 2. 启动基础设施（Postgres + Redis）

```bash
cd deploy
docker compose up -d postgres redis
```

### 3. 启动后端

```bash
cd apps/server
cp .env.example .env          # 填入 ANTHROPIC_API_KEY、WX_APPID、WX_SECRET
pnpm install
pnpm prisma migrate dev       # 建表
pnpm prisma db seed           # 灌入违禁词
pnpm dev                      # 启动 nest，监听 :3000
```

### 4. 启动小程序

1. 用微信开发者工具打开 `apps/miniprogram`
2. 修改 `app.ts` 里的 `apiBase` 指向你的后端（开发期 `http://localhost:3000`）
3. 编译 → 在模拟器或真机预览

## 当前已实现

| 模块 | 状态 | 备注 |
|---|---|---|
| 微信登录 | ✅ | wx.login → code2session → JWT |
| 账号档案 CRUD | ✅ | 含人设字段 |
| 草稿 CRUD + 状态机 | ✅ | draft → scheduled → handed_off → published |
| AI 写作 | ✅ | Claude + prompt caching + 多账号 fan-out |
| 违禁词 L1 | ✅ | Trie + 内置 100+ 词样例（生产前补 1500+）|
| 跳转 XHS handoff | ✅ | 保存图 + 复制 + URL Scheme |
| 数据填报 | ✅ | 日卡 |
| 灵感选题 | 🟡 | LLM 生成 + 用户粘贴 oembed（无第三方数据源）|
| 订阅与计费 | ⏳ | 框架就绪，待接微信支付 |
| 排期 + 订阅消息 | ⏳ | 数据模型就绪，定时器待接 |

## 上线前 Checklist

见 [`docs/design/p0-detailed-design.md` §9](docs/design/p0-detailed-design.md)。

## License

私有项目，未授权请勿外传。
