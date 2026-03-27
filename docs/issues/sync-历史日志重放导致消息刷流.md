# sync 历史日志重放导致消息刷流

## 现象

- `16024` 后端启动后，工作区预览和消息表会持续出现“很久之前的消息”
- 停掉后端后，数据库不再继续增加这批旧消息
- 小卡片会被重复刷动，尤其容易被 `tool_use` 和历史 `assistant_message` 触发

## 根因

问题不是单一层面的，而是几层叠加：

1. `7777` 的 `normalized-logs/ws` 会在重连或重新订阅时重放旧 patch
2. `16024` 启动后会重新追历史 process log
3. 旧实现里，历史消息缺失 `timestamp` 时会污染 `entry_timestamp`
4. `tool_use` 默认进入 realtime 广播和工作区预览接口，放大了刷流感知

最关键的漏口在历史 process 的重连策略：

- 非 `running` 的 process，只在订阅状态是 `completed` 时才跳过
- 如果服务异常退出，订阅状态可能停在 `active` / `error`
- 服务重启后会再次连接这些旧 process 的 `normalized-logs/ws`
- 结果就是历史日志被重新消费

## 修复

本轮修复分为四层：

1. 保住 `entry_timestamp`
   - 已存在 entry 不再覆盖 `entry_timestamp`
   - 缺失 `timestamp` 的新 entry 不再用 `time.Now()` 回填
   - 优先沿用旧值，否则退回 `process.created_at`

2. 降低 `tool_use` 广播噪音
   - `tool_use` 在 `running` 状态下不做 realtime 广播
   - 只有进入终态才广播

3. 过滤工作区预览默认消息类型
   - `/api/workspaces/{id}/latest-messages` 默认不再包含 `tool_use`
   - 会话详情接口仍保留完整消息类型

4. 阻止已同步历史 process 的日志重放
   - 对非 `running` process，只要订阅里已经有 `last_entry_index`
   - 重启后直接跳过，不再重新连历史日志 websocket

## 影响范围

- 工作区预览卡片
- `/api/workspaces/{id}/latest-messages`
- `kw_process_entries`
- `kw_sync_subscriptions`
- `internal/sync` 的 process log 订阅链

## 验证结论

- 问题复现条件：启动 `16024` 后端
- 问题停止条件：停止 `16024` 后端
- 修复后：已同步过的旧 completed / failed process 不再在启动时重放

## 后续建议

- 如果后续还要追查上游是否存在更激进的 replay，可以继续保留 `KANBAN_SYNC_TRACE=1` 的按需链路日志
- 如果确认系统稳定，可继续移除更多临时诊断代码，只保留受环境变量控制的 trace
