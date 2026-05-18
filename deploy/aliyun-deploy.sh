#!/usr/bin/env bash
# RedMatrix 一键部署到阿里云 ECS 轻量服务器（或任何 Linux）
# 用法：
#   curl -sSL https://raw.githubusercontent.com/z1992j/APP-dev/main/deploy/aliyun-deploy.sh \
#     | bash -s -- --deepseek-key sk-xxx [--ip 公网IP] [--mode build|ghcr]
#
# 或先克隆再跑：
#   git clone https://github.com/z1992j/APP-dev.git && cd APP-dev
#   bash deploy/aliyun-deploy.sh --deepseek-key sk-xxx
#
# 默认走 build 模式（在 ECS 本地 docker build），避免 GHCR PAT 配置。

set -euo pipefail

# ── 解析参数 ────────────────────────────────────────────────────────
MODE="build"            # build | ghcr
DEEPSEEK_KEY=""
DEEPSEEK_MODEL="deepseek-v4-pro"
PUBLIC_IP=""
GH_TOKEN=""
GH_OWNER="z1992j"
REPO_URL="https://github.com/z1992j/APP-dev.git"
WORK_DIR="${WORK_DIR:-$HOME/redmatrix}"
SKIP_DEPS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --deepseek-key) DEEPSEEK_KEY="$2"; shift 2 ;;
    --deepseek-model) DEEPSEEK_MODEL="$2"; shift 2 ;;
    --ip) PUBLIC_IP="$2"; shift 2 ;;
    --gh-token) GH_TOKEN="$2"; shift 2 ;;
    --gh-owner) GH_OWNER="$2"; shift 2 ;;
    --work-dir) WORK_DIR="$2"; shift 2 ;;
    --skip-deps) SKIP_DEPS="true"; shift ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]
  --deepseek-key <key>       必填，DeepSeek API key (sk-...)
  --mode build|ghcr          默认 build；ghcr 需要 --gh-token
  --deepseek-model <name>    默认 deepseek-v4-pro
  --ip <public-ip>           ECS 公网 IP；不填则尝试自动探测
  --gh-token <PAT>           仅 ghcr 模式需要
  --gh-owner <user>          GHCR 镜像 owner，默认 z1992j
  --work-dir <path>          默认 ~/redmatrix
  --skip-deps                跳过 Docker 安装
EOF
      exit 0
      ;;
    *) echo "未知参数：$1"; exit 1 ;;
  esac
done

# ── 颜色 + 工具 ────────────────────────────────────────────────────
RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
step() { echo; echo "${BLUE}▶ $*${RESET}"; }
ok()   { echo "${GREEN}  ✓ $*${RESET}"; }
warn() { echo "${YELLOW}  ⚠ $*${RESET}"; }
fail() { echo "${RED}  ✗ $*${RESET}" >&2; exit 1; }

# ── 校验 ──────────────────────────────────────────────────────────
[ -z "$DEEPSEEK_KEY" ] && fail "请用 --deepseek-key sk-... 提供 DeepSeek API key"
[ "$MODE" = "ghcr" ] && [ -z "$GH_TOKEN" ] && fail "ghcr 模式需要 --gh-token <PAT>"
[ "$EUID" -eq 0 ] && warn "你正在用 root 跑（OK，但建议给一个非 root 用户加 docker 组）"

# ── 自动探测公网 IP ────────────────────────────────────────────────
if [ -z "$PUBLIC_IP" ]; then
  step "探测 ECS 公网 IP"
  PUBLIC_IP=$(curl -fsSL --max-time 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null \
            || curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null \
            || echo "")
  if [ -z "$PUBLIC_IP" ]; then
    warn "未能自动探测；后续 URL 显示为 <YOUR_IP>。可加 --ip <公网IP> 重跑。"
    PUBLIC_IP="<YOUR_IP>"
  else
    ok "公网 IP = $PUBLIC_IP"
  fi
fi

# ── 安装 Docker（如缺）─────────────────────────────────────────────
if [ "$SKIP_DEPS" != "true" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    step "安装 Docker（走阿里云源）"
    if [ -f /etc/debian_version ]; then
      sudo apt-get update -y
      sudo apt-get install -y ca-certificates curl gnupg
      sudo install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
      OS_ID=$(. /etc/os-release && echo "$ID")
      OS_CN=$(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}")
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/${OS_ID} ${OS_CN} stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
      sudo apt-get update -y
      sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    elif [ -f /etc/redhat-release ]; then
      sudo yum install -y yum-utils
      sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
      sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
      fail "不支持的发行版，请手动装 Docker"
    fi
    sudo systemctl enable --now docker
    ok "Docker 安装完成"
  else
    ok "Docker 已存在：$(docker --version)"
  fi

  # 配阿里云 daemon mirror（更快拉 image）
  if [ ! -f /etc/docker/daemon.json ]; then
    step "配置 Docker 镜像加速"
    sudo mkdir -p /etc/docker
    sudo tee /etc/docker/daemon.json >/dev/null <<EOF
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://docker.m.daocloud.io"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
    sudo systemctl restart docker
    ok "镜像加速已开"
  fi
fi

docker version >/dev/null || fail "Docker 不可用"

# ── 内存检测 + worker 决策 ─────────────────────────────────────────
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
ENABLE_WORKER="true"
if [ "$MEM_MB" -lt 3000 ]; then
  warn "内存仅 ${MEM_MB}MB（< 3GB），自动化 worker 不会启动。需 ≥4GB 跑 xhs-mcp 容器。"
  ENABLE_WORKER="false"
else
  ok "内存 ${MEM_MB}MB，可跑 xhs-mcp worker"
fi

# ── 拉/同步源码 ────────────────────────────────────────────────────
step "准备源码 → $WORK_DIR"
if [ -d "$WORK_DIR/.git" ]; then
  ok "目录存在，git pull"
  (cd "$WORK_DIR" && git pull --ff-only origin main)
else
  git clone --depth 1 "$REPO_URL" "$WORK_DIR"
fi
cd "$WORK_DIR"

# ── 写 .env ────────────────────────────────────────────────────────
step "生成 deploy/.env"
JWT_RANDOM=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid)
PG_RANDOM=$(openssl rand -hex 12 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d -)
cat > deploy/.env <<EOF
# Generated by aliyun-deploy.sh on $(date -u '+%Y-%m-%d %H:%M:%S')
DEEPSEEK_API_KEY=${DEEPSEEK_KEY}
DEEPSEEK_BASE_URL=https://api.deepseek.com/anthropic
DEEPSEEK_MODEL=${DEEPSEEK_MODEL}
JWT_SECRET=${JWT_RANDOM}
PG_PASSWORD=${PG_RANDOM}
WX_APPID=
WX_SECRET=
PUBLIC_API_BASE=http://${PUBLIC_IP}:3000
GH_OWNER=${GH_OWNER}
IMAGE_TAG=latest
WORKER_HOST=127.0.0.1
XHS_MCP_IMAGE=xpzouying/xiaohongshu-mcp:latest
EOF
chmod 600 deploy/.env
ok ".env 已写，JWT/PG 密码已随机生成"

# ── 启动方式：build vs ghcr ────────────────────────────────────────
if [ "$MODE" = "ghcr" ]; then
  step "登录 GHCR"
  echo "$GH_TOKEN" | docker login ghcr.io -u "$GH_OWNER" --password-stdin
  ok "GHCR 已登录"
  step "拉镜像"
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env pull postgres redis server web
else
  step "本机构建镜像（首次约 3~5 分钟）"
  cat > deploy/docker-compose.build.yml <<'EOF'
# 本机构建版 — 在 docker-compose.prod.yml 之上覆盖 server/web 的 image
services:
  server:
    build:
      context: ../apps/server
    image: redmatrix-server-local:latest
  web:
    build:
      context: ../apps/web
    image: redmatrix-web-local:latest
EOF
  cd deploy
  docker compose -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env build server web
  ok "构建完成"
  cd ..
fi

# ── 启动 ─────────────────────────────────────────────────────────
step "启动整套（postgres + redis + server + web）"
cd deploy
COMPOSE_FILES="-f docker-compose.prod.yml"
[ "$MODE" = "build" ] && COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.build.yml"
docker compose $COMPOSE_FILES --env-file .env up -d
cd ..

# ── 拉 xhs-mcp 镜像（如有自动化需求）───────────────────────────────
if [ "$ENABLE_WORKER" = "true" ]; then
  step "预拉 xhs-mcp worker 镜像"
  docker pull xpzouying/xiaohongshu-mcp:latest || warn "xhs-mcp 镜像拉取失败，绑定账号时会自动重试"
fi

# ── 等健康检查 ─────────────────────────────────────────────────────
step "等待 server :3000 健康"
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then
    ok "server ready"
    break
  fi
  sleep 1
done

step "等待 web :3001 渲染"
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3001/login >/dev/null 2>&1; then
    ok "web ready"
    break
  fi
  sleep 1
done

# ── 阿里云安全组提醒 ───────────────────────────────────────────────
echo
echo "${YELLOW}════════════════════════════════════════════════════════════════${RESET}"
echo "${YELLOW}  阿里云安全组需要开放：${RESET}"
echo "${YELLOW}     · 3000/tcp  (NestJS API)${RESET}"
echo "${YELLOW}     · 3001/tcp  (Next.js Web)${RESET}"
echo "${YELLOW}  控制台：https://swas.console.aliyun.com/${RESET}"
echo "${YELLOW}     ECS 控制台 → 实例 → 防火墙 → 添加规则${RESET}"
echo "${YELLOW}════════════════════════════════════════════════════════════════${RESET}"
echo

# ── 最终 URL ───────────────────────────────────────────────────────
echo "${GREEN}════════════════════════════════════════════════════════════════${RESET}"
echo "${GREEN}  🚀 RedMatrix 部署完成！${RESET}"
echo
echo "  登录页：  http://${PUBLIC_IP}:3001/login"
echo "  健康检查：http://${PUBLIC_IP}:3000/api/v1/health"
echo "  Dev 登录：填任意标识（如 alice）即可"
echo
echo "  日志命令："
echo "    docker compose -f $WORK_DIR/deploy/docker-compose.prod.yml --env-file $WORK_DIR/deploy/.env logs -f server"
echo "    docker compose -f $WORK_DIR/deploy/docker-compose.prod.yml --env-file $WORK_DIR/deploy/.env logs -f web"
echo
echo "  更新版本（拉最新代码 + 重新构建）："
echo "    cd $WORK_DIR && git pull && bash deploy/aliyun-deploy.sh --deepseek-key $DEEPSEEK_KEY --skip-deps"
echo
echo "  停止所有服务："
echo "    cd $WORK_DIR/deploy && docker compose -f docker-compose.prod.yml --env-file .env down"
echo "${GREEN}════════════════════════════════════════════════════════════════${RESET}"
