#!/bin/sh
# Server container entrypoint.
#  - 等 Postgres ready
#  - 跑 prisma migrate deploy（幂等）
#  - 跑 db seed（幂等 — seed.ts 用 upsert）
#  - 启动 NestJS
set -e

# DATABASE_URL 形如 postgresql://user:pass@host:port/db?schema=...
PG_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:[^@]+@([^:/?]+).*|\1|')
PG_PORT=$(echo "$DATABASE_URL" | sed -nE 's|.*://[^:]+:[^@]+@[^:/?]+:([0-9]+).*|\1|p')
PG_PORT="${PG_PORT:-5432}"

echo "→ waiting for Postgres ${PG_HOST}:${PG_PORT} ..."
for i in $(seq 1 60); do
  if nc -z "$PG_HOST" "$PG_PORT" 2>/dev/null; then
    echo "  ✓ postgres reachable"
    break
  fi
  sleep 1
done

echo "→ prisma migrate deploy"
npx prisma migrate deploy

echo "→ prisma db seed (idempotent)"
npx prisma db seed || echo "  (seed skipped or failed — non-fatal)"

echo "→ starting NestJS server"
exec node dist/main.js
