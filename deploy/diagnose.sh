#!/usr/bin/env bash
# 部署后的快速诊断脚本。在 ECS 上：
#   cd ~/redmatrix && git pull && bash deploy/diagnose.sh
set +e
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env
COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file $ENV_FILE"

echo "════════════════════════════════════════════════════════════"
echo "  RedMatrix 诊断（$(date -u '+%Y-%m-%d %H:%M:%S UTC')）"
echo "════════════════════════════════════════════════════════════"

echo
echo "▶ A. 容器状态"
$COMPOSE ps

echo
echo "▶ B. .env 关键字段（脱敏）"
if [ -f "$ENV_FILE" ]; then
  grep -E "^(DEEPSEEK_API_KEY|JWT_SECRET|PG_PASSWORD|DEEPSEEK_BASE_URL|DEEPSEEK_MODEL|PUBLIC_API_BASE|DATABASE_URL|REDIS_URL)" "$ENV_FILE" \
    | sed -E 's/(DEEPSEEK_API_KEY|JWT_SECRET|PG_PASSWORD)=.{0,8}.*/\1=<set, hidden>/'
else
  echo "❌ $ENV_FILE 不存在！"
fi

echo
echo "▶ C. server 最近 60 行日志"
$COMPOSE logs --tail=60 server 2>&1 | tail -60

echo
echo "▶ D. 健康检查与登录探测"
echo "  health:"
curl -sS --max-time 5 -o /tmp/health.json -w "    HTTP %{http_code}  body:" 'http://localhost:3000/api/v1/health'
cat /tmp/health.json 2>/dev/null
echo
echo
echo "  wx-login (dev mode):"
curl -sS --max-time 8 -X POST -o /tmp/wx.json -w "    HTTP %{http_code}  body:" \
  'http://localhost:3000/api/v1/auth/wx-login' \
  -H 'Content-Type: application/json' \
  -d '{"code":"dev-diag"}'
cat /tmp/wx.json 2>/dev/null
echo
echo
echo "  web /login HTML 渲染:"
curl -sS --max-time 5 -o /dev/null -w "    HTTP %{http_code}\n" 'http://localhost:3001/login'

echo
echo "▶ E. Prisma 迁移状态"
$COMPOSE exec -T postgres psql -U redmatrix -d redmatrix -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 8;" 2>&1

echo
echo "▶ F. 表清单（应该有 16~18 张）"
$COMPOSE exec -T postgres psql -U redmatrix -d redmatrix -c \
  "\\dt" 2>&1 | tail -20

echo
echo "▶ G. server 容器内 env 检查（DATABASE_URL / DEEPSEEK_API_KEY 是否注入）"
$COMPOSE exec -T server sh -c \
  'echo "DATABASE_URL=$(echo $DATABASE_URL | sed "s/:[^:@]*@/:<pwd>@/")"; echo "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:0:8}...";echo "JWT_SECRET length=${#JWT_SECRET}"; echo "PORT=$PORT"' 2>&1

echo
echo "════════════════════════════════════════════════════════════"
echo "  诊断完成。如果 D 段 health 不通或 wx-login 500，"
echo "  请把 C 段 server 日志贴回去给开发。"
echo "════════════════════════════════════════════════════════════"
