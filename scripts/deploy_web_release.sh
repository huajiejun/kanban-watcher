#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

TARGET_DIR=${1:-"${HOME}/github/kanban-watcher-release"}
NPM_BIN=${NPM_BIN:-npm}
RSYNC_BIN=${RSYNC_BIN:-rsync}
NGINX_BIN=${NGINX_BIN:-nginx}
BREW_BIN=${BREW_BIN:-brew}
NGINX_SERVERS_DIR=${NGINX_SERVERS_DIR:-/opt/homebrew/etc/nginx/servers}
NGINX_SERVER_CONFIG_NAME=${NGINX_SERVER_CONFIG_NAME:-kanban-web-release.conf}
NGINX_SERVER_CONFIG_PATH="${NGINX_SERVERS_DIR}/${NGINX_SERVER_CONFIG_NAME}"
NGINX_TEMPLATE=${NGINX_TEMPLATE:-"${REPO_ROOT}/config/nginx-web-release.conf.template"}
RELEASE_PORT=${RELEASE_PORT:-7779}
BACKEND_API_URL=${BACKEND_API_URL:-http://127.0.0.1:7778}
LLM_API_URL=${LLM_API_URL:-http://127.0.0.1:1234}

echo "[deploy] repo: ${REPO_ROOT}"
echo "[deploy] target: ${TARGET_DIR}"
echo "[deploy] nginx server config: ${NGINX_SERVER_CONFIG_PATH}"

cd "${REPO_ROOT}"

echo "[deploy] building web bundle..."
"${NPM_BIN}" run build:web

mkdir -p "${TARGET_DIR}"

echo "[deploy] syncing dist/web -> ${TARGET_DIR}"
"${RSYNC_BIN}" -a dist/web/ "${TARGET_DIR}/"

if ! command -v "${NGINX_BIN}" >/dev/null 2>&1; then
  echo "[deploy] nginx not found: ${NGINX_BIN}" >&2
  exit 1
fi

if [[ ! -d "${NGINX_SERVERS_DIR}" ]]; then
  echo "[deploy] nginx servers dir not found: ${NGINX_SERVERS_DIR}" >&2
  exit 1
fi

if [[ ! -f "${NGINX_TEMPLATE}" ]]; then
  echo "[deploy] nginx template not found: ${NGINX_TEMPLATE}" >&2
  exit 1
fi

echo "[deploy] rendering nginx server config..."
export TARGET_DIR RELEASE_PORT BACKEND_API_URL LLM_API_URL
perl -0pe '
  BEGIN {
    $target_dir = $ENV{TARGET_DIR};
    $release_port = $ENV{RELEASE_PORT};
    $backend_api_url = $ENV{BACKEND_API_URL};
    $llm_api_url = $ENV{LLM_API_URL};

    for ($target_dir, $release_port, $backend_api_url, $llm_api_url) {
      s/\\/\\\\/g;
      s/&/\\&/g;
    }
  }
  s#__TARGET_DIR__#$target_dir#g;
  s#__RELEASE_PORT__#$release_port#g;
  s#__BACKEND_API_URL__#$backend_api_url#g;
  s#__LLM_API_URL__#$llm_api_url#g;
' "${NGINX_TEMPLATE}" > "${NGINX_SERVER_CONFIG_PATH}"

echo "[deploy] validating nginx config..."
"${NGINX_BIN}" -t

if command -v "${BREW_BIN}" >/dev/null 2>&1 && "${BREW_BIN}" services list | grep -q '^nginx\s\+started'; then
  echo "[deploy] reloading homebrew nginx..."
  "${NGINX_BIN}" -s reload
else
  echo "[deploy] starting homebrew nginx..."
  "${BREW_BIN}" services start nginx
fi

echo "[deploy] done"
