import { LitElement, html, nothing, type TemplateResult } from "lit";

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
};

export function renderWorkspaceSectionList({
  sections,
  collapsedSections,
  compact = false,
  selectedWorkspaceId,
  getWorkspaceDisplayMeta,
  onToggleSection,
  onSelectWorkspace,
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
                  ),
                )}
              </div>
            `}
      </section>
    `;
  });
}

export class WorkspaceSectionList extends LitElement {
  static styles = workspaceSectionListStyles;

  static properties = {
    sections: { attribute: false },
    collapsedSections: { attribute: false },
    compact: { type: Boolean },
    selectedWorkspaceId: { attribute: false },
    getWorkspaceDisplayMeta: { attribute: false },
  };

  sections: WorkspaceSection[] = [];
  collapsedSections = new Set<WorkspaceSectionKey>();
  compact = false;
  selectedWorkspaceId?: string;
  getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => WorkspaceDisplayMeta = (workspace) => ({
    relativeTime: workspace.relative_time ?? "刚刚",
    filesChanged: workspace.files_changed ?? 0,
    linesAdded: workspace.lines_added ?? 0,
    linesRemoved: workspace.lines_removed ?? 0,
  });

  protected createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  protected render() {
    return renderWorkspaceSectionList({
      sections: this.sections,
      collapsedSections: this.collapsedSections,
      compact: this.compact,
      selectedWorkspaceId: this.selectedWorkspaceId,
      getWorkspaceDisplayMeta: this.getWorkspaceDisplayMeta,
      onToggleSection: (key) => this.handleToggleSection(key),
      onSelectWorkspace: (workspace) => this.handleSelectWorkspace(workspace),
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
) {
  const statusMeta = getStatusMeta(workspace);
  const { relativeTime, filesChanged, linesAdded, linesRemoved } =
    getWorkspaceDisplayMeta(workspace);

  return html`
    <button
      class="task-card ${statusMeta.accentClass} ${compact ? "is-compact" : "is-expanded"}"
      type="button"
      data-selected=${workspace.id === selectedWorkspaceId ? "true" : "false"}
      @click=${() => onSelectWorkspace(workspace)}
    >
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
  `;
}
