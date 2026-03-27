import { LitElement, html, nothing } from "lit";

import { detectDialogEditLanguage, renderDialogMessage } from "./dialog-message-renderer";
import { cardStyles } from "../styles";
import type { DialogMessage } from "../lib/dialog-messages";
import type { WorkspaceQueueStatusResponse } from "../types";
import "./workspace-todo-panel";

export type ConversationPaneAction = "send" | "queue" | "stop";
export type ConversationPaneMessage = DialogMessage;
export type DevServerState = "idle" | "starting" | "running" | "stopping";

export class WorkspaceConversationPane extends LitElement {
  static styles = cardStyles;

  static properties = {
    workspaceName: { attribute: false },
    workspaceId: { attribute: false },
    workspacePath: { attribute: false },
    resolveWorkspacePath: { attribute: false },
    messages: { attribute: false },
    quickButtons: { attribute: false },
    messageDraft: { attribute: false },
    currentFeedback: { attribute: false },
    queueStatus: { attribute: false },
    renderMessage: { attribute: false },
    quickButtonsTemplate: { attribute: false },
    expandedToolMessageKeys: { attribute: false },
    smoothRevealMessageKey: { attribute: false },
    statusAccentClass: { attribute: false },
    isRunning: { type: Boolean },
    canQueue: { type: Boolean },
    devServerState: { attribute: false },
    showWorkspaceWebPreview: { type: Boolean },
    showFileBrowser: { type: Boolean },
    todoBaseUrl: { attribute: false },
    todoApiKey: { attribute: false },
    todoPendingCount: { attribute: false },
    showTodoPanel: { type: Boolean, state: true },
    quickButtonsExpanded: { state: true },
    quickButtonsOverflowing: { state: true },
  };

  workspaceName = "";
  workspaceId = "";
  workspacePath = "";
  resolveWorkspacePath?: () => Promise<string>;
  messages: ConversationPaneMessage[] = [];
  quickButtons: string[] = [];
  messageDraft = "";
  currentFeedback = "";
  queueStatus?: WorkspaceQueueStatusResponse;
  renderMessage?: (message: ConversationPaneMessage) => unknown;
  quickButtonsTemplate?: unknown;
  expandedToolMessageKeys = new Set<string>();
  smoothRevealMessageKey?: string;
  statusAccentClass = "is-idle";
  isRunning = false;
  canQueue = false;
  devServerState: DevServerState = "idle";
  showWorkspaceWebPreview = false;
  showFileBrowser = false;
  todoBaseUrl = "";
  todoApiKey = "";
  todoPendingCount = 0;
  private showTodoPanel = false;
  private resolvedWorkspacePath = "";
  private quickButtonsExpanded = false;
  private quickButtonsOverflowing = false;
  private readonly collapsedQuickButtonsHeight = 36;

  // File Browser 配置
  private readonly FILE_BROWSER_LOCAL_URL = import.meta.env.VITE_FILE_BROWSER_URL || "http://127.0.0.1:9394";
  private readonly FILE_BROWSER_REMOTE_URL = import.meta.env.VITE_FILE_BROWSER_REMOTE_URL || "https://file.huajiejun.cn:999";

  protected render() {
    const isQueued = this.queueStatus?.status === "queued";
    const isDevServerRunning = this.devServerState === "running" || this.devServerState === "stopping";
    const devServerToggleSymbol = isDevServerRunning ? "❚❚" : "▶";
    const isDevServerToggleDisabled =
      this.devServerState === "starting" || this.devServerState === "stopping";

    return html`
      <section class="workspace-pane-shell ${this.statusAccentClass}">
      <div class="dialog-header">
        <div class="dialog-heading">
          <h2 class="dialog-title">${this.workspaceName}</h2>
        </div>
        <div class="dialog-header-actions">
          <button
            class="dialog-action-icon"
            type="button"
            aria-label="待办事项"
            title="待办事项"
            @click=${this.toggleTodoPanel}
          >
            📋${this.todoPendingCount > 0
              ? html`<span class="todo-badge">${this.todoPendingCount}</span>`
              : nothing}
          </button>
          <button
            class="dialog-action-icon"
            type="button"
            aria-label="文件"
            title="文件浏览器"
            @click=${this.toggleFileBrowser}
          >
            📁
          </button>
          ${this.showWorkspaceWebPreview
            ? html`
                <button
                  class="dialog-web-preview"
                  type="button"
                  aria-label="打开快捷网页"
                  @click=${this.handleWorkspaceWebPreviewToggle}
                >
                  <svg
                    class="dialog-web-preview-icon"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M10 2.25a7.75 7.75 0 1 1 0 15.5a7.75 7.75 0 0 1 0-15.5Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                    />
                    <path
                      d="M10 2.75c2.05 2.08 3.2 4.66 3.2 7.25S12.05 15.17 10 17.25c-2.05-2.08-3.2-4.66-3.2-7.25S7.95 4.83 10 2.75Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                    />
                    <path
                      d="M3 10h14M4.6 5.5h10.8M4.6 14.5h10.8"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                    />
                  </svg>
                </button>
              `
            : nothing}
          <button
            class="dialog-dev-server-toggle"
            type="button"
            data-dev-server-state=${this.devServerState}
            ?disabled=${isDevServerToggleDisabled}
            aria-label=${isDevServerRunning ? "暂停开发服务器" : "启动开发服务器"}
            @click=${this.handleDevServerToggle}
          >
            ${devServerToggleSymbol}
          </button>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            @click=${this.handleClose}
          >
            ✕
          </button>
        </div>
      </div>

      ${this.showFileBrowser ? this.renderFileBrowser() : nothing}

      <workspace-todo-panel
        .workspaceId=${this.workspaceId}
        .baseUrl=${this.todoBaseUrl}
        .apiKey=${this.todoApiKey}
        .open=${this.showTodoPanel}
        .isRunning=${this.isRunning}
        @todo-selected=${this.handleTodoSelected}
        @todo-count-change=${this.handleTodoCountChange}
        @close=${this.closeTodoPanel}
      ></workspace-todo-panel>

      <section class="dialog-messages">
        <div class="dialog-panel-title">对话消息</div>
        <div class="message-list">
          ${this.messages.map((message) =>
            this.renderMessage ? this.renderMessage(message) : this.renderEntry(message),
          )}
        </div>
      </section>

      <div class="dialog-composer">
        ${isQueued
          ? html`<div class="queue-banner">消息已排队 - 将在当前运行完成时执行</div>`
          : nothing}
        ${this.renderQuickButtonsArea()}
        <textarea
          class="message-input"
          rows="2"
          placeholder="输入消息"
          .value=${this.messageDraft}
          @input=${this.handleInput}
          @keydown=${this.handleComposerKeydown}
        ></textarea>
        <div class="dialog-actions">
          <button
            class="dialog-action dialog-action-primary"
            type="button"
            @click=${() => this.emitAction(this.isRunning ? "stop" : "send")}
          >
            ${this.isRunning ? "停止" : "发送消息"}
          </button>
          ${this.canQueue
            ? html`
                <button
                  class="dialog-action dialog-action-secondary"
                  type="button"
                  @click=${() => this.emitAction(isQueued ? "stop" : "queue")}
                >
                  ${isQueued ? "取消队列" : "加入队列"}
                </button>
              `
            : nothing}
        </div>
        <div
          class=${this.currentFeedback ? "dialog-feedback" : "dialog-feedback is-empty"}
          aria-live="polite"
        >
          ${this.currentFeedback || "\u00a0"}
        </div>
      </div>
      </section>
    `;
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has("messages")) {
      this.scrollMessagesToBottom();
    }
    if (changedProperties.has("quickButtons") || changedProperties.has("quickButtonsTemplate")) {
      this.quickButtonsExpanded = false;
    }
    if (
      changedProperties.has("quickButtons") ||
      changedProperties.has("quickButtonsTemplate") ||
      changedProperties.has("showFileBrowser")
    ) {
      this.updateQuickButtonsCollapseState();
    }
    if (changedProperties.has("workspaceId") || changedProperties.has("workspacePath")) {
      this.resolvedWorkspacePath = "";
    }
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.handleViewportResize);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.handleViewportResize);
    super.disconnectedCallback();
  }

  focusComposer() {
    const input = this.shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement | null;
    if (!input) {
      return;
    }
    input.focus();
    const cursor = input.value.length;
    input.setSelectionRange(cursor, cursor);
  }

  private renderQuickButtons() {
    if (this.quickButtons.length === 0) {
      return nothing;
    }

    return html`
      <div class="quick-buttons">
        ${this.quickButtons.map((text) => html`
          <button
            class="quick-button is-static"
            type="button"
            @click=${() => this.handleQuickButton(text)}
          >
            ${text}
          </button>
        `)}
      </div>
    `;
  }

  private renderQuickButtonsArea() {
    if (!this.quickButtonsTemplate && this.quickButtons.length === 0) {
      return nothing;
    }

    const shouldCollapse = this.quickButtonsOverflowing && this.isMobileViewport();

    return html`
      <div
        class=${[
          "quick-buttons-region",
          shouldCollapse ? "is-collapsible" : "",
          shouldCollapse && !this.quickButtonsExpanded ? "is-collapsed" : "",
          shouldCollapse && this.quickButtonsExpanded ? "is-expanded" : "",
        ].filter(Boolean).join(" ")}
      >
        <div class="quick-buttons-viewport">
          ${this.quickButtonsTemplate ?? this.renderQuickButtons()}
        </div>
        ${shouldCollapse
          ? html`
              <button
                class="quick-buttons-toggle"
                type="button"
                aria-label=${this.quickButtonsExpanded ? "收起快捷按钮" : "展开快捷按钮"}
                title=${this.quickButtonsExpanded ? "收起快捷按钮" : "展开快捷按钮"}
                @click=${this.toggleQuickButtonsExpanded}
              >
                ${this.quickButtonsExpanded ? "▴" : "▾"}
              </button>
            `
          : nothing}
      </div>
    `;
  }

  private renderEntry(message: ConversationPaneMessage) {
    return renderDialogMessage(message, {
      expandedToolMessageKeys: this.expandedToolMessageKeys,
      onToggleToolMessage: this.toggleToolMessage,
      editLanguage: detectDialogEditLanguage(this.messages),
      smoothRevealMessageKey: this.smoothRevealMessageKey,
    });
  }

  private handleInput(event: Event) {
    this.dispatchEvent(
      new CustomEvent<string>("draft-change", {
        detail: (event.target as HTMLTextAreaElement).value,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleComposerKeydown(event: KeyboardEvent) {
    if (this.isRunning || event.key !== "Enter" || !event.metaKey) {
      return;
    }

    event.preventDefault();
    this.emitAction("send");
  }

  private handleQuickButton(text: string) {
    this.dispatchEvent(
      new CustomEvent<string>("quick-button-click", {
        detail: text,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleViewportResize = () => {
    this.updateQuickButtonsCollapseState();
  };

  private toggleQuickButtonsExpanded = () => {
    this.quickButtonsExpanded = !this.quickButtonsExpanded;
  };

  private isMobileViewport() {
    return window.innerWidth <= 640;
  }

  private updateQuickButtonsCollapseState() {
    const quickButtons = this.shadowRoot?.querySelector(".quick-buttons") as HTMLDivElement | null;
    if (!quickButtons || !this.isMobileViewport()) {
      this.quickButtonsOverflowing = false;
      this.quickButtonsExpanded = false;
      return;
    }

    this.quickButtonsOverflowing = quickButtons.scrollHeight > this.collapsedQuickButtonsHeight;
    if (!this.quickButtonsOverflowing) {
      this.quickButtonsExpanded = false;
    }
  }

  private emitAction(action: ConversationPaneAction) {
    this.dispatchEvent(
      new CustomEvent<ConversationPaneAction>("action-click", {
        detail: action,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleClose = () => {
    this.dispatchEvent(
      new CustomEvent("pane-close", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleDevServerToggle = () => {
    this.dispatchEvent(
      new CustomEvent("dev-server-toggle", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleWorkspaceWebPreviewToggle = () => {
    this.dispatchEvent(
      new CustomEvent("workspace-web-preview-toggle", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private toggleFileBrowser = async () => {
    if (this.showFileBrowser) {
      this.closeFileBrowser();
      return;
    }

    this.resolvedWorkspacePath = await this.resolveCurrentWorkspacePath();
    this.showFileBrowser = true;
  };

  private closeFileBrowser = () => {
    this.showFileBrowser = false;
  };

  private toggleTodoPanel = () => {
    this.showTodoPanel = !this.showTodoPanel;
  };

  private closeTodoPanel = () => {
    this.showTodoPanel = false;
  };

  private handleTodoSelected = (e: CustomEvent<{ content: string; todoId: string }>) => {
    this.showTodoPanel = false;
    this.dispatchEvent(
      new CustomEvent<{ content: string; todoId: string }>("todo-selected", {
        detail: { content: e.detail.content, todoId: e.detail.todoId },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleTodoCountChange = (e: CustomEvent<{ count: number }>) => {
    this.todoPendingCount = e.detail.count;
  };

  private async resolveCurrentWorkspacePath() {
    if (!this.resolveWorkspacePath) {
      return this.workspacePath;
    }

    try {
      const resolved = (await this.resolveWorkspacePath()).trim();
      return resolved || this.workspacePath;
    } catch {
      return this.workspacePath;
    }
  }

  private getEffectiveWorkspacePath() {
    return this.resolvedWorkspacePath || this.workspacePath;
  }

  private isLocalAccess(): boolean {
    const hostname = window.location.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.")
    );
  }

  private getFileBrowserUrl(): string {
    // iframe 使用根据访问方式选择 URL
    const baseUrl = this.isLocalAccess()
      ? this.FILE_BROWSER_LOCAL_URL
      : this.FILE_BROWSER_REMOTE_URL;

    const workspacePath = this.getEffectiveWorkspacePath();
    if (!workspacePath) {
      return baseUrl;
    }
    // 从环境变量获取 File Browser 根目录前缀（需与远程 File Browser 配置的 root 一致）
    const fbRootPrefix = import.meta.env.VITE_FILE_BROWSER_ROOT_PREFIX || '/Users/huajiejun/github';
    const relativePath = workspacePath.replace(fbRootPrefix, '');
    return `${baseUrl}/files/${relativePath}`;
  }

  private getFileBrowserExternalUrl(): string {
    // 新窗口打开链接始终使用远程 URL
    const workspacePath = this.getEffectiveWorkspacePath();
    if (!workspacePath) {
      return this.FILE_BROWSER_REMOTE_URL;
    }
    const fbRootPrefix = import.meta.env.VITE_FILE_BROWSER_ROOT_PREFIX || '/Users/huajiejun/github';
    const relativePath = workspacePath.replace(fbRootPrefix, '');
    return `${this.FILE_BROWSER_REMOTE_URL}/files/${relativePath}`;
  }

  private renderFileBrowser() {
    return html`
      <div class="file-browser-overlay" @click=${this.handleOverlayClick}>
        <div class="file-browser-modal">
          <div class="file-browser-header">
            <h3 class="file-browser-title">📁 文件浏览器</h3>
            <div class="file-browser-actions">
              <a
                class="file-browser-link"
                href=${this.getFileBrowserExternalUrl()}
                target="_blank"
                title="在新窗口打开"
              >
                ↗️
              </a>
              <button
                class="file-browser-close"
                type="button"
                @click=${this.closeFileBrowser}
              >
                ✕
              </button>
            </div>
          </div>
          <div class="file-browser-content">
            <iframe
              src=${this.getFileBrowserUrl()}
              class="file-browser-iframe"
              title="文件浏览器"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            ></iframe>
          </div>
        </div>
      </div>
    `;
  }

  private handleOverlayClick = (event: Event) => {
    if ((event.target as HTMLElement).classList.contains("file-browser-overlay")) {
      this.closeFileBrowser();
    }
  };

  private scrollMessagesToBottom() {
    const messageList = this.shadowRoot?.querySelector(".message-list") as HTMLDivElement | null;
    if (!messageList) {
      return;
    }
    messageList.scrollTop = messageList.scrollHeight;
  }

  private toggleToolMessage = (toolKey: string) => {
    const next = new Set(this.expandedToolMessageKeys);
    if (next.has(toolKey)) {
      next.delete(toolKey);
    } else {
      next.add(toolKey);
    }
    this.expandedToolMessageKeys = next;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-conversation-pane": WorkspaceConversationPane;
  }
}

if (!customElements.get("workspace-conversation-pane")) {
  customElements.define("workspace-conversation-pane", WorkspaceConversationPane);
}
