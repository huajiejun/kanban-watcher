
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
./build-app.sh
```


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

