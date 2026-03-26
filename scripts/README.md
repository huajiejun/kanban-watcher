# 启动脚本说明

## `start-dev.sh`

工作区前后端开发启动脚本。

当前规则：

- 前端端口优先通过固定管理 API `http://127.0.0.1:7778` 申请
- 若管理 API 不可用，则回退到数据库兜底命令 `go run ./cmd/kw_frontend_port reserve`
- 后端端口固定为 `frontend_port + 10000`
- `status` / `stop` / `logs` 会优先读取本地缓存；缓存不存在时，会查询数据库里的已分配端口映射；只有两者都拿不到时才退回旧 hash 规则

### 用法

```bash
./scripts/start-dev.sh start 1467
./scripts/start-dev.sh stop 1467
./scripts/start-dev.sh status 1467
./scripts/start-dev.sh restart 1467
./scripts/start-dev.sh logs 1467
```

如果不指定 `worktree_id`，脚本会尝试从当前分支名或目录名推断。

### 命令说明

| 命令 | 说明 |
| --- | --- |
| `start` | 申请前端端口并启动前后端 |
| `stop` | 停止前后端 |
| `status` | 查看当前工作区前后端状态 |
| `restart` | 重启前后端 |
| `logs` | 持续跟随后端和前端日志 |

### 端口规则

- 前端端口池：`6020-6030`
- 后端端口：`frontend_port + 10000`
- 同一工作区优先复用数据库中已记录的 `frontend_port`
- 工作区归档后，`frontend_port` 会被释放

示例：

| 前端端口 | 后端端口 |
| --- | --- |
| `6020` | `16020` |
| `6023` | `16023` |
| `6030` | `16030` |

### 相关文件

- 端口缓存：`/tmp/kanban-dev/workspace-{workspace_id}.env`
- 后端日志：`/tmp/kanban-backend-{backend_port}.log`
- 前端日志：`/tmp/kanban-frontend-{frontend_port}.log`
- PID 目录：`/tmp/kanban-dev/`

### 环境变量

- `KANBAN_MANAGER_API_BASE`
  - 覆盖管理 API 地址，默认 `http://127.0.0.1:7778`
- `KANBAN_API_KEY`
  - 覆盖管理 API key；未设置时会尝试从 `~/.config/kanban-watcher/config.yaml` 读取
