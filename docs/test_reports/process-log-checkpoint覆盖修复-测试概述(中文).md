# Process Log Checkpoint 覆盖修复测试概述

## 本次目标

- 修复 `kw_sync_subscriptions.last_entry_index` 在 process log stream connect/error 状态更新时被 `NULL` 覆盖的问题
- 避免 worker 重连 process log ws 后从头重放同一批 normalized logs，导致 `kw_process_entries` 被重复 upsert

## 现场证据

- 重复刷新的记录对应：
  - `process_id=c2dde1c1-f52d-47c6-802c-71585eff2979`
  - `session_id=c4975814-82a5-443f-9b5a-26a7aeb4d9c1`
  - `workspace_id=2495bea7-64cc-40fa-8d87-0626f7f6d43c`
- 对应 subscription：
  - `process_log:c2dde1c1-f52d-47c6-802c-71585eff2979`
  - `status=error`
  - `last_error=\"unexpected EOF\"`
  - `last_entry_index=NULL`

## 执行测试

### 1. 定向回归测试

命令：

```bash
go test ./internal/store -run TestUpsertSubscriptionPreservesLastEntryIndexWhenIncomingValueIsNil
```

结果：

- 通过，验证已有 checkpoint 在传入 `nil` 时不会被覆盖成 `NULL`

### 2. store 包全量测试

命令：

```bash
go test ./internal/store
```

结果：

- 通过，`internal/store` 包全部测试通过

## 修复内容

- `internal/store/store.go`
  - 将 `last_entry_index = VALUES(last_entry_index)` 改为
  - `last_entry_index = COALESCE(VALUES(last_entry_index), last_entry_index)`

## 结论

- process log stream 的 connect/error 状态更新不再清空已有 checkpoint
- worker 重连后可以继续从已有 `last_entry_index` 继续消费，而不是从头重放
- 该修复直接针对 `kw_process_entries` 被重复 upsert 的根因
