# 预设配置修复

## 问题描述
用户希望将 "zhipu" 和 "minimax" 添加为 Claude Code 的预设选项，而不是模型选项。

## 解决方案

### 后端修改
文件: `internal/server/server.go`

1. **添加预设选项** (第1589行):
   ```go
   Presets: []string{"DEFAULT", "PLAN", "ROUTER", "zhipu", "minimax"},
   ```

2. **添加预设配置处理** (第1672-1677行):
   ```go
   case "zhipu":
       options.ModelID = "zhipu/glm-4-plus"
       options.PermissionPolicy = "auto"
   case "minimax":
       options.ModelID = "minimax/minimax-text-01"
       options.PermissionPolicy = "auto"
   ```

### 前端行为
- 当用户选择 Agent=Claude Code, Preset=zhipu 时:
  1. 前端调用 `GET /api/agents/preset-options?executor=CLAUDE_CODE&variant=zhipu`
  2. 后端返回 `{model_id: "zhipu/glm-4-plus", permission_policy: "auto"}`
  3. 前端自动填充模型字段为 "zhipu/glm-4-plus"
  4. 前端自动填充权限策略为 "auto"

## 验证方法
```bash
# 检查预设列表
curl "http://localhost:7778/api/agents/discovery?executor=CLAUDE_CODE"

# 检查 zhipu 预设配置
curl "http://localhost:7778/api/agents/preset-options?executor=CLAUDE_CODE&variant=zhipu"

# 检查 minimax 预设配置
curl "http://localhost:7778/api/agents/preset-options?executor=CLAUDE_CODE&variant=minimax"
```

## 结果
- ✅ 预设列表包含: DEFAULT, PLAN, ROUTER, zhipu, minimax
- ✅ 选择 zhipu 预设时自动使用 zhipu/glm-4-plus 模型
- ✅ 选择 minimax 预设时自动使用 minimax/minimax-text-01 模型
