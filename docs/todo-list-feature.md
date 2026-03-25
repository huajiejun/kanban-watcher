# Todo List 功能文档

## 概述

Todo List 功能允许用户在 Kanban Watcher 中查看和管理待办事项。

## 功能特性

### TodoProgressPopup（工具栏按钮）

- 位置：工作区对话框的工具栏
- 功能：
  - 显示待办进度（已完成/总数）
  - 点击弹出详细列表
  - 显示完成百分比和进度条

### ChatTodoList（对话列表）

- 位置：对话消息中
- 功能：
  - 可展开/折叠的待办列表
  - 显示每个待办项的状态
  - 支持点击展开查看详情

## 状态类型

| 状态 | 图标 | 描述 |
|------|------|------|
| `completed` | ✓ | 已完成 |
| `in_progress` | ⊙ | 进行中 |
| `cancelled` | ○ | 已取消 |
| `pending` | ○ | 待处理 |

## 使用方式

1. AI 执行 `todo_management` 工具调用
2. 系统自动提取待办事项
3. 在工具栏和对话中显示待办列表
4. 实时更新完成进度

## 技术实现

- 基于 Lit 组件架构
- TypeScript 类型安全
- 响应式设计
- 无障碍支持

## 组件

### TodoProgressPopup

工具栏按钮组件，显示待办进度和弹出详情。

**文件位置：** `src/components/todo-progress-popup.ts`

**属性：**
- `todos`: TodoItem[] - 待办事项列表
- `disabled`: boolean - 是否禁用

**事件：**
- 无（纯展示组件）

### ChatTodoList

对话中的可展开待办列表组件。

**文件位置：** `src/components/chat-todo-list.ts`

**属性：**
- `todos`: TodoItem[] - 待办事项列表
- `expanded`: boolean - 是否展开

**事件：**
- `toggle-expand` - 展开/折叠事件

### 类型定义

类型定义位于 `src/types.ts`：

```typescript
export interface TodoItem {
  id: string;
  content: string;
  status: 'completed' | 'in_progress' | 'cancelled' | 'pending';
  activeForm?: string;
}

export interface TodoListData {
  todos: TodoItem[];
  completedCount: number;
  totalCount: number;
}
```

## 数据提取

系统通过 `extractTodoListFromToolUse` 函数从 AI 工具调用中提取待办事项。

**文件位置：** `src/utils/todo-extractor.ts`

**支持的工具名称：**
- `todo_management`
- `TodoWrite`

## 测试

### 单元测试

- `tests/todo-progress-popup.test.ts` - 工具栏组件测试
- `tests/chat-todo-list.test.ts` - 对话列表组件测试

### 集成测试

- `tests/todo-integration.test.ts` - 集成测试

### 运行测试

```bash
npm test
```

## 样式

组件使用 CSS 自定义属性，支持主题定制：

- `--primary-color` - 主色调
- `--success-color` - 成功状态颜色
- `--warning-color` - 警告状态颜色
- `--text-color` - 文本颜色
- `--background-color` - 背景颜色

## 无障碍支持

- 语义化 HTML 结构
- ARIA 属性支持
- 键盘导航友好
- 高对比度模式支持

## 未来计划

- [ ] 支持待办项点击交互
- [ ] 添加过滤和排序功能
- [ ] 支持待办项编辑
- [ ] 添加动画效果
