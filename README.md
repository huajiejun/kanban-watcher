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
./scripts/build_macos_app.sh
```

产物会输出到 `dist-macos/Kanban Watcher.app`。

如需做一次本地校验，可运行：

```bash
./scripts/test_build_macos_app.sh
```

当前打包内容包含：

- 主程序二进制：`Contents/MacOS/Kanban Watcher`
- 应用元数据：`Contents/Info.plist`
- Finder 图标：`Contents/Resources/AppIcon.icns`
- 示例配置：`Contents/Resources/config.yaml.example`

说明：

- 当前版本只生成未签名 `.app`，适合本机使用或内部分发
- 当前默认使用 `build/macos/AppIcon.svg` 生成 Finder 图标

## Local Preview

To preview the card UI locally without Home Assistant:

```bash
npm install
npm run preview
```

Then open the local Vite URL in your browser. The preview page injects a mock
`hass` payload so you can inspect the three workspace sections and click into
the workspace dialog.

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
