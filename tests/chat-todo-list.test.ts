// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import '../src/components/chat-todo-list';
import type { TodoItem } from '../src/types';

type ChatTodoListElement = HTMLElement & {
  todos: TodoItem[];
  expanded: boolean;
  updateComplete: Promise<unknown>;
};

describe('ChatTodoList', () => {
  it('should render todo list header', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = document.createElement('chat-todo-list') as ChatTodoListElement;
    element.todos = todos;
    document.body.appendChild(element);
    await element.updateComplete;

    const header = element.shadowRoot?.querySelector('.todo-header');
    expect(header).toBeDefined();
    expect(header?.textContent).toContain('更新待办');

    document.body.removeChild(element);
  });

  it('should toggle expansion on click', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = document.createElement('chat-todo-list') as ChatTodoListElement;
    element.todos = todos;
    element.expanded = false;
    document.body.appendChild(element);
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

    document.body.removeChild(element);
  });

  it('should render todo items with correct status icons', async () => {
    const todos: TodoItem[] = [
      { content: 'Completed task', status: 'completed' },
      { content: 'In progress task', status: 'in_progress' },
      { content: 'Cancelled task', status: 'cancelled' },
      { content: 'Pending task', status: 'pending' },
    ];

    const element = document.createElement('chat-todo-list') as ChatTodoListElement;
    element.todos = todos;
    element.expanded = true;
    document.body.appendChild(element);
    await element.updateComplete;

    const items = element.shadowRoot?.querySelectorAll('.todo-item');
    expect(items?.length).toBe(4);

    // Check cancelled task has strikethrough
    const cancelledContent = element.shadowRoot?.querySelector('.todo-content.cancelled');
    expect(cancelledContent).toBeDefined();

    document.body.removeChild(element);
  });
});
