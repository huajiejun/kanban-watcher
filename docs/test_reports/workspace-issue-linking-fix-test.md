# 工作区与任务关联修复测试

## 修复内容

**问题**: 从任务详情创建工作区后，工作区没有立即显示在任务的关联工作区列表中

**根本原因**: 创建工作区后，工作区数据没有立即保存到 kanban-watcher 的本地数据库，导致前端查询时返回空列表

**修复方案**: 在 `handleCreateAndStartWorkspace` 中，创建工作区成功后立即将其异步保存到本地数据库

## 代码变更

### 1. 修改 `internal/server/server.go`

在 `handleCreateAndStartWorkspace` 方法中，添加异步保存逻辑：

```go
// 立即将工作区保存到本地数据库，以便前端能立即查询到关联
if s.store != nil && result.Success && result.Data.Workspace.WorkspaceID != "" {
    go s.saveCreatedWorkspaceToLocalDB(req, result.Data.Workspace.WorkspaceID)
}
```

### 2. 新增 `saveCreatedWorkspaceToLocalDB` 方法

```go
// saveCreatedWorkspaceToLocalDB 将新创建的工作区保存到本地数据库
// 这样前端可以立即查询到关联的工作区，而不需要等待同步服务
func (s *Server) saveCreatedWorkspaceToLocalDB(req api.CreateAndStartWorkspaceRequest, workspaceID string) {
    if s.store == nil {
        return
    }

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    now := time.Now()
    name := req.Name
    branch := "main" // 默认分支，可以从 repos 中提取更好的值
    if len(req.Repos) > 0 {
        if repoMap, ok := req.Repos[0].(map[string]interface{}); ok {
            if targetBranch, exists := repoMap["target_branch"].(string); exists && targetBranch != "" {
                branch = targetBranch
            }
        }
    }

    // 从 linked_issue 中提取 issue_id
    var issueID *string
    if req.LinkedIssue != nil {
        if linkedIssueMap, ok := req.LinkedIssue.(map[string]interface{}); ok {
            if issueIDStr, exists := linkedIssueMap["issue_id"].(string); exists && issueIDStr != "" {
                issueID = &issueIDStr
            }
        }
    }

    workspace := &store.Workspace{
        ID:                  workspaceID,
        Name:                name,
        Branch:              branch,
        IssueID:             issueID,
        Archived:            false,
        Pinned:              false,
        LatestSessionID:     nil,
        IsRunning:           true, // 刚创建的工作区默认正在运行
        LatestProcessStatus: nil,
        HasPendingApproval:  false,
        HasUnseenTurns:      false,
        HasRunningDevServer: false,
        FrontendPort:        nil,
        FilesChanged:        0,
        LinesAdded:          0,
        LinesRemoved:        0,
        LastSeenAt:          now,
        CreatedAt:           &now,
        UpdatedAt:           &now,
        SyncedAt:            now,
    }

    if err := s.store.UpsertWorkspace(ctx, workspace); err != nil {
        log.Printf("[HTTP Server] 保存新创建工作区到本地数据库失败: workspace=%s, err=%v", workspaceID, err)
    } else {
        log.Printf("[HTTP Server] 新创建工作区已保存到本地数据库: workspace=%s, issue_id=%v", workspaceID, issueID)
    }
}
```

## 测试步骤

1. 打开移动端看板页面
2. 点击一个任务进入详情
3. 在"关联工作区"区域点击"新建工作区"
4. 填写工作区信息并创建
5. 观察任务详情中的"关联工作区"列表是否立即显示新创建的工作区

## 预期结果

- ✅ 创建工作区后，任务详情立即显示新工作区
- ✅ 刷新页面后，工作区仍然显示在关联列表中
- ✅ 后端日志显示 "新创建工作区已保存到本地数据库"

## 实际结果

（待测试）
