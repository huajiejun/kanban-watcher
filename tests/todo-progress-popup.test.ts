// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import '../src/components/todo-progress-popup';
import type { TodoItem } from '../src/types';

type TodoProgressPopupElement = HTMLElement & {
  todos: TodoItem[];
  open: boolean;
  updateComplete: Promise<unknown>;
};

describe('TodoProgressPopup', () => {
  it('should render empty state when no todos', async () => {
    const element = document.createElement('todo-progress-popup') as TodoProgressPopupElement;
    element.todos = [];
    document.body.appendChild(element);
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('button');
    expect(button?.disabled).toBe(true);

    document.body.removeChild(element);
  });

  it('should calculate progress correctly', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'in_progress' },
      { content: 'Task 3', status: 'pending' },
    ];

    const element = document.createElement('todo-progress-popup') as TodoProgressPopupElement;
    element.todos = todos;
    document.body.appendChild(element);
    await element.updateComplete;

    // Should show 1/3 completed
    const progressText = element.shadowRoot?.querySelector('.progress-text');
    expect(progressText?.textContent).toContain('1/3');

    document.body.removeChild(element);
  });

  it('should show popover on click', async () => {
    const todos: TodoItem[] = [
      { content: 'Task 1', status: 'completed' },
    ];

    const element = document.createElement('todo-progress-popup') as TodoProgressPopupElement;
    element.todos = todos;
    document.body.appendChild(element);
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('button');
    button?.click();
    await element.updateComplete;

    const popover = element.shadowRoot?.querySelector('.todo-popover');
    expect(popover).toBeDefined();

    document.body.removeChild(element);
  });
});
