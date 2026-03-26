#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
TAIL_ARGS_FILE="$TMP_DIR/tail-args.log"
LOOKUP_ARGS_FILE="$TMP_DIR/lookup-args.log"
WORKTREE_ID="logs-db"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/go" <<'EOF'
#!/bin/bash
if [ "${1:-}" = "run" ] && [ "${2:-}" = "./cmd/kw_frontend_port" ] && [ "${3:-}" = "lookup" ]; then
  echo "$*" > "$LOOKUP_ARGS_FILE"
  cat <<'JSON'
{"frontend_port":6028,"backend_port":16028}
JSON
  exit 0
fi

echo "unexpected go invocation: $*" >&2
exit 1
EOF
chmod +x "$TMP_DIR/bin/go"

cat > "$TMP_DIR/bin/tail" <<'EOF'
#!/bin/bash
printf '%s\n' "$@" > "$TAIL_ARGS_FILE"
EOF
chmod +x "$TMP_DIR/bin/tail"

cd "$ROOT_DIR"
rm -f "/tmp/kanban-dev/workspace-$WORKTREE_ID.env"
LOOKUP_ARGS_FILE="$LOOKUP_ARGS_FILE" TAIL_ARGS_FILE="$TAIL_ARGS_FILE" PATH="$TMP_DIR/bin:$PATH" bash ./scripts/start-dev.sh logs "$WORKTREE_ID" >/dev/null 2>&1 || true

if [ ! -f "$LOOKUP_ARGS_FILE" ]; then
  echo "FAIL: logs 命令在没有本地缓存时未查询数据库中的端口映射"
  exit 1
fi

if ! grep -q "./cmd/kw_frontend_port lookup --workspace $WORKTREE_ID" "$LOOKUP_ARGS_FILE"; then
  echo "FAIL: logs 命令查询数据库端口映射时参数不正确"
  exit 1
fi

if [ ! -f "$TAIL_ARGS_FILE" ]; then
  echo "FAIL: logs 命令没有调用 tail -F"
  exit 1
fi

if ! grep -qx -- "/tmp/kanban-backend-16028.log" "$TAIL_ARGS_FILE"; then
  echo "FAIL: logs 命令没有跟随后端数据库映射日志"
  exit 1
fi

if ! grep -qx -- "/tmp/kanban-frontend-6028.log" "$TAIL_ARGS_FILE"; then
  echo "FAIL: logs 命令没有跟随前端数据库映射日志"
  exit 1
fi

echo "PASS: logs 命令在没有缓存时会优先使用数据库中的端口映射"
