import { LitElement, html, nothing } from "lit";

import { getStatusMeta } from "../lib/status-meta";
import { cardStyles } from "../styles";
import type { KanbanWorkspace } from "../types";

export type WorkspaceSectionKey = "attention" | "running" | "idle";

export type WorkspaceSection = {
  key: WorkspaceSectionKey;
  label: string;
  workspaces: KanbanWorkspace[];
};

export class WorkspaceSectionList extends LitElement {
  static styles = cardStyles;

  static properties = {
    sections: { attribute: false },
    collapsedSections: { attribute: false },
    selectedWorkspaceId: { attribute: false },
    getWorkspaceDisplayMeta: { attribute: false },
  };

  sections: WorkspaceSection[] = [];
  collapsedSections = new Set<WorkspaceSectionKey>();
  selectedWorkspaceId?: string;
  getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => {
    relativeTime: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  } = (workspace) => ({
    relativeTime: workspace.relative_time ?? "刚刚",
    filesChanged: workspace.files_changed ?? 0,
    linesAdded: workspace.lines_added ?? 0,
    linesRemoved: workspace.lines_removed ?? 0,
  });

  protected createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  protected render() {
    return this.sections.map(({ key, label, workspaces }) => {
      const collapsed = this.collapsedSections.has(key);

      return html`
        <section class="section" ?collapsed=${collapsed}>
          <button
            class="section-toggle"
            type="button"
            @click=${() => this.handleToggleSection(key)}
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
    });
  }

  private renderWorkspace(workspace: KanbanWorkspace) {
    const statusMeta = getStatusMeta(workspace);
    const { relativeTime, filesChanged, linesAdded, linesRemoved } =
      this.getWorkspaceDisplayMeta(workspace);

    return html`
      <button
        class="task-card ${statusMeta.accentClass}"
        type="button"
        data-selected=${workspace.id === this.selectedWorkspaceId ? "true" : "false"}
        @click=${() => this.handleSelectWorkspace(workspace)}
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
