# 工作区待办备忘录 设计规格

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** 在工作区对话面板表头添加待办备忘录功能，用户可以快速记录、管理和发送待办事项

**Architecture:** 独立 Lit 组件 `workspace-todo-panel.ts` 通过自定义事件与对话面板通信。后端在 Go 服务中新增 CRUD API，MySQL 持久化。PC/移动端共用同一个组件，通过 CSS 媒体查询适配。

**Tech Stack:** Lit (前端) + Go net/http (后端) + MySQL (数据库)

---

## 功能需求

### 核心交互流程

1. **打开待办面板**：点击表头待办按钮（带数量角标）→ 弹出 modal（同文件浏览器模式）
2. **管理待办**：新增、编辑、标记完成、删除
3. **发送待办**：点击待办项 → 自动填入输入框并自动发送 → 标记为已完成
4. **完成归档**：已完成项自动隐藏归档，可重新添加回来

### 待办事项字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | UUID 主键 |
| workspace_id | VARCHAR(36) | 所属工作区 |
| content | VARCHAR(500) | 内容文本 |
| is_completed | BOOLEAN | 完成状态 |
| created_at | TIMESTAMP(3) | 创建时间 |
| updated_at | TIMESTAMP(3) | 更新时间 |

### PC/移动端适配

- 统一 modal 弹窗模式（同文件浏览器）
- PC 端：较大弹窗（如 480px 宽）
- 移动端（≤640px）：全屏宽弹窗
- 表头按钮尺寸差异：32px / 26px（同现有按钮）

---

## 文件变更清单

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/components/workspace-todo-panel.ts` | 待办面板 Lit 组件（CRUD UI + 发送交互） |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `internal/store/store.go` | InitSchema 新增 `kw_workspace_todos` 建表 + CRUD 方法 |
| `internal/server/server.go` | 新增 `/api/workspaces/{id}/todos` 路由 |
| `src/lib/http-api.ts` | 新增待办 CRUD 的 fetch 函数 |
| `src/types.ts` | 新增 `WorkspaceTodo` 类型定义 |
| `src/components/workspace-conversation-pane.ts` | 表头添加待办按钮 + 引入组件 |
| `src/web/workspace-home.ts` | 传递 workspaceId 给对话面板 + 处理 todo-selected 事件 |
| `src/kanban-watcher-card.ts` | 移动端传递 workspaceId + 处理 todo-selected 事件 |
| `src/styles.ts` | 待办面板相关样式 |

---

## 数据库设计

```sql
CREATE TABLE IF NOT EXISTS kw_workspace_todos (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    content VARCHAR(500) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_kw_todos_workspace (workspace_id),
    INDEX idx_kw_todos_workspace_completed (workspace_id, is_completed),
    CONSTRAINT fk_kw_todos_workspace
        FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
```

---

## API 设计

### GET /api/workspaces/{workspace_id}/todos

获取工作区的未完成待办列表（默认只返回未完成的，query 参数 `include_completed=true` 可返回全部）

**响应：**
```json
{
  "todos": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "content": "修复登录 bug",
      "is_completed": false,
      "created_at": "2026-03-27T10:00:00Z",
      "updated_at": "2026-03-27T10:00:00Z"
    }
  ],
  "pending_count": 3
}
```

### POST /api/workspaces/{workspace_id}/todos

**请求体：**
```json
{ "content": "修复登录 bug" }
```

**响应：** 返回创建的待办项

### PUT /api/workspaces/{workspace_id}/todos/{todo_id}

**请求体：**
```json
{ "content": "修复登录和注册 bug", "is_completed": true }
```

**响应：** 返回更新后的待办项

### DELETE /api/workspaces/{workspace_id}/todos/{todo_id}

**响应：**
```json
{ "success": true }
```

---

## 前端组件设计

### workspace-todo-panel.ts

**属性：**
- `workspaceId: string` — 工作区 ID
- `open: boolean` — 是否显示 modal

**自定义事件：**
- `todo-selected` — 用户点击待办发送（detail: `{ content: string }`）
- `todo-count-change` — 待办数量变化（detail: `{ count: number }`）

**UI 结构：**
```
Modal Overlay
├── Modal Container
│   ├── Header（标题 + 关闭按钮）
│   ├── 新增输入框（输入 + 回车/按钮添加）
│   ├── 待办列表
│   │   └── 待办项（内容 + 编辑/完成/删除操作）
│   └── 已归档区域（折叠显示）
│       └── 归档项（可重新激活）
```

**交互细节：**
- 新增：输入框 + 回车或点击按钮
- 编辑：点击内容进入编辑模式（inline edit）
- 完成：点击 checkbox，完成后自动移到归档区域
- 发送：双击待办项 → 触发 `todo-selected` 事件
- 归档恢复：归档区域点击恢复按钮

### 对话面板集成

在 `workspace-conversation-pane.ts` 的 `dialog-header-actions` 中，文件浏览器按钮前面添加待办按钮：

```html
<button class="dialog-action-icon" @click=${this.toggleTodoPanel}>
  📋 ${pendingTodoCount > 0 ? html`<span class="todo-badge">${pendingTodoCount}</span>` : nothing}
</button>
```

**事件处理流程：**
1. 对话面板监听 `todo-selected` 事件
2. 收到事件后，自动设置 `messageDraft` 为待办内容
3. 自动触发 `send` action
4. 通知待办面板标记该项为已完成

---

## 样式设计

- modal 风格复用文件浏览器的 overlay + modal 模式
- 待办项 hover 时显示操作按钮
- 角标样式：小圆点/数字 badge，右上角定位
- 编辑模式：inline input 替换文本
- 移动端（≤640px）：modal 宽度 100vw，高度自适应
