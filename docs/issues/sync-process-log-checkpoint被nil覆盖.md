# sync: process log checkpoint 被 nil 覆盖

## 现象

- `kw_process_entries` 中同一个 `(process_id, entry_index)` 被重复刷新
- 刷新来源不是 `7778` 主服务，而是某个 worker 端口
- 对应的 `kw_sync_subscriptions` 记录出现：
  - `status=error`
  - `last_error="unexpected EOF"`
  - `last_entry_index=NULL`

## 现场证据

- 记录示例：
  - `process_id=c2dde1c1-f52d-47c6-802c-71585eff2979`
  - `session_id=c4975814-82a5-443f-9b5a-26a7aeb4d9c1`
  - `workspace_id=2495bea7-64cc-40fa-8d87-0626f7f6d43c`
- subscription：
  - `process_log:c2dde1c1-f52d-47c6-802c-71585eff2979`
  - `updated_at=2026-03-28T17:54:12.237+08:00`
  - `last_error="unexpected EOF"`
  - `last_entry_index=NULL`

## 根因

- `processEntryBuffer` flush 后会把最新 `last_entry_index` 写回 `kw_sync_subscriptions`
- 但 `subscribeProcessLogs()` 在 connect/error 更新状态时，调用 `upsertProcessSubscription(..., nil, ...)`
- `store.UpsertSubscription` 使用 `last_entry_index = VALUES(last_entry_index)`，导致 `nil` 直接把已有 checkpoint 覆盖成 `NULL`
- 下次 worker 重连 process log ws 时失去 checkpoint，只能从头重放

## 修复方向

- 在 `store.UpsertSubscription` 中改为保留已有 checkpoint：
  - `last_entry_index = COALESCE(VALUES(last_entry_index), last_entry_index)`
