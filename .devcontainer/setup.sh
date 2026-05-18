#!/usr/bin/env bash
# One-shot Codespaces / devcontainer setup. 起 Postgres + Redis、装依赖、
# 跑迁移和种子，并把 Codespaces Secrets 注入 apps/server/.env。
set -e
cd "$(dirname "$0")/.."

echo "→ ensure Docker daemon up"
docker version >/dev/null

echo "→ bring up Postgres + Redis"
docker compose -f deploy/docker-compose.yml up -d postgres redis
# wait until pg_isready
for i in $(seq 1 30); do
  if docker compose -f deploy/docker-compose.yml exec -T postgres pg_isready -U redmatrix >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "→ apps/server install + migrate + seed"
cd apps/server
[ -f .env ] || cp .env.example .env

# Codespaces 友好的本地 DB
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://redmatrix:redmatrix@localhost:5432/redmatrix?schema=public|' .env
sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://localhost:6379|' .env

# 把 Codespaces 设置的 Secret 注入 .env（如未设置则保留 .env.example 里的占位）
inject() { # $1=name $2=value
  if [ -n "$2" ]; then
    if grep -q "^$1=" .env; then
      sed -i "s|^$1=.*|$1=$2|" .env
    else
      echo "$1=$2" >> .env
    fi
    echo "  ✓ $1 set from Codespaces secret"
  fi
}
inject DEEPSEEK_API_KEY  "${DEEPSEEK_API_KEY:-}"
inject DEEPSEEK_BASE_URL "${DEEPSEEK_BASE_URL:-}"
inject DEEPSEEK_MODEL    "${DEEPSEEK_MODEL:-}"
inject JWT_SECRET        "${JWT_SECRET:-}"
inject WX_APPID          "${WX_APPID:-}"
inject WX_SECRET         "${WX_SECRET:-}"

pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
cd ../..

echo "→ apps/web install"
cd apps/web
[ -f .env.local ] || cp .env.local.example .env.local
pnpm install
cd ../..

cat <<EOF

════════════════════════════════════════════════════════════════
  ✓ RedMatrix Codespace 就绪
════════════════════════════════════════════════════════════════

下一步在两个 terminal 里分别跑：

  Tab 1: cd apps/server && pnpm dev    # NestJS @ :3000
  Tab 2: cd apps/web    && pnpm dev    # Next.js  @ :3001

VS Code 顶部 PORTS 标签里 :3001 会标 "openPreview"，点开就是公网测试 URL。

如果 AI 写作 / 仿写返回 401：
  在 GitHub → Settings → Codespaces → Secrets 里加 DEEPSEEK_API_KEY，
  rebuild container 即可（或手工编辑 apps/server/.env 立即生效）。

E2E:
  cd apps/server && bash test/e2e.test.sh
EOF
