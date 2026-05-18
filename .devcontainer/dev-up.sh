#!/usr/bin/env bash
# 在 Codespace attach 时被调用。用 tmux 在后台启动 server + web，
# 让 :3000 和 :3001 立刻可用。已在跑则跳过。
#
# 查看日志：
#   tmux attach -t redmatrix          (Ctrl-b n / p 切窗口、Ctrl-b d 退出)
#   tail -f /tmp/redmatrix-server.log
#   tail -f /tmp/redmatrix-web.log

set -e
cd "$(dirname "$0")/.."

# 已经有人在跑就别重复
if tmux has-session -t redmatrix 2>/dev/null; then
  echo "→ tmux session 'redmatrix' already up, skipping"
  exit 0
fi

# 等 setup.sh 已经把 .env 落好（postCreateCommand 跑完才会有）
if [ ! -f apps/server/.env ]; then
  echo "→ apps/server/.env 还没就绪，跳过自动起服（setup.sh 还在跑）"
  exit 0
fi
if [ ! -d apps/server/node_modules ] || [ ! -d apps/web/node_modules ]; then
  echo "→ deps 还没装好，跳过（setup.sh 还在跑）"
  exit 0
fi

echo "→ 启动 server + web 到 tmux session 'redmatrix'"
tmux new-session -d -s redmatrix -n server \
  "cd apps/server && pnpm dev 2>&1 | tee /tmp/redmatrix-server.log"
tmux new-window -t redmatrix:1 -n web \
  "cd apps/web && pnpm dev 2>&1 | tee /tmp/redmatrix-web.log"

# 等 server 起来再返回（最多 60s）
for i in $(seq 1 60); do
  if curl -sSf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
    echo "✓ server :3000 ready"
    break
  fi
  sleep 1
done
for i in $(seq 1 60); do
  if curl -sSf http://localhost:3001 >/dev/null 2>&1; then
    echo "✓ web :3001 ready — 上方 PORTS 标签里点 🌐 打开"
    break
  fi
  sleep 1
done
