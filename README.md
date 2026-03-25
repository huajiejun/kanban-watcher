# Kanban Watcher Card

Lit-based Home Assistant custom card. Current version supports two data modes:

- API mode: recommended. The card reads workspaces and conversation history from `kanban-watcher` HTTP API.
- Hass fallback mode: keeps the old preview / sensor-attribute path for local preview and compatibility.

This repository is currently set up for manual Home Assistant deployment rather than npm package distribution.

## Build

```bash
npm install
npm run build
```

The production bundle is written to `dist/kanban-watcher-card.js`.

## Build macOS App

`kanban-watcher` 的托盘程序可以直接打包为 macOS `.app`：

```bash
chmod +x scripts/build_macos_app.sh
zsh scripts/build_macos_app.sh
```

产物会输出到 `dist-macos/Kanban Watcher.app`。

如需做一次本地校验，可运行：

```bash
chmod +x scripts/test_build_macos_app.sh
zsh scripts/test_build_macos_app.sh
```

当前打包内容包含：

- 主程序二进制：`Contents/MacOS/Kanban Watcher`
- 应用元数据：`Contents/Info.plist`
- Finder 图标：`Contents/Resources/AppIcon.icns`
- 示例配置：`Contents/Resources/config.yaml.example`

说明：

- 当前版本只生成未签名 `.app`，适合本机使用或内部分发
- 当前默认使用 `build/macos/AppIcon.png` 生成 Finder 图标

## Local Preview

本地启动前端预览：

```bash
npm install
npm run preview
```

启动后有两个入口：

- 首页 `/`：网页版工作区主入口，桌面端显示“左侧状态栏 + 右侧多窗格工作区”，手机端退回 Home Assistant 卡片交互
- 预览页 `/preview`：保留原来的卡片预览页，用于单卡片样式和弹窗交互验证

如果本地 `kanban-watcher` HTTP API 开启了鉴权，访问时请带上 `api_key` 参数：

```text
http://127.0.0.1:5173/?api_key=your-api-key
http://127.0.0.1:5173/preview?api_key=your-api-key
```

如需显式指定后端地址和消息条数，可继续追加：

```text
http://127.0.0.1:5173/?base_url=http://127.0.0.1:7778&api_key=your-api-key&messages_limit=50
http://127.0.0.1:5173/preview?base_url=http://127.0.0.1:7778&api_key=your-api-key&messages_limit=50
```

## Install In Home Assistant

1. Build the card.
2. Copy `dist/kanban-watcher-card.js` into your Home Assistant `www/` directory, for example `config/www/kanban-watcher-card.js`.
3. Add the resource in Lovelace:

```yaml
url: /local/kanban-watcher-card.js
type: module
```

## Use The Card

Recommended API-driven config:

```yaml
type: custom:kanban-watcher-card
entity: sensor.kanban_watcher_kanban_watcher
base_url: https://watcher.huajiejun.cn
api_key: your-api-key-here
messages_limit: 50
```

Compatibility config without API mode:

```yaml
type: custom:kanban-watcher-card
entity: sensor.kanban_watcher_kanban_watcher
```

## Behavior

- Shows non-empty sections in this order: `需要注意`, `运行中`, `空闲`
- Section headers start expanded and can be collapsed
- Each task is rendered as a compact two-line summary card
- Empty boards show `当前没有任务`
- In API mode, the board requests `/api/workspaces/active` on load and refreshes periodically
- In API mode, clicking a workspace requests `/api/workspaces/{workspace_id}/latest-messages`
- Sending a message in the dialog calls `/api/workspace/{workspace_id}/follow-up`
- 网页版工作区首页支持最多同时打开 4 个窗格，第 5 个会顶替最早打开的窗格
- 任务从其他状态进入 `需要注意` 时，会自动加入桌面端右侧打开区
- 手动关闭的关注窗格不会在普通刷新时重新自动弹出，除非它之后再次从其他状态回到 `需要注意`
