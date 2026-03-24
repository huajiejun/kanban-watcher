#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="Kanban Watcher"
APP_DIR="$ROOT_DIR/dist-macos/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
EXECUTABLE="$MACOS_DIR/$APP_NAME"
ICON_SOURCE="$ROOT_DIR/build/macos/AppIcon.png"
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/kanban-watcher-app.XXXXXX")
ICONSET_DIR="$TEMP_DIR/AppIcon.iconset"

cleanup() {
  rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cp "$ROOT_DIR/build/macos/Info.plist" "$CONTENTS_DIR/Info.plist"

[[ -f "$ICON_SOURCE" ]] || {
  echo "缺少图标源文件: $ICON_SOURCE" >&2
  exit 1
}

mkdir -p "$ICONSET_DIR"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  doubled_size=$((size * 2))
  sips -z "$doubled_size" "$doubled_size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

CGO_ENABLED=1 go build -o "$EXECUTABLE" ./cmd/kanban-watcher
chmod +x "$EXECUTABLE"

if [[ -f "$ROOT_DIR/config.yaml.example" ]]; then
  cp "$ROOT_DIR/config.yaml.example" "$RESOURCES_DIR/config.yaml.example"
fi

echo "已生成: $APP_DIR"
