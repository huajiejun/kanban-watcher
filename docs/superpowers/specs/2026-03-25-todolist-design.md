# 待办事项备忘录设计规格

**日期:** 2026-03-25
**状态:** 待审核
**作者:** Claude Code

---

## 1. 概述

在任务卡片的对话框中添加侧边抽屉式待办列表功能，允许用户记录下一步操作或后续想做的事情。数据存储在后端，每个工作区独立管理。

### 1.1 核心需求

- 在对话框输入框区域添加待办列表入口
- 侧边抽屉方式展开待办列表
- 每个工作区独立存储待办数据
- 点击待办项可发送消息并自动标记完成
- 后端持久化存储

### 1.2 功能列表

| 功能 | 描述 |
|------|------|
| 新增待办 | 手动输入新的待办事项 |
| 编辑待办 | 修改已有待办的内容 |
| 删除待办 | 删除单个待办事项 |
| 勾选完成 | 手动勾选标记为已完成 |
| 点击发送 | 点击待办项自动填入输入框并发送 |
| 清空已完成 | 一键清除所有已完成的待办 |

---

## 2. UI 设计

### 2.1 布局结构

```
┌─────────────────────────────────────────────────────────┐
│ 工作区名称                                    [✕ 关闭]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [消息历史区域]                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [继续] [同意] [📝 待办]                                │
├─────────────────────────────────────────────────────────┤
│  [输入框................................] [发送]        │
└─────────────────────────────────────────────────────────┘
```

点击"📝 待办"按钮后，侧边抽屉展开：

```
┌──────────────────────────────────┬──────────────────────┐
│ 工作区名称               [✕]    │ 📋 待办事项    [+]  │
├──────────────────────────────────┤──────────────────────┤
│                                  │                      │
│  [消息历史区域]                  │ ☐ 添加登录功能 ✏️🗑️│
│                                  │ ☐ 修复样式问题 ✏️🗑️│
│                                  │ ☑ 添加数据库        │
│                                  │                      │
│                                  │ [🗑️ 清空已完成]     │
├──────────────────────────────────┤                      │
│  [继续] [同意] [📝 待办]         │                      │
├──────────────────────────────────┤                      │
│  [输入框................] [发送] │                      │
└──────────────────────────────────┴──────────────────────┘
```

### 2.2 交互流程

1. **打开待办列表**: 点击"📝 待办"按钮，侧边抽屉从右侧滑入
2. **关闭待办列表**: 再次点击按钮或点击抽屉外部区域
3. **新增待办**: 点击"+"按钮，弹出输入框，输入内容后确认
4. **编辑待办**: 点击"✏️"图标，修改内容后确认
5. **删除待办**: 点击"🗑️"图标，弹出确认对话框"确定删除此待办？"，确认后删除
6. **勾选完成**: 点击复选框，切换完成状态
7. **发送待办**: 点击待办项内容，自动填入输入框并发送，同时标记为完成
8. **清空已完成**: 点击"清空已完成"按钮，删除所有已完成的待办

### 2.3 状态样式

| 状态 | 样式 |
|------|------|
| 未完成 | 正常文字，白色复选框边框 |
| 已完成 | 灰色文字 + 删除线，绿色填充复选框 |

---

## 3. 数据库设计

### 3.1 表结构

```sql
CREATE TABLE workspace_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_todos_workspace ON workspace_todos(workspace_id);
CREATE INDEX idx_todos_completed ON workspace_todos(workspace_id, completed);

-- 外键约束（如果 workspaces 表存在）
-- ALTER TABLE workspace_todos
--   ADD CONSTRAINT fk_todos_workspace
--   FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| workspace_id | UUID | 关联的工作区 ID |
| content | TEXT | 待办内容 |
| completed | BOOLEAN | 是否已完成 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

## 4. API 设计

### 4.1 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workspaces/:id/todos` | 获取工作区的待办列表 |
| POST | `/api/workspaces/:id/todos` | 新增待办 |
| PUT | `/api/todos/:id` | 更新待办（内容/完成状态） |
| DELETE | `/api/todos/:id` | 删除待办 |
| DELETE | `/api/workspaces/:id/todos/completed` | 清空已完成的待办 |

### 4.2 接口详情

#### GET /api/workspaces/:id/todos

获取指定工作区的所有待办事项。

**响应:**
```json
{
  "todos": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "content": "添加登录功能",
      "completed": false,
      "created_at": "2026-03-25T10:00:00Z",
      "updated_at": "2026-03-25T10:00:00Z"
    }
  ]
}
```

#### POST /api/workspaces/:id/todos

新增待办事项。

**请求体:**
```json
{
  "content": "添加登录功能"
}
```

**响应:**
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "content": "添加登录功能",
  "completed": false,
  "created_at": "2026-03-25T10:00:00Z",
  "updated_at": "2026-03-25T10:00:00Z"
}
```

#### PUT /api/todos/:id

更新待办事项。

**请求体:**
```json
{
  "content": "修改后的内容",
  "completed": true
}
```

**响应:** 返回更新后的待办对象

#### DELETE /api/todos/:id

删除单个待办事项。

**响应:** 204 No Content

#### DELETE /api/workspaces/:id/todos/completed

清空指定工作区所有已完成的待办。

**响应:** 204 No Content

### 4.3 错误响应格式

所有 API 在发生错误时返回统一格式：

```json
{
  "error": "not_found",
  "message": "待办事项不存在"
}
```

**常见错误码：**
| HTTP 状态码 | error | 说明 |
|------------|-------|------|
| 400 | bad_request | 请求参数无效 |
| 401 | unauthorized | 未授权 |
| 404 | not_found | 资源不存在 |
| 500 | internal_error | 服务器内部错误 |

---

## 5. 前端组件设计

### 5.1 组件结构

```
src/
├── lib/
│   └── todo-api.ts          # Todo API 调用
├── components/
│   └── todo-drawer.ts       # Todo 侧边抽屉组件
└── kanban-watcher-card.ts   # 主卡片组件（修改）
```

### 5.2 类型定义

```typescript
interface TodoItem {
  id: string;
  workspace_id: string;
  content: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}
```

### 5.3 状态管理

在 `KanbanWatcherCard` 组件中新增以下状态：

```typescript
@property({ state: true })
private todoDrawerOpen = false;

@property({ state: true })
private todos: TodoItem[] = [];

@property({ state: true })
private todoLoading = false;
```

### 5.3 关键方法

```typescript
// 加载待办列表
private async loadTodos(workspaceId: string): Promise<void>

// 切换抽屉显示
private toggleTodoDrawer(): void

// 新增待办
private async addTodo(content: string): Promise<void>

// 更新待办
private async updateTodo(todoId: string, data: Partial<TodoItem>): Promise<void>

// 删除待办
private async deleteTodo(todoId: string): Promise<void>

// 发送待办并标记完成
// 流程：先发送消息 → 成功后标记完成 → 标记失败不影响消息
private async sendTodoAndComplete(todo: TodoItem): Promise<void>

// 清空已完成
private async clearCompletedTodos(): Promise<void>
```

---

## 6. 样式设计

### 6.1 新增样式

```css
/* 待办按钮 */
.todo-toggle-button {
  padding: 4px 10px;
  background: var(--accent-color, #3b82f6);
  color: white;
  border-radius: 6px;
  cursor: pointer;
}

/* 侧边抽屉容器 */
.todo-drawer {
  width: 200px;
  padding: 12px;
  background: var(--secondary-background-color, #374151);
  border-radius: 10px;
  border: 1px solid var(--divider-color, #4b5563);
  transition: transform 200ms ease, opacity 200ms ease;
}

.todo-drawer.is-closed {
  transform: translateX(100%);
  opacity: 0;
  pointer-events: none;
}

/* 待办项 */
.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--card-background, #1f2937);
  border-radius: 6px;
  cursor: pointer;
}

.todo-item.is-completed {
  opacity: 0.6;
}

.todo-item.is-completed .todo-content {
  text-decoration: line-through;
  color: var(--secondary-text-color, #6b7280);
}

/* 复选框 */
.todo-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--accent-color, #3b82f6);
  border-radius: 4px;
  flex-shrink: 0;
}

.todo-checkbox.is-checked {
  background: var(--success-color, #10b981);
  border-color: var(--success-color, #10b981);
}

/* 操作按钮 */
.todo-action {
  color: var(--secondary-text-color, #6b7280);
  font-size: 10px;
  cursor: pointer;
}
```

---

## 7. 错误处理

### 7.1 错误类型

| 场景 | 处理方式 |
|------|---------|
| 网络请求失败 | 显示错误提示，不更新 UI |
| 加载失败 | 显示空状态 + 重试按钮 |
| 新增失败 | 显示错误提示，保留输入内容 |
| 删除失败 | 恢复删除的项，显示错误提示 |

### 7.2 错误提示格式

使用现有的 `actionFeedback` 机制显示错误信息。

---

## 8. 测试计划

### 8.1 单元测试

- [ ] API 调用函数测试
- [ ] 组件状态管理测试
- [ ] 事件处理测试

### 8.2 集成测试

- [ ] 完整的 CRUD 流程测试
- [ ] 发送并标记完成流程测试
- [ ] 清空已完成流程测试

### 8.3 E2E 测试

- [ ] 打开/关闭抽屉
- [ ] 新增、编辑、删除待办
- [ ] 点击发送待办
- [ ] 清空已完成

---

## 9. 实现优先级

1. **P0 - 核心功能**
   - 数据库表创建
   - API 接口实现
   - 前端 API 调用
   - 抽屉组件基础结构

2. **P1 - 基本交互**
   - 新增待办
   - 删除待办
   - 点击发送

3. **P2 - 完善功能**
   - 编辑待办
   - 勾选完成
   - 清空已完成

---

## 10. 未来扩展

以下功能不在当前范围，但可作为后续迭代考虑：

- 待办优先级排序
- 待办截止日期
- 待办标签/分类
- 批量操作
- 拖拽排序
