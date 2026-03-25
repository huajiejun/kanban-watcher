import { LitElement, html, css, nothing } from 'lit';
import type { TodoItem } from '../types';

export class TodoProgressPopup extends LitElement {
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

  static properties = {
    todos: { state: true },
    open: { state: true },
  };

  todos: TodoItem[] = [];
  open = false;

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

// Register the custom element
customElements.define('todo-progress-popup', TodoProgressPopup);
