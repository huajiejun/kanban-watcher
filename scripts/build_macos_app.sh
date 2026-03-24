#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="Kanban Watcher"
APP_DIR="$ROOT_DIR/dist-macos/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
EXECUTABLE="$MACOS_DIR/$APP_NAME"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cp "$ROOT_DIR/build/macos/Info.plist" "$CONTENTS_DIR/Info.plist"

CGO_ENABLED=1 go build -o "$EXECUTABLE" ./cmd/kanban-watcher
chmod +x "$EXECUTABLE"

if [[ -f "$ROOT_DIR/config.yaml.example" ]]; then
  cp "$ROOT_DIR/config.yaml.example" "$RESOURCES_DIR/config.yaml.example"
fi

echo "已生成: $APP_DIR"
