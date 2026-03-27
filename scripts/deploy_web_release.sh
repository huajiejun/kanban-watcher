#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

# 正式发布目录。目录内只放静态产物和运行日志，不再维护独立 nginx.conf。
TARGET_DIR=${1:-"${HOME}/github/kanban-watcher-release"}

# 允许通过环境变量覆盖命令路径，便于测试或在不同机器上复用。
NPM_BIN=${NPM_BIN:-npm}
RSYNC_BIN=${RSYNC_BIN:-rsync}
NGINX_BIN=${NGINX_BIN:-nginx}
BREW_BIN=${BREW_BIN:-brew}

# 统一复用 Homebrew 主 nginx，通过 servers/ 子配置管理正式站点。
NGINX_SERVERS_DIR=${NGINX_SERVERS_DIR:-/opt/homebrew/etc/nginx/servers}
NGINX_SERVER_CONFIG_NAME=${NGINX_SERVER_CONFIG_NAME:-kanban-web-release.conf}
NGINX_SERVER_CONFIG_PATH="${NGINX_SERVERS_DIR}/${NGINX_SERVER_CONFIG_NAME}"
NGINX_TEMPLATE=${NGINX_TEMPLATE:-"${REPO_ROOT}/config/nginx-web-release.conf.template"}

# 正式站点默认监听 7779，并把 API、LLM 请求反代到本机服务。
RELEASE_PORT=${RELEASE_PORT:-7779}
BACKEND_API_URL=${BACKEND_API_URL:-http://127.0.0.1:7778}
LLM_API_URL=${LLM_API_URL:-http://127.0.0.1:1234}

log_info() {
  echo "[deploy] $*"
}

fail() {
  echo "[deploy] $*" >&2
  exit 1
}

require_command() {
  local command_name=$1
  local command_path=$2
  if ! command -v "${command_path}" >/dev/null 2>&1; then
    fail "${command_name} not found: ${command_path}"
  fi
}

render_nginx_server_config() {
  log_info "rendering nginx server config..."
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
}

is_homebrew_nginx_started() {
  command -v "${BREW_BIN}" >/dev/null 2>&1 &&
    "${BREW_BIN}" services list | grep -q '^nginx\s\+started'
}

log_info "repo: ${REPO_ROOT}"
log_info "target: ${TARGET_DIR}"
log_info "nginx server config: ${NGINX_SERVER_CONFIG_PATH}"

cd "${REPO_ROOT}"

log_info "building web bundle..."
"${NPM_BIN}" run build:web

mkdir -p "${TARGET_DIR}"

log_info "syncing dist/web -> ${TARGET_DIR}"
"${RSYNC_BIN}" -a dist/web/ "${TARGET_DIR}/"

require_command "nginx" "${NGINX_BIN}"
if [[ ! -d "${NGINX_SERVERS_DIR}" ]]; then
  fail "nginx servers dir not found: ${NGINX_SERVERS_DIR}"
fi

if [[ ! -f "${NGINX_TEMPLATE}" ]]; then
  fail "nginx template not found: ${NGINX_TEMPLATE}"
fi

render_nginx_server_config

log_info "validating nginx config..."
"${NGINX_BIN}" -t

if is_homebrew_nginx_started; then
  log_info "reloading homebrew nginx..."
  "${NGINX_BIN}" -s reload
else
  log_info "starting homebrew nginx..."
  "${BREW_BIN}" services start nginx
fi

log_info "done"
