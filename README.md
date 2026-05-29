# RedMatrix — 小红书矩阵协作工作台

[![CI](https://github.com/z1992j/RedMatrix/actions/workflows/ci.yml/badge.svg)](https://github.com/z1992j/RedMatrix/actions/workflows/ci.yml)
[![Images](https://github.com/z1992j/RedMatrix/actions/workflows/build-images.yml/badge.svg)](https://github.com/z1992j/RedMatrix/actions/workflows/build-images.yml)

面向小红书博主与轻量 MCN 的 **AI 内容生产 + 多账号自动化运营 + 矩阵协作** 全栈工作台。

基于开源 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)（MIT）做账号沙盒；每账号独立 Docker 容器、独立 cookie 卷、独立代理 IP，互不关联。

## 仓库结构

```
.
├── apps/
│   ├── server/        NestJS 10 + Prisma 5 + PostgreSQL + BullMQ 后端
│   └── web/           Next.js 15 + React 19 + Tailwind 网页端
├── deploy/            docker-compose（本地 / 生产 / xhs-mcp worker）
├── docs/              PRD / 详设 / 调研文档
├── .github/workflows/ CI（e2e + build + worker smoke）+ GHCR 镜像
└── .devcontainer/     Codespaces 一键开发环境
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 15 · React 19 · Zustand · TanStack Query · Tailwind CSS |
| 后端 | NestJS 10 · Prisma 5 · PostgreSQL · Redis · BullMQ |
| AI | DeepSeek-v4-pro（Anthropic SDK 兼容网关）· 流式 SSE |
| 自动化 | xhs-mcp（Go + go-rod）· 每账号独立 Docker 容器 |
| CI/CD | GitHub Actions → GHCR 镜像 → docker-compose 部署 |

## 页面导航

| 路由 | 页面 | 说明 |
|------|------|------|
| `/inspire` | 灵感选题 | AI 生成 10 角度 + 粘贴 XHS 链接收藏 |
| `/write` | AI 写作 | DeepSeek 流式生成 · 多账号 fan-out · prompt 缓存 |
| `/imitate` | 一键仿写 | 单条 + 批量模式 · 粘 URL → 解析 → AI 改写 → 草稿 |
| `/drafts` | 草稿管理 | 状态机 · 排期 · 违禁词检查 · 图片管理 · 封面选择 |
| `/comments` | 评论管理 | 自动抓取 · 按笔记分组 · 批量操作 · AI/模板回复 · 情感分析 |
| `/dm` | 私信 | 会话列表 · 聊天窗口 · AI 建议回复 · 归档 |
| `/data` | 数据看板 | 趋势柱状图（7/30/90天）· 每日填报 · 矩阵汇总 |
| `/accounts` | 账号档案 | 人设管理 · 在线状态指示 · 绑定自动化 |
| `/workers` | Worker 监控 | Docker 状态 · 容器健康 · 端口/配额/活跃时间 |
| `/team` | 团队 | 邀请 · 角色权限（owner/admin/editor/reviewer/viewer）|
| `/billing` | 订阅计费 | 套餐展示（支付接入中）|
| `/settings` | 设置 | 协议中心 |

## 功能

| 模块 | 状态 | 说明 |
|------|------|------|
| 登录 / JWT / 多团队 | ✅ | dev 模式 + 微信 OAuth 框架 · httpOnly cookie 认证 |
| 账号档案 + 人设 | ✅ | persona 喂 AI · 全局账号切换器 · 在线状态 |
| 灵感选题 | ✅ | LLM 10 角度 + 链接 oembed |
| AI 写作 | ✅ | DeepSeek 流式 · 多账号 fan-out · prompt 缓存 |
| AI 仿写 | ✅ | 单条 + **批量模式**（多 URL 并行） |
| 违禁词检测 | ✅ | Trie 引擎 + 三层框架 |
| 草稿 + 排期 | ✅ | 状态机 · cron 扫描 · **图片管理 + 封面选择** |
| xhs-mcp 自动化 | ✅ | 扫码登录 · 自动发布 · 每账号 Docker 沙盒 |
| 评论管理 | ✅ | 15 分钟自动抓取 · **按笔记分组** · **批量操作** · AI/模板回复 · **情感分析** |
| 私信 | ✅ | 会话列表 · 聊天窗口 · **AI 建议回复** · 归档（数据结构就绪，xhs-mcp 扩展中）|
| 数据看板 | ✅ | **趋势柱状图** · 7/30/90 天切换 · 矩阵汇总 |
| Worker 监控 | ✅ | Docker 可用性 · 容器健康 · 端口/配额/活跃时间 |
| 审稿协作 | ✅ | owner / admin / editor / reviewer / viewer 五级角色 |
| 团队邀请 | ✅ | 邀请码 + 角色管理 |
| 协议中心 | ✅ | 用户 / 隐私 / 订阅 |

## 安全加固

| 项目 | 措施 |
|------|------|
| JWT | 启动时校验 `JWT_SECRET` ≥ 32 字符，否则拒绝启动 |
| CORS | 白名单模式，`CORS_ORIGINS` 环境变量配置 |
| SSRF | URL 解析后 DNS 校验私网 IP · 禁止自动重定向 |
| Docker | 支持 TCP API（`DOCKER_HOST` 环境变量）· 不强依赖 socket 挂载 |
| 容器 | 非 root 用户运行（`appuser`）|
| Token | httpOnly cookie · 同时兼容 Bearer header |
| HTTP 头 | Helmet 中间件 |

## 启动

### Codespaces（零配置）

1. GitHub Settings → Codespaces → New secret → `DEEPSEEK_API_KEY`
2. 仓库 Code → Codespaces → Create codespace on main
3. 终端分两个 tab：
   ```bash
   cd apps/server && pnpm dev    # NestJS :3000
   cd apps/web && pnpm dev       # Next.js :3001
   ```

### 阿里云 ECS（生产部署）

```bash
cd deploy
cat > .env <<EOF
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/anthropic
DEEPSEEK_MODEL=deepseek-v4-pro
JWT_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 16)
CORS_ORIGINS=https://your-domain.com
PUBLIC_API_BASE=https://your-domain.com
EOF

docker compose -f docker-compose.prod.yml up -d
```

### 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | ≥ 32 字符，`openssl rand -hex 32` |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `REDIS_URL` | 是 | Redis 连接串 |
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API Key |
| `CORS_ORIGINS` | 否 | 允许跨域来源，逗号分隔 |
| `DOCKER_HOST` | 否 | Docker TCP 地址，如 `tcp://127.0.0.1:2375` |
| `WX_APPID` / `WX_SECRET` | 否 | 微信 OAuth（生产需要）|

## CI

每次 push 触发三个并行 job：

1. **Server e2e** — Postgres + Redis → migrate + seed + build → 28 项断言
2. **Web** — typecheck + 17 路由 production build
3. **xhs-mcp Worker** — 拉镜像 + 启容器 + 验 `/health`

合并到 main 后推 GHCR 镜像：
- `ghcr.io/z1992j/redmatrix-server:latest`
- `ghcr.io/z1992j/redmatrix-web:latest`

## 端口

| 服务 | 端口 |
|------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Server (NestJS) | 3000 |
| Web (Next.js) | 3001 |
| Worker 池 | 18000~18999 |

## 数据模型

20 张表，核心模型：

- **User / Team / TeamMember** — 用户 + 团队 + 角色
- **XhsAccount** — 账号档案（含 AI 人设 JSON）
- **Draft / DraftReview** — 草稿 + 审稿
- **XhsSession** — 浏览器自动化会话（6 态状态机）
- **XhsComment / CommentRule** — 评论 + 自动回复规则（含情感分析）
- **DmConversation / DmMessage / DmRule** — 私信会话 + 消息 + 规则
- **DataPoint** — 数据填报（按日×账号去重）
- **AiUsage** — AI 用量计费
- **AuditLog** — 全链路操作审计

## 风险提示

**自动化能力在小红书 ToS 灰色地带**。即使有指纹+IP+节流，仍可能触发风控：

- ✅ 只服务已养号 ≥30 天 + 粉丝 ≥1k 的蓝 V，新号必死
- ✅ 内置每账号日发帖 ≤3、最小间隔 30 分钟硬限
- ✅ 用户协议明文「风险自担」+ 强实名
- ❌ 不做刷量黑产 / 批量虚假账号 / 跨设备共号

详见 [`docs/research/multi-account-automation.md`](docs/research/multi-account-automation.md)

## 致谢

- [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) — Go + go-rod 浏览器自动化（MIT）

## License

私有项目，未授权请勿外传。
