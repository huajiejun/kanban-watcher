#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
TAIL_ARGS_FILE="$TMP_DIR/tail-args.log"
WORKTREE_ID="logs-check"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/tail" <<'EOF'
#!/bin/bash
printf '%s\n' "$@" > "$TAIL_ARGS_FILE"
EOF
chmod +x "$TMP_DIR/bin/tail"

cd "$ROOT_DIR"
TAIL_ARGS_FILE="$TAIL_ARGS_FILE" PATH="$TMP_DIR/bin:$PATH" bash ./scripts/start-dev.sh logs "$WORKTREE_ID" >/dev/null 2>&1 || true

if [ ! -f "$TAIL_ARGS_FILE" ]; then
  echo "FAIL: logs 命令没有调用 tail -F"
  exit 1
fi

BACKEND_PORT=$((18000 + ($(echo -n "$WORKTREE_ID" | cksum | cut -d' ' -f1) % 1000)))
FRONTEND_PORT=$((BACKEND_PORT - 2000))

EXPECTED_BACKEND_LOG="/tmp/kanban-backend-$BACKEND_PORT.log"
EXPECTED_FRONTEND_LOG="/tmp/kanban-frontend-$FRONTEND_PORT.log"

if ! grep -qx -- "-F" "$TAIL_ARGS_FILE"; then
  echo "FAIL: logs 命令没有使用 tail -F"
  exit 1
fi

if ! grep -qx -- "$EXPECTED_BACKEND_LOG" "$TAIL_ARGS_FILE"; then
  echo "FAIL: logs 命令没有跟随后端日志"
  exit 1
fi

if ! grep -qx -- "$EXPECTED_FRONTEND_LOG" "$TAIL_ARGS_FILE"; then
  echo "FAIL: logs 命令没有跟随前端日志"
  exit 1
fi

echo "PASS: logs 命令会持续跟随后端和前端日志"
