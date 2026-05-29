#!/usr/bin/env bash
# Quick test: pull image, start a worker, hit /health, fetch QR.
# Use this on your server to verify the xhs-mcp image works before integrating.
set -e

ACCOUNT_ID="${1:-test}"
PORT="${2:-18001}"
PROXY="${3:-}"

NAME="xhs-mcp-acc-${ACCOUNT_ID}"

echo "→ pulling image"
docker pull xpzouying/xiaohongshu-mcp:latest

echo "→ removing existing container if any"
docker rm -f "$NAME" 2>/dev/null || true

echo "→ starting worker on port ${PORT}"
docker run -d \
  --name "$NAME" \
  -p "${PORT}:18060" \
  -v "xhs-cookies-${ACCOUNT_ID}:/app/cookies" \
  -v "xhs-assets-${ACCOUNT_ID}:/app/assets" \
  -e "XHS_PORT=18060" \
  ${PROXY:+-e "XHS_PROXY=${PROXY}"} \
  --label "redmatrix.role=xhs-mcp-worker" \
  --label "redmatrix.account_id=${ACCOUNT_ID}" \
  --memory=800m \
  --restart=unless-stopped \
  xpzouying/xiaohongshu-mcp:latest

echo "→ waiting for healthy"
for i in $(seq 1 30); do
  if curl -sSf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "  ✓ healthy"
    break
  fi
  sleep 1
done

echo
echo "→ login status:"
curl -sS "http://127.0.0.1:${PORT}/api/v1/login/status"
echo
echo

echo "→ fetch QR (run, then scan from XHS App):"
curl -sS "http://127.0.0.1:${PORT}/api/v1/login/qrcode" | python3 -m json.tool || true

echo
echo "After scan, run:"
echo "  curl http://127.0.0.1:${PORT}/api/v1/login/status"
echo
echo "Tear down:"
echo "  docker rm -f $NAME"
echo "  docker volume rm xhs-cookies-${ACCOUNT_ID} xhs-assets-${ACCOUNT_ID}"
