# 工作区与任务关联调试记录

## 问题
从任务详情创建的工作区没有自动关联到该任务。

## 排查过程

### 1. 前端代码检查
- ✅ `mobile-issue-detail-panel.ts` 正确派发事件，包含 `projectId`
- ✅ `workspace-home.ts` 正确接收并传递 `projectId` 和 `issueId`
- ✅ `kanban-watcher-card.ts` 的 `openCreateWorkspaceDialog` 正确设置参数

### 2. 创建请求检查
**文件**: `src/kanban-watcher-card.ts`

**修复**: 在 `handleCreateWorkspace` 方法中，将 `linked_issue` 从 `null` 改为实际值：
```typescript
linked_issue: this.createWorkspaceIssueId && this.createWorkspaceProjectId ? {
  remote_project_id: this.createWorkspaceProjectId,
  issue_id: this.createWorkspaceIssueId
} : null,
```

### 3. 类型检查
- ✅ `LinkedIssueInfo` 接口定义正确：
  ```typescript
  export interface LinkedIssueInfo {
    remote_project_id: string;
    issue_id: string;
  }
  ```

- ✅ `CreateWorkspaceRequest` 接口包含 `linked_issue` 字段

### 4. 后端检查
**文件**: `internal/api/proxy.go`
```go
type CreateAndStartWorkspaceRequest struct {
  Name           string                 `json:"name"`
  Repos          []interface{}          `json:"repos"`
  LinkedIssue    interface{}            `json:"linked_issue"`
  ExecutorConfig map[string]interface{} `json:"executor_config"`
  Prompt         string                 `json:"prompt"`
  ImageIDs       []string               `json:"image_ids"`
}
```

- ✅ 包含 `LinkedIssue` 字段，类型为 `interface{}`

### 5. vibe-kanban API 检查
**文件**: `shared/types.ts`
```typescript
export type CreateAndStartWorkspaceRequest = {
  name: string | null,
  repos: Array<WorkspaceRepoInput>,
  linked_issue: LinkedIssueInfo | null,
  executor_config: ExecutorConfig,
  prompt: string,
  image_ids: Array<string> | null,
};
```

- ✅ vibe-kanban 支持 `linked_issue` 字段
- ✅ `LinkedIssueInfo` 定义匹配：
  ```typescript
  export type LinkedIssueInfo = {
    remote_project_id: string,
    issue_id: string,
  };
  ```

## 数据流

```
1. mobile-issue-detail-panel.ts
   ↓ dispatch "create-workspace-for-issue"
   { issueId, issueSimpleId, projectId: this.issue?.project_id, ... }

2. workspace-home.ts
   ↓ receive event
   ↓ card.openCreateWorkspaceDialog({
       projectId: issueProjectId || this.kanbanProjectId,
       issueId: issueId,
       ...
     })

3. kanban-watcher-card.ts
   ↓ openCreateWorkspaceDialog()
   this.createWorkspaceProjectId = options?.projectId || ""
   this.createWorkspaceIssueId = options?.issueId || ""

4. handleCreateWorkspace()
   ↓ build request
   CreateWorkspaceRequest = {
     linked_issue: {
       remote_project_id: this.createWorkspaceProjectId,
       issue_id: this.createWorkspaceIssueId
     },
     ...
   }

5. POST /api/workspaces/start
   ↓ proxy to vibe-kanban
   CreateAndStartWorkspaceRequest{LinkedIssue: linked_issue}

6. vibe-kanban
   ↓ create workspace
   ↓ link workspace to issue (via linked_issue)
```

## 测试验证

### 创建请求示例
```json
POST /api/workspaces/start
{
  "name": "任务 #42",
  "repos": [...],
  "linked_issue": {
    "remote_project_id": "proj-xxx",
    "issue_id": "issue-yyy"
  },
  "executor_config": {...},
  "prompt": "任务描述...",
  "image_ids": null
}
```

### 后端日志
添加日志输出确认 `linked_issue` 值：
```go
log.Printf("[HTTP Server] 创建工作区请求: name=%s, linked_issue=%v", req.Name, req.LinkedIssue)
```

## 提交记录
1. `785f663` - fix: 修复工作区与任务关联失败的问题（添加 projectId 传递）
2. `3fdc7ee` - fix: 修复创建请求中的 linked_issue 字段
3. `b6d3faf` - chore: 添加 linked_issue 调试日志
