import { LitElement, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  cancelWorkspaceQueue,
  fetchActiveWorkspaces,
  fetchWorkspaceLatestMessages,
  fetchWorkspaceQueueStatus,
  sendWorkspaceMessage,
  stopWorkspaceExecution,
} from "./lib/http-api";
import { connectRealtime } from "./lib/realtime-api";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import { renderMessageMarkdown } from "./lib/render-message-markdown";
import { summarizeToolCall, type DialogToolStatus } from "./lib/tool-call";
import {
  extractDynamicButtons,
  getQuickButtonsWithLLM,
  isValidButtonText,
  STATIC_BUTTONS,
} from "./lib/quick-buttons";
import type { ButtonWithReason } from "./types";
import {
  detectLanguageFromPath,
  renderDiffWithHighlight,
  renderCodeWithHighlight,
} from "./lib/highlight-code";
import {
  type WorkspaceSectionKey,
} from "./components/workspace-section-list";
import { cardStyles } from "./styles";
import type {
  ActiveWorkspacesResponse,
  KanbanEntityAttributes,
  KanbanSessionAttributes,
  KanbanSessionMessage,
  KanbanWorkspace,
  LocalWorkspaceSummary,
  RealtimeEvent,
  SessionMessageResponse,
  WorkspaceQueueStatusResponse,
} from "./types";

type SectionKey = WorkspaceSectionKey;

type HomeAssistantState = {
  attributes?: KanbanEntityAttributes | KanbanSessionAttributes;
};

type HomeAssistantLike = {
  states: Record<string, HomeAssistantState>;
};

type CardConfig = {
  entity: string;
  base_url?: string;
  api_key?: string;
  messages_limit?: number;
  llm_enabled?: boolean;
  llm_base_url?: string;
  llm_model?: string;
};

type DialogAction = "send" | "queue" | "stop";
type DialogTextMessage = {
  key?: string;
  kind: "message";
  sender: "user" | "ai";
  text: string;
  timestamp?: string;
};
type DialogToolMessage = {
  key?: string;
  kind: "tool";
  toolName: string;
  summary: string;
  detail: string;
  status: DialogToolStatus;
  statusLabel: string;
  icon: string;
  command?: string;
  timestamp?: string;
  changes?: Array<{
    action: "write" | "edit" | "delete" | "rename";
    content?: string;
    unified_diff?: string;
    new_path?: string;
  }>;
};
type DialogToolGroupMessage = {
  key?: string;
  kind: "tool-group";
  toolName: string;
  summary: string;
  status: DialogToolStatus;
  statusLabel: string;
  icon: string;
  items: DialogToolMessage[];
  timestamp?: string;
};
type DialogMessage = DialogTextMessage | DialogToolMessage | DialogToolGroupMessage;

const SECTION_ORDER: Array<{ key: SectionKey; label: string }> = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" },
];

const DEFAULT_MESSAGES_LIMIT = 50;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_DIALOG_FALLBACK_INTERVAL_MS = 5_000;
const DEFAULT_REALTIME_RETRY_DELAY_MS = 3_000;

export class KanbanWatcherCard extends LitElement {
  static styles = cardStyles;

  static properties = {
    hass: { attribute: false },
    collapsedSections: { state: true },
    selectedWorkspaceId: { state: true },
    messageDraft: { state: true },
    actionFeedback: { state: true },
    apiWorkspaces: { state: true },
    boardLoading: { state: true },
    boardError: { state: true },
    dialogLoading: { state: true },
    dialogError: { state: true },
    dialogMessagesByWorkspace: { state: true },
    queueStatusByWorkspace: { state: true },
    optimisticQueueWorkspaceIds: { state: true },
    autoScrollEnabled: { state: true },
    dynamicButtonsByWorkspace: { state: true },
  };

  hass?: HomeAssistantLike;

  private config?: CardConfig;
  private refreshTimer?: number;
  private dialogRefreshTimer?: number;
  private boardRealtimeRetryTimer?: number;
  private realtimeRetryTimer?: number;
  private boardRealtimeSocket?: WebSocket;
  private realtimeSocket?: WebSocket;
  private boardRealtimeConnected = false;
  private realtimeConnected = false;

  private collapsedSections = new Set<SectionKey>();
  private selectedWorkspaceId?: string;
  private messageDraft = "";
  private actionFeedback = "";
  private apiWorkspaces: KanbanWorkspace[] = [];
  private boardLoading = false;
  private boardError = "";
  private dialogLoading = false;
  private dialogError = "";
  private dialogMessagesByWorkspace: Record<string, DialogMessage[]> = {};
  private queueStatusByWorkspace: Record<string, WorkspaceQueueStatusResponse> = {};
  private optimisticQueueWorkspaceIds = new Set<string>();
  private autoScrollEnabled = true;
  private messageListScrollHandler?: () => void;
  private dialogMessageVersionsByWorkspace: Record<string, string> = {};
  private expandedToolMessageKeys = new Set<string>();
  /** @deprecated 使用 extractedButtonsByWorkspace 和 suggestedButtonsByWorkspace 代替 */
  private dynamicButtonsByWorkspace: Record<string, string[]> = {};
  /** 从消息中提取的选项按钮 */
  private extractedButtonsByWorkspace: Record<string, string[]> = {};
  /** LLM 语义联想推荐的操作按钮（带理由） */
  private suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
  /** 缓存每个工作区最后分析的消息 hash，避免重复调用 LLM */
  private dynamicButtonsMessageHashByWorkspace: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeyDown);
    this.startApiSyncIfNeeded();
  }

  disconnectedCallback() {
    this.removeEventListener("keydown", this.handleKeyDown);
    this.stopApiSync();
    super.disconnectedCallback();
  }

  setConfig(config: CardConfig) {
    if (!config?.entity) {
      throw new Error("`entity` is required");
    }

    this.config = config;
    this.startApiSyncIfNeeded();
  }

  getCardSize() {
    return Math.max(1, this.visibleSections.length * 2);
  }

  protected render() {
    const sections = this.visibleSections;

    return html`
      <ha-card>
        <div class="board">
          ${this.renderBoardState(sections)}
        </div>
        ${this.renderDialog()}
      </ha-card>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("selectedWorkspaceId") && this.selectedWorkspaceId) {
      this.scrollMessagesToBottom();
      this.setupMessageListScrollListener();
    }
    if (changedProperties.has("selectedWorkspaceId") && this.isApiMode) {
      this.restartRealtimeConnection();
      this.updateDialogPolling();
    }
  }

  private renderBoardState(
    sections: Array<{ key: SectionKey; label: string; workspaces: KanbanWorkspace[] }>,
  ) {
    if (this.boardLoading && sections.length === 0) {
      return html`<div class="empty-state">正在加载工作区...</div>`;
    }

    if (this.boardError && sections.length === 0) {
      return html`<div class="empty-state">${this.boardError}</div>`;
    }

    if (sections.length === 0) {
      return html`<div class="empty-state">当前没有任务</div>`;
    }

    return html`
      <workspace-section-list
        .sections=${sections}
        .collapsedSections=${this.collapsedSections}
        .selectedWorkspaceId=${this.selectedWorkspaceId}
        .getWorkspaceDisplayMeta=${(workspace: KanbanWorkspace) =>
          this.getWorkspaceDisplayMeta(workspace)}
        @workspace-section-toggle=${(event: CustomEvent<SectionKey>) =>
          this.toggleSection(event.detail)}
        @workspace-select=${(event: CustomEvent<KanbanWorkspace>) =>
          this.openWorkspaceDialog(event.detail)}
      ></workspace-section-list>
    `;
  }

  private renderQuickButtons(workspace: KanbanWorkspace) {
    const isRunning = workspace.status === "running";

    // 运行时隐藏所有快捷按钮
    if (isRunning) {
      return nothing;
    }

    // 获取各类按钮
    const extractedButtons = this.extractedButtonsByWorkspace[workspace.id] || [];
    const suggestedButtons = this.suggestedButtonsByWorkspace[workspace.id] || [];

    // 合并所有按钮：静态 + 提取 + 推荐
    const staticBtns = STATIC_BUTTONS.filter(isValidButtonText);
    const extractedBtns = extractedButtons.filter(isValidButtonText);

    if (staticBtns.length === 0 && extractedBtns.length === 0 && suggestedButtons.length === 0) {
      return nothing;
    }

    return html`
      <div class="quick-buttons">
        ${staticBtns.map((text) => html`
          <button
            class="quick-button is-static"
            type="button"
            @click=${() => void this.handleQuickButtonClick(text)}
          >
            ${text}
          </button>
        `)}
        ${extractedBtns.map((text) => html`
          <button
            class="quick-button is-extracted"
            type="button"
            @click=${() => void this.handleQuickButtonClick(text)}
          >
            ${text}
          </button>
        `)}
        ${suggestedButtons.map((item, index) => html`
          <div class="quick-button-wrapper">
            <button
              class="quick-button is-suggested"
              type="button"
              @click=${() => void this.handleQuickButtonClick(item.button)}
            >
              ${item.button}
            </button>
            <button
              class="quick-button-info"
              type="button"
              title="点击查看理由"
              @click=${(e: Event) => {
                e.stopPropagation();
                const wrapper = (e.target as HTMLElement).closest('.quick-button-wrapper');
                const tooltip = wrapper?.querySelector('.quick-button-reason');
                if (tooltip) {
                  tooltip.classList.toggle('is-visible');
                }
              }}
            >
              ℹ️
            </button>
            <div class="quick-button-reason">${item.reason}</div>
          </div>
        `)}
      </div>
    `;
  }

  private renderDialog() {
    const workspace = this.selectedWorkspace;

    if (!workspace) {
      return nothing;
    }

    const messages = this.getDialogMessages(workspace);
    const isRunning = workspace.status === "running";
    const canQueue = isRunning || this.optimisticQueueWorkspaceIds.has(workspace.id);
    const queueStatus = this.queueStatusByWorkspace[workspace.id];
    const isQueued = canQueue && queueStatus?.status === "queued";

    return html`
      <div class="dialog-shell" role="presentation">
        <button
          class="dialog-overlay"
          type="button"
          aria-label="关闭工作区详情"
          @click=${this.closeWorkspaceDialog}
        ></button>
        <section
          class="workspace-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="${workspace.name} 工作区详情"
        >
          <div class="dialog-header">
            <div class="dialog-heading">
              <h2 class="dialog-title">${workspace.name}</h2>
            </div>
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭"
              @click=${this.closeWorkspaceDialog}
            >
              ✕
            </button>
          </div>

          <section class="dialog-messages">
            <div class="dialog-panel-title">对话消息</div>
            <div class="message-list">
              ${messages.map((message) => this.renderDialogEntry(message))}
            </div>
          </section>

          <div class="dialog-composer">
            ${isQueued
              ? html`<div class="queue-banner">消息已排队 - 将在当前运行完成时执行</div>`
              : nothing}
            ${this.renderQuickButtons(workspace)}
            <textarea
              class="message-input"
              rows="2"
              placeholder="输入消息"
              .value=${this.messageDraft}
              @input=${this.handleMessageInput}
            ></textarea>
            <div class="dialog-actions">
              <button
                class="dialog-action dialog-action-primary"
                type="button"
                @click=${() => void this.handleActionClick(isRunning ? "stop" : "send")}
              >
                ${isRunning
                  ? html`
                      <span class="action-spinner" aria-hidden="true"></span>
                      <span>停止</span>
                    `
                  : "发送消息"}
              </button>
              ${canQueue
                ? html`
                    <button
                      class="dialog-action dialog-action-secondary"
                      type="button"
                      @click=${() => void this.handleActionClick(isQueued ? "stop" : "queue")}
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
      </div>
    `;
  }

  private get currentFeedback() {
    if (this.actionFeedback) {
      return this.actionFeedback;
    }
    const workspace = this.selectedWorkspace;
    if (workspace) {
      const queueStatus = this.queueStatusByWorkspace[workspace.id];
      if (queueStatus?.status === "queued") {
        return "消息已排队 - 将在当前运行完成时执行";
      }
    }
    if (this.dialogError) {
      return this.dialogError;
    }
    if (this.dialogLoading) {
      return "正在加载消息...";
    }
    return this.isApiMode ? "消息已切换为本地持久化接口。" : "消息操作暂未接入真实接口。";
  }

  private toggleSection(key: SectionKey) {
    const next = new Set(this.collapsedSections);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.collapsedSections = next;
  }

  private openWorkspaceDialog(workspace: KanbanWorkspace) {
    this.selectedWorkspaceId = workspace.id;
    this.messageDraft = "";
    this.actionFeedback = "";
    this.dialogError = "";
    if (this.isApiMode) {
      const shouldRefreshQueueStatus = this.shouldRefreshWorkspaceMessages(workspace);
      void this.loadWorkspaceMessages(workspace.id, true);
      if (workspace.status === "running" && (shouldRefreshQueueStatus || !this.queueStatusByWorkspace[workspace.id])) {
        void this.loadWorkspaceQueueStatus(workspace.id);
      }
    }
  }

  private closeWorkspaceDialog = () => {
    const workspaceID = this.selectedWorkspaceId;
    this.selectedWorkspaceId = undefined;
    this.messageDraft = "";
    this.actionFeedback = "";
    this.dialogError = "";
    this.dialogLoading = false;
    if (workspaceID) {
      const next = new Set(this.optimisticQueueWorkspaceIds);
      next.delete(workspaceID);
      this.optimisticQueueWorkspaceIds = next;
    }
    this.expandedToolMessageKeys = new Set();
  };

  private renderDialogEntry(message: DialogMessage) {
    if (message.kind === "tool") {
      return this.renderToolMessage(message);
    }
    if (message.kind === "tool-group") {
      return this.renderToolGroupMessage(message);
    }

    return html`
      <div class="message-row">
        <div class="message-bubble ${message.sender === "user" ? "is-user" : "is-ai"}">
          ${unsafeHTML(renderMessageMarkdown(this.compactMessageText(message.text)))}
        </div>
      </div>
    `;
  }

  private renderToolMessage(message: DialogToolMessage) {
    const toolKey = this.getDialogMessageIdentity(message);
    const expanded = this.expandedToolMessageKeys.has(toolKey);

    return html`
      <div class="message-tool">
        <button
          class="message-tool-button is-${message.status}"
          type="button"
          @click=${() => this.toggleToolMessage(toolKey)}
        >
          <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
          <span class="message-tool-summary">
            <span class="message-tool-name">${message.toolName}</span>
            <span class="message-tool-text">${message.summary}</span>
          </span>
          <span class="message-tool-status">${message.statusLabel}</span>
        </button>
        ${expanded
          ? html`
              <div class="message-tool-detail">
                ${message.command
                  ? html`<div class="message-tool-command">${message.command}</div>`
                  : nothing}
                ${message.changes && message.changes.length > 0
                  ? message.changes.map((change) => this.renderFileChange(change))
                  : nothing}
                ${message.detail && (!message.changes || message.changes.length === 0)
                  ? html`${unsafeHTML(renderMessageMarkdown(message.detail))}`
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderFileChange(change: NonNullable<DialogToolMessage["changes"]>[number]) {
    const actionLabel: Record<string, string> = {
      write: "写入",
      edit: "编辑",
      delete: "删除",
      rename: "重命名",
    };

    if (change.action === "edit" && change.unified_diff) {
      const language = this.currentEditLanguage;
      const highlightedDiff = renderDiffWithHighlight(change.unified_diff, language);
      return html`
        <div class="file-change">
          <div class="file-change-header">
            <span class="file-change-action">${actionLabel[change.action]}</span>
          </div>
          <div class="file-change-diff">${unsafeHTML(highlightedDiff)}</div>
        </div>
      `;
    }

    if (change.action === "write" && change.content) {
      const lines = change.content.split("\n").length;
      const language = this.currentEditLanguage;
      const highlightedCode = renderCodeWithHighlight(this.truncateContent(change.content, 50), language);
      return html`
        <div class="file-change">
          <div class="file-change-header">
            <span class="file-change-action">${actionLabel[change.action]}</span>
            <span class="file-change-lines">${lines} 行</span>
          </div>
          <div class="file-change-code">${unsafeHTML(highlightedCode)}</div>
        </div>
      `;
    }

    if (change.action === "delete") {
      return html`
        <div class="file-change">
          <div class="file-change-header">
            <span class="file-change-action">${actionLabel[change.action]}</span>
          </div>
        </div>
      `;
    }

    if (change.action === "rename" && change.new_path) {
      return html`
        <div class="file-change">
          <div class="file-change-header">
            <span class="file-change-action">${actionLabel[change.action]}</span>
            <span class="file-change-new-path">→ ${change.new_path}</span>
          </div>
        </div>
      `;
    }

    return nothing;
  }

  private get currentEditLanguage(): string | undefined {
    const messages = this.selectedWorkspaceId
      ? this.dialogMessagesByWorkspace[this.selectedWorkspaceId]
      : [];
    for (const message of messages) {
      if (message.kind === "tool" && message.toolName === "修改文件" && message.summary) {
        return detectLanguageFromPath(message.summary);
      }
    }
    return undefined;
  }

  private formatUnifiedDiff(diff: string): string {
    return diff
      .split("\n")
      .map((line) => {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          return `+ ${line.slice(1)}`;
        }
        if (line.startsWith("-") && !line.startsWith("---")) {
          return `- ${line.slice(1)}`;
        }
        if (line.startsWith("@@")) {
          return `@@ ${line.slice(2)}`;
        }
        return line;
      })
      .join("\n");
  }

  private truncateContent(content: string, maxLines: number): string {
    const lines = content.split("\n");
    if (lines.length <= maxLines) {
      return content;
    }
    return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} 行已省略)`;
  }

  private renderToolGroupMessage(message: DialogToolGroupMessage) {
    const toolKey = this.getDialogMessageIdentity(message);
    const expanded = this.expandedToolMessageKeys.has(toolKey);

    return html`
      <div class="message-tool">
        <button
          class="message-tool-button is-${message.status}"
          type="button"
          @click=${() => this.toggleToolMessage(toolKey)}
        >
          <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
          <span class="message-tool-summary">
            <span class="message-tool-name">${message.toolName}</span>
            <span class="message-tool-text">${message.summary}</span>
          </span>
          <span class="message-tool-status">${message.statusLabel}</span>
        </button>
        ${expanded
          ? html`
              <div class="message-tool-detail">
                ${message.items.map((item) => this.renderGroupedToolDetail(item))}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderGroupedToolDetail(message: DialogToolMessage) {
    return html`
      <div class="message-tool-group-item">
        <div class="message-tool-group-item-summary">
          ${message.command ?? message.summary}
        </div>
        ${message.detail
          ? html`${unsafeHTML(renderMessageMarkdown(message.detail))}`
          : nothing}
      </div>
    `;
  }

  private toggleToolMessage(toolKey: string) {
    const next = new Set(this.expandedToolMessageKeys);
    if (next.has(toolKey)) {
      next.delete(toolKey);
    } else {
      next.add(toolKey);
    }
    this.expandedToolMessageKeys = next;
    this.requestUpdate();
  }

  private handleMessageInput = (event: Event) => {
    this.messageDraft = (event.target as HTMLTextAreaElement).value;
  };

  private async handleActionClick(action: DialogAction) {
    const queueStatus = this.selectedWorkspaceId
      ? this.queueStatusByWorkspace[this.selectedWorkspaceId]
      : undefined;
    const isQueued = queueStatus?.status === "queued";

    if (action === "stop" && isQueued) {
      await this.handleCancelQueue();
      return;
    }

    if (action === "stop") {
      if (!this.isApiMode || !this.selectedWorkspaceId) {
        this.actionFeedback = "停止功能暂未接入，当前仅展示界面。";
        return;
      }
      try {
        this.actionFeedback = "正在发送停止请求...";
        const response = await stopWorkspaceExecution({
          baseUrl: this.config!.base_url!,
          apiKey: this.config?.api_key,
          workspaceId: this.selectedWorkspaceId,
        });
        this.actionFeedback = response.message?.trim() || "已发送停止请求";
        void this.loadActiveWorkspaces();
      } catch (error) {
        this.actionFeedback = this.toErrorMessage(error, "停止执行失败");
      }
      return;
    }

    if (!this.isApiMode || !this.selectedWorkspaceId) {
      this.actionFeedback = "发送消息功能暂未接入，当前仅展示界面。";
      return;
    }

    const message = this.messageDraft.trim();
    if (!message) {
      this.actionFeedback = "请输入要发送的消息。";
      return;
    }

    try {
      this.actionFeedback = action === "queue" ? "正在加入队列..." : "正在发送消息...";
      const response = await sendWorkspaceMessage({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
        message,
        mode: action,
      });
      if (action === "send") {
        this.appendOptimisticUserMessage(this.selectedWorkspaceId, message);
      }
      const successPrefix = action === "queue" ? "加入队列成功" : "发送成功";
      this.actionFeedback = response.message?.trim()
        ? `${successPrefix}：${response.message.trim()}`
        : `${successPrefix}。`;
      if (action === "queue") {
        this.messageDraft = message;
        this.setQueueStatus(this.selectedWorkspaceId, {
          ...response,
          status: "queued",
          queued: {
            session_id: response.session_id,
            data: {
              message,
            },
          },
        });
      } else {
        const workspace = this.selectedWorkspace;
        if (workspace && workspace.status !== "running") {
          const next = new Set(this.optimisticQueueWorkspaceIds);
          next.add(workspace.id);
          this.optimisticQueueWorkspaceIds = next;
        }
        this.messageDraft = "";
      }
      this.emitPreviewStatus();
      if (action === "send") {
        await this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
      }
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "发送消息失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async handleQuickButtonClick(text: string) {
    const workspace = this.selectedWorkspace;
    if (!workspace) {
      return;
    }

    const isRunning = workspace.status === "running";
    if (isRunning) {
      this.actionFeedback = "工作区正在运行，无法发送快捷消息。";
      this.emitPreviewStatus(this.actionFeedback);
      return;
    }

    if (!this.isApiMode || !this.selectedWorkspaceId) {
      this.actionFeedback = "发送消息功能暂未接入，当前仅展示界面。";
      this.emitPreviewStatus(this.actionFeedback);
      return;
    }

    try {
      this.actionFeedback = "正在发送快捷消息...";
      this.emitPreviewStatus(this.actionFeedback);
      const response = await sendWorkspaceMessage({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
        message: text,
        mode: "send",
      });

      this.appendOptimisticUserMessage(this.selectedWorkspaceId, text);
      this.actionFeedback = response.message?.trim()
        ? `发送成功：${response.message.trim()}`
        : "快捷消息已发送";
      this.messageDraft = "";
      this.emitPreviewStatus(this.actionFeedback);
      await this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "发送快捷消息失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async handleCancelQueue() {
    if (!this.isApiMode || !this.selectedWorkspaceId) {
      return;
    }

    try {
      this.actionFeedback = "正在取消队列...";
      const response = await cancelWorkspaceQueue({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
      });
      this.setQueueStatus(this.selectedWorkspaceId, response);
      this.actionFeedback = response.message?.trim() || "队列已取消";
      this.emitPreviewStatus();
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "取消队列失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async loadWorkspaceQueueStatus(workspaceId: string) {
    if (!this.isApiMode) {
      return;
    }

    try {
      const response = await fetchWorkspaceQueueStatus({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId,
      });
      this.setQueueStatus(workspaceId, response);
      if (
        this.selectedWorkspaceId === workspaceId &&
        response.status === "queued" &&
        !this.messageDraft.trim()
      ) {
        this.messageDraft = response.queued?.data?.message ?? "";
      }
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "获取队列状态失败");
    }
  }

  private setQueueStatus(workspaceId: string, response: WorkspaceQueueStatusResponse) {
    this.queueStatusByWorkspace = {
      ...this.queueStatusByWorkspace,
      [workspaceId]: response,
    };
  }

  private handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === "Escape" && this.selectedWorkspace) {
      this.closeWorkspaceDialog();
    }
  };

  private getWorkspaceDisplayMeta(workspace: KanbanWorkspace) {
    // 与 vibe-kanban 主项目保持一致：优先使用 AI 执行完成时间，同时兼容旧 completed_at 字段。
    const completionTimeSource =
      workspace.latest_process_completed_at ||
      (workspace.status === "completed" ? workspace.completed_at : undefined);
    const timeSource =
      completionTimeSource ||
      workspace.last_message_at ||
      workspace.updated_at ||
      this.entityAttributes?.updated_at;

    return {
      relativeTime: workspace.relative_time || formatRelativeTime(timeSource),
      filesChanged: workspace.files_changed ?? 0,
      linesAdded: workspace.lines_added ?? 0,
      linesRemoved: workspace.lines_removed ?? 0,
    };
  }

  private get entityAttributes(): KanbanEntityAttributes | undefined {
    if (!this.hass || !this.config?.entity) {
      return undefined;
    }

    return this.hass.states[this.config.entity]?.attributes;
  }

  private get selectedWorkspace(): KanbanWorkspace | undefined {
    if (!this.selectedWorkspaceId) {
      return undefined;
    }

    return this.allWorkspaces.find((workspace) => workspace.id === this.selectedWorkspaceId);
  }

  private get visibleSections() {
    const grouped = groupWorkspaces(this.allWorkspaces);

    return SECTION_ORDER.map(({ key, label }) => ({
      key,
      label,
      workspaces: grouped[key],
    })).filter((section) => section.workspaces.length > 0);
  }

  private get allWorkspaces(): KanbanWorkspace[] {
    return this.isApiMode ? this.apiWorkspaces : this.normalizedWorkspaces;
  }

  private get normalizedWorkspaces(): KanbanWorkspace[] {
    const raw = this.entityAttributes?.workspaces;

    if (Array.isArray(raw)) {
      return raw.filter(this.isWorkspaceLike);
    }

    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(this.isWorkspaceLike) : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private get isApiMode() {
    return Boolean(this.config?.base_url);
  }

  private isWorkspaceLike(value: unknown): value is KanbanWorkspace {
    return Boolean(
      value &&
        typeof value === "object" &&
        "id" in value &&
        "name" in value &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { name?: unknown }).name === "string",
    );
  }

  private getDialogMessages(workspace: KanbanWorkspace): DialogMessage[] {
    if (this.isApiMode) {
      const apiMessages = this.dialogMessagesByWorkspace[workspace.id];
      if (apiMessages?.length) {
        return apiMessages;
      }
      if (this.dialogLoading) {
        return [{ kind: "message", sender: "ai", text: "正在加载消息..." }];
      }
      if (this.dialogError) {
        return [{ kind: "message", sender: "ai", text: this.dialogError }];
      }
    }

    const recentSessionMessages = this.getRecentSessionMessages(workspace);

    if (recentSessionMessages.length > 0) {
      return recentSessionMessages;
    }

    const sessionId = workspace.latest_session_id ?? workspace.last_session_id;

    return [
      {
        kind: "message",
        sender: "ai",
        text: sessionId
          ? "暂无同步的对话消息。"
          : "当前工作区还没有可展示的对话消息。",
      },
    ];
  }

  private getRecentSessionMessages(workspace: KanbanWorkspace): DialogMessage[] {
    const sessionId = workspace.latest_session_id ?? workspace.last_session_id;

    if (!sessionId || !this.hass) {
      return [];
    }

    const sessionState = Object.values(this.hass.states).find((state) => {
      const attributes = state.attributes as KanbanSessionAttributes | undefined;
      return attributes?.session_id === sessionId;
    });

    if (!sessionState) {
      return [];
    }

    const attributes = sessionState.attributes as KanbanSessionAttributes | undefined;
    const rawRecentMessages = attributes?.recent_messages;
    const parsedMessages = this.parseRecentMessages(rawRecentMessages);

    if (parsedMessages.length > 0) {
      return parsedMessages;
    }

    return typeof attributes?.last_message === "string" && attributes.last_message.trim()
      ? [{ kind: "message", sender: "ai", text: attributes.last_message.trim() }]
      : [];
  }

  private parseRecentMessages(
    rawRecentMessages: KanbanSessionAttributes["recent_messages"],
  ): DialogMessage[] {
    const parsed =
      typeof rawRecentMessages === "string"
        ? this.parseRecentMessagesString(rawRecentMessages)
        : rawRecentMessages;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((message) => this.normalizeSessionMessage(message))
      .filter((message): message is DialogMessage => Boolean(message));
  }

  private parseRecentMessagesString(rawRecentMessages: string) {
    try {
      return JSON.parse(rawRecentMessages) as KanbanSessionMessage[];
    } catch {
      return [];
    }
  }

  private normalizeSessionMessage(message: KanbanSessionMessage): DialogMessage | undefined {
    if (!message || typeof message.content !== "string") {
      return undefined;
    }

    const text = message.content.trim();

    if (!text) {
      return undefined;
    }

    return {
      kind: "message",
      sender: message.role === "user" ? "user" : "ai",
      text: this.compactMessageText(text),
      timestamp: message.timestamp,
    };
  }

  private compactMessageText(text: string) {
    return text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim().replace(/[ \t]{2,}/g, " "))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private scrollMessagesToBottom() {
    if (!this.autoScrollEnabled) {
      return;
    }

    const messageList = this.renderRoot.querySelector(".message-list") as
      | HTMLDivElement
      | null;

    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  private setupMessageListScrollListener() {
    if (this.messageListScrollHandler) {
      const oldMessageList = this.renderRoot.querySelector(".message-list");
      if (oldMessageList) {
        oldMessageList.removeEventListener("scroll", this.messageListScrollHandler);
      }
    }

    this.autoScrollEnabled = true;

    const messageList = this.renderRoot.querySelector(".message-list") as HTMLDivElement | null;
    if (messageList) {
      this.messageListScrollHandler = () => this.handleMessageListScroll(messageList);
      messageList.addEventListener("scroll", this.messageListScrollHandler);
    }
  }

  private handleMessageListScroll(messageList: HTMLDivElement) {
    const isAtBottom =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 50;

    if (isAtBottom) {
      if (!this.autoScrollEnabled) {
        this.autoScrollEnabled = true;
      }
    } else {
      if (this.autoScrollEnabled) {
        this.autoScrollEnabled = false;
      }
    }
  }
  private emitPreviewStatus(message?: string) {
    this.dispatchEvent(
      new CustomEvent("kanban-watcher-preview-status", {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private startApiSyncIfNeeded() {
    if (!this.isConnected) {
      return;
    }

    this.stopApiSync();

    if (!this.isApiMode) {
      return;
    }

    void this.loadActiveWorkspaces();
    this.connectBoardRealtimeIfNeeded();
    this.startBoardPolling();
  }

  private stopApiSync() {
    this.stopBoardPolling();
    this.stopDialogPolling();
    if (this.boardRealtimeRetryTimer) {
      window.clearTimeout(this.boardRealtimeRetryTimer);
      this.boardRealtimeRetryTimer = undefined;
    }
    if (this.realtimeRetryTimer) {
      window.clearTimeout(this.realtimeRetryTimer);
      this.realtimeRetryTimer = undefined;
    }
    if (this.boardRealtimeSocket) {
      const socket = this.boardRealtimeSocket;
      this.boardRealtimeSocket = undefined;
      socket.close();
    }
    if (this.realtimeSocket) {
      const socket = this.realtimeSocket;
      this.realtimeSocket = undefined;
      socket.close();
    }
    this.boardRealtimeConnected = false;
    this.realtimeConnected = false;
  }

  private startBoardPolling() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = window.setInterval(() => {
      void this.loadActiveWorkspaces();
    }, DEFAULT_REFRESH_INTERVAL_MS);
  }

  private stopBoardPolling() {
    if (!this.refreshTimer) {
      return;
    }
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private startDialogPolling() {
    if (this.dialogRefreshTimer || !this.selectedWorkspaceId) {
      return;
    }
    this.dialogRefreshTimer = window.setInterval(() => {
      if (this.selectedWorkspaceId) {
        void this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
      }
    }, DEFAULT_DIALOG_FALLBACK_INTERVAL_MS);
  }

  private stopDialogPolling() {
    if (!this.dialogRefreshTimer) {
      return;
    }
    window.clearInterval(this.dialogRefreshTimer);
    this.dialogRefreshTimer = undefined;
  }

  private updateDialogPolling() {
    if (this.realtimeConnected || !this.selectedWorkspaceId) {
      this.stopDialogPolling();
      return;
    }
    this.startDialogPolling();
  }

  private connectBoardRealtimeIfNeeded() {
    if (!this.config?.base_url || typeof WebSocket === "undefined") {
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.config.base_url,
      apiKey: this.config.api_key,
      onOpen: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.boardRealtimeConnected = true;
        this.emitPreviewStatus(`首页实时已连接：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        this.stopBoardPolling();
        if (this.boardRealtimeRetryTimer) {
          window.clearTimeout(this.boardRealtimeRetryTimer);
          this.boardRealtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.boardRealtimeConnected = false;
        this.emitPreviewStatus(`首页实时已断开，已退回轮询：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        void this.loadActiveWorkspaces();
        this.startBoardPolling();
        this.scheduleBoardRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "workspace_snapshot") {
          this.emitPreviewStatus(`首页实时已更新：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
          this.handleRealtimeEvent(event);
        }
      },
    });
    this.boardRealtimeSocket = socket;
  }

  private connectRealtimeIfNeeded() {
    if (!this.config?.base_url || typeof WebSocket === "undefined") {
      return;
    }

    const sessionId = this.selectedWorkspace?.latest_session_id ?? this.selectedWorkspace?.last_session_id;
    if (!sessionId) {
      this.realtimeConnected = false;
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.config.base_url,
      apiKey: this.config.api_key,
      sessionId,
      onOpen: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.realtimeConnected = true;
        this.emitPreviewStatus(`弹窗实时已连接：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        this.stopDialogPolling();
        if (this.realtimeRetryTimer) {
          window.clearTimeout(this.realtimeRetryTimer);
          this.realtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.realtimeConnected = false;
        this.emitPreviewStatus(`弹窗实时已断开，已退回轮询：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        if (this.selectedWorkspaceId) {
          void this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
        }
        this.updateDialogPolling();
        this.scheduleRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "session_messages_appended") {
          this.emitPreviewStatus(`弹窗实时已追加：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        }
        this.handleRealtimeEvent(event);
      },
    });
    this.realtimeSocket = socket;
  }

  private restartRealtimeConnection() {
    if (!this.isApiMode) {
      return;
    }
    if (this.realtimeSocket) {
      const socket = this.realtimeSocket;
      this.realtimeSocket = undefined;
      socket.close();
    }
    this.connectRealtimeIfNeeded();
  }

  private scheduleBoardRealtimeReconnect() {
    if (this.boardRealtimeRetryTimer || !this.isApiMode) {
      return;
    }
    this.boardRealtimeRetryTimer = window.setTimeout(() => {
      this.boardRealtimeRetryTimer = undefined;
      if (this.boardRealtimeSocket) {
        const socket = this.boardRealtimeSocket;
        this.boardRealtimeSocket = undefined;
        socket.close();
      }
      this.connectBoardRealtimeIfNeeded();
    }, DEFAULT_REALTIME_RETRY_DELAY_MS);
  }

  private scheduleRealtimeReconnect() {
    if (this.realtimeRetryTimer || !this.isApiMode) {
      return;
    }
    this.realtimeRetryTimer = window.setTimeout(() => {
      this.realtimeRetryTimer = undefined;
      this.restartRealtimeConnection();
    }, DEFAULT_REALTIME_RETRY_DELAY_MS);
  }

  private handleRealtimeEvent(event: RealtimeEvent) {
    if (event.type === "workspace_snapshot") {
      this.apiWorkspaces = this.normalizeApiWorkspaces({
        workspaces: event.workspaces,
      });
      this.requestUpdate();
      return;
    }
    if (event.type === "session_messages_appended" && event.session_id) {
      this.appendRealtimeMessages(event.session_id, event.messages);
    }
  }

  private appendRealtimeMessages(sessionId: string, messages: SessionMessageResponse[] | undefined) {
    const workspace = this.apiWorkspaces.find(
      (item) => item.latest_session_id === sessionId || item.last_session_id === sessionId,
    );
    if (!workspace) {
      return;
    }

    const existing = this.dialogMessagesByWorkspace[workspace.id] ?? [];
    const existingFlat = this.flattenDialogMessages(existing);
    const merged = [...existingFlat];
    const indexByKey = new Map(
      existingFlat.map((item, index) => [this.getDialogMessageIdentity(item), index]),
    );
    const previousLatestTimestamp = this.getLatestDialogTimestamp(existingFlat);
    let hasNewLatestMessage = false;

    for (const message of this.normalizeApiMessagesFlat(messages)) {
      const key = this.getDialogMessageIdentity(message);
      const optimisticIndex = this.findMatchingOptimisticUserMessageIndex(merged, message);
      if (typeof optimisticIndex === "number") {
        merged[optimisticIndex] = message;
        indexByKey.set(key, optimisticIndex);
        hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
        continue;
      }
      const existingIndex = indexByKey.get(key);
      if (typeof existingIndex === "number") {
        merged[existingIndex] = message;
        hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
        continue;
      }
      if (!this.isMessageStrictlyAfter(message.timestamp, previousLatestTimestamp)) {
        continue;
      }
      indexByKey.set(key, merged.length);
      merged.push(message);
      hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
    }

    const sortedMerged = this.sortDialogMessagesByTimestamp(merged);
    if (this.areFlatMessagesEqual(existingFlat, sortedMerged)) {
      return;
    }

    this.dialogMessagesByWorkspace = {
      ...this.dialogMessagesByWorkspace,
      [workspace.id]: this.groupConsecutiveToolMessages(sortedMerged),
    };
    this.requestUpdate();
    if (hasNewLatestMessage) {
      void this.updateComplete.then(() => this.scrollMessagesToBottom());
    }
  }

  private async loadActiveWorkspaces() {
    if (!this.config?.base_url) {
      return;
    }

    this.boardLoading = true;
    this.boardError = "";

    try {
      const response = await fetchActiveWorkspaces({
        baseUrl: this.config.base_url,
        apiKey: this.config.api_key,
      });
      this.apiWorkspaces = this.normalizeApiWorkspaces(response);
      this.emitPreviewStatus();
    } catch (error) {
      this.apiWorkspaces = [];
      this.boardError = this.toErrorMessage(error, "加载工作区失败");
      this.emitPreviewStatus(this.boardError);
    } finally {
      this.boardLoading = false;
      this.requestUpdate();
    }
  }

  private normalizeApiWorkspaces(response: ActiveWorkspacesResponse) {
    const items = Array.isArray(response.workspaces) ? response.workspaces : [];
    return items
      .map((workspace) => this.mapApiWorkspace(workspace))
      .sort((left, right) => this.compareWorkspaces(left, right));
  }

  private mapApiWorkspace(workspace: LocalWorkspaceSummary): KanbanWorkspace {
    // 与 vibe-kanban 主项目保持一致：优先使用 AI 执行完成时间
    const displayTimeSource =
      workspace.latest_process_completed_at ||
      workspace.last_message_at ||
      workspace.updated_at;

    return {
      id: workspace.id,
      name: workspace.name || workspace.id,
      status: workspace.status || "completed",
      latest_session_id: workspace.latest_session_id,
      has_pending_approval: workspace.has_pending_approval,
      has_unseen_turns: workspace.has_unseen_turns,
      has_running_dev_server: workspace.has_running_dev_server,
      latest_process_completed_at: workspace.latest_process_completed_at,
      updated_at: workspace.updated_at,
      last_message_at: workspace.last_message_at,
      relative_time: formatRelativeTime(displayTimeSource),
      files_changed: workspace.files_changed ?? 0,
      lines_added: workspace.lines_added ?? 0,
      lines_removed: workspace.lines_removed ?? 0,
    };
  }

  private compareWorkspaces(left: KanbanWorkspace, right: KanbanWorkspace) {
    const leftPinned = Boolean(left.is_pinned);
    const rightPinned = Boolean(right.is_pinned);
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const leftName = (left.name || left.id).trim().toLocaleLowerCase("zh-CN");
    const rightName = (right.name || right.id).trim().toLocaleLowerCase("zh-CN");
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName, "zh-CN");
    }

    return left.id.localeCompare(right.id, "zh-CN");
  }

  private shouldRefreshWorkspaceMessages(workspace: KanbanWorkspace) {
    const cachedMessages = this.dialogMessagesByWorkspace[workspace.id];
    if (!cachedMessages?.length) {
      return true;
    }

    return this.getWorkspaceMessageVersion(workspace) !== this.dialogMessageVersionsByWorkspace[workspace.id];
  }

  private getWorkspaceMessageVersion(workspace: KanbanWorkspace) {
    return workspace.last_message_at || workspace.updated_at || workspace.latest_session_id || "";
  }

  private async loadWorkspaceMessages(workspaceId: string, forceRefresh = false) {
    if (!this.config?.base_url) {
      return;
    }
    if (!forceRefresh && this.dialogMessagesByWorkspace[workspaceId]) {
      return;
    }

    this.dialogLoading = true;
    this.dialogError = "";

    try {
      const response = await fetchWorkspaceLatestMessages({
        baseUrl: this.config.base_url,
        apiKey: this.config.api_key,
        workspaceId,
        limit: this.config.messages_limit ?? DEFAULT_MESSAGES_LIMIT,
      });
      const normalizedMessages = this.normalizeApiMessages(response.messages);
      this.dialogMessagesByWorkspace = {
        ...this.dialogMessagesByWorkspace,
        [workspaceId]: this.mergeOptimisticMessages(
          this.dialogMessagesByWorkspace[workspaceId] ?? [],
          normalizedMessages,
        ),
      };
      const workspace = this.allWorkspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        this.dialogMessageVersionsByWorkspace = {
          ...this.dialogMessageVersionsByWorkspace,
          [workspaceId]: this.getWorkspaceMessageVersion(workspace),
        };
        // 非 running 状态都触发 LLM 分析动态按钮（带缓存）
        if (workspace.status !== "running") {
          void this.analyzeDynamicButtons(workspace);
        }
      }
      this.emitPreviewStatus();
      this.requestUpdate();
      await this.updateComplete;
      this.scrollMessagesToBottom();
    } catch (error) {
      this.dialogError = this.toErrorMessage(error, "加载消息失败");
      this.emitPreviewStatus(this.dialogError);
    } finally {
      this.dialogLoading = false;
      this.requestUpdate();
    }
  }

  /**
   * 计算字符串的简单 hash（用于缓存判断）
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转为 32 位整数
    }
    return hash.toString(16);
  }

  /**
   * 分析动态按钮（使用 LLM 或正则匹配）
   * 带缓存：相同消息内容不重复调用 LLM
   */
  private async analyzeDynamicButtons(workspace: KanbanWorkspace) {
    const messages = this.dialogMessagesByWorkspace[workspace.id] || [];

    // 获取最后一条 AI 消息
    const lastAiMessage = [...messages]
      .reverse()
      .find((msg) => msg.kind === "message" && msg.sender === "ai");

    if (!lastAiMessage || !("text" in lastAiMessage)) {
      this.extractedButtonsByWorkspace = {
        ...this.extractedButtonsByWorkspace,
        [workspace.id]: [],
      };
      this.suggestedButtonsByWorkspace = {
        ...this.suggestedButtonsByWorkspace,
        [workspace.id]: [],
      };
      this.dynamicButtonsByWorkspace = {
        ...this.dynamicButtonsByWorkspace,
        [workspace.id]: [],
      };
      // 清除缓存
      delete this.dynamicButtonsMessageHashByWorkspace[workspace.id];
      return;
    }

    const message = lastAiMessage.text;
    const messageHash = this.simpleHash(message);
    const cachedHash = this.dynamicButtonsMessageHashByWorkspace[workspace.id];

    // 如果消息内容相同，使用缓存结果
    if (cachedHash === messageHash) {
      return;
    }

    // 构建消息历史（用于短消息时的上下文分析）
    const recentMessages: SessionMessageResponse[] = messages
      .filter((msg): msg is DialogTextMessage =>
        msg.kind === "message" && msg.sender === "ai"
      )
      .slice(-5)
      .map((msg) => ({
        role: "assistant",
        content: msg.text,
        timestamp: msg.timestamp,
      }));

    // 使用 LLM 分析
    const result = await getQuickButtonsWithLLM({
      message,
      workspaceStatus: workspace.status,
      llmEnabled: this.config?.llm_enabled ?? false,
      llmConfig: {
        baseUrl: this.config?.llm_base_url,
        model: this.config?.llm_model,
      },
      recentMessages,
    });

    // 更新缓存
    this.dynamicButtonsMessageHashByWorkspace[workspace.id] = messageHash;
    this.extractedButtonsByWorkspace = {
      ...this.extractedButtonsByWorkspace,
      [workspace.id]: result.extractedButtons,
    };
    this.suggestedButtonsByWorkspace = {
      ...this.suggestedButtonsByWorkspace,
      [workspace.id]: result.suggestedButtons,
    };
    // 兼容旧的 dynamicButtons
    this.dynamicButtonsByWorkspace = {
      ...this.dynamicButtonsByWorkspace,
      [workspace.id]: result.dynamicButtons,
    };
    this.requestUpdate();
  }

  private normalizeApiMessages(messages: SessionMessageResponse[] | undefined) {
    return this.groupConsecutiveToolMessages(this.normalizeApiMessagesFlat(messages));
  }

  private normalizeApiMessagesFlat(messages: SessionMessageResponse[] | undefined) {
    return (Array.isArray(messages) ? messages : [])
      .map((message) => {
        if (message.entry_type === "tool_use") {
          return this.normalizeApiToolMessage(message);
        }
        if (typeof message.content !== "string" || !message.content.trim()) {
          return undefined;
        }
        return {
          key: this.buildMessageKey(message),
          kind: "message",
          sender: message.role === "user" ? "user" : "ai",
          text: this.compactMessageText(message.content),
          timestamp: message.timestamp,
        } satisfies DialogMessage;
      })
      .filter((message): message is DialogTextMessage | DialogToolMessage => Boolean(message));
  }

  private normalizeApiToolMessage(message: SessionMessageResponse) {
    const summary = summarizeToolCall(message);
    if (!summary) {
      return undefined;
    }

    return {
      key: this.buildMessageKey(message),
      kind: "tool",
      toolName: summary.toolName,
      summary: summary.summary,
      detail: summary.detail,
      status: summary.status,
      statusLabel: summary.statusLabel,
      icon: summary.icon,
      command: summary.command,
      changes: summary.changes,
      timestamp: message.timestamp,
    } satisfies DialogMessage;
  }

  private getDialogMessageIdentity(message: DialogMessage) {
    if (message.key) {
      return message.key;
    }
    if (message.kind === "tool-group") {
      return `tool-group:${message.toolName}:${message.summary}:${message.status}`;
    }
    if (message.kind === "tool") {
      return `tool:${message.toolName}:${message.summary}:${message.status}`;
    }
    return `${message.sender}:${message.text}`;
  }

  private groupConsecutiveToolMessages(messages: DialogMessage[]) {
    const grouped: DialogMessage[] = [];

    for (const message of messages) {
      const previous = grouped.at(-1);
      if (
        message.kind === "tool" &&
        previous?.kind === "tool-group" &&
        previous.toolName === message.toolName
      ) {
        previous.items = [...previous.items, message];
        previous.summary = `${previous.items.length} commands`;
        previous.status = this.getGroupedToolStatus(previous.items);
        previous.statusLabel = previous.items.length > 1 ? `${previous.items.length} 条` : previous.statusLabel;
        previous.timestamp = this.getLatestDialogTimestamp(previous.items);
        continue;
      }

      if (
        message.kind === "tool" &&
        previous?.kind === "tool" &&
        previous.toolName === message.toolName
      ) {
        grouped[grouped.length - 1] = {
          kind: "tool-group",
          toolName: message.toolName,
          summary: "2 commands",
          status: this.getGroupedToolStatus([previous, message]),
          statusLabel: "2 条",
          icon: message.icon,
          items: [previous, message],
          timestamp: this.getLatestDialogTimestamp([previous, message]),
        } satisfies DialogToolGroupMessage;
        continue;
      }

      grouped.push(message);
    }

    return grouped;
  }

  private getGroupedToolStatus(items: DialogToolMessage[]): DialogToolStatus {
    if (items.some((item) => item.status === "error")) {
      return "error";
    }
    if (items.some((item) => item.status === "pending")) {
      return "pending";
    }
    if (items.some((item) => item.status === "running")) {
      return "running";
    }
    if (items.some((item) => item.status === "denied")) {
      return "denied";
    }
    if (items.every((item) => item.status === "success")) {
      return "success";
    }
    return "idle";
  }

  private flattenDialogMessages(messages: DialogMessage[]) {
    return messages.flatMap((message) => {
      if (message.kind === "tool-group") {
        return message.items;
      }
      return [message];
    });
  }

  private sortDialogMessagesByTimestamp(messages: Array<DialogTextMessage | DialogToolMessage>) {
    return [...messages].sort((left, right) => {
      const leftTimestampValue = this.getComparableTimestampValue(left.timestamp);
      const rightTimestampValue = this.getComparableTimestampValue(right.timestamp);
      if (
        leftTimestampValue !== undefined &&
        rightTimestampValue !== undefined &&
        leftTimestampValue !== rightTimestampValue
      ) {
        return leftTimestampValue - rightTimestampValue;
      }

      const leftTimestamp = left.timestamp ?? "";
      const rightTimestamp = right.timestamp ?? "";
      if (leftTimestamp && rightTimestamp && leftTimestamp !== rightTimestamp) {
        return leftTimestamp.localeCompare(rightTimestamp);
      }
      return this.getDialogMessageIdentity(left).localeCompare(this.getDialogMessageIdentity(right), "zh-CN");
    });
  }

  private getLatestDialogTimestamp(messages: Array<{ timestamp?: string }>) {
    return messages.reduce<string | undefined>((latest, message) => {
      if (!message.timestamp) {
        return latest;
      }
      if (this.compareTimestamps(message.timestamp, latest) > 0) {
        return message.timestamp;
      }
      return latest;
    }, undefined);
  }

  private isMessageAtOrAfter(timestamp: string | undefined, baseline: string | undefined) {
    return this.compareTimestamps(timestamp, baseline) >= 0;
  }

  private isMessageStrictlyAfter(timestamp: string | undefined, baseline: string | undefined) {
    return this.compareTimestamps(timestamp, baseline) > 0;
  }

  private compareTimestamps(left: string | undefined, right: string | undefined) {
    if (!left) {
      return right ? -1 : 0;
    }
    if (!right) {
      return 1;
    }

    const leftValue = this.getComparableTimestampValue(left);
    const rightValue = this.getComparableTimestampValue(right);
    if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
      return leftValue - rightValue;
    }

    return left.localeCompare(right);
  }

  private getComparableTimestampValue(timestamp: string | undefined) {
    if (!timestamp) {
      return undefined;
    }

    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }

  private areFlatMessagesEqual(
    left: Array<DialogTextMessage | DialogToolMessage>,
    right: Array<DialogTextMessage | DialogToolMessage>,
  ) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((message, index) => this.getFlatMessageSignature(message) === this.getFlatMessageSignature(right[index]!));
  }

  private getFlatMessageSignature(message: DialogTextMessage | DialogToolMessage) {
    if (message.kind === "tool") {
      return [
        "tool",
        this.getDialogMessageIdentity(message),
        message.timestamp ?? "",
        message.status,
        message.summary,
        message.detail,
        message.command ?? "",
      ].join("::");
    }

    return [
      "message",
      this.getDialogMessageIdentity(message),
      message.timestamp ?? "",
      message.sender,
      message.text,
    ].join("::");
  }

  private appendOptimisticUserMessage(workspaceId: string, text: string) {
    const optimisticMessage: DialogTextMessage = {
      key: `local:${Date.now()}:${text}`,
      kind: "message",
      sender: "user",
      text: this.compactMessageText(text),
      timestamp: new Date().toISOString(),
    };
    const existing = this.dialogMessagesByWorkspace[workspaceId] ?? [];
    this.dialogMessagesByWorkspace = {
      ...this.dialogMessagesByWorkspace,
      [workspaceId]: [...existing, optimisticMessage],
    };
    this.requestUpdate();
  }

  private mergeOptimisticMessages(existing: DialogMessage[], incoming: DialogMessage[]) {
    const merged = [...incoming];
    const optimisticMessages = existing.filter(
      (message): message is DialogTextMessage =>
        message.kind === "message" &&
        message.sender === "user" &&
        typeof message.key === "string" &&
        message.key.startsWith("local:"),
    );

    for (const optimisticMessage of optimisticMessages) {
      const alreadyPersisted = incoming.some(
        (message) =>
          message.kind === "message" &&
          message.sender === "user" &&
          message.text === optimisticMessage.text,
      );
      if (!alreadyPersisted) {
        merged.push(optimisticMessage);
      }
    }

    return merged;
  }

  private findMatchingOptimisticUserMessageIndex(messages: DialogMessage[], incoming: DialogMessage) {
    if (incoming.kind !== "message" || incoming.sender !== "user") {
      return undefined;
    }

    return messages.findIndex(
      (message) =>
        message.kind === "message" &&
        message.sender === "user" &&
        typeof message.key === "string" &&
        message.key.startsWith("local:") &&
        message.text === incoming.text,
    );
  }

  private buildMessageKey(message: SessionMessageResponse) {
    if (
      typeof message.process_id === "string" &&
      typeof message.entry_index === "number"
    ) {
      return `${message.process_id}:${message.entry_index}`;
    }
    if (typeof message.id === "number") {
      return `id:${message.id}`;
    }
    if (typeof message.timestamp === "string" && typeof message.content === "string") {
      return `${message.timestamp}:${message.content}`;
    }
    return undefined;
  }

  private toErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
      return `${fallback}：${error.message.trim()}`;
    }
    return fallback;
  }
}
