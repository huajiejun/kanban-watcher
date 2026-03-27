#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat > "$FAKE_BIN/curl" <<'EOF'
#!/bin/bash
echo "$*" > "$TEST_CURL_ARGS_FILE"
exit 7
EOF

cat > "$FAKE_BIN/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF

cat > "$FAKE_BIN/go" <<'EOF'
#!/bin/bash
if [ "${1:-}" = "run" ] && [ "${2:-}" = "./cmd/kw_frontend_port" ]; then
  echo "$*" > "$TEST_FALLBACK_GO_ARGS_FILE"
  cat <<'JSON'
{"frontend_port":6024,"backend_port":16024}
JSON
  exit 0
fi

if [ "${1:-}" = "run" ] && [ "${2:-}" = "./cmd/kanban-watcher" ]; then
  echo "KANBAN_PORT=${KANBAN_PORT:-}" > "$TEST_GO_ENV_FILE"
  sleep 5
  exit 0
fi

echo "unexpected go invocation: $*" >&2
exit 1
EOF

cat > "$FAKE_BIN/npx" <<'EOF'
#!/bin/bash
{
  echo "VITE_BACKEND_PORT=${VITE_BACKEND_PORT:-}"
  echo "ARGS=$*"
} > "$TEST_NPX_ENV_FILE"
sleep 5
EOF

chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/lsof" "$FAKE_BIN/go" "$FAKE_BIN/npx"

export PATH="$FAKE_BIN:$PATH"
export TEST_CURL_ARGS_FILE="$TMP_DIR/curl_args.txt"
export TEST_FALLBACK_GO_ARGS_FILE="$TMP_DIR/fallback_go_args.txt"
export TEST_GO_ENV_FILE="$TMP_DIR/go_env.txt"
export TEST_NPX_ENV_FILE="$TMP_DIR/npx_env.txt"
export KANBAN_API_KEY="test-key"

cd "$ROOT_DIR"

bash ./scripts/start-dev.sh start bf66 >/dev/null 2>&1 &
script_pid=$!
sleep 3
wait $script_pid || true

if ! grep -q "127.0.0.1:7778/api/workspace/bf66/frontend-port?api_key=test-key" "$TEST_CURL_ARGS_FILE"; then
  echo "FAIL: 未先尝试固定管理端口的前端端口接口"
  exit 1
fi

if [ ! -f "$TEST_FALLBACK_GO_ARGS_FILE" ]; then
  echo "FAIL: 管理 API 失败后未调用数据库兜底命令"
  exit 1
fi

if ! grep -q "./cmd/kw_frontend_port reserve --workspace bf66" "$TEST_FALLBACK_GO_ARGS_FILE"; then
  echo "FAIL: 数据库兜底命令参数不正确"
  exit 1
fi

if ! grep -q "KANBAN_PORT=16024" "$TEST_GO_ENV_FILE"; then
  echo "FAIL: 数据库兜底后后端端口未按前端端口+10000 推导"
  exit 1
fi

if ! grep -q "VITE_BACKEND_PORT=16024" "$TEST_NPX_ENV_FILE"; then
  echo "FAIL: 数据库兜底后前端未收到推导后的后端端口"
  exit 1
fi

if ! grep -q -- "--port 6024" "$TEST_NPX_ENV_FILE"; then
  echo "FAIL: 数据库兜底后前端未使用兜底返回的前端端口"
  exit 1
fi

echo "PASS: 管理 API 不可用时，启动脚本会回退到数据库兜底分配前端端口"
