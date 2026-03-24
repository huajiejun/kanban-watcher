#!/bin/bash
# 构建 macOS .app 应用程序包

set -e

APP_NAME="KanbanWatcher"
VERSION="1.0.0"
BUNDLE_ID="com.huajiejun.kanban-watcher"

# 目录设置
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/release"
APP_DIR="${DIST_DIR}/${APP_NAME}.app"

echo "🔨 构建 Go 二进制文件..."
CGO_ENABLED=1 go build -o "${SCRIPT_DIR}/kanban-watcher" ./cmd/kanban-watcher

echo "📦 创建 .app 目录结构..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# 复制可执行文件
cp "${SCRIPT_DIR}/kanban-watcher" "${APP_DIR}/Contents/MacOS/"

# 创建 Info.plist
cat > "${APP_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>zh_CN</string>
    <key>CFBundleExecutable</key>
    <string>kanban-watcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>Kanban Watcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2024 huajiejun. All rights reserved.</string>
</dict>
</plist>
EOF

# 生成图标
ICON_SOURCE="${SCRIPT_DIR}/assets/app-icon.png"
if [ ! -f "${ICON_SOURCE}" ]; then
    ICON_SOURCE="${SCRIPT_DIR}/assets/icon_normal.png"
fi

if command -v sips &> /dev/null && [ -f "${ICON_SOURCE}" ]; then
    echo "🎨 生成应用图标..."

    # 创建临时目录
    ICONSET_DIR="${DIST_DIR}/AppIcon.iconset"
    mkdir -p "${ICONSET_DIR}"

    # 生成不同尺寸的图标
    for size in 16 32 64 128 256 512; do
        sips -z $size $size "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_${size}x${size}.png" 2>/dev/null || true
    done

    # 生成 @2x 图标
    for size in 16 32 64 128 256; do
        sips -z $((size*2)) $((size*2)) "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_${size}x${size}@2x.png" 2>/dev/null || true
    done

    # 转换为 icns
    if command -v iconutil &> /dev/null; then
        iconutil -c icns "${ICONSET_DIR}" -o "${APP_DIR}/Contents/Resources/AppIcon.icns" 2>/dev/null || echo "⚠️  图标生成失败，继续..."
    fi

    rm -rf "${ICONSET_DIR}"
fi

# 设置权限
chmod +x "${APP_DIR}/Contents/MacOS/kanban-watcher"

echo "✅ 构建完成！"
echo "📍 应用位置: ${APP_DIR}"
echo ""
echo "💡 使用方法："
echo "   - 双击 ${APP_DIR} 运行应用"
echo "   - 或拖拽到 /Applications 目录安装"
