# mac应用打包-测试概述

## 测试日期

2026-03-24

## 测试目标

验证 `kanban-watcher` 能通过脚本打包为可执行的 macOS `.app`。

## 执行命令

```bash
chmod +x scripts/build_macos_app.sh scripts/test_build_macos_app.sh
zsh scripts/test_build_macos_app.sh
```

## 测试结果

- 成功生成 `dist-macos/Kanban Watcher.app`
- `Contents/Info.plist` 存在
- `Contents/MacOS/Kanban Watcher` 存在且可执行
- `Contents/Resources/AppIcon.icns` 存在
- `file` 校验通过，产物为 macOS 可执行文件

## 备注

- 构建过程中出现一次 `ld` warning，但未影响产物生成和结构校验
- 当前版本使用 `build/macos/AppIcon.svg` 生成 Finder 图标
- 本次为脚本与产物结构验证，未生成截图
