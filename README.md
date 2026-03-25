# Kanban Watcher Card

Lit-based Home Assistant custom card. Current version supports two data modes:

- API mode: recommended. The card reads workspaces and conversation history from `kanban-watcher` HTTP API.
- Hass fallback mode: keeps the old preview / sensor-attribute path for local preview and compatibility.

This repository is currently set up for manual Home Assistant deployment rather than npm package distribution.

## Build

### Build Home Assistant Card

```bash
npm install
npm run build:ha
```

产物会输出到 `dist/ha/kanban-watcher-card.js`。

### Build Web App

```bash
npm install
npm run build:web
```

网页版正式构建产物会输出到 `dist/web/`，包含：

- `dist/web/index.html`
- `dist/web/preview/index.html`

### Deploy Web Release

如果需要把网页版正式产物同步到本机发布目录，并刷新对应的 `nginx`，可以直接使用脚本：

```bash
./scripts/deploy_web_release.sh
```

默认行为：

- 执行 `npm run build:web`
- 同步 `dist/web/` 到 `~/github/knban-watcher-release`
- 如果 `~/github/knban-watcher-release/nginx.conf` 对应的 nginx 已在运行，则执行 reload
- 如果未运行，则直接用该配置启动 nginx

如果要改发布目录，可以传入目标路径：

```bash
./scripts/deploy_web_release.sh ~/github/kanban-watcher-release
```

### Build All

```bash
npm install
npm run build
```

该命令会依次执行 `build:ha` 和 `build:web`。

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

本地启动网页端开发预览：

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

1. Build the card with `npm run build:ha`.
2. Copy `dist/ha/kanban-watcher-card.js` into your Home Assistant `www/` directory, for example `config/www/kanban-watcher-card.js`.
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

## Todo List 功能

Kanban Watcher 现在支持待办事项显示功能：

- **工具栏按钮**：显示当前待办进度，点击查看详细列表
- **对话中显示**：在消息中展示待办事项更新
- **状态图标**：支持已完成(✓)、进行中(⊙)、已取消(○)等状态
- **进度显示**：实时显示完成进度和百分比

详细文档请参阅 [Todo List 功能文档](docs/todo-list-feature.md)
