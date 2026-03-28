# Process Log Checkpoint 覆盖修复计划

**Goal:** 修复 process log stream 在 connect/error 状态更新时将 `kw_sync_subscriptions.last_entry_index` 用 `NULL` 覆盖的问题，避免 worker 重连后从头重放同一批 normalized logs，导致 `kw_process_entries` 被重复 upsert。

**Architecture:** 在 `store.UpsertSubscription` 层保留已有 checkpoint：当传入的 `last_entry_index` 为 `NULL` 时，不覆盖库里已有值；补充 store 回归测试锁定该行为。

**Tech Stack:** Go、sqlmock、MySQL

---

## 步骤

- [x] 补充回归测试，覆盖已有 `last_entry_index` 被 `nil` 更新时应保留旧值
- [x] 修改 `UpsertSubscription` 的 SQL，避免 `NULL` 覆盖 checkpoint
- [x] 运行相关单测确认通过
