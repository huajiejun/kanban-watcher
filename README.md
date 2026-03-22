# Kanban Watcher Card

Lit-based Home Assistant custom card for the Kanban Watcher sensor entity.

This repository is currently set up for manual Home Assistant deployment rather than npm package distribution.

## Build

```bash
npm install
npm run build
```

The production bundle is written to `dist/kanban-watcher-card.js`.

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

Add the custom card to a dashboard and point it at the Kanban Watcher entity:

```yaml
type: custom:kanban-watcher-card
entity: sensor.kanban_watcher_kanban_watcher
```

## Behavior

- Shows non-empty sections in this order: `需要注意`, `运行中`, `空闲`
- Section headers start expanded and can be collapsed
- Each task is rendered as a compact two-line summary card
- Empty boards show `当前没有任务`
