import { LitElement, html, nothing } from "lit";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import { getStatusMeta } from "./lib/status-meta";
import { cardStyles } from "./styles";
import type {
  KanbanConversationMessage,
  KanbanEntityAttributes,
  KanbanSessionAttributes,
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
  };

  hass?: HomeAssistantLike;

  private config?: CardConfig;

  private collapsedSections = new Set<SectionKey>();

  private selectedWorkspaceId?: string;

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
        ${this.renderConversationDialog()}
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
    const timeSource =
      workspace.relative_time ||
      (workspace.status === "completed"
        ? workspace.completed_at ?? this.entityAttributes?.updated_at
        : this.entityAttributes?.updated_at);
    const relativeTime = workspace.relative_time || formatRelativeTime(timeSource);
    const filesChanged = workspace.files_changed ?? 0;
    const linesAdded = workspace.lines_added ?? 0;
    const linesRemoved = workspace.lines_removed ?? 0;

    return html`
      <button
        class="task-card ${statusMeta.accentClass}"
        type="button"
        @click=${() => this.openConversation(workspace.id)}
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

  private toggleSection(key: SectionKey) {
    const next = new Set(this.collapsedSections);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.collapsedSections = next;
  }

  private openConversation(workspaceId: string) {
    this.selectedWorkspaceId = workspaceId;
  }

  private closeConversation() {
    this.selectedWorkspaceId = undefined;
  }

  private get entityAttributes(): KanbanEntityAttributes | undefined {
    if (!this.hass || !this.config?.entity) {
      return undefined;
    }

    return this.hass.states[this.config.entity]?.attributes;
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

  private renderConversationDialog() {
    const workspace = this.selectedWorkspace;
    if (!workspace) {
      return nothing;
    }

    const session = this.sessionAttributesForWorkspace(workspace);
    const messages = this.sessionMessages(session);
    const updatedAt = session?.updated_at ? formatRelativeTime(session.updated_at) : "";

    return html`
      <div class="dialog-backdrop" @click=${this.closeConversation}>
        <section
          class="conversation-dialog"
          @click=${(event: Event) => event.stopPropagation()}
        >
          <div class="dialog-header">
            <div>
              <div class="dialog-title">${workspace.name}</div>
              <div class="dialog-subtitle">
                ${workspace.latest_session_id ?? workspace.latestSessionId ?? "无 session"}
                ${updatedAt ? html`<span>· ${updatedAt}</span>` : nothing}
              </div>
            </div>
            <button
              class="dialog-close"
              type="button"
              @click=${this.closeConversation}
              aria-label="关闭对话弹窗"
            >
              ×
            </button>
          </div>
          ${messages.length === 0
            ? html`<div class="dialog-empty">暂无对话记录</div>`
            : html`
                <div class="conversation-list">
                  ${messages.map((message) => this.renderConversationMessage(message))}
                </div>
              `}
        </section>
      </div>
    `;
  }

  private renderConversationMessage(message: KanbanConversationMessage) {
    const role = (message.role ?? "assistant").toLowerCase();
    const timestamp = message.timestamp ? formatRelativeTime(message.timestamp) : "";

    return html`
      <article class="conversation-item role-${role}">
        <div class="conversation-meta">
          <span class="conversation-role">${role}</span>
          ${timestamp ? html`<span class="conversation-time">${timestamp}</span>` : nothing}
        </div>
        <div class="conversation-content">${message.content ?? ""}</div>
      </article>
    `;
  }

  private get selectedWorkspace(): KanbanWorkspace | undefined {
    if (!this.selectedWorkspaceId) {
      return undefined;
    }
    return this.normalizedWorkspaces.find((workspace) => workspace.id === this.selectedWorkspaceId);
  }

  private sessionAttributesForWorkspace(
    workspace: KanbanWorkspace,
  ): KanbanSessionAttributes | undefined {
    const sessionId = workspace.latest_session_id ?? workspace.latestSessionId;
    if (!sessionId || !this.hass?.states) {
      return undefined;
    }

    for (const state of Object.values(this.hass.states)) {
      const attrs = this.asSessionAttributes(state.attributes);
      const candidateId = attrs?.session_id ?? attrs?.sessionId;
      if (candidateId === sessionId) {
        return attrs;
      }
    }

    const fallbackEntityId = `sensor.kanban_watcher_kanban_session_${sessionId.slice(0, 8)}`;
    return this.asSessionAttributes(this.hass.states[fallbackEntityId]?.attributes);
  }

  private sessionMessages(session?: KanbanSessionAttributes): KanbanConversationMessage[] {
    const messages = session?.recent_messages;
    if (Array.isArray(messages)) {
      return messages.filter((message) => this.isConversationMessage(message));
    }
    if (typeof messages === "string") {
      try {
        const parsed = JSON.parse(messages);
        return Array.isArray(parsed)
          ? parsed.filter((message) => this.isConversationMessage(message))
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private asSessionAttributes(value: unknown): KanbanSessionAttributes | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    const attrs = value as KanbanSessionAttributes;
    if (typeof (attrs.session_id ?? attrs.sessionId) !== "string") {
      return undefined;
    }
    return attrs;
  }

  private isConversationMessage(value: unknown): value is KanbanConversationMessage {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof (value as { content?: unknown }).content === "string",
    );
  }
}
