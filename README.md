# RedMatrix — 小红书矩阵协作工作台

[![CI](https://github.com/z1992j/APP-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/z1992j/APP-dev/actions/workflows/ci.yml)
[![Images](https://github.com/z1992j/APP-dev/actions/workflows/build-images.yml/badge.svg)](https://github.com/z1992j/APP-dev/actions/workflows/build-images.yml)

面向小红书博主与轻量 MCN 的 **AI 协作 + AI 仿写 + 多账号自动化发布** 工作台。
基于开源 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)（MIT）做账号沙盒；每账号独立 Docker 容器、独立 cookie 卷、独立代理 IP，互不关联。

## 仓库结构

```
.
├── apps/
│   ├── server/        NestJS + Prisma + PostgreSQL 主后端
│   └── web/           Next.js 15 网页端（主形态）
├── deploy/            docker-compose（本地 / 生产 / xhs-mcp worker 模板）
├── docs/              产品 PRD / 设计 / 调研文档
├── .github/workflows/ CI（e2e + build + worker smoke）+ GHCR 镜像
└── .devcontainer/     Codespaces 一键开发环境
```

## 🚀 启动

### 方式一：Codespaces（零配置）

仓库右上角 **Code → Codespaces → Create codespace**。`.devcontainer/setup.sh` 会自动安装依赖、起 Postgres+Redis、migrate、灌种子。然后：

```bash
# 两个 Terminal
cd apps/server && pnpm dev    # :3000
cd apps/web    && pnpm dev    # :3001 （Codespaces 自动转发公网预览 URL）
```

### 方式二：自有服务器拉镜像（推荐生产）

```bash
docker login ghcr.io -u <your-github-user>

cd deploy
cat > .env <<EOF
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/anthropic
DEEPSEEK_MODEL=deepseek-v4-pro
JWT_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 16)
WX_APPID=                           # 网页 OAuth 暂未必填
WX_SECRET=
PUBLIC_API_BASE=http://<your-host>:3000
GH_OWNER=z1992j
EOF

docker compose -f docker-compose.prod.yml up -d

# 试一个 xhs-mcp worker（每账号一容器）
./test-worker.sh 1 18001 [可选代理 URL]
```

## 🔑 登录

部署后打开浏览器：

```
http://<your-host>:3001/login
```

Dev 模式（无微信 AppID 也可）：

1. 输入任意标识（如 `alice`）
2. 后端会自动建用户 + 个人团队
3. 跳到 `/inspire` 工作台

后续生产：填入 `WX_APPID` / `WX_SECRET` 接入微信扫码 OAuth。

## ✅ 功能

| 模块 | 状态 | 备注 |
|---|---|---|
| 登录 / JWT / 多团队切换 | ✅ | dev 模式 + 微信 OAuth 框架 |
| 账号档案 + 人设 + 套餐配额 | ✅ | persona 字段喂 AI |
| 灵感选题 | ✅ | LLM 生成 10 角度 + 粘贴 XHS 链接 oembed |
| AI 写作 | ✅ | DeepSeek-v4-pro 流式（Anthropic SDK + 兼容网关）+ 多账号 fan-out |
| **AI 仿写工作台** | ✅ | 粘 URL → 解析 → 按锁定提示词改写 → 草稿 |
| 违禁词检测 | ✅ | Trie + 64 种子词 + 三层框架 |
| 草稿 + 状态机 + 排期 | ✅ | draft → in_review → scheduled → handed_off → published |
| 跳转小红书 | ✅ | 复制文案 + 跳 creator.xiaohongshu.com |
| **xhs-mcp 自动化** | ✅ | 扫码登录 / 自动发布 / 评论 |
| 每账号独立沙盒 | ✅ | Docker 容器 + 独立 cookie 卷 + 独立代理 IP |
| 审稿协作 + 角色 | ✅ | owner / admin / editor / reviewer / viewer |
| 团队邀请 / 切换 | ✅ | 多团队 JWT 切换 |
| 数据填报 + 汇总 | ✅ | 每日 7 字段 + 矩阵看板 |
| 协议中心 | ✅ | 用户 / 隐私 / 订阅 |
| 排期 cron + 健康检查 | ✅ | 每分钟扫到期 |

⏳ Phase 3+：评论自动浏览 + AI 回复 / 蓝 V 私信轮询 / 代理 IP 池健康检查 / BullMQ 错峰队列 / 微信支付。

## ✅ CI

每次 push 触发 [`ci.yml`](.github/workflows/ci.yml) 三个并行 job：

1. **Server e2e**：Postgres + Redis service → migrate + seed + build + 启动 → 28 项断言（auth / 配额 / 草稿全状态机 / 团队邀请 / 切换 / 角色鉴权）
2. **Web**：typecheck + 13 路由 production build
3. **xhs-mcp Worker**：拉镜像 + 启容器 + 验 `/health` 与 `/api/v1/login/status`

合并到 main 后 [`build-images.yml`](.github/workflows/build-images.yml) 推 GHCR：
- `ghcr.io/z1992j/redmatrix-server:latest`
- `ghcr.io/z1992j/redmatrix-web:latest`

## 端口

| 服务 | 端口 |
|---|---|
| Postgres | 5432 |
| Redis | 6379 |
| Server (NestJS) | 3000 |
| Web (Next.js) | 3001 |
| Worker 池（每账号一个） | 18000~18999 |

## 风险提示（必读）

**自动化能力在小红书 ToS 灰色地带**。即使有指纹+IP+节流，仍可能触发风控：

- ✅ **只服务已养号 ≥30 天 + 粉丝 ≥1k 的蓝 V**，新号必死
- ✅ 内置每账号日发帖 ≤3、最小间隔 30 分钟硬限
- ✅ 用户协议明文「风险自担」+ 强实名
- ❌ 不做刷量黑产 / 批量虚假账号 / 跨设备共号
- 详见 [`docs/research/multi-account-automation.md`](docs/research/multi-account-automation.md)

## 致谢

- [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) — Go + go-rod 浏览器自动化（MIT）

## License

私有项目，未授权请勿外传。
