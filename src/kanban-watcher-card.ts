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
  };

  hass?: HomeAssistantLike;

  private config?: CardConfig;

  private collapsedSections = new Set<SectionKey>();

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
        <div class="task-card ${statusMeta.accentClass}">
        <div class="workspace-name">${workspace.name}</div>
        <div class="task-meta">
          <span class="meta-status">
            <span class="leading-icon">${statusMeta.leadingIcon}</span>
            ${statusMeta.unseenIcon
              ? html`<span class="unseen-icon">${statusMeta.unseenIcon}</span>`
              : nothing}
            ${statusMeta.approvalIcon
              ? html`<span class="approval-icon">${statusMeta.approvalIcon}</span>`
              : nothing}
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
}
