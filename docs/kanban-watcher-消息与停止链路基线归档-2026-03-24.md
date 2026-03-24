# kanban-watcher 消息与停止链路基线归档

日期：2026-03-24

## 当前基线

### 用户消息来源

- `kanban-watcher` 不再本地伪造发送消息入库
- 用户消息统一在同步 execution process 时，从 `executor_action.prompt` 生成并写入 `kw_process_entries`
- `normalized logs` 中的 `user_message` 不再作为主来源入库

### 停止当前执行

- 前端停止按钮调用本地接口：`POST /api/workspace/{workspace_id}/stop`
- 后端根据本地库查询该工作区最新仍在运行的 `codingagent` process
- 再代理调用上游接口：`POST /api/execution-processes/{process_id}/stop`

### 对话弹窗数据来源

- 弹窗每次打开都会主动拉取最新消息
- 打开后的增量更新继续通过 realtime/polling 合并
- 队列状态单独通过 `/api/workspace/{workspace_id}/queue` 查询和取消

## 当前关键接口

- `POST /api/workspace/{workspace_id}/message`
- `GET /api/workspace/{workspace_id}/queue`
- `DELETE /api/workspace/{workspace_id}/queue`
- `POST /api/workspace/{workspace_id}/stop`

## 当前数据库基线

### `kw_process_entries`

- 用户消息使用真实 `process_id`
- 用户消息 `entry_index` 固定为 `-1`
- 已增加复合索引：
  - `(session_id, entry_type, entry_timestamp)`

### `kw_msg_contexts`

- 持久化工作区消息上下文
- 用于后续 `send` / `queue` 请求携带 `executor_config`

## 基线验证命令

```bash
go test ./...
npm test
npm run build
```

## 备注

- `scripts` 目录脚本入口已拆分为独立子目录，避免影响 `go test ./...`
- 本基线适用于当前 `kanban-watcher` API 模式联调
