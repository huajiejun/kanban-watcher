# KANBAN_PORT 角色判定修复计划

**Goal:** 修复配置文件未显式设置 `runtime.role` 时，`KANBAN_PORT` 将实例切到非 `7778` 端口后仍保持 `main` 角色的问题，避免非主端口实例继续执行主同步并写数据库。

**Architecture:** 在配置默认值与默认填充逻辑之间引入“角色是否显式配置”的判定，仅在用户显式配置时保留角色；否则根据最终端口重新推导 `main/worker`。

**Tech Stack:** Go、yaml、testing

---

## 步骤

- [x] 增加回归测试，覆盖 `defaultConfig + KANBAN_PORT != 7778` 时应推导为 worker
- [x] 修改配置默认值/填充逻辑，避免默认 main 阻断端口推导
- [x] 运行相关配置测试确认通过
