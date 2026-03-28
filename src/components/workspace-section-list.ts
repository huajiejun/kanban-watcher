import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import { getStatusMeta } from "../lib/status-meta";
import { workspaceSectionListStyles } from "../styles";
import type { KanbanWorkspace } from "../types";

export type WorkspaceSectionKey = "attention" | "running" | "idle";

export type WorkspaceSection = {
  key: WorkspaceSectionKey;
  label: string;
  workspaces: KanbanWorkspace[];
};

type WorkspaceDisplayMeta = {
  relativeTime: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
};

type RenderWorkspaceSectionListOptions = {
  sections: WorkspaceSection[];
  collapsedSections: Set<WorkspaceSectionKey>;
  compact?: boolean;
  selectedWorkspaceId?: string;
  getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => WorkspaceDisplayMeta;
  onToggleSection: (key: WorkspaceSectionKey) => void;
  onSelectWorkspace: (workspace: KanbanWorkspace) => void;
  onMenuAction?: (workspace: KanbanWorkspace, action: string) => void;
  activeMenuWorkspaceId?: string;
};

export function renderWorkspaceSectionList({
  sections,
  collapsedSections,
  compact = false,
  selectedWorkspaceId,
  getWorkspaceDisplayMeta,
  onToggleSection,
  onSelectWorkspace,
  onMenuAction,
  activeMenuWorkspaceId,
}: RenderWorkspaceSectionListOptions): TemplateResult[] {
  return sections.map(({ key, label, workspaces }) => {
    const collapsed = collapsedSections.has(key);

    return html`
      <section class="section" ?collapsed=${collapsed}>
        <button class="section-toggle" type="button" @click=${() => onToggleSection(key)}>
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
                ${workspaces.map((workspace) =>
                  renderWorkspaceCard(
                    workspace,
                    selectedWorkspaceId,
                    compact,
                    getWorkspaceDisplayMeta,
                    onSelectWorkspace,
                    onMenuAction,
                    activeMenuWorkspaceId === workspace.id,
                  ),
                )}
              </div>
            `}
      </section>
    `;
  });
}

export class WorkspaceSectionList extends LitElement {
  static styles = [workspaceSectionListStyles, css`
    .task-card-menu-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 140px;
      background: var(--primary-background-color, #1e293b);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 100;
      overflow: hidden;
    }

    .task-card-menu-item {
      width: 100%;
      padding: 10px 14px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #e2e8f0);
      font: inherit;
      font-size: 0.82rem;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .task-card-menu-item:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-color, #f1f5f9);
    }

    .task-card-menu-item.is-danger {
      color: var(--error-color, #f87171);
    }

    .task-card-menu-item.is-danger:hover {
      background: rgba(239, 68, 68, 0.15);
    }

    .task-card-menu-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
      margin: 4px 0;
    }
  `];

  static properties = {
    sections: { attribute: false },
    collapsedSections: { attribute: false },
    compact: { type: Boolean },
    selectedWorkspaceId: { attribute: false },
    getWorkspaceDisplayMeta: { attribute: false },
    activeMenuWorkspaceId: { state: true },
  };

  sections: WorkspaceSection[] = [];
  collapsedSections = new Set<WorkspaceSectionKey>();
  compact = false;
  selectedWorkspaceId?: string;
  activeMenuWorkspaceId?: string;
  getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => WorkspaceDisplayMeta = (workspace) => ({
    relativeTime: workspace.relative_time ?? "刚刚",
    filesChanged: workspace.files_changed ?? 0,
    linesAdded: workspace.lines_added ?? 0,
    linesRemoved: workspace.lines_removed ?? 0,
  });

  protected createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  protected updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("activeMenuWorkspaceId")) {
      if (this.activeMenuWorkspaceId) {
        setTimeout(() => {
          document.addEventListener("click", this.handleDocumentClick);
        }, 0);
      }
    }
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.handleDocumentClick);
    super.disconnectedCallback();
  }

  private handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as Node;
    const menuContainer = this.renderRoot?.querySelector(".task-card-menu-container");
    if (menuContainer && !menuContainer.contains(target)) {
      this.activeMenuWorkspaceId = undefined;
      document.removeEventListener("click", this.handleDocumentClick);
    }
  };

  protected render() {
    return renderWorkspaceSectionList({
      sections: this.sections,
      collapsedSections: this.collapsedSections,
      compact: this.compact,
      selectedWorkspaceId: this.selectedWorkspaceId,
      getWorkspaceDisplayMeta: this.getWorkspaceDisplayMeta,
      onToggleSection: (key) => this.handleToggleSection(key),
      onSelectWorkspace: (workspace) => this.handleSelectWorkspace(workspace),
      onMenuAction: (workspace, action) => this.handleMenuAction(workspace, action),
      activeMenuWorkspaceId: this.activeMenuWorkspaceId,
    });
  }

  private handleToggleSection(key: WorkspaceSectionKey) {
    this.dispatchEvent(
      new CustomEvent<WorkspaceSectionKey>("workspace-section-toggle", {
        detail: key,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleSelectWorkspace(workspace: KanbanWorkspace) {
    this.dispatchEvent(
      new CustomEvent<KanbanWorkspace>("workspace-select", {
        detail: workspace,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleMenuAction(workspace: KanbanWorkspace, action: string) {
    if (action === "toggle-menu") {
      this.activeMenuWorkspaceId = this.activeMenuWorkspaceId === workspace.id ? undefined : workspace.id;
      return;
    }
    this.activeMenuWorkspaceId = undefined;
    this.dispatchEvent(
      new CustomEvent<{ workspace: KanbanWorkspace; action: string }>("workspace-menu-action", {
        detail: { workspace, action },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderMenuDropdown(workspace: KanbanWorkspace) {
    if (this.activeMenuWorkspaceId !== workspace.id) {
      return nothing;
    }
    return html`
      <div class="task-card-menu-dropdown">
        <button
          class="task-card-menu-item"
          type="button"
          @click=${() => this.handleMenuAction(workspace, "create-pr")}
        >
          <span>🔀</span>
          <span>提交 Pull Request</span>
        </button>
        <button
          class="task-card-menu-item"
          type="button"
          @click=${() => this.handleMenuAction(workspace, "open-branch")}
        >
          <span>🌿</span>
          <span>打开分支</span>
        </button>
        <div class="task-card-menu-divider"></div>
        <button
          class="task-card-menu-item is-danger"
          type="button"
          @click=${() => this.handleMenuAction(workspace, "delete")}
        >
          <span>🗑️</span>
          <span>删除工作区</span>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-section-list": WorkspaceSectionList;
  }
}

if (!customElements.get("workspace-section-list")) {
  customElements.define("workspace-section-list", WorkspaceSectionList);
}

function renderWorkspaceCard(
  workspace: KanbanWorkspace,
  selectedWorkspaceId: string | undefined,
  compact: boolean,
  getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => WorkspaceDisplayMeta,
  onSelectWorkspace: (workspace: KanbanWorkspace) => void,
  onMenuAction?: (workspace: KanbanWorkspace, action: string) => void,
  showMenu?: boolean,
) {
  const statusMeta = getStatusMeta(workspace);
  const { relativeTime, filesChanged, linesAdded, linesRemoved } =
    getWorkspaceDisplayMeta(workspace);

  return html`
    <div class="task-card-wrapper" style="position: relative;">
      <button
        class="task-card ${statusMeta.accentClass} ${compact ? "is-compact" : "is-expanded"}"
        type="button"
        data-selected=${workspace.id === selectedWorkspaceId ? "true" : "false"}
        @click=${() => onSelectWorkspace(workspace)}
      >
        ${onMenuAction ? html`
          <button
            class="task-card-menu-btn"
            type="button"
            @click=${(e: Event) => {
              e.stopPropagation();
              onMenuAction(workspace, "toggle-menu");
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onMenuAction(workspace, "toggle-menu");
              }
            }}
            aria-label="操作菜单"
          >
            ⋮
          </button>
        ` : nothing}
        <div class="workspace-name">${workspace.name}</div>
        ${compact
          ? nothing
          : html`
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
                  ><span class="file-count">📄 ${filesChanged}</span> <span class="lines-added"
                    >+${linesAdded}</span
                  >
                  <span class="lines-removed">-${linesRemoved}</span></span
                >
              </div>
            `}
      </button>
      ${onMenuAction && showMenu ? html`
        <div class="task-card-menu-dropdown">
          <button
            class="task-card-menu-item"
            type="button"
            @click=${(e: Event) => {
              e.stopPropagation();
              onMenuAction(workspace, "create-pr");
            }}
          >
            <span>🔀</span>
            <span>提交 Pull Request</span>
          </button>
          <button
            class="task-card-menu-item"
            type="button"
            @click=${(e: Event) => {
              e.stopPropagation();
              onMenuAction(workspace, "open-branch");
            }}
          >
            <span>🌿</span>
            <span>打开分支</span>
          </button>
          <div class="task-card-menu-divider"></div>
          <button
            class="task-card-menu-item is-danger"
            type="button"
            @click=${(e: Event) => {
              e.stopPropagation();
              onMenuAction(workspace, "delete");
            }}
          >
            <span>🗑️</span>
            <span>删除工作区</span>
          </button>
        </div>
      ` : nothing}
    </div>
  `;
}
