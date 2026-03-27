import { LitElement, html, css, nothing } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import type { WorkspaceTodo } from "../types";
import {
  fetchWorkspaceTodos,
  createWorkspaceTodo,
  updateWorkspaceTodo,
  deleteWorkspaceTodo,
} from "../lib/http-api";

const ICONS = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  restore: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
};

export class WorkspaceTodoPanel extends LitElement {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .todo-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.15s ease-out forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .todo-modal {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      width: 480px;
      max-height: 600px;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.2s ease-out forwards;
      overflow: hidden;
    }

    .todo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .todo-title {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0;
    }

    .todo-close {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.15s;
    }

    .todo-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    .todo-add-row {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .todo-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #f1f5f9;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }

    .todo-input:focus {
      border-color: rgba(59, 130, 246, 0.5);
    }

    .todo-input::placeholder {
      color: #64748b;
    }

    .todo-add-btn {
      padding: 8px 14px;
      border: none;
      border-radius: 8px;
      background: #3b82f6;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }

    .todo-add-btn:hover {
      background: #2563eb;
    }

    .todo-add-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .todo-list-area {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .todo-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      transition: background 0.15s;
      cursor: default;
    }

    .todo-item:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .todo-checkbox {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }

    .todo-checkbox:hover {
      border-color: #3b82f6;
    }

    .todo-checkbox:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .todo-checkbox:disabled:hover {
      border-color: rgba(255, 255, 255, 0.25);
    }

    .todo-checkbox svg {
      display: none;
    }

    .todo-content-text {
      flex: 1;
      font-size: 13px;
      color: #f1f5f9;
      line-height: 1.5;
      word-break: break-word;
      min-width: 0;
    }

    .todo-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }

    .todo-item:hover .todo-actions {
      opacity: 1;
    }

    .todo-action-btn {
      width: 26px;
      height: 26px;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }

    .todo-action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    .todo-action-btn.btn-delete:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }

    .todo-action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }

    .todo-edit-input {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid rgba(59, 130, 246, 0.5);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
      font-size: 13px;
      outline: none;
    }

    .todo-archived-section {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .todo-archived-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      cursor: pointer;
      color: #64748b;
      font-size: 12px;
      user-select: none;
      transition: color 0.15s;
    }

    .todo-archived-header:hover {
      color: #94a3b8;
    }

    .todo-archived-header .chevron-icon {
      transition: transform 0.2s;
    }

    .todo-archived-header.expanded .chevron-icon {
      transform: rotate(180deg);
    }

    .todo-archived-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      color: #64748b;
      font-size: 13px;
    }

    .todo-archived-item .todo-content-text {
      color: #64748b;
      text-decoration: line-through;
    }

    .todo-archived-checkbox {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(100, 116, 139, 0.4);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .todo-archived-checkbox svg {
      display: block;
      color: #64748b;
    }

    .todo-restore-btn {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .todo-restore-btn:hover {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }

    .todo-empty {
      padding: 40px 20px;
      text-align: center;
      color: #475569;
      font-size: 13px;
    }

    .todo-loading {
      padding: 32px 20px;
      text-align: center;
      color: #64748b;
      font-size: 13px;
    }

    @media (max-width: 640px) {
      .todo-modal {
        width: 100vw;
        height: 80vh;
        max-height: 80vh;
        border-radius: 0;
        padding: 0;
      }
    }
  `;

  static properties = {
    workspaceId: { type: String, attribute: false },
    baseUrl: { type: String, attribute: false },
    apiKey: { type: String, attribute: false },
    open: { type: Boolean, reflect: true },
    isRunning: { type: Boolean, attribute: false },
  };

  workspaceId = "";
  baseUrl = "";
  apiKey = "";
  open = false;
  isRunning = false;

  private todos: WorkspaceTodo[] = [];
  private pendingTodos: WorkspaceTodo[] = [];
  private completedTodos: WorkspaceTodo[] = [];
  private newTodoContent = "";
  private editingTodoId: string | null = null;
  private editText = "";
  private showArchived = false;
  private isLoading = false;
  private isAdding = false;
  private editCancelled = false;

  updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("open") && this.open) {
      this.loadTodos();
    }
  }

  private async loadTodos() {
    if (!this.workspaceId) return;
    this.isLoading = true;

    try {
      const response = await fetchWorkspaceTodos({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        includeCompleted: true,
      });

      this.todos = response.todos ?? [];
      this.splitTodos();
      this.emitCountChange();
    } catch {
      this.todos = [];
      this.pendingTodos = [];
      this.completedTodos = [];
    } finally {
      this.isLoading = false;
      this.requestUpdate();
    }
  }

  private splitTodos() {
    this.pendingTodos = this.todos.filter((t) => !t.is_completed);
    this.completedTodos = this.todos.filter((t) => t.is_completed);
  }

  private emitCountChange() {
    this.dispatchEvent(
      new CustomEvent<{ count: number }>("todo-count-change", {
        detail: { count: this.pendingTodos.length },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleAddClick = async () => {
    const content = this.newTodoContent.trim();
    if (!content || this.isAdding) return;

    this.isAdding = true;
    this.requestUpdate();
    try {
      await createWorkspaceTodo({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        content,
      });
      this.newTodoContent = "";
      await this.loadTodos();
    } catch {
      // silently fail on add error
    } finally {
      this.isAdding = false;
      this.requestUpdate();
    }
  };

  private handleInputKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.handleAddClick();
    }
  };

  private handleInputChange = (e: Event) => {
    this.newTodoContent = (e.target as HTMLInputElement).value;
    this.requestUpdate();
  };

  private handleToggleComplete = (todo: WorkspaceTodo) => {
    if (this.isRunning) return;
    this.dispatchEvent(
      new CustomEvent<{ content: string; todoId: string }>("todo-selected", {
        detail: { content: todo.content, todoId: todo.id },
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private handleDelete = async (todo: WorkspaceTodo) => {
    try {
      await deleteWorkspaceTodo({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        todoId: todo.id,
      });
      await this.loadTodos();
    } catch {
      // silently fail
    }
  };

  private handleStartEdit = (todo: WorkspaceTodo) => {
    this.editCancelled = false;
    this.editingTodoId = todo.id;
    this.editText = todo.content;
    this.requestUpdate();
  };

  private handleCancelEdit = () => {
    this.editingTodoId = null;
    this.editText = "";
    this.requestUpdate();
  };

  private handleSaveEdit = async (todo: WorkspaceTodo) => {
    if (this.editCancelled) {
      this.editCancelled = false;
      return;
    }
    const content = this.editText.trim();
    if (!content) return;

    try {
      await updateWorkspaceTodo({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        todoId: todo.id,
        content,
        isCompleted: todo.is_completed,
      });
      this.editingTodoId = null;
      this.editText = "";
      await this.loadTodos();
    } catch {
      // silently fail
    }
  };

  private handleEditKeydown = (e: KeyboardEvent, todo: WorkspaceTodo) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.handleSaveEdit(todo);
    } else if (e.key === "Escape") {
      this.editCancelled = true;
      this.handleCancelEdit();
    }
  };

  private handleEditInput = (e: Event) => {
    this.editText = (e.target as HTMLInputElement).value;
  };

  private handleRestore = async (todo: WorkspaceTodo) => {
    try {
      await updateWorkspaceTodo({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        todoId: todo.id,
        content: todo.content,
        isCompleted: false,
      });
      await this.loadTodos();
    } catch {
      // silently fail
    }
  };

  private toggleArchived = () => {
    this.showArchived = !this.showArchived;
    this.requestUpdate();
  };

  private handleClose = () => {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("close", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("todo-overlay")) {
      this.handleClose();
    }
  };

  private renderPendingItem(todo: WorkspaceTodo) {
    const isEditing = this.editingTodoId === todo.id;

    return html`
      <div class="todo-item">
        <div
          class="todo-checkbox"
          role="checkbox"
          aria-checked="false"
          tabindex="0"
          title="发送并完成"
          ?disabled=${this.isRunning}
          @click=${() => this.handleToggleComplete(todo)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this.handleToggleComplete(todo);
            }
          }}
        ></div>
        ${isEditing
          ? html`
              <input
                class="todo-edit-input"
                type="text"
                .value=${this.editText}
                @input=${this.handleEditInput}
                @keydown=${(e: KeyboardEvent) => this.handleEditKeydown(e, todo)}
                @blur=${() => this.handleSaveEdit(todo)}
              />
            `
          : html`<span class="todo-content-text">${todo.content}</span>`}
        <div class="todo-actions">
          ${isEditing
            ? nothing
            : html`
                <button
                  class="todo-action-btn"
                  title="编辑"
                  type="button"
                  @click=${() => this.handleStartEdit(todo)}
                >
                  ${unsafeSVG(ICONS.edit)}
                </button>
                <button
                  class="todo-action-btn btn-delete"
                  title="删除"
                  type="button"
                  @click=${() => this.handleDelete(todo)}
                >
                  ${unsafeSVG(ICONS.trash)}
                </button>
              `}
        </div>
      </div>
    `;
  }

  private renderArchivedItem(todo: WorkspaceTodo) {
    return html`
      <div class="todo-archived-item">
        <div class="todo-archived-checkbox">
          ${unsafeSVG(ICONS.check)}
        </div>
        <span class="todo-content-text">${todo.content}</span>
        <button
          class="todo-restore-btn"
          title="恢复"
          type="button"
          @click=${() => this.handleRestore(todo)}
        >
          ${unsafeSVG(ICONS.restore)}
        </button>
      </div>
    `;
  }

  render() {
    if (!this.open) return nothing;

    const hasCompleted = this.completedTodos.length > 0;

    return html`
      <div class="todo-overlay" @click=${this.handleOverlayClick}>
        <div class="todo-modal">
          <div class="todo-header">
            <h3 class="todo-title">待办事项</h3>
            <button
              class="todo-close"
              type="button"
              aria-label="关闭"
              @click=${this.handleClose}
            >
              &#x2715;
            </button>
          </div>

          <div class="todo-add-row">
            <input
              class="todo-input"
              type="text"
              placeholder="添加新待办..."
              .value=${this.newTodoContent}
              @input=${this.handleInputChange}
              @keydown=${this.handleInputKeydown}
            />
            <button
              class="todo-add-btn"
              type="button"
              ?disabled=${!this.newTodoContent.trim() || this.isAdding}
              @click=${this.handleAddClick}
            >
              添加
            </button>
          </div>

          <div class="todo-list-area">
            ${this.isLoading
              ? html`<div class="todo-loading">加载中...</div>`
              : this.pendingTodos.length === 0 && !hasCompleted
                ? html`<div class="todo-empty">暂无待办事项</div>`
                : html`
                    ${this.pendingTodos.map((t) => this.renderPendingItem(t))}
                    ${hasCompleted
                      ? html`
                          <div class="todo-archived-section">
                            <div
                              class="todo-archived-header ${this.showArchived
                                ? "expanded"
                                : ""}"
                              @click=${this.toggleArchived}
                            >
                              <span class="chevron-icon">
                                ${unsafeSVG(ICONS.chevronDown)}
                              </span>
                              <span>已完成 (${this.completedTodos.length})</span>
                            </div>
                            ${this.showArchived
                              ? this.completedTodos.map((t) =>
                                  this.renderArchivedItem(t),
                                )
                              : nothing}
                          </div>
                        `
                      : nothing}
                  `}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("workspace-todo-panel", WorkspaceTodoPanel);
