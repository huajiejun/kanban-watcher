import { LitElement, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { fetchActiveWorkspaces, fetchWorkspaceLatestMessages, sendWorkspaceFollowUp } from "./lib/http-api";
import { connectRealtime } from "./lib/realtime-api";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import { renderMessageMarkdown } from "./lib/render-message-markdown";
import { getStatusMeta } from "./lib/status-meta";
import { summarizeToolCall, type DialogToolStatus } from "./lib/tool-call";
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
} from "./types";

type SectionKey = "attention" | "running" | "idle";

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
};

type DialogAction = "send" | "queue" | "stop";
type DialogTextMessage = {
  key?: string;
  kind: "message";
  sender: "user" | "ai";
  text: string;
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
};
type DialogMessage = DialogTextMessage | DialogToolMessage;
type QueueItem = {
  workspaceId: string;
  content: string;
};

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
  private queuedItems: QueueItem[] = [];
  private apiWorkspaces: KanbanWorkspace[] = [];
  private boardLoading = false;
  private boardError = "";
  private dialogLoading = false;
  private dialogError = "";
  private dialogMessagesByWorkspace: Record<string, DialogMessage[]> = {};
  private expandedToolMessageKeys = new Set<string>();

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

    return sections.map(({ key, label, workspaces }) =>
      this.renderSection(key, label, workspaces),
    );
  }

  private renderSection(
    key: SectionKey,
    label: string,
    workspaces: KanbanWorkspace[],
  ) {
    const collapsed = this.collapsedSections.has(key);

    return html`
      <section class="section" ?collapsed=${collapsed}>
        <button
          class="section-toggle"
          type="button"
          @click=${() => this.toggleSection(key)}
        >
          <span class="section-title-row">
            <span class="section-title">${label}</span>
            <span class="section-count">${workspaces.length}</span>
          </span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
        ${collapsed
          ? nothing
          : html`
              <div class="section-body">
                ${workspaces.map((workspace) => this.renderWorkspace(workspace))}
              </div>
            `}
      </section>
    `;
  }

  private renderWorkspace(workspace: KanbanWorkspace) {
    const statusMeta = getStatusMeta(workspace);
    const { relativeTime, filesChanged, linesAdded, linesRemoved } =
      this.getWorkspaceDisplayMeta(workspace);

    return html`
      <button
        class="task-card ${statusMeta.accentClass}"
        type="button"
        @click=${() => this.openWorkspaceDialog(workspace)}
      >
        <div class="workspace-name">${workspace.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            ${statusMeta.icons.map(
              (icon) => html`<span class="status-icon tone-${icon.tone} kind-${icon.kind}"
                >${icon.symbol}</span
              >`,
            )}
          </span>
          <span class="relative-time">${relativeTime}</span>
          <span class="meta-files"
            ><span class="file-count">📄 ${filesChanged}</span> <span
              class="lines-added"
              >+${linesAdded}</span
            >
            <span class="lines-removed">-${linesRemoved}</span></span
          >
        </div>
      </button>
    `;
  }

  private renderDialog() {
    const workspace = this.selectedWorkspace;

    if (!workspace) {
      return nothing;
    }

    const messages = this.getDialogMessages(workspace);
    const isRunning = workspace.status === "running";
    const queuedItems = this.getQueueItems(workspace.id);

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
            ${queuedItems.length > 0
              ? html`
                  <div class="queue-list">
                    ${queuedItems.map(
                      (item, index) => html`
                        <div class="queue-item">
                          <span class="queue-index">队列 ${index + 1}</span>
                          <span class="queue-content">${item.content}</span>
                        </div>
                      `,
                    )}
                  </div>
                `
              : nothing}
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
              ${isRunning
                ? html`
                    <button
                      class="dialog-action dialog-action-secondary"
                      type="button"
                      @click=${() => void this.handleActionClick("queue")}
                    >
                      加入队列
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
      void this.loadWorkspaceMessages(workspace.id, true);
    }
  }

  private closeWorkspaceDialog = () => {
    this.selectedWorkspaceId = undefined;
    this.messageDraft = "";
    this.actionFeedback = "";
    this.dialogError = "";
    this.dialogLoading = false;
    this.expandedToolMessageKeys = new Set();
  };

  private renderDialogEntry(message: DialogMessage) {
    if (message.kind === "tool") {
      return this.renderToolMessage(message);
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
                ${message.detail
                  ? html`${unsafeHTML(renderMessageMarkdown(message.detail))}`
                  : nothing}
              </div>
            `
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
    if (action === "queue" && this.selectedWorkspaceId) {
      const content = this.messageDraft.trim() || "未填写内容的排队消息";
      this.queuedItems = [
        ...this.queuedItems.filter((item) => item.workspaceId !== this.selectedWorkspaceId),
        { workspaceId: this.selectedWorkspaceId, content },
      ];
      this.actionFeedback = "加入队列功能暂未接入，当前仅展示界面。";
      return;
    }

    if (action === "stop") {
      this.actionFeedback = "停止功能暂未接入，当前仅展示界面。";
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
      this.actionFeedback = "正在发送消息...";
      const response = await sendWorkspaceFollowUp({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
        message,
      });
      this.messageDraft = "";
      this.actionFeedback = response.message?.trim()
        ? `发送成功：${response.message.trim()}`
        : "发送成功。";
      this.emitPreviewStatus();
      await this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "发送消息失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === "Escape" && this.selectedWorkspace) {
      this.closeWorkspaceDialog();
    }
  };

  private getWorkspaceDisplayMeta(workspace: KanbanWorkspace) {
    const timeSource =
      workspace.relative_time ||
      workspace.updated_at ||
      workspace.last_message_at ||
      (workspace.status === "completed"
        ? workspace.completed_at ?? this.entityAttributes?.updated_at
        : this.entityAttributes?.updated_at);

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
    const messageList = this.renderRoot.querySelector(".message-list") as
      | HTMLDivElement
      | null;

    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  private getQueueItems(workspaceId: string) {
    return this.queuedItems.filter((item) => item.workspaceId === workspaceId);
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
    const merged = [...existing];
    const indexByKey = new Map(
      existing.map((item, index) => [this.getDialogMessageIdentity(item), index]),
    );

    for (const message of this.normalizeApiMessages(messages)) {
      const key = this.getDialogMessageIdentity(message);
      const existingIndex = indexByKey.get(key);
      if (typeof existingIndex === "number") {
        merged[existingIndex] = message;
        continue;
      }
      indexByKey.set(key, merged.length);
      merged.push(message);
    }

    this.dialogMessagesByWorkspace = {
      ...this.dialogMessagesByWorkspace,
      [workspace.id]: merged,
    };
    this.requestUpdate();
    void this.updateComplete.then(() => this.scrollMessagesToBottom());
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
    const updatedAt = workspace.last_message_at || workspace.updated_at;
    return {
      id: workspace.id,
      name: workspace.name || workspace.id,
      status: workspace.status || "completed",
      latest_session_id: workspace.latest_session_id,
      has_pending_approval: workspace.has_pending_approval,
      has_unseen_turns: workspace.has_unseen_turns,
      has_running_dev_server: workspace.has_running_dev_server,
      updated_at: updatedAt,
      relative_time: formatRelativeTime(updatedAt),
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
      this.dialogMessagesByWorkspace = {
        ...this.dialogMessagesByWorkspace,
        [workspaceId]: this.normalizeApiMessages(response.messages),
      };
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

  private normalizeApiMessages(messages: SessionMessageResponse[] | undefined) {
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
        } satisfies DialogMessage;
      })
      .filter((message): message is DialogMessage => Boolean(message));
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
    } satisfies DialogMessage;
  }

  private getDialogMessageIdentity(message: DialogMessage) {
    if (message.key) {
      return message.key;
    }
    if (message.kind === "tool") {
      return `tool:${message.toolName}:${message.summary}:${message.status}`;
    }
    return `${message.sender}:${message.text}`;
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
