#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
WORKTREE_ID="bf66"
OUTPUT_FILE="$TMP_DIR/status_output.txt"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p /tmp/kanban-dev
cat > "/tmp/kanban-dev/workspace-$WORKTREE_ID.env" <<'EOF'
FRONTEND_PORT=6023
BACKEND_PORT=16023
EOF

cd "$ROOT_DIR"

bash ./scripts/start-dev.sh status "$WORKTREE_ID" >"$OUTPUT_FILE" 2>&1 || true

if ! grep -q "运行角色: worker" "$OUTPUT_FILE"; then
  echo "FAIL: status 输出未显示 worker 角色"
  exit 1
fi

if ! grep -q "WebSocket 主后端: http://127.0.0.1:7778" "$OUTPUT_FILE"; then
  echo "FAIL: status 输出未显示 websocket 主后端地址"
  exit 1
fi

echo "PASS: status 命令会显示运行角色与 websocket 主后端"
