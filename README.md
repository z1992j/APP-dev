# RedMatrix — 小红书矩阵协作工作台

[![CI](https://github.com/z1992j/APP-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/z1992j/APP-dev/actions/workflows/ci.yml)
[![Images](https://github.com/z1992j/APP-dev/actions/workflows/build-images.yml/badge.svg)](https://github.com/z1992j/APP-dev/actions/workflows/build-images.yml)

面向小红书博主与轻量 MCN 的「AI 协作 + 半自动发布」工具。形态选型见 [`docs/research/web-vs-miniprogram.md`](docs/research/web-vs-miniprogram.md)，PRD 见 [`docs/prd/v1.0.md`](docs/prd/v1.0.md)，自动化集成见 [`docs/research/xiaohongshu-mcp-integration.md`](docs/research/xiaohongshu-mcp-integration.md)。

## 仓库结构

```
.
├── apps/
│   ├── server/        NestJS 后端 + Prisma + PostgreSQL（主后端，三端共用）
│   ├── web/           Next.js 15 网页主形态（PC + 移动响应式）
│   └── miniprogram/   微信小程序（移动协作 + 微信获客入口）
├── deploy/            docker-compose 本地 + 生产模板
├── docs/              产品 / 设计 / 调研文档
├── .github/workflows/ CI / 镜像构建
└── .devcontainer/     Codespaces 一键开发环境
```

## 🚀 三种方式跑起来

### A. GitHub Codespaces（最快，零本地依赖）

点击仓库右上角 **Code → Codespaces → Create codespace** → 等 2~3 分钟自动跑完
`.devcontainer/setup.sh`（Postgres + Redis + 后端依赖 + 迁移 + 灌种子）。然后两个 Terminal：

```bash
# Tab 1: 后端
cd apps/server && pnpm dev      # :3000

# Tab 2: 网页
cd apps/web && pnpm dev          # :3001（Codespaces 会自动转发到公网预览 URL）
```

### B. 拉镜像跑（你已有服务器）

```bash
# 一次性：登录 GHCR
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-username> --password-stdin

# 进 deploy 目录配置 .env（填入 ANTHROPIC_API_KEY / JWT_SECRET / WX_*）
cd deploy && cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=$(openssl rand -hex 32)
WX_APPID=your_wx_appid
WX_SECRET=your_wx_secret
PG_PASSWORD=$(openssl rand -hex 16)
PUBLIC_API_BASE=https://api.your-domain.com
EOF

# 起 Postgres + Redis + server + web（镜像由 GHCR 拉）
docker compose -f docker-compose.prod.yml up -d

# 服务器需要让 server 容器访问 docker socket（已在 compose 中配好）
# 然后试跑一个 xhs-mcp worker：
./test-worker.sh 1 18001 [可选代理 URL]
```

### C. 本地纯源码跑

```bash
sudo service postgresql start && sudo service redis-server start
sudo -u postgres psql -c "CREATE USER redmatrix WITH PASSWORD 'redmatrix' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE redmatrix OWNER redmatrix;"

cd apps/server && cp .env.example .env   # 填入 ANTHROPIC_API_KEY 等
pnpm install && pnpm prisma migrate dev && pnpm prisma db seed && pnpm dev

cd apps/web && cp .env.local.example .env.local && pnpm install && pnpm dev
```

## ✅ CI 自动跑通的事

每次 push 都跑 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)，三个并行 job：

1. **server** — 启 Postgres + Redis service container → 装依赖 → migrate → seed → 编译 → 启动 → **跑 28 项 e2e 断言**（登录/账号/草稿全状态机/团队邀请/角色鉴权/审计…）
2. **web** — Next.js typecheck + production build（13 个路由）
3. **worker-image** — 拉 `xpzouying/xiaohongshu-mcp:latest` → 启 worker → 检 `/health` → 调 `/api/v1/login/status` 验证可用

合并到 main 后 [`build-images.yml`](.github/workflows/build-images.yml) 自动构建并推到 GHCR：
- `ghcr.io/z1992j/redmatrix-server:latest`
- `ghcr.io/z1992j/redmatrix-web:latest`

## 当前已实现

| 模块 | 后端 | 网页 | 小程序 |
|---|---|---|---|
| 登录 / JWT / 多团队切换 | ✅ | ✅ | ✅ |
| 账号档案 CRUD + 配额 | ✅ | ✅ | ✅ |
| 灵感选题（LLM 生成 + oembed）| ✅ | ✅ | ✅ |
| AI 写作（流式 + 多账号 fan-out） | ✅ | ✅ | ✅ |
| **AI 仿写工作台**（粘 URL → 仿写 → 草稿） | ✅ | ✅ | — |
| 违禁词 Trie + 三层框架 | ✅ | ✅ | ✅ |
| 草稿 + 状态机 + 排期 | ✅ | ✅ | ✅ |
| 跳转 XHS（PC 跳 creator + 小程序跳 App） | ✅ | ✅ | ✅ |
| **自动化绑定 / 扫码登录 / 自动发布**（集成 xiaohongshu-mcp） | ✅ | ✅ | — |
| 审稿协作 + 角色鉴权 | ✅ | ✅ | — |
| 团队邀请 / 切换 | ✅ | ✅ | — |
| 数据填报 + 汇总 | ✅ | ✅ | ✅ |
| 协议中心 | — | ✅ | ✅ |
| 排期 cron + 健康检查 | ✅ | ✅ | — |

⏳ 待完成：微信支付、L2 微信内容安全 API、L3 LLM 上下文判断、扩到 1500+ 违禁词、订阅消息模板、真 COS STS、评论/私信自动回复（Phase 3）、代理 IP 池健康检查（Phase 4）。

## 端口

- Postgres: 5432
- Redis: 6379
- Server: 3000
- Web: 3001
- Workers: 18000~18999（每账号一个 Docker 容器）

## License

私有项目，未授权请勿外传。基于 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)（MIT）。
