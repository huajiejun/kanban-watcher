import { LitElement, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import { renderMessageMarkdown } from "./lib/render-message-markdown";
import { getStatusMeta } from "./lib/status-meta";
import { cardStyles } from "./styles";
import type {
  KanbanEntityAttributes,
  KanbanSessionAttributes,
  KanbanSessionMessage,
  KanbanWorkspace,
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
};

type DialogAction = "send" | "queue" | "stop";
type DialogMessage = {
  sender: "user" | "ai";
  text: string;
};
type QueueItem = {
  workspaceId: string;
  content: string;
};

const SECTION_ORDER: Array<{ key: SectionKey; label: string }> = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" },
];

export class KanbanWatcherCard extends LitElement {
  static styles = cardStyles;

  static properties = {
    hass: { attribute: false },
    collapsedSections: { state: true },
    selectedWorkspaceId: { state: true },
    messageDraft: { state: true },
    actionFeedback: { state: true },
  };

  hass?: HomeAssistantLike;

  private config?: CardConfig;

  private collapsedSections = new Set<SectionKey>();
  private selectedWorkspaceId?: string;
  private messageDraft = "";
  private actionFeedback = "";
  private queuedItems: QueueItem[] = [];

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    this.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  setConfig(config: CardConfig) {
    if (!config?.entity) {
      throw new Error("`entity` is required");
    }

    this.config = config;
  }

  getCardSize() {
    return Math.max(1, this.visibleSections.length * 2);
  }

  protected render() {
    const sections = this.visibleSections;

    return html`
      <ha-card>
        <div class="board">
          ${sections.length === 0
            ? html`<div class="empty-state">当前没有任务</div>`
            : sections.map(({ key, label, workspaces }) =>
                this.renderSection(key, label, workspaces),
              )}
        </div>
        ${this.renderDialog()}
      </ha-card>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("selectedWorkspaceId") && this.selectedWorkspaceId) {
      this.scrollMessagesToBottom();
    }
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
              ${messages.map(
                (message) => html`
                  <div class="message-row">
                    <div class="message-bubble ${message.sender === "user" ? "is-user" : "is-ai"}">${unsafeHTML(renderMessageMarkdown(this.compactMessageText(message.text)))}</div>
                  </div>
                `,
              )}
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
                @click=${() => this.handleActionClick(isRunning ? "stop" : "send")}
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
                      @click=${() => this.handleActionClick("queue")}
                    >
                      加入队列
                    </button>
                  `
                : nothing}
            </div>
            <div class="dialog-feedback" aria-live="polite">
              ${this.actionFeedback || "消息操作暂未接入真实接口。"}
            </div>
          </div>
        </section>
      </div>
    `;
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
  }

  private closeWorkspaceDialog = () => {
    this.selectedWorkspaceId = undefined;
    this.messageDraft = "";
    this.actionFeedback = "";
  };

  private handleMessageInput = (event: Event) => {
    this.messageDraft = (event.target as HTMLTextAreaElement).value;
  };

  private handleActionClick(action: DialogAction) {
    if (action === "queue" && this.selectedWorkspaceId) {
      const content = this.messageDraft.trim() || "未填写内容的排队消息";
      this.queuedItems = [
        ...this.queuedItems.filter((item) => item.workspaceId !== this.selectedWorkspaceId),
        { workspaceId: this.selectedWorkspaceId, content },
      ];
      this.actionFeedback = "加入队列功能暂未接入，当前仅展示界面。";
      return;
    }

    this.actionFeedback =
      action === "send"
        ? "发送消息功能暂未接入，当前仅展示界面。"
        : "停止功能暂未接入，当前仅展示界面。";
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

    return this.normalizedWorkspaces.find(
      (workspace) => workspace.id === this.selectedWorkspaceId,
    );
  }

  private get visibleSections() {
    const grouped = groupWorkspaces(this.normalizedWorkspaces);

    return SECTION_ORDER.map(({ key, label }) => ({
      key,
      label,
      workspaces: grouped[key],
    })).filter((section) => section.workspaces.length > 0);
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
    const recentSessionMessages = this.getRecentSessionMessages(workspace);

    if (recentSessionMessages.length > 0) {
      return recentSessionMessages;
    }

    const sessionId = workspace.latest_session_id ?? workspace.last_session_id;

    return [
      {
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
      ? [{ sender: "ai", text: attributes.last_message.trim() }]
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
}
