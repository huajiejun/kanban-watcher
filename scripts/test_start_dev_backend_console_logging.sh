#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
STDOUT_FILE="$TMP_DIR/stdout.log"
STDERR_FILE="$TMP_DIR/stderr.log"
FAKE_GO_PID_FILE="$TMP_DIR/fake-go.pid"
FAKE_NPX_PID_FILE="$TMP_DIR/fake-npx.pid"
WORKTREE_ID="stderr-check"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/go" <<'EOF'
#!/bin/bash
echo "$$" > "$FAKE_GO_PID_FILE"
echo "模拟后端报错" >&2
sleep 6
EOF
chmod +x "$TMP_DIR/bin/go"

cat > "$TMP_DIR/bin/npx" <<'EOF'
#!/bin/bash
echo "$$" > "$FAKE_NPX_PID_FILE"
sleep 6
EOF
chmod +x "$TMP_DIR/bin/npx"

cat > "$TMP_DIR/bin/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$TMP_DIR/bin/lsof"

cd "$ROOT_DIR"
START_TIME=$(date +%s)
FAKE_GO_PID_FILE="$FAKE_GO_PID_FILE" FAKE_NPX_PID_FILE="$FAKE_NPX_PID_FILE" PATH="$TMP_DIR/bin:$PATH" bash ./scripts/start-dev.sh start "$WORKTREE_ID" >"$STDOUT_FILE" 2>"$STDERR_FILE"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if ! grep -q "模拟后端报错" "$STDERR_FILE"; then
  echo "FAIL: 当前控制台没有收到后端 stderr"
  exit 1
fi

BACKEND_PORT="$(awk -F': ' '/后端端口/ { print $2; exit }' "$STDOUT_FILE")"
BACKEND_LOG_FILE="/tmp/kanban-backend-$BACKEND_PORT.log"
BACKEND_PID_FILE="/tmp/kanban-dev/backend-$BACKEND_PORT.pid"
FRONTEND_PORT="$(awk -F': ' '/前端端口/ { print $2; exit }' "$STDOUT_FILE")"
FRONTEND_PID_FILE="/tmp/kanban-dev/frontend-$FRONTEND_PORT.pid"

if [ -z "$BACKEND_PORT" ] || [ ! -f "$BACKEND_LOG_FILE" ]; then
  echo "FAIL: 未找到后端日志文件"
  exit 1
fi

if ! grep -q "模拟后端报错" "$BACKEND_LOG_FILE"; then
  echo "FAIL: 后端日志文件未保留 stderr"
  exit 1
fi

if [ ! -f "$FAKE_GO_PID_FILE" ] || [ ! -f "$BACKEND_PID_FILE" ]; then
  echo "FAIL: 未找到后端 PID 记录"
  exit 1
fi

if [ "$(cat "$FAKE_GO_PID_FILE")" != "$(cat "$BACKEND_PID_FILE")" ]; then
  echo "FAIL: 脚本记录的后端 PID 不是实际后端进程"
  exit 1
fi

if [ ! -f "$FAKE_NPX_PID_FILE" ] || [ ! -f "$FRONTEND_PID_FILE" ]; then
  echo "FAIL: 未找到前端 PID 记录"
  exit 1
fi

if [ "$(cat "$FAKE_NPX_PID_FILE")" != "$(cat "$FRONTEND_PID_FILE")" ]; then
  echo "FAIL: 脚本记录的前端 PID 不是实际前端进程"
  exit 1
fi

if [ "$DURATION" -ge 5 ]; then
  echo "FAIL: 启动脚本被前端或后端前台阻塞，没有快速返回"
  exit 1
fi

echo "PASS: 前后端已后台启动，脚本快速返回，后端 stderr 已同步打印到控制台并写入日志"
