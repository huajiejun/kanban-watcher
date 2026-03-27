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
cat <<'JSON'
{"success":true,"data":{"workspace_id":"cfg1","frontend_port":6021,"backend_port":16021}}
JSON
EOF

cat > "$FAKE_BIN/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF

cat > "$FAKE_BIN/go" <<'EOF'
#!/bin/bash
sleep 5
EOF

cat > "$FAKE_BIN/npx" <<'EOF'
#!/bin/bash
sleep 5
EOF

chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/lsof" "$FAKE_BIN/go" "$FAKE_BIN/npx"

CONFIG_HOME_DIR="$TMP_DIR/home"
mkdir -p "$CONFIG_HOME_DIR/.config/kanban-watcher"
cat > "$CONFIG_HOME_DIR/.config/kanban-watcher/config.yaml" <<'EOF'
http_api:
  port: 7778
  api_key: "quoted-key"
EOF

export PATH="$FAKE_BIN:$PATH"
export TEST_CURL_ARGS_FILE="$TMP_DIR/curl_args.txt"

cd "$ROOT_DIR"

HOME="$CONFIG_HOME_DIR" bash ./scripts/start-dev.sh start cfg1 >/dev/null 2>&1 &
script_pid=$!
sleep 3
wait $script_pid || true

if ! grep -q "api/workspace/cfg1/frontend-port?api_key=quoted-key" "$TEST_CURL_ARGS_FILE"; then
  echo "FAIL: 从配置文件读取的 api_key 没有正确去掉 YAML 引号"
  exit 1
fi

if grep -q 'api_key="quoted-key"' "$TEST_CURL_ARGS_FILE"; then
  echo "FAIL: 请求 URL 仍然携带带引号的 api_key"
  exit 1
fi

echo "PASS: 启动脚本从配置文件读取 api_key 时会去掉 YAML 引号"
