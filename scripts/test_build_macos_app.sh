#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR="$ROOT_DIR/dist-macos/Kanban Watcher.app"
EXECUTABLE="$APP_DIR/Contents/MacOS/Kanban Watcher"
INFO_PLIST="$APP_DIR/Contents/Info.plist"

"$ROOT_DIR/scripts/build_macos_app.sh"

[[ -d "$APP_DIR" ]] || {
  echo "缺少 app bundle: $APP_DIR" >&2
  exit 1
}

[[ -x "$EXECUTABLE" ]] || {
  echo "缺少可执行文件: $EXECUTABLE" >&2
  exit 1
}

[[ -f "$INFO_PLIST" ]] || {
  echo "缺少 Info.plist: $INFO_PLIST" >&2
  exit 1
}

grep -q "<string>com.huajiejun.kanban-watcher</string>" "$INFO_PLIST" || {
  echo "Info.plist 缺少 bundle id" >&2
  exit 1
}

file "$EXECUTABLE" | grep -Eq "Mach-O|executable" || {
  echo "产物不是有效的 macOS 可执行文件" >&2
  exit 1
}

echo "macOS app bundle 验证通过"
