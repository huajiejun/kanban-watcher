#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
STDOUT_FILE="$TMP_DIR/stdout.log"
STDERR_FILE="$TMP_DIR/stderr.log"
WORKTREE_ID="stderr-check"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/go" <<'EOF'
#!/bin/bash
echo "模拟后端报错" >&2
sleep 3
EOF
chmod +x "$TMP_DIR/bin/go"

cat > "$TMP_DIR/bin/npx" <<'EOF'
#!/bin/bash
sleep 3
EOF
chmod +x "$TMP_DIR/bin/npx"

cat > "$TMP_DIR/bin/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$TMP_DIR/bin/lsof"

cd "$ROOT_DIR"
PATH="$TMP_DIR/bin:$PATH" bash ./scripts/start-dev.sh start "$WORKTREE_ID" >"$STDOUT_FILE" 2>"$STDERR_FILE"

if ! grep -q "模拟后端报错" "$STDERR_FILE"; then
  echo "FAIL: 当前控制台没有收到后端 stderr"
  exit 1
fi

BACKEND_PORT="$(awk -F': ' '/后端端口/ { print $2; exit }' "$STDOUT_FILE")"
BACKEND_LOG_FILE="/tmp/kanban-backend-$BACKEND_PORT.log"

if [ -z "$BACKEND_PORT" ] || [ ! -f "$BACKEND_LOG_FILE" ]; then
  echo "FAIL: 未找到后端日志文件"
  exit 1
fi

if ! grep -q "模拟后端报错" "$BACKEND_LOG_FILE"; then
  echo "FAIL: 后端日志文件未保留 stderr"
  exit 1
fi

echo "PASS: 后端 stderr 已同步打印到控制台并写入日志"
