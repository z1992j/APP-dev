# RedMatrix — 小红书矩阵协作工作台

面向小红书博主与轻量 MCN 的「AI 协作 + 半自动发布」工具。形态选型见 [`docs/research/web-vs-miniprogram.md`](docs/research/web-vs-miniprogram.md)，PRD 见 [`docs/prd/v1.0.md`](docs/prd/v1.0.md)。

## 仓库结构

```
.
├── apps/
│   ├── server/        NestJS 后端 + Prisma + PostgreSQL（主后端，三端共用）
│   ├── web/           Next.js 15 网页主形态（PC + 移动响应式）
│   └── miniprogram/   微信小程序（移动协作 + 微信获客入口）
├── deploy/            docker-compose 本地开发环境
└── docs/              产品 / 设计 / 调研文档
```

**形态分工**：
- **网页** = 主战场，MCN 编辑 / 博主助理在 PC 工作
- **小程序** = 微信生态获客 + 移动场景填报
- **后端** = 一份 REST API 三端共用

## 快速开始

### 1. 环境准备

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 16 + Redis 7（本地或 docker compose）
- Claude API Key

### 2. 启动数据库

```bash
sudo service postgresql start && sudo service redis-server start
sudo -u postgres psql -c "CREATE USER redmatrix WITH PASSWORD 'redmatrix' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE redmatrix OWNER redmatrix;"
```

（或用 docker：`cd deploy && docker compose up -d postgres redis`）

### 3. 启动后端

```bash
cd apps/server
cp .env.example .env          # 填入 ANTHROPIC_API_KEY、WX_APPID、WX_SECRET
pnpm install
pnpm prisma migrate dev       # 建表
pnpm prisma db seed           # 灌入 64 条违禁词
pnpm dev                      # NestJS 监听 :3000
```

### 4. 启动网页

```bash
cd apps/web
cp .env.local.example .env.local
pnpm install
pnpm dev                      # Next.js 监听 :3001
# 浏览器打开 http://localhost:3001
# Dev 登录：随意输入标识（如 alice），后端会自动建账号
```

### 5. 启动小程序（可选）

用微信开发者工具打开 `apps/miniprogram`，修改 `app.ts` 的 `apiBase` 指向后端。

### 6. 跑 E2E

```bash
cd apps/server
bash test/e2e.test.sh   # 28 项断言全部覆盖核心路径
```

## 当前已实现

| 模块 | 后端 | 网页 | 小程序 |
|---|---|---|---|
| 登录 / JWT / 多团队切换 | ✅ | ✅ | ✅ |
| 账号档案 CRUD + 配额 | ✅ | ✅ | ✅ |
| 灵感选题（LLM 生成 + oembed）| ✅ | ✅ | ✅ |
| AI 写作（流式 + 多账号 fan-out） | ✅ | ✅ | ✅ |
| 违禁词 Trie + 三层框架 | ✅ | ✅ | ✅ |
| 草稿 + 状态机 + 排期 | ✅ | ✅ | ✅ |
| 跳转 XHS（PC 跳 creator + 小程序跳 App） | ✅ | ✅ | ✅ |
| 审稿协作 + 角色鉴权 | ✅ | ✅ | — |
| 团队邀请 / 切换 | ✅ | ✅ | — |
| 数据填报 + 汇总 | ✅ | ✅ | ✅ |
| 协议中心 | — | ✅ | ✅ |
| 排期 cron + 健康检查 | ✅ | ✅ | — |

⏳ 待完成：微信支付、L2 微信内容安全 API、L3 LLM 上下文判断、扩到 1500+ 违禁词、订阅消息模板、真 COS STS。

## 端口

- Postgres: 5432
- Redis: 6379
- Server: 3000
- Web: 3001

## License

私有项目，未授权请勿外传。
