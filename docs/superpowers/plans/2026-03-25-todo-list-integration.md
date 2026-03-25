# Todo List 集成实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 kanban-watcher 中集成 todo list 功能，提供与 vibe-kanban 一致的待办事项显示和管理体验

**Architecture:** 基于 Lit 组件架构，创建 TodoProgressPopup（工具栏按钮）和 ChatTodoList（对话列表）两个核心组件，通过类型扩展和状态管理实现 todo 数据的提取和展示

**Tech Stack:** TypeScript, LitElement, Lit HTML, CSS

---

## 文件结构

### 新建文件
- `src/components/todo-progress-popup.ts` - TodoProgressPopup 组件
- `src/components/chat-todo-list.ts` - ChatTodoList 组件
- `tests/todo-progress-popup.test.ts` - TodoProgressPopup 测试
- `tests/chat-todo-list.test.ts` - ChatTodoList 测试

### 修改文件
- `src/types.ts` - 添加 TodoItem 接口和扩展 ToolActionInfo
- `src/kanban-watcher-card.ts` - 集成 TodoProgressPopup 组件
- `src/lib/tool-call.ts` - 添加 todo_management 支持
- `src/styles.ts` - 添加 todo 相关样式

---

## Chunk 1: 类型定义和数据结构

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/types.ts:127-143`

- [ ] **Step 1: 添加 TodoItem 接口**

在 `src/types.ts` 文件末尾添加 TodoItem 接口定义：

```typescript
/** 待办事项状态 */
export type TodoStatus = 'completed' | 'in_progress' | 'cancelled' | 'pending';

/** 待办事项 */
export interface TodoItem {
  content: string;
  status?: TodoStatus | null;
  id?: string;
}

/** 待办事项列表 */
export interface TodoList {
  items: TodoItem[];
  completedCount: number;
  totalCount: number;
  percentage: number;
}
```

- [ ] **Step 2: 扩展 ToolActionInfo 接口**

修改 `src/types.ts` 中的 ToolActionInfo 接口，添加 todos 字段：

```typescript
export interface ToolActionInfo {
  action?: string;
  command?: string;
  path?: string;
  q?: string;
  query?: string;
  url?: string;
  description?: string;
  operation?: string;
  todos?: TodoItem[];  // 添加这行
  changes?: Array<{
    action: "write" | "edit" | "delete" | "rename";
    content?: string;
    unified_diff?: string;
    new_path?: string;
  }>;
  [key: string]: unknown;
}
```

- [ ] **Step 3: 验证类型定义**

运行 TypeScript 编译器验证类型定义：

```bash
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 4: 提交类型定义**

```bash
git add src/types.ts
git commit -m "feat: add TodoItem and TodoList type definitions"
```

---

## Chunk 2: TodoProgressPopup 组件

### Task 2: 创建 TodoProgressPopup 组件

**Files:**
- Create: `src/components/todo-progress-popup.ts`
- Create: `tests/todo-progress-popup.test.ts`

- [ ] **Step 1: 编写 TodoProgressPopup 组件测试**

创建 `tests/todo-progress-popup.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { TodoProgressPopup } from '../src/components/todo-progress-popup';
import type { TodoItem } from '../src/types';

describe('TodoProgressPopup', () => {
  it('should render empty state when no todos', async () => {
    const element = new TodoProgressPopup();
    element.todos = [];
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('button');
    expect(button?.disabled).toBe(true);
  });

  it('should calculate progress correctly', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'in_progress' },
      { content: 'Task 3', status: 'pending' },
    ];

    const element = new TodoProgressPopup();
    element.todos = todos;
    await element.updateComplete;

    // Should show 1/3 completed
    const progressText = element.shadowRoot?.querySelector('.progress-text');
    expect(progressText?.textContent).toContain('1/3');
  });

  it('should show popover on click', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = new TodoProgressPopup();
    element.todos = todos;
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('button');
    button?.click();
    await element.updateComplete;

    const popover = element.shadowRoot?.querySelector('.todo-popover');
    expect(popover).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test tests/todo-progress-popup.test.ts
```

Expected: FAIL - Cannot find module '../src/components/todo-progress-popup'

- [ ] **Step 3: 创建 TodoProgressPopup 组件**

创建 `src/components/todo-progress-popup.ts`：

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TodoItem } from '../types';

@customElement('todo-progress-popup')
export class TodoProgressPopup extends LitElement {
  @property({ type: Array })
  todos: TodoItem[] = [];

  @property({ type: Boolean })
  open = false;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .todo-button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .todo-button:hover:not(:disabled) {
      background: #f5f5f5;
    }

    .todo-button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .todo-icon {
      width: 16px;
      height: 16px;
    }

    .progress-text {
      font-size: 12px;
      color: #666;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: #e0e0e0;
      border-radius: 2px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      background: #4caf50;
      transition: width 0.3s;
    }

    .todo-popover {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      width: 300px;
      max-height: 400px;
      overflow-y: auto;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: none;
    }

    .todo-popover.open {
      display: block;
    }

    .popover-header {
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      font-weight: 600;
    }

    .todo-list {
      padding: 8px 0;
    }

    .todo-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 16px;
      font-size: 14px;
    }

    .todo-item:hover {
      background: #f5f5f5;
    }

    .status-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      margin-top: 2px;
    }

    .status-icon.completed {
      color: #4caf50;
    }

    .status-icon.in_progress {
      color: #2196f3;
    }

    .status-icon.cancelled {
      color: #9e9e9e;
    }

    .status-icon.pending {
      color: #9e9e9e;
    }

    .todo-content {
      flex: 1;
      line-height: 1.4;
    }

    .todo-content.cancelled {
      text-decoration: line-through;
      color: #9e9e9e;
    }
  `;

  private togglePopover() {
    if (this.todos.length === 0) return;
    this.open = !this.open;
  }

  private getProgress() {
    const total = this.todos.length;
    const completed = this.todos.filter(
      todo => todo.status?.toLowerCase() === 'completed'
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }

  private getStatusIcon(status?: string | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'completed') {
      return '✓';
    }
    if (s === 'in_progress' || s === 'in-progress') {
      return '⊙';
    }
    if (s === 'cancelled') {
      return '○';
    }
    return '○';
  }

  private getStatusClass(status?: string | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'in_progress' || s === 'in-progress') return 'in_progress';
    if (s === 'cancelled') return 'cancelled';
    return 'pending';
  }

  render() {
    const { completed, total, percentage } = this.getProgress();
    const isEmpty = this.todos.length === 0;

    return html`
      <button
        class="todo-button"
        ?disabled=${isEmpty}
        @click=${this.togglePopover}
      >
        <span class="todo-icon">☑</span>
        ${!isEmpty
          ? html`<span class="progress-text">${completed}/${total}</span>`
          : nothing}
      </button>

      ${!isEmpty
        ? html`
            <div class="todo-popover ${this.open ? 'open' : ''}">
              <div class="popover-header">
                <div>待办事项</div>
                <div class="progress-text">${completed}/${total} 完成 (${percentage}%)</div>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style="width: ${percentage}%"
                  ></div>
                </div>
              </div>
              <div class="todo-list">
                ${this.todos.map(
                  todo => html`
                    <div class="todo-item">
                      <span
                        class="status-icon ${this.getStatusClass(todo.status)}"
                      >
                        ${this.getStatusIcon(todo.status)}
                      </span>
                      <span
                        class="todo-content ${todo.status?.toLowerCase() ===
                        'cancelled'
                          ? 'cancelled'
                          : ''}"
                      >
                        ${todo.content}
                      </span>
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : nothing}
    `;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test tests/todo-progress-popup.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: 提交 TodoProgressPopup 组件**

```bash
git add src/components/todo-progress-popup.ts tests/todo-progress-popup.test.ts
git commit -m "feat: add TodoProgressPopup component with tests"
```

---

## Chunk 3: ChatTodoList 组件

### Task 3: 创建 ChatTodoList 组件

**Files:**
- Create: `src/components/chat-todo-list.ts`
- Create: `tests/chat-todo-list.test.ts`

- [ ] **Step 1: 编写 ChatTodoList 组件测试**

创建 `tests/chat-todo-list.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { ChatTodoList } from '../src/components/chat-todo-list';
import type { TodoItem } from '../src/types';

describe('ChatTodoList', () => {
  it('should render todo list header', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = new ChatTodoList();
    element.todos = todos;
    await element.updateComplete;

    const header = element.shadowRoot?.querySelector('.todo-header');
    expect(header).toBeDefined();
    expect(header?.textContent).toContain('更新待办');
  });

  it('should toggle expansion on click', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = new ChatTodoList();
    element.todos = todos;
    element.expanded = false;
    await element.updateComplete;

    // Initially collapsed
    let list = element.shadowRoot?.querySelector('.todo-list-items');
    expect(list).toBeNull();

    // Click to expand
    const header = element.shadowRoot?.querySelector('.todo-header');
    header?.click();
    await element.updateComplete;

    // Now expanded
    list = element.shadowRoot?.querySelector('.todo-list-items');
    expect(list).toBeDefined();
  });

  it('should render todo items with correct status icons', async () => {
    const todos: TodoItem[] = [
      { content: 'Completed task', status: 'completed' },
      { content: 'In progress task', status: 'in_progress' },
      { content: 'Cancelled task', status: 'cancelled' },
      { content: 'Pending task', status: 'pending' },
    ];

    const element = new ChatTodoList();
    element.todos = todos;
    element.expanded = true;
    await element.updateComplete;

    const items = element.shadowRoot?.querySelectorAll('.todo-item');
    expect(items?.length).toBe(4);

    // Check cancelled task has strikethrough
    const cancelledContent = element.shadowRoot?.querySelector('.todo-content.cancelled');
    expect(cancelledContent).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test tests/chat-todo-list.test.ts
```

Expected: FAIL - Cannot find module '../src/components/chat-todo-list'

- [ ] **Step 3: 创建 ChatTodoList 组件**

创建 `src/components/chat-todo-list.ts`：

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TodoItem } from '../types';

@customElement('chat-todo-list')
export class ChatTodoList extends LitElement {
  @property({ type: Array })
  todos: TodoItem[] = [];

  @property({ type: Boolean })
  expanded = false;

  static styles = css`
    :host {
      display: block;
      font-size: 14px;
    }

    .todo-header {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: #666;
      padding: 4px 0;
    }

    .todo-header:hover {
      color: #333;
    }

    .todo-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }

    .header-text {
      flex: 1;
    }

    .caret-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      transition: transform 0.2s;
    }

    .caret-icon.expanded {
      transform: rotate(180deg);
    }

    .todo-list-items {
      margin-top: 8px;
      margin-left: 24px;
    }

    .todo-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 0;
    }

    .status-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-icon.completed {
      color: #4caf50;
    }

    .status-icon.in_progress {
      color: #2196f3;
    }

    .status-icon.cancelled {
      color: #9e9e9e;
    }

    .status-icon.pending {
      color: #9e9e9e;
    }

    .todo-content {
      flex: 1;
      line-height: 1.5;
      word-break: break-word;
    }

    .todo-content.cancelled {
      text-decoration: line-through;
      color: #9e9e9e;
    }
  `;

  private toggle() {
    this.expanded = !this.expanded;
    this.dispatchEvent(
      new CustomEvent('toggle', {
        detail: { expanded: this.expanded },
        bubbles: true,
        composed: true,
      })
    );
  }

  private getStatusIcon(status?: string | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'completed') {
      return '✓';
    }
    if (s === 'in_progress' || s === 'in-progress') {
      return '⊙';
    }
    if (s === 'cancelled') {
      return '○';
    }
    return '○';
  }

  private getStatusClass(status?: string | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'in_progress' || s === 'in-progress') return 'in_progress';
    if (s === 'cancelled') return 'cancelled';
    return 'pending';
  }

  render() {
    return html`
      <div class="todo-header" @click=${this.toggle}>
        <span class="todo-icon">☑</span>
        <span class="header-text">更新待办</span>
        <span class="caret-icon ${this.expanded ? 'expanded' : ''}">▼</span>
      </div>

      ${this.expanded && this.todos.length > 0
        ? html`
            <ul class="todo-list-items">
              ${this.todos.map(
                todo => html`
                  <li class="todo-item">
                    <span
                      class="status-icon ${this.getStatusClass(todo.status)}"
                    >
                      ${this.getStatusIcon(todo.status)}
                    </span>
                    <span
                      class="todo-content ${todo.status?.toLowerCase() ===
                      'cancelled'
                        ? 'cancelled'
                        : ''}"
                    >
                      ${todo.content}
                    </span>
                  </li>
                `
              )}
            </ul>
          `
        : nothing}
    `;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test tests/chat-todo-list.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 5: 提交 ChatTodoList 组件**

```bash
git add src/components/chat-todo-list.ts tests/chat-todo-list.test.ts
git commit -m "feat: add ChatTodoList component with tests"
```

---

## Chunk 4: 工具调用处理

### Task 4: 扩展工具调用处理

**Files:**
- Modify: `src/lib/tool-call.ts`

- [ ] **Step 1: 添加 todo_management 工具类型**

在 `src/lib/tool-call.ts` 中添加 todo_management 的处理：

```typescript
// 在工具类型映射中添加
const TOOL_ICONS: Record<string, string> = {
  // ... 现有的工具图标
  todo_management: "☑",
};

const TOOL_LABELS: Record<string, string> = {
  // ... 现有的工具标签
  todo_management: "更新待办",
};

// 在 summarizeToolCall 函数中添加处理
export function summarizeToolCall(
  toolName: string,
  actionType: ToolActionInfo,
  status: DialogToolStatus
): { summary: string; detail: string; icon: string; statusLabel: string } {
  // ... 现有代码

  case "todo_management":
    const todos = actionType.todos || [];
    const completed = todos.filter(t => t.status?.toLowerCase() === 'completed').length;
    return {
      summary: `更新待办事项 (${completed}/${todos.length})`,
      detail: todos.map(t => `- [${t.status || 'pending'}] ${t.content}`).join('\n'),
      icon: TOOL_ICONS.todo_management,
      statusLabel: getStatusLabel(status),
    };

  // ... 其他 case
}
```

- [ ] **Step 2: 验证工具调用处理**

运行 TypeScript 编译器验证：

```bash
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 3: 提交工具调用处理**

```bash
git add src/lib/tool-call.ts
git commit -m "feat: add todo_management tool call handling"
```

---

## Chunk 5: 主组件集成

### Task 5: 集成到 kanban-watcher-card

**Files:**
- Modify: `src/kanban-watcher-card.ts`

- [ ] **Step 1: 导入 TodoProgressPopup 组件**

在 `src/kanban-watcher-card.ts` 顶部添加导入：

```typescript
import './components/todo-progress-popup';
import './components/chat-todo-list';
```

- [ ] **Step 2: 添加 todos 状态**

在 KanbanWatcherCard 类中添加状态：

```typescript
@state()
private currentTodos: TodoItem[] = [];

@state()
private inProgressTodo: TodoItem | null = null;
```

- [ ] **Step 3: 提取 todos 数据**

在消息处理逻辑中添加 todo 提取：

```typescript
private extractTodosFromMessage(message: SessionMessageResponse): TodoItem[] {
  if (message.tool_info?.action_type?.action === 'todo_management') {
    return message.tool_info.action_type.todos || [];
  }
  return [];
}

// 在消息处理流程中调用
private processMessage(message: SessionMessageResponse) {
  const todos = this.extractTodosFromMessage(message);
  if (todos.length > 0) {
    this.currentTodos = todos;
    this.inProgressTodo = todos.find(t => t.status === 'in_progress') || null;
  }
  // ... 现有处理逻辑
}
```

- [ ] **Step 4: 在工具栏中渲染 TodoProgressPopup**

在对话框的工具栏区域添加 TodoProgressPopup：

```typescript
// 在 renderDialogToolbar 方法中添加
private renderDialogToolbar() {
  return html`
    <div class="dialog-toolbar">
      <!-- 现有的工具栏内容 -->

      <todo-progress-popup
        .todos=${this.currentTodos}
      ></todo-progress-popup>
    </div>
  `;
}
```

- [ ] **Step 5: 在消息中渲染 ChatTodoList**

在消息渲染逻辑中添加 ChatTodoList：

```typescript
// 在 renderDialogMessage 方法中添加处理
private renderDialogMessage(message: DialogMessage) {
  if (message.kind === 'tool') {
    // ... 现有的工具消息处理

    // 如果是 todo_management，渲染 ChatTodoList
    if (message.toolName === 'todo_management' && message.changes) {
      const todos: TodoItem[] = message.changes.map(change => ({
        content: change.content || '',
        status: change.action as TodoStatus,
      }));

      return html`
        <chat-todo-list
          .todos=${todos}
          .expanded=${false}
        ></chat-todo-list>
      `;
    }
  }
  // ... 其他消息类型处理
}
```

- [ ] **Step 6: 验证集成**

运行 TypeScript 编译器验证：

```bash
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 7: 提交主组件集成**

```bash
git add src/kanban-watcher-card.ts
git commit -m "feat: integrate TodoProgressPopup and ChatTodoList into main card"
```

---

## Chunk 6: 样式和优化

### Task 6: 添加样式和优化

**Files:**
- Modify: `src/styles.ts`

- [ ] **Step 1: 添加 todo 相关的全局样式**

在 `src/styles.ts` 中添加：

```typescript
export const todoStyles = css`
  /* Todo 相关的动画和过渡效果 */
  @keyframes todoSlideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .todo-animation {
    animation: todoSlideIn 0.3s ease-out;
  }
`;
```

- [ ] **Step 2: 优化响应式布局**

在 `src/styles.ts` 中添加响应式样式：

```typescript
export const todoResponsiveStyles = css`
  @media (max-width: 600px) {
    todo-progress-popup .todo-popover {
      width: 250px;
      right: -50px;
    }
  }
`;
```

- [ ] **Step 3: 提交样式优化**

```bash
git add src/styles.ts
git commit -m "feat: add todo styles and responsive layout"
```

---

## Chunk 7: 端到端测试

### Task 7: 创建端到端测试

**Files:**
- Create: `tests/todo-integration.test.ts`

- [ ] **Step 1: 创建集成测试**

创建 `tests/todo-integration.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './kanban-watcher-card';
import type { KanbanWatcherCard } from '../src/kanban-watcher-card';

describe('Todo Integration', () => {
  let element: KanbanWatcherCard;

  beforeEach(async () => {
    element = await fixture(html`
      <kanban-watcher-card
        .hass=${{}}
        .config=${{ entity: 'sensor.test' }}
      ></kanban-watcher-card>
    `);
    await element.updateComplete;
  });

  it('should render TodoProgressPopup in dialog toolbar', async () => {
    // Open dialog
    element.openDialog(element.workspaces[0]);
    await element.updateComplete;

    const todoPopup = element.shadowRoot?.querySelector('todo-progress-popup');
    expect(todoPopup).toBeDefined();
  });

  it('should update todos when receiving todo_management message', async () => {
    const todos = [
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'in_progress' },
    ];

    // Simulate receiving a message with todos
    element.processMessage({
      tool_info: {
        action_type: {
          action: 'todo_management',
          todos,
        },
      },
    });
    await element.updateComplete;

    expect(element.currentTodos).toEqual(todos);
    expect(element.inProgressTodo?.content).toBe('Task 2');
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
npm test tests/todo-integration.test.ts
```

Expected: PASS - All tests pass

- [ ] **Step 3: 提交集成测试**

```bash
git add tests/todo-integration.test.ts
git commit -m "test: add todo integration tests"
```

---

## Chunk 8: 文档和清理

### Task 8: 更新文档和清理

**Files:**
- Modify: `README.md`
- Create: `docs/todo-list-feature.md`

- [ ] **Step 1: 更新 README**

在 `README.md` 中添加 Todo List 功能说明：

```markdown
## Todo List 功能

Kanban Watcher 现在支持待办事项显示功能：

- **工具栏按钮**：显示当前待办进度，点击查看详细列表
- **对话中显示**：在消息中展示待办事项更新
- **状态图标**：支持已完成(✓)、进行中(⊙)、已取消(○)等状态
- **进度显示**：实时显示完成进度和百分比
```

- [ ] **Step 2: 创建功能文档**

创建 `docs/todo-list-feature.md`：

```markdown
# Todo List 功能文档

## 概述

Todo List 功能允许用户在 Kanban Watcher 中查看和管理待办事项。

## 功能特性

### TodoProgressPopup（工具栏按钮）

- 位置：输入框右侧工具栏
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

- `completed` - 已完成（✓）
- `in_progress` - 进行中（⊙）
- `cancelled` - 已取消（○）
- `pending` - 待处理（○）

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
```

- [ ] **Step 3: 最终提交**

```bash
git add README.md docs/todo-list-feature.md
git commit -m "docs: add todo list feature documentation"
```

- [ ] **Step 4: 创建最终提交**

```bash
git add -A
git commit -m "feat: complete todo list integration

- Add TodoProgressPopup and ChatTodoList components
- Integrate with tool call handling
- Add comprehensive tests
- Update documentation

Closes #issue-number"
```

---

## 执行说明

完成计划后，运行完整的测试套件：

```bash
npm test
```

确保所有测试通过，然后构建项目：

```bash
npm run build
```

验证构建产物无错误。

**计划完成！准备好执行了吗？**
