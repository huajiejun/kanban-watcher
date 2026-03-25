import { LitElement, html, nothing } from "lit";

import { detectDialogEditLanguage, renderDialogMessage } from "./dialog-message-renderer";
import { cardStyles } from "../styles";
import type { DialogMessage } from "../lib/dialog-messages";
import type { WorkspaceQueueStatusResponse } from "../types";

export type ConversationPaneAction = "send" | "queue" | "stop";
export type ConversationPaneMessage = DialogMessage;

export class WorkspaceConversationPane extends LitElement {
  static styles = cardStyles;

  static properties = {
    workspaceName: { attribute: false },
    messages: { attribute: false },
    quickButtons: { attribute: false },
    messageDraft: { attribute: false },
    currentFeedback: { attribute: false },
    queueStatus: { attribute: false },
    renderMessage: { attribute: false },
    quickButtonsTemplate: { attribute: false },
    expandedToolMessageKeys: { attribute: false },
    isRunning: { type: Boolean },
    canQueue: { type: Boolean },
  };

  workspaceName = "";
  messages: ConversationPaneMessage[] = [];
  quickButtons: string[] = [];
  messageDraft = "";
  currentFeedback = "";
  queueStatus?: WorkspaceQueueStatusResponse;
  renderMessage?: (message: ConversationPaneMessage) => unknown;
  quickButtonsTemplate?: unknown;
  expandedToolMessageKeys = new Set<string>();
  isRunning = false;
  canQueue = false;

  protected render() {
    const isQueued = this.queueStatus?.status === "queued";

    return html`
      <section class="workspace-pane-shell">
      <div class="dialog-header">
        <div class="dialog-heading">
          <h2 class="dialog-title">${this.workspaceName}</h2>
        </div>
        <button
          class="dialog-close"
          type="button"
          aria-label="关闭"
          @click=${this.handleClose}
        >
          ✕
        </button>
      </div>

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
        <div class="dialog-feedback" aria-live="polite">
          ${this.currentFeedback}
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
