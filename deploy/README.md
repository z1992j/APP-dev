# 部署 / 本地基础设施

## 启动基础服务（Postgres + Redis）

```bash
docker compose up -d postgres redis
```

## 后端

```bash
cd ../apps/server
cp .env.example .env             # 填入 DEEPSEEK_API_KEY 等
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev                         # http://localhost:3000
```

## 网页

```bash
cd ../apps/web
cp .env.local.example .env.local
pnpm install
pnpm dev                         # http://localhost:3001
```

## 整体部署（生产）

```bash
docker compose --profile app up -d
```

---

## Phase 2 — xiaohongshu-mcp 自动化 Worker

每个 XHS 账号 = 一个独立 Docker 容器，cookie/资源/IP 完全隔离。
NestJS 的 `automation` 模块通过 Docker socket 动态启停容器（端口池 18000-18999）。

### 服务器要求

- Docker 已安装；NestJS 容器或宿主进程能访问 `/var/run/docker.sock`
- 每账号约 800MB RAM、~150MB 磁盘
- 4C8G 服务器可跑 10~15 个并发账号

### 拉取并测试 worker 镜像

```bash
# 测试单个 worker（独立 cookies 卷 + 可选代理）
./test-worker.sh <ACCOUNT_ID> <PORT> [PROXY_URL]

# 例：
./test-worker.sh 1 18001
# 然后浏览器或扫码 App 访问 http://<server>:18001/api/v1/login/qrcode
```

### docker-compose 模板（参考）

`docker-compose.workers.yml` 是手动 smoke test 用的模板。
**生产环境不要手动跑**，NestJS 的 `automation` 模块会动态 spawn。

### 代理 IP（青果）

每账号绑定独立住宅 IP（约 ¥30/IP/月）：

```
XHS_PROXY=http://USER:PASS@proxy.qg.net:9999
```

把代理信息存到 `proxy` 表，NestJS spawn 时会自动注入 worker 环境变量。

### NestJS 调度逻辑

- 第一次"绑定 XHS"：`POST /automation/sessions/:accountId/bind`
  → spawn 容器 → 返回 QR 给前端 → 前端轮询 `GET /automation/sessions/:accountId/poll`
  → 用户扫码 → cookie 持久化到该账号专属 Docker volume
- 后续发布：`POST /automation/drafts/:draftId/publish`
  → 复用已有 worker → 下载图片到 assets 卷 → 调 worker `/api/v1/publish`
- 解绑：`DELETE /automation/sessions/:accountId`
  → stop + remove 容器（cookie 卷可保留以便重新绑定）

### 节流（内置）

- 每账号默认日发帖 ≤3、评论 ≤30、私信 ≤50
- 最小间隔 30 分钟（service 层 `assertQuota` 控制）
- 在 `xhs_session.dailyQuota` 改 JSON 调整

### 风险提示

- 自动化任何动作都可能触发风控；**仅服务已养号 ≥30 天 + 蓝 V 账号**
- 不要拿新号试
- 用户协议必须明确"风险自担"
- 验证码 / 异地登录会让账号状态变为 `challenged`，需手动重新扫码

---

## 端口

- Postgres: 5432
- Redis: 6379
- Server: 3000
- Web: 3001
- Workers: 18000~18999（每账号一个）
