# KANBAN_PORT 角色判定修复测试概述

## 本次目标

- 修复配置文件未显式设置 `runtime.role` 时，`KANBAN_PORT` 将实例切到非 `7778` 端口后仍保持 `main` 角色的问题
- 确保端口最终值和 runtime 角色推导一致，避免非主端口实例继续执行主同步并写数据库

## 执行测试

### 1. 定向回归测试

命令：

```bash
go test ./internal/config -run TestLoadConfigUsesWorkerRoleWhenKanbanPortOverridesConfigWithoutRuntimeRole
```

结果：

- 通过，验证配置文件未写 `runtime.role` 时，`KANBAN_PORT=16027` 会让 `LoadConfig()` 推导出 `worker`

### 2. config 包全量测试

命令：

```bash
go test ./internal/config
```

结果：

- 通过，`internal/config` 包全部测试通过

## 修复内容

- `internal/config/config.go`
  - 不再在 `defaultConfig()` 中预填 `Runtime.Role=main`
  - 保留 `applyDefaults()` 按最终端口推导 `main/worker`
  - 示例配置写出时显式设置 `Runtime.Role=main`

## 结论

- 运行实例的角色不再被 `defaultConfig()` 默认值卡死
- 当配置文件未显式设置 `runtime.role` 时，最终角色会基于最终端口值正确推导
- `KANBAN_PORT=16027` 这类启动方式不会再误判成 `main`
