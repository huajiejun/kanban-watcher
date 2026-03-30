# 预设配置修复 v2

## 问题描述
选择 "zhipu" 或 "minimax" preset 创建工作区时，报错：`Unknown executor type: CLAUDE_CODE:zhipu`

## 根本原因
1. kanban-watcher  correctly 返回了预设列表 `["DEFAULT", "PLAN", "ROUTER", "zhipu", "minimax"]`
2. 前端 correctly 调用了 preset-options API 获取配置
3. 但 vibe-kanban 的 `default_profiles.json` 中只有 `DEFAULT`、`PLAN`、`ROUTER` 配置
4. 当传递 `variant: "zhipu"` 给 vibe-kanban 时，它找不到这个 variant 的配置，所以报错

## 解决方案
对于非标准预设（zhipu、minimax），让 kanban-watcher 的 preset-options API 返回 `variant: "DEFAULT"`，这样 vibe-kanban 会找到 DEFAULT 配置，同时通过 `model_id` 指定实际使用的模型。

## 代码修改

### 后端 (internal/server/server.go)

1. **添加 Variant 字段到 AgentPresetOptions 结构体**
```go
type AgentPresetOptions struct {
	ModelID          string  `json:"model_id,omitempty"`
	PermissionPolicy string  `json:"permission_policy,omitempty"`
	Variant          *string `json:"variant,omitempty"`  // 新增
}
```

2. **修改 preset-options 处理，对非标准预设返回 DEFAULT**
```go
case "zhipu":
    options.ModelID = "zhipu/glm-4-plus"
    options.PermissionPolicy = "auto"
    defaultVariant := "DEFAULT"
    options.Variant = &defaultVariant  // 新增

case "minimax":
    options.ModelID = "minimax/minimax-text-01"
    options.PermissionPolicy = "auto"
    defaultVariant := "DEFAULT"
    options.Variant = &defaultVariant  // 新增
```

### 前端 (src/kanban-watcher-card.ts)

**修改 loadPresetOptions，使用 API 返回的 variant**
```typescript
if (options) {
  // 自动填充模型（如果预设中有）
  if (options.model_id) {
    this.createWorkspaceModel = options.model_id;
  }
  // 自动填充权限策略
  if (options.permission_policy) {
    this.createWorkspacePermission = options.permission_policy;
  }
  // 如果预设返回了 variant（如非标准预设映射到 DEFAULT），使用它  // 新增
  if (options.variant !== undefined) {  // 新增
    this.createWorkspaceVariant = options.variant;  // 新增
  }  // 新增
}
```

## API 响应示例

**GET /api/agents/preset-options?executor=CLAUDE_CODE&variant=zhipu**
```json
{
    "success": true,
    "data": {
        "model_id": "zhipu/glm-4-plus",
        "permission_policy": "auto",
        "variant": "DEFAULT"
    }
}
```

## 工作流程

1. 用户选择 Agent: CLAUDE_CODE, Preset: zhipu
2. 前端调用 preset-options API
3. 后端返回 `{model_id: "zhipu/glm-4-plus", variant: "DEFAULT"}`
4. 前端设置：`createWorkspaceVariant = "DEFAULT"`, `createWorkspaceModel = "zhipu/glm-4-plus"`
5. 创建工作区请求：`executor: "CLAUDE_CODE"`, `variant: "DEFAULT"`, `model_id: "zhipu/glm-4-plus"`
6. vibe-kanban 找到 DEFAULT 配置，使用 zhipu 模型启动工作区

## 验证命令

```bash
# 检查预设列表
curl "http://localhost:7778/api/agents/discovery?executor=CLAUDE_CODE"

# 检查 zhipu preset（应该返回 variant: DEFAULT）
curl "http://localhost:7778/api/agents/preset-options?executor=CLAUDE_CODE&variant=zhipu"

# 检查 minimax preset（应该返回 variant: DEFAULT）
curl "http://localhost:7778/api/agents/preset-options?executor=CLAUDE_CODE&variant=minimax"
```
