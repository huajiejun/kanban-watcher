import { LitElement, html, css, nothing } from 'lit';
import type { TodoItem } from '../types';

interface TodoHistoryEntry {
  workspaceId: string;
  workspaceName: string;
  todos: TodoItem[];
  timestamp: number;
  completedCount: number;
  totalCount: number;
}

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

    .todo-button:hover {
      background: #f5f5f5;
    }

    .todo-button.empty {
      opacity: 0.6;
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
      width: 350px;
      max-height: 500px;
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
      background: #f9f9f9;
    }

    .popover-tabs {
      display: flex;
      border-bottom: 1px solid #e0e0e0;
    }

    .popover-tab {
      flex: 1;
      padding: 8px 16px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 13px;
      color: #666;
      transition: all 0.2s;
    }

    .popover-tab:hover {
      background: #f5f5f5;
    }

    .popover-tab.active {
      color: #2196f3;
      border-bottom: 2px solid #2196f3;
      font-weight: 600;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
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

    .history-entry {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .history-entry:last-child {
      border-bottom: none;
    }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .history-workspace {
      font-weight: 600;
      font-size: 13px;
      color: #333;
    }

    .history-time {
      font-size: 11px;
      color: #999;
    }

    .history-progress {
      font-size: 12px;
      color: #666;
      margin-bottom: 8px;
    }

    .history-progress.completed {
      color: #4caf50;
    }

    .empty-state {
      padding: 24px 16px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }

    .clear-history {
      padding: 8px 16px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }

    .clear-history button {
      background: none;
      border: none;
      color: #f44336;
      cursor: pointer;
      font-size: 12px;
      padding: 4px 8px;
    }

    .clear-history button:hover {
      text-decoration: underline;
    }
  `;

  private todos: TodoItem[] = [];
  private workspaceId: string = '';
  private workspaceName: string = '';
  private open = false;
  private activeTab: 'current' | 'history' = 'current';
  private history: TodoHistoryEntry[] = [];

  static properties = {
    todos: { type: Array },
    workspaceId: { type: String },
    workspaceName: { type: String },
    open: { state: true },
    activeTab: { state: true },
    history: { state: true },
  };

  constructor() {
    super();
    this.loadHistory();
  }

  private handleToggle() {
    this.open = !this.open;
    if (this.open && this.todos.length > 0) {
      this.saveToHistory();
    }
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

  private loadHistory() {
    try {
      const stored = localStorage.getItem('todo-history');
      if (stored) {
        this.history = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load todo history:', e);
      this.history = [];
    }
  }

  private saveToHistory() {
    if (this.todos.length === 0 || !this.workspaceId) return;

    const { completed, total, percentage } = this.getProgress();
    const entry: TodoHistoryEntry = {
      workspaceId: this.workspaceId,
      workspaceName: this.workspaceName || this.workspaceId,
      todos: this.todos,
      timestamp: Date.now(),
      completedCount: completed,
      totalCount: total,
    };

    // 移除相同工作区的旧记录
    this.history = this.history.filter(h => h.workspaceId !== this.workspaceId);

    // 添加新记录到开头
    this.history.unshift(entry);

    // 只保留最近 20 条记录
    this.history = this.history.slice(0, 20);

    try {
      localStorage.setItem('todo-history', JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save todo history:', e);
    }
  }

  private clearHistory() {
    this.history = [];
    try {
      localStorage.removeItem('todo-history');
    } catch (e) {
      console.error('Failed to clear todo history:', e);
    }
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private switchTab(tab: 'current' | 'history') {
    this.activeTab = tab;
  }

  render() {
    const { completed, total, percentage } = this.getProgress();
    const isEmpty = this.todos.length === 0;
    const hasHistory = this.history.length > 0;

    return html`
      <button
        class="todo-button ${isEmpty ? 'empty' : ''}"
        @click=${this.handleToggle}
      >
        <span class="todo-icon">☑</span>
        ${!isEmpty
          ? html`<span class="progress-text">${completed}/${total}</span>`
          : nothing}
      </button>

      <div class="todo-popover ${this.open ? 'open' : ''}">
        <div class="popover-header">
          <div>待办事项</div>
        </div>

        <div class="popover-tabs">
          <button
            class="popover-tab ${this.activeTab === 'current' ? 'active' : ''}"
            @click=${() => this.switchTab('current')}
          >
            当前任务
          </button>
          <button
            class="popover-tab ${this.activeTab === 'history' ? 'active' : ''}"
            @click=${() => this.switchTab('history')}
          >
            历史记录 ${hasHistory ? `(${this.history.length})` : ''}
          </button>
        </div>

        <div class="tab-content ${this.activeTab === 'current' ? 'active' : ''}">
          ${!isEmpty
            ? html`
                <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0;">
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
              `
            : html`
                <div class="empty-state">
                  暂无待办事项
                </div>
              `}
        </div>

        <div class="tab-content ${this.activeTab === 'history' ? 'active' : ''}">
          ${hasHistory
            ? html`
                ${this.history.map(
                  entry => html`
                    <div class="history-entry">
                      <div class="history-header">
                        <div class="history-workspace">${entry.workspaceName}</div>
                        <div class="history-time">${this.formatTime(entry.timestamp)}</div>
                      </div>
                      <div class="history-progress ${entry.completedCount === entry.totalCount ? 'completed' : ''}">
                        ${entry.completedCount}/${entry.totalCount} 完成
                        ${entry.completedCount === entry.totalCount ? '✓' : ''}
                      </div>
                      <div class="todo-list">
                        ${entry.todos.slice(0, 3).map(
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
                        ${entry.todos.length > 3
                          ? html`
                              <div style="padding: 4px 16px; font-size: 12px; color: #999;">
                                还有 ${entry.todos.length - 3} 项...
                              </div>
                            `
                          : nothing}
                      </div>
                    </div>
                  `
                )}
                <div class="clear-history">
                  <button @click=${this.clearHistory}>清空历史记录</button>
                </div>
              `
            : html`
                <div class="empty-state">
                  暂无历史记录
                </div>
              `}
        </div>
      </div>
    `;
  }
}

// Register the custom element
customElements.define('todo-progress-popup', TodoProgressPopup);
