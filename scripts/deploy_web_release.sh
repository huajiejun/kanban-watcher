#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

TARGET_DIR=${1:-"${HOME}/github/knban-watcher-release"}
NGINX_CONFIG="${TARGET_DIR}/nginx.conf"

echo "[deploy] repo: ${REPO_ROOT}"
echo "[deploy] target: ${TARGET_DIR}"

cd "${REPO_ROOT}"

echo "[deploy] building web bundle..."
npm run build:web

mkdir -p "${TARGET_DIR}"

echo "[deploy] syncing dist/web -> ${TARGET_DIR}"
rsync -a dist/web/ "${TARGET_DIR}/"

if ! command -v nginx >/dev/null 2>&1; then
  echo "[deploy] nginx not found in PATH" >&2
  exit 1
fi

if [[ ! -f "${NGINX_CONFIG}" ]]; then
  echo "[deploy] nginx config not found: ${NGINX_CONFIG}" >&2
  exit 1
fi

if pgrep -f "nginx: master process nginx -c ${NGINX_CONFIG}" >/dev/null 2>&1; then
  echo "[deploy] reloading nginx..."
  nginx -s reload -c "${NGINX_CONFIG}"
else
  echo "[deploy] starting nginx..."
  nginx -c "${NGINX_CONFIG}"
fi

echo "[deploy] done"
