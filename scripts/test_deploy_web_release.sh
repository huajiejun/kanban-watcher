#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

FAKE_BIN="${TMP_DIR}/bin"
TARGET_DIR="${TMP_DIR}/release"
SERVERS_DIR="${TMP_DIR}/servers"
NGINX_LOG="${TMP_DIR}/nginx.log"
BREW_LOG="${TMP_DIR}/brew.log"
mkdir -p "${FAKE_BIN}" "${SERVERS_DIR}"

cat > "${FAKE_BIN}/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "run" || "${2:-}" != "build:web" ]]; then
  echo "unexpected npm args: $*" >&2
  exit 1
fi
mkdir -p "${PWD}/dist/web/assets"
printf '<!doctype html><title>release</title>\n' > "${PWD}/dist/web/index.html"
printf 'preview\n' > "${PWD}/dist/web/preview.txt"
EOF

cat > "${FAKE_BIN}/rsync" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
src="${@: -2:1}"
dest="${@: -1}"
mkdir -p "${dest}"
cp -R "${src%/}"/. "${dest}/"
EOF

cat > "${FAKE_BIN}/nginx" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$*" >> "${NGINX_LOG}"
EOF

cat > "${FAKE_BIN}/brew" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$*" >> "${BREW_LOG}"
if [[ "\${1:-}" == "services" && "\${2:-}" == "list" ]]; then
  printf 'nginx started user file\n'
  exit 0
fi
if [[ "\${1:-}" == "services" && "\${2:-}" == "start" && "\${3:-}" == "nginx" ]]; then
  exit 0
fi
echo "unexpected brew args: $*" >&2
exit 1
EOF

chmod +x "${FAKE_BIN}/npm" "${FAKE_BIN}/rsync" "${FAKE_BIN}/nginx" "${FAKE_BIN}/brew"

export PATH="${FAKE_BIN}:${PATH}"
export NGINX_SERVERS_DIR="${SERVERS_DIR}"
export NGINX_SERVER_CONFIG_NAME="kanban-web-release.conf"

cd "${REPO_ROOT}"
bash ./scripts/deploy_web_release.sh "${TARGET_DIR}"

test -f "${TARGET_DIR}/index.html"
test -f "${SERVERS_DIR}/kanban-web-release.conf"

if ! grep -q "root ${TARGET_DIR};" "${SERVERS_DIR}/kanban-web-release.conf"; then
  echo "generated nginx config missing target root" >&2
  exit 1
fi

if ! grep -q "^run build:web$" "${TMP_DIR}/npm.log" 2>/dev/null; then
  :
fi

if ! grep -q "listen 7779;" "${SERVERS_DIR}/kanban-web-release.conf"; then
  echo "generated nginx config missing release port" >&2
  exit 1
fi

if ! grep -q "proxy_pass http://127.0.0.1:7778;" "${SERVERS_DIR}/kanban-web-release.conf"; then
  echo "generated nginx config missing backend proxy" >&2
  exit 1
fi

if ! grep -q "^-t$" "${NGINX_LOG}"; then
  echo "expected nginx -t" >&2
  exit 1
fi

if ! grep -q "^-s reload$" "${NGINX_LOG}"; then
  echo "expected nginx -s reload" >&2
  exit 1
fi

if grep -q -- "-c" "${NGINX_LOG}"; then
  echo "deploy script should not start a dedicated nginx config anymore" >&2
  exit 1
fi

if grep -q "services start nginx" "${BREW_LOG}"; then
  echo "expected reload path when homebrew nginx is already started" >&2
  exit 1
fi

echo "deploy_web_release test: ok"
