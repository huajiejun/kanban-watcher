# 手机模式 realtime 地址修复 - 测试概述

## 目标

验证浏览器手机模式下的内嵌 `kanban-watcher-card` 会读取 `/api/info` 返回的 `realtime.base_url`，并将板级与会话级 websocket 都连接到主后端 realtime 地址，而不是当前 worktree 的 `base_url`。

## 执行命令

1. 失败测试（RED）

```bash
npm test -- --run tests/todo-integration.test.ts -t "uses realtime.base_url for the mobile card"
```

结果：

- FAIL
- 板级 websocket 实际连接 `ws://127.0.0.1:18842/...`
- 会话 websocket 实际连接 `ws://127.0.0.1:18842/...`

2. 修复后定向验证（GREEN）

```bash
npm test -- --run tests/todo-integration.test.ts -t "uses realtime.base_url for the mobile card"
```

结果：

- PASS
- 板级 websocket 连接 `ws://127.0.0.1:7778/api/realtime/ws?...`
- 会话 websocket 连接 `ws://127.0.0.1:7778/api/realtime/ws?...&session_id=...`

3. 手机模式集成回归

```bash
npm test -- --run tests/workspace-home.test.ts -t "delegates mobile realtime startup to the embedded card"
```

结果：

- PASS

4. 卡片全量回归

```bash
npm test -- --run tests/todo-integration.test.ts
```

结果：

- 存在 1 条失败：`Todo extraction from messages > should render TodoProgressPopup with correct todos when provided`
- 该失败位于待办提取相关断言，和本次 realtime 地址修复无直接关联

## 结论

- 手机模式内嵌卡片已补齐 `realtime.base_url` 读取逻辑。
- 板级和会话级 websocket 已与桌面模式一致，统一连接主后端 realtime 地址。
- 本次修复未破坏 `workspace-home` 对内嵌卡片 realtime 启动的委托逻辑。
