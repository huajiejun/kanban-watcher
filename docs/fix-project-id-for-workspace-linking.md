# 修复工作区与任务关联失败的问题

## 问题描述
创建的工作区没有与任务关联。

## 根本原因
1. `mobile-issue-detail-panel.ts` 派发 `create-workspace-for-issue` 事件时，没有包含 `projectId`
2. `workspace-home.ts` 使用的是 `this.kanbanProjectId`（从项目选择器获取），但用户可能直接从任务详情面板打开对话框
3. 当 `kanbanProjectId` 为空时，无法调用关联 API

## 解决方案

### 1. 添加 projectId 到事件详情
**文件**: `src/components/mobile-issue-detail-panel.ts`

```javascript
private handleCreateWorkspace() {
  this.dispatchEvent(
    new CustomEvent("create-workspace-for-issue", {
      detail: {
        issueId: this.issue?.id,
        issueSimpleId: this.issue?.simple_id,
        projectId: this.issue?.project_id,  // 新增
        title: this.issue?.title,
        description: this.issue?.description
      },
      ...
    })
  );
}
```

### 2. 使用事件详情中的 projectId
**文件**: `src/web/workspace-home.ts`

```javascript
private async handleCreateWorkspaceForIssue(e: CustomEvent<{
  issueId: string;
  issueSimpleId: string;
  projectId?: string;  // 新增
  title?: string;
  description?: string | null;
}>) {
  const { issueId, issueSimpleId, projectId: issueProjectId, title, description } = e.detail;

  // 优先使用事件中的 projectId，如果没有则使用 kanbanProjectId
  card.openCreateWorkspaceDialog({
    suggestedName: `任务 ${issueSimpleId}`,
    projectId: issueProjectId || this.kanbanProjectId,  // 修改
    issueId: issueId,
    prompt: promptContent || undefined
  });
}
```

## 工作流程
1. 用户点击任务详情面板中的"创建工作区"
2. `mobile-issue-detail-panel` 派发事件，包含 `projectId: this.issue?.project_id`
3. `workspace-home` 从事件详情中提取 `projectId` 并传递给对话框
4. `kanban-watcher-card` 创建完工作区后，调用 `linkWorkspaceToIssue` 进行关联

## 验证方法
1. 打开任务详情面板
2. 点击"创建工作区"
3. 创建工作区成功后，检查任务详情中的工作区列表是否包含新创建的工作区
