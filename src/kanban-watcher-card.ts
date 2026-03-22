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

const ATTENTION_DIALOG_MESSAGES: DialogMessage[] = [
  { sender: "user", text: "请先确认这个工作区的下一步安排。" },
  { sender: "ai", text: "我先整理最新状态，稍后给你结论。" },
  { sender: "user", text: "如果需要审批，直接告诉我卡在哪一步。" },
  { sender: "ai", text: "目前还差最后一条确认消息，我会继续跟进。" },
  { sender: "user", text: "如果下午还没有结果，就先给我一个阻塞说明。" },
  { sender: "ai", text: "可以，我会先把阻塞点、影响范围和建议处理顺序写清楚。" },
  { sender: "user", text: "顺便看下是不是有人还没回复你。" },
  { sender: "ai", text: "我已经补发了一次提醒，接下来等对方确认后再继续推进。" },
  { sender: "user", text: "如果对方继续没回复，就先给我一个备选方案。" },
  { sender: "ai", text: "明白，我会准备一个不依赖对方输入的降级处理方案。" },
  { sender: "user", text: "晚上之前给我一个阶段性结论。" },
  { sender: "ai", text: "好的，今晚之前我会回传当前进度、阻塞点和建议动作。" },
  { sender: "user", text: "如果需要我拍板，直接把选项写清楚。" },
  { sender: "ai", text: "收到，我会把可选方案整理成简短列表，方便你直接决策。" },
  { sender: "user", text: "先继续推进，有更新就按这个线程同步。" },
];

const RUNNING_DIALOG_MESSAGES: DialogMessage[] = [
  { sender: "user", text: "运行中的任务目前有新的输出吗？" },
  { sender: "ai", text: "有，刚刚补充了一段新的处理结果，还在继续执行。" },
  { sender: "user", text: "先盯住结果，如果异常就立刻提醒我。" },
  { sender: "ai", text: "收到，我会在异常出现时第一时间同步。" },
  { sender: "user", text: "日志里面如果出现重复重试，也一起带上。" },
  { sender: "ai", text: "好的，我会继续观察日志，并在下一轮输出后同步你。" },
  { sender: "user", text: "如果今晚之前能跑完，就顺手帮我总结一次。" },
  { sender: "ai", text: "明白，结束后我会整理一版简短总结放在最后一条消息里。" },
  { sender: "user", text: "有没有发现性能抖动或者处理延迟？" },
  { sender: "ai", text: "目前有轻微波动，但还没超过预期阈值，我会继续监控。" },
  { sender: "user", text: "如果延迟继续升高，就优先保结果不要保速度。" },
  { sender: "ai", text: "了解，我会先确保结果稳定，再考虑吞吐表现。" },
  { sender: "user", text: "下一轮输出后把关键日志摘给我。" },
  { sender: "ai", text: "可以，我会只保留关键片段，避免消息太长影响阅读。" },
  { sender: "user", text: "继续跑，先不要中断。" },
];

const IDLE_DIALOG_MESSAGES: DialogMessage[] = [
  { sender: "user", text: "这个任务已经结束了吗？" },
  { sender: "ai", text: "已经结束，当前没有新的待处理动作。" },
  { sender: "user", text: "那先保留记录，后续有变更再通知。" },
  { sender: "ai", text: "好的，我会保留上下文并等待下一步指令。" },
  { sender: "user", text: "之前确认过的问题点也一起保留下来。" },
  { sender: "ai", text: "已记录，后续如果重新打开这个任务，我会先把这些点带出来。" },
  { sender: "user", text: "那就先这样，今天不用再继续追了。" },
  { sender: "ai", text: "收到，当前先保持静默，等待新的输入。" },
  { sender: "user", text: "如果有人重新提这个任务，就先提醒我历史结论。" },
  { sender: "ai", text: "可以，我会优先附上之前的结论和保留意见。" },
  { sender: "user", text: "这条线程先别清掉，可能明天还要继续。" },
  { sender: "ai", text: "明白，我会保留完整上下文，方便后续直接续接。" },
  { sender: "user", text: "若有新的相关消息，也合并到这里。" },
  { sender: "ai", text: "可以，相关更新我会继续归档到同一个会话中。" },
  { sender: "user", text: "好，先归档但不要删除。" },
];

const FAILED_DIALOG_MESSAGES: DialogMessage[] = [
  { sender: "user", text: "这个失败任务现在卡在哪里？" },
  { sender: "ai", text: "当前卡在最后一步校验，前面的处理已经完成。" },
  { sender: "user", text: "先确认是不是输入条件有变化。" },
  { sender: "ai", text: "我正在回看最近一次输入，暂时没看到明显变更。" },
  { sender: "user", text: "如果不是输入问题，就查执行链路。" },
  { sender: "ai", text: "明白，我会沿着执行链路逐步排查失败位置。" },
  { sender: "user", text: "把你认为最可能的三个原因列出来。" },
  { sender: "ai", text: "目前优先怀疑依赖超时、重试失效和状态回写异常。" },
  { sender: "user", text: "先验证最便宜的那个。" },
  { sender: "ai", text: "我会优先检查依赖超时和日志缺口，这两项验证成本最低。" },
  { sender: "user", text: "如果 30 分钟内没有结果，就先发阻塞说明。" },
  { sender: "ai", text: "收到，超时后我会先给你阻塞说明和下一步建议。" },
  { sender: "user", text: "别直接重跑，先搞清楚根因。" },
  { sender: "ai", text: "了解，在没有根因前我不会盲目重试。" },
  { sender: "user", text: "继续查，有进展就发这里。" },
];

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
                    <div class="message-bubble ${message.sender === "user" ? "is-user" : "is-ai"}">
                      ${unsafeHTML(renderMessageMarkdown(this.compactMessageText(message.text)))}
                    </div>
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

    const messageMap: Record<string, DialogMessage[]> = {
      "attention-1": ATTENTION_DIALOG_MESSAGES,
      "approval-needed": ATTENTION_DIALOG_MESSAGES,
      "running-1": RUNNING_DIALOG_MESSAGES,
      "running-active": RUNNING_DIALOG_MESSAGES,
      "idle-1": IDLE_DIALOG_MESSAGES,
      "idle-completed": IDLE_DIALOG_MESSAGES,
      "attention-failed": FAILED_DIALOG_MESSAGES,
    };

    return (
      messageMap[workspace.id] ?? [
        { sender: "user", text: `请同步 ${workspace.name} 的最新情况。` },
        { sender: "ai", text: "我正在整理消息记录，稍后继续反馈。" },
      ]
    );
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
