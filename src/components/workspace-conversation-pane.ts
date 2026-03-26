import { LitElement, html, nothing } from "lit";

import { detectDialogEditLanguage, renderDialogMessage } from "./dialog-message-renderer";
import { cardStyles } from "../styles";
import type { DialogMessage } from "../lib/dialog-messages";
import type { WorkspaceQueueStatusResponse } from "../types";

export type ConversationPaneAction = "send" | "queue" | "stop";
export type ConversationPaneMessage = DialogMessage;
export type DevServerState = "idle" | "starting" | "running" | "stopping";

export class WorkspaceConversationPane extends LitElement {
  static styles = cardStyles;

  static properties = {
    workspaceName: { attribute: false },
    workspacePath: { attribute: false },
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
    showDevServerPreview: { type: Boolean },
    showFileBrowser: { type: Boolean },
  };

  workspaceName = "";
  workspacePath = "";
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
  showDevServerPreview = false;
  showFileBrowser = false;

  // File Browser 配置
  private readonly FILE_BROWSER_LOCAL_URL = import.meta.env.VITE_FILE_BROWSER_URL || "http://127.0.0.1:9394";
  private readonly FILE_BROWSER_REMOTE_URL = import.meta.env.VITE_FILE_BROWSER_REMOTE_URL || "https://file.huajiejun.cn";

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
            aria-label="文件"
            title="文件浏览器"
            @click=${this.toggleFileBrowser}
          >
            📁
          </button>
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
          ${this.showDevServerPreview
            ? html`
                <button
                  class="dialog-dev-server-preview"
                  type="button"
                  aria-label="打开开发服务器预览"
                  @click=${this.handleDevServerPreviewToggle}
                >
                  🖥
                </button>
              `
            : nothing}
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
        ${this.quickButtonsTemplate ?? this.renderQuickButtons()}
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

  private handleDevServerPreviewToggle = () => {
    this.dispatchEvent(
      new CustomEvent("dev-server-preview-toggle", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private toggleFileBrowser = () => {
    this.showFileBrowser = !this.showFileBrowser;
  };

  private closeFileBrowser = () => {
    this.showFileBrowser = false;
  };

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

    if (!this.workspacePath) {
      return baseUrl;
    }
    // 从环境变量获取 File Browser 根目录前缀（需与 File Browser 配置的 root 一致）
    const fbRootPrefix = import.meta.env.VITE_FILE_BROWSER_ROOT_PREFIX || '/Users/huajiejun';
    const relativePath = this.workspacePath.replace(fbRootPrefix, '');
    return `${baseUrl}/files/${relativePath}`;
  }

  private getFileBrowserExternalUrl(): string {
    // 新窗口打开链接始终使用远程 URL
    if (!this.workspacePath) {
      return this.FILE_BROWSER_REMOTE_URL;
    }
    const fbRootPrefix = import.meta.env.VITE_FILE_BROWSER_ROOT_PREFIX || '/Users/huajiejun';
    const relativePath = this.workspacePath.replace(fbRootPrefix, '');
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
