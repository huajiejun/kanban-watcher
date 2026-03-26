#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
ENV_CAPTURE_FILE="$TMP_DIR/frontend-env.log"
WORKTREE_ID="subpath-check"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/go" <<'EOF'
#!/bin/bash
sleep 6
EOF
chmod +x "$TMP_DIR/bin/go"

cat > "$TMP_DIR/bin/npx" <<'EOF'
#!/bin/bash
env | sort > "$ENV_CAPTURE_FILE"
sleep 6
EOF
chmod +x "$TMP_DIR/bin/npx"

cat > "$TMP_DIR/bin/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$TMP_DIR/bin/lsof"

cd "$ROOT_DIR"
ENV_CAPTURE_FILE="$ENV_CAPTURE_FILE" PATH="$TMP_DIR/bin:$PATH" bash ./scripts/start-dev.sh start "$WORKTREE_ID" >/dev/null 2>&1

BACKEND_PORT=$((18000 + ($(echo -n "$WORKTREE_ID" | cksum | cut -d' ' -f1) % 1000)))
FRONTEND_PORT=$((BACKEND_PORT - 2000))

if ! grep -qx "VITE_BACKEND_PORT=$BACKEND_PORT" "$ENV_CAPTURE_FILE"; then
  echo "FAIL: 未注入 VITE_BACKEND_PORT"
  exit 1
fi

if ! grep -qx "VITE_DEV_BASE_PATH=/$FRONTEND_PORT/" "$ENV_CAPTURE_FILE"; then
  echo "FAIL: 未注入 VITE_DEV_BASE_PATH"
  exit 1
fi

if ! grep -qx "VITE_BASE_URL=/$FRONTEND_PORT" "$ENV_CAPTURE_FILE"; then
  echo "FAIL: 未注入 VITE_BASE_URL"
  exit 1
fi

if ! grep -qx "VITE_DEV_HMR_PATH=/$FRONTEND_PORT/__vite_ws" "$ENV_CAPTURE_FILE"; then
  echo "FAIL: 未注入 VITE_DEV_HMR_PATH"
  exit 1
fi

echo "PASS: start-dev.sh 会为子路径访问注入前端环境变量"
