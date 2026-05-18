#!/usr/bin/env bash
# One-shot Codespaces / devcontainer setup. Brings up Postgres + Redis,
# installs deps, runs migrations and seeds.
set -e
cd "$(dirname "$0")/.."

echo "→ ensure Docker daemon up"
docker version >/dev/null

echo "→ bring up Postgres + Redis"
docker compose -f deploy/docker-compose.yml up -d postgres redis
sleep 4

echo "→ apps/server install + migrate + seed"
cd apps/server
[ -f .env ] || cp .env.example .env
# substitute for Codespaces-friendly DATABASE_URL
sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://redmatrix:redmatrix@localhost:5432/redmatrix?schema=public|' .env
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

✓ Setup complete.

To run:
  Tab 1: cd apps/server && pnpm dev    # :3000
  Tab 2: cd apps/web    && pnpm dev    # :3001

E2E:
  cd apps/server && bash test/e2e.test.sh

Test xhs-mcp worker:
  ./deploy/test-worker.sh 1 18001
EOF
