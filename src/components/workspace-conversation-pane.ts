import { LitElement, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { renderMessageMarkdown } from "../lib/render-message-markdown";
import { cardStyles } from "../styles";
import type { WorkspaceQueueStatusResponse } from "../types";

export type ConversationPaneAction = "send" | "queue" | "stop";

export type ConversationPaneMessage =
  | {
      key?: string;
      kind: "message";
      sender: "user" | "ai";
      text: string;
      timestamp?: string;
    }
  | {
      key?: string;
      kind: "tool";
      toolName: string;
      summary: string;
      detail: string;
      status: "running" | "success" | "error";
      statusLabel: string;
      icon: string;
      timestamp?: string;
    }
  | {
      key?: string;
      kind: "tool-group";
      toolName: string;
      summary: string;
      status: "running" | "success" | "error";
      statusLabel: string;
      icon: string;
      items: Array<{
        key?: string;
        kind: "tool";
        toolName: string;
        summary: string;
        detail: string;
        status: "running" | "success" | "error";
        statusLabel: string;
        icon: string;
        timestamp?: string;
      }>;
      timestamp?: string;
    };

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
    if (message.kind === "tool") {
      return html`
        <div class="message-tool">
          <div class="message-tool-button is-${message.status}">
            <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
            <span class="message-tool-summary">
              <span class="message-tool-name">${message.toolName}</span>
              <span class="message-tool-text">${message.summary}</span>
            </span>
            <span class="message-tool-status">${message.statusLabel}</span>
          </div>
        </div>
      `;
    }

    if (message.kind === "tool-group") {
      return html`
        <div class="message-tool">
          <div class="message-tool-button is-${message.status}">
            <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
            <span class="message-tool-summary">
              <span class="message-tool-name">${message.toolName}</span>
              <span class="message-tool-text">${message.summary}</span>
            </span>
            <span class="message-tool-status">${message.statusLabel}</span>
          </div>
        </div>
      `;
    }

    return html`
      <div class="message-row">
        <div class="message-bubble ${message.sender === "user" ? "is-user" : "is-ai"}">
          ${unsafeHTML(renderMessageMarkdown(message.text))}
        </div>
      </div>
    `;
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
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-conversation-pane": WorkspaceConversationPane;
  }
}

if (!customElements.get("workspace-conversation-pane")) {
  customElements.define("workspace-conversation-pane", WorkspaceConversationPane);
}
