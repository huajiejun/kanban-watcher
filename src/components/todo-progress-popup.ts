import { LitElement, html, css, nothing } from 'lit';
import type { TodoItem } from '../types';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

interface TodoHistoryEntry {
  workspaceId: string;
  workspaceName: string;
  todos: TodoItem[];
  timestamp: number;
  completedCount: number;
  totalCount: number;
}

// SVG Icons (based on Phosphor Icons and Lucide)
const ICONS = {
  listChecks: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216 128a8 8 0 0 1-8 8H128a8 8 0 0 1 0-16h80A8 8 0 0 1 216 128ZM128 72h80a8 8 0 0 0 0-16H128a8 8 0 0 0 0 16Zm80 112H128a8 8 0 0 0 0 16h80a8 8 0 0 0 0-16ZM82.34 42.34L56 68.69 45.66 58.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32 0l32-32a8 8 0 0 0-11.32-11.32Zm0 64L56 132.69 45.66 122.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32 0l32-32a8 8 0 0 0-11.32-11.32Zm0 64L56 196.69l-10.34-10.35a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32 0l32-32a8 8 0 0 0-11.32-11.32Z"/>
  </svg>`,

  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>`,

  circle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
  </svg>`,

  circleDot: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
  </svg>`,

  caretDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
    <path d="M213.66 101.66a8 8 0 0 0-11.32 0L128 175.94 53.66 101.66a8 8 0 0 0-11.32 11.32l80 80a8 8 0 0 0 11.32 0l80-80a8 8 0 0 0 0-11.32Z"/>
  </svg>`,
};

export class TodoProgressPopup extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .todo-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.9);
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }

    .todo-button:hover {
      background: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 1);
    }

    .todo-button:active {
      transform: scale(0.95);
    }

    .todo-button.empty {
      opacity: 0.6;
    }

    .todo-button.empty:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.95);
    }

    .todo-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-dot {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #3b82f6;
    }

    .progress-dot.completed {
      background: #22c55e;
    }

    .todo-popover {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      width: 360px;
      max-height: 500px;
      overflow: hidden;
      background: rgb(30, 30, 30);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      display: none;
      animation: slideIn 0.2s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .todo-popover.open {
      display: flex;
      flex-direction: column;
    }

    .popover-header {
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.02);
    }

    .popover-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 12px;
    }

    .popover-progress {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .progress-text {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      white-space: nowrap;
    }

    .progress-bar {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .progress-fill.completed {
      background: linear-gradient(90deg, #22c55e, #4ade80);
    }

    .popover-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.2);
    }

    .popover-tab {
      flex: 1;
      padding: 10px 16px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }

    .popover-tab:hover {
      color: rgba(255, 255, 255, 0.7);
      background: rgba(255, 255, 255, 0.05);
    }

    .popover-tab.active {
      color: #60a5fa;
      font-weight: 600;
    }

    .popover-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #3b82f6;
    }

    .tab-content {
      display: none;
      overflow-y: auto;
      max-height: 350px;
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
      gap: 12px;
      padding: 10px 16px;
      transition: background 0.2s;
    }

    .todo-item:hover {
      background: rgba(255, 255, 255, 0.03);
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
      color: #22c55e;
    }

    .status-icon.in_progress {
      color: #3b82f6;
    }

    .status-icon.cancelled {
      color: rgba(255, 255, 255, 0.3);
    }

    .status-icon.pending {
      color: rgba(255, 255, 255, 0.3);
    }

    .todo-content {
      flex: 1;
      font-size: 13px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
      word-break: break-word;
    }

    .todo-content.cancelled {
      text-decoration: line-through;
      color: rgba(255, 255, 255, 0.3);
    }

    .history-entry {
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
      color: rgba(255, 255, 255, 0.9);
    }

    .history-time {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
    }

    .history-progress {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .history-progress.completed {
      color: #22c55e;
    }

    .empty-state {
      padding: 48px 16px;
      text-align: center;
      color: rgba(255, 255, 255, 0.3);
      font-size: 13px;
    }

    .clear-history {
      padding: 12px 16px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .clear-history button {
      background: none;
      border: none;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      padding: 4px 8px;
      transition: all 0.2s;
    }

    .clear-history button:hover {
      color: #f87171;
      text-decoration: underline;
    }

    .more-items {
      padding: 8px 16px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      text-align: center;
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
    if (s === 'completed') return ICONS.check;
    if (s === 'in_progress' || s === 'in-progress') return ICONS.circleDot;
    if (s === 'cancelled') return ICONS.circle;
    return ICONS.circle;
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

    const { completed, total } = this.getProgress();
    const entry: TodoHistoryEntry = {
      workspaceId: this.workspaceId,
      workspaceName: this.workspaceName || this.workspaceId,
      todos: this.todos,
      timestamp: Date.now(),
      completedCount: completed,
      totalCount: total,
    };

    this.history = this.history.filter(h => h.workspaceId !== this.workspaceId);
    this.history.unshift(entry);
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
        <span class="todo-icon">${unsafeSVG(ICONS.listChecks)}</span>
        ${!isEmpty
          ? html`
              <span class="progress-dot ${percentage === 100 ? 'completed' : ''}"></span>
            `
          : nothing}
      </button>

      <div class="todo-popover ${this.open ? 'open' : ''}">
        <div class="popover-header">
          <div class="popover-title">待办事项</div>
          ${!isEmpty
            ? html`
                <div class="popover-progress">
                  <span class="progress-text">${completed}/${total} 完成</span>
                  <div class="progress-bar">
                    <div
                      class="progress-fill ${percentage === 100 ? 'completed' : ''}"
                      style="width: ${percentage}%"
                    ></div>
                  </div>
                </div>
              `
            : nothing}
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
                <div class="todo-list">
                  ${this.todos.map(
                    todo => html`
                      <div class="todo-item">
                        <span
                          class="status-icon ${this.getStatusClass(todo.status)}"
                        >
                          ${unsafeSVG(this.getStatusIcon(todo.status))}
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
                                ${unsafeSVG(this.getStatusIcon(todo.status))}
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
                              <div class="more-items">
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
