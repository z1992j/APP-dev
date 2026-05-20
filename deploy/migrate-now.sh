#!/usr/bin/env bash
# 不重建镜像，立刻在已部署的容器上跑迁移 + 种子。
# 适合「服务已起但表没建」的紧急修复。
#
# 用法（在 ~/redmatrix 目录下）：
#   bash deploy/migrate-now.sh

set -e
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env
COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file $ENV_FILE"

echo "▶ 等 postgres 健康"
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U redmatrix >/dev/null 2>&1; then
    echo "  ✓ postgres ready"
    break
  fi
  sleep 1
done

echo "▶ 在 server 容器内跑 prisma migrate deploy"
$COMPOSE exec -T server sh -c "
  cd /app && npx prisma migrate deploy
" || {
  echo "  → server 容器在 restart 循环，改在 postgres 上手工创建表"
  echo "  → 先用一次性 server 容器（带 entrypoint=npx prisma migrate deploy）"
  $COMPOSE run --rm --entrypoint "" server sh -c "cd /app && npx prisma migrate deploy"
}

echo "▶ 种子数据（违禁词等）"
$COMPOSE exec -T server sh -c "
  cd /app && npx prisma db seed
" 2>/dev/null || \
$COMPOSE run --rm --entrypoint "" server sh -c "cd /app && npx prisma db seed" || \
  echo "  ⚠ seed 失败（如果已经种子过，可忽略）"

echo
echo "▶ 校验表"
$COMPOSE exec -T postgres psql -U redmatrix -d redmatrix -c "\\dt"

echo
echo "▶ 重启 server（让健康路径完整生效）"
$COMPOSE restart server
sleep 3

echo
echo "▶ 测一下健康"
$COMPOSE exec -T server sh -c "wget -qO- http://localhost:3000/api/v1/health" || \
  curl -fsS http://localhost:3000/api/v1/health

echo
echo "✓ 修复完成。打开 http://你的IP:3001/login 重试登录。"
