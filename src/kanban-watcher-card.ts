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

    const statusMeta = getStatusMeta(workspace);
    const { relativeTime, filesChanged, linesAdded, linesRemoved } =
      this.getWorkspaceDisplayMeta(workspace);

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
              <div class="dialog-eyebrow">工作区详情</div>
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

          <div class="dialog-summary ${statusMeta.accentClass}">
            <div class="dialog-summary-top">
              <span class="meta-status">
                ${statusMeta.icons.map(
                  (icon) => html`<span class="status-icon tone-${icon.tone} kind-${icon.kind}"
                    >${icon.symbol}</span
                  >`,
                )}
              </span>
              <span class="dialog-summary-time">${relativeTime}</span>
            </div>
            <div class="dialog-summary-bottom">
              <span>状态：${this.getWorkspaceStatusLabel(workspace)}</span>
              <span>📄 ${filesChanged}</span>
              <span class="lines-added">+${linesAdded}</span>
              <span class="lines-removed">-${linesRemoved}</span>
            </div>
          </div>

          <section class="dialog-panel">
            <div class="dialog-panel-title">查看兑换内容</div>
            <div class="dialog-panel-body">
              <div class="dialog-content-card">
                <div class="dialog-content-kicker">兑换摘要</div>
                <div class="dialog-content-title">${workspace.name} 当前兑换方案</div>
                <p class="dialog-content-text">
                  第一版先展示预设内容，用于承载后续真实兑换详情。当前可查看推荐方案、兑换说明与下一步动作入口。
                </p>
                <div class="dialog-content-grid">
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">推荐档位</span>
                    <span class="dialog-content-value">标准兑换包</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">兑换状态</span>
                    <span class="dialog-content-value">待确认</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">处理建议</span>
                    <span class="dialog-content-value">优先发送消息确认细节</span>
                  </div>
                  <div class="dialog-content-item">
                    <span class="dialog-content-label">预留说明</span>
                    <span class="dialog-content-value">第二期接入真实接口与动态字段</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="dialog-panel">
            <div class="dialog-panel-title">消息操作</div>
            <div class="dialog-panel-body">
              <textarea
                class="message-input"
                rows="4"
                placeholder="输入要发送给当前工作区的消息内容"
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
                ${this.actionFeedback || "动作已预留，第二期接入真实能力。"}
              </div>
            </div>
          </section>
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
        ? "发送消息功能将在第二期接入，当前为界面占位。"
        : "队列消息功能将在第二期接入，当前为界面占位。";
  }

  private handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === "Escape" && this.selectedWorkspace) {
      this.closeWorkspaceDialog();
    }
  };

  private getWorkspaceStatusLabel(workspace: KanbanWorkspace) {
    if (workspace.has_pending_approval) {
      return "待审批";
    }

    if (workspace.status === "running") {
      return "运行中";
    }

    if (workspace.has_unseen_turns) {
      return "需关注";
    }

    return "空闲";
  }

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
}
