import { LitElement, html, nothing } from "lit";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import { getStatusMeta } from "./lib/status-meta";
import { cardStyles } from "./styles";
import type { KanbanEntityAttributes, KanbanWorkspace } from "./types";

type SectionKey = "attention" | "running" | "idle";

type HomeAssistantState = {
  attributes?: KanbanEntityAttributes;
};

type HomeAssistantLike = {
  states: Record<string, HomeAssistantState>;
};

type CardConfig = {
  entity: string;
};

type DialogAction = "send" | "queue";
type DialogMessage = {
  sender: "user" | "ai";
  text: string;
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
                  <div class="message-row is-${message.sender}">
                    <div class="message-bubble">${message.text}</div>
                  </div>
                `,
              )}
            </div>
          </section>

          <div class="dialog-composer">
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
                @click=${() => this.handleActionClick("send")}
              >
                发送消息
              </button>
              <button
                class="dialog-action dialog-action-secondary"
                type="button"
                @click=${() => this.handleActionClick("queue")}
              >
                队列消息
              </button>
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
    this.actionFeedback =
      action === "send"
        ? "发送消息功能暂未接入，当前仅展示界面。"
        : "队列消息功能暂未接入，当前仅展示界面。";
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
    const messageMap: Record<string, DialogMessage[]> = {
      "attention-1": [
        { sender: "user", text: "请先确认这个工作区的下一步安排。" },
        { sender: "ai", text: "我先整理最新状态，稍后给你结论。" },
        { sender: "user", text: "如果需要审批，直接告诉我卡在哪一步。" },
        { sender: "ai", text: "目前还差最后一条确认消息，我会继续跟进。" },
        { sender: "user", text: "如果下午还没有结果，就先给我一个阻塞说明。" },
        { sender: "ai", text: "可以，我会先把阻塞点、影响范围和建议处理顺序写清楚。" },
        { sender: "user", text: "顺便看下是不是有人还没回复你。" },
        { sender: "ai", text: "我已经补发了一次提醒，接下来等对方确认后再继续推进。" },
      ],
      "running-1": [
        { sender: "user", text: "运行中的任务目前有新的输出吗？" },
        { sender: "ai", text: "有，刚刚补充了一段新的处理结果，还在继续执行。" },
        { sender: "user", text: "先盯住结果，如果异常就立刻提醒我。" },
        { sender: "ai", text: "收到，我会在异常出现时第一时间同步。" },
        { sender: "user", text: "日志里面如果出现重复重试，也一起带上。" },
        { sender: "ai", text: "好的，我会继续观察日志，并在下一轮输出后同步你。" },
        { sender: "user", text: "如果今晚之前能跑完，就顺手帮我总结一次。" },
        { sender: "ai", text: "明白，结束后我会整理一版简短总结放在最后一条消息里。" },
      ],
      "idle-1": [
        { sender: "user", text: "这个任务已经结束了吗？" },
        { sender: "ai", text: "已经结束，当前没有新的待处理动作。" },
        { sender: "user", text: "那先保留记录，后续有变更再通知。" },
        { sender: "ai", text: "好的，我会保留上下文并等待下一步指令。" },
        { sender: "user", text: "之前确认过的问题点也一起保留下来。" },
        { sender: "ai", text: "已记录，后续如果重新打开这个任务，我会先把这些点带出来。" },
        { sender: "user", text: "那就先这样，今天不用再继续追了。" },
        { sender: "ai", text: "收到，当前先保持静默，等待新的输入。" },
      ],
    };

    return (
      messageMap[workspace.id] ?? [
        { sender: "user", text: `请同步 ${workspace.name} 的最新情况。` },
        { sender: "ai", text: "我正在整理消息记录，稍后继续反馈。" },
      ]
    );
  }
}
