# PC/手机共享 Realtime 链路重构计划

**Goal:** 提取 PC 端和手机模式共用的 realtime 策略 helper，统一实时地址解析、活动消息过滤和 session 切换判定，避免两套链路继续分叉。

**Architecture:** 新增独立 `realtime-sync` helper 模块，承载 `realtime.base_url` 解析、活动 session 提取、active pane 消息类型常量和 selected session 变化判定。`workspace-home` 与 `kanban-watcher-card` 改为复用该模块，只保留各自组件内的 UI 状态与 websocket 生命周期控制。

**Tech Stack:** TypeScript、Lit、Vitest

---

## 步骤

- [x] 新增共享 helper 测试，覆盖实时地址解析、active pane types 和 session 变化判定
- [x] 运行目标测试，确认共享逻辑覆盖到位
- [x] 提取共享 `realtime-sync` helper，并切换 PC/手机两端复用
- [x] 重新运行相关测试确认通过
