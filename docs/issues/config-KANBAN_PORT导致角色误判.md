# config: KANBAN_PORT 导致角色误判

## 现象

- 手动以 `KANBAN_PORT=16027 go run ./cmd/kanban-watcher` 启动
- 实例监听端口已经变成 `16027`
- 但 `/api/info` 返回 `runtime.role = "main"`
- 该实例继续执行主同步并向数据库写入新消息

## 根因

- `LoadConfig()` 先创建 `defaultConfig()`
- `defaultConfig()` 默认把 `Runtime.Role` 设为 `main`
- 若配置文件未显式写 `runtime.role`，YAML 反序列化不会把该字段清空
- `applyDefaults()` 只有在 `cfg.Runtime.Role == ""` 时才按端口推导角色
- 因此 `KANBAN_PORT` 虽然改掉了端口，但不会再把角色从 `main` 改成 `worker`

## 修复方向

- 不在默认配置里预填 `Runtime.Role=main`
- 或者在 `LoadConfig()/applyDefaults()` 中显式区分“用户是否配置了 runtime.role”
- 最终角色应基于端口最终值推导，除非用户明确配置了 `runtime.role`
