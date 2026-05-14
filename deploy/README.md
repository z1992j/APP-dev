# Local dev infra

```bash
# 启动基础服务（postgres + redis）
docker compose up -d postgres redis

# 跑后端
cd ../apps/server
cp .env.example .env   # 填入 ANTHROPIC_API_KEY 等
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev               # http://localhost:3000

# 整体部署（含 server 容器）
docker compose --profile app up -d
```

## 端口
- Postgres: 5432
- Redis: 6379
- Server: 3000
