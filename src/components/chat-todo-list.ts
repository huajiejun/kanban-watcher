import { LitElement, html, css, nothing } from 'lit';
import type { TodoItem } from '../types';

export class ChatTodoList extends LitElement {
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
      list-style: none;
      padding: 0;
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

  static properties = {
    todos: { state: true },
    expanded: { state: true },
  };

  todos: TodoItem[] = [];
  expanded = false;

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

// 注册自定义元素
customElements.define('chat-todo-list', ChatTodoList);
