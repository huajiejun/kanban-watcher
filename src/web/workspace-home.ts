import { LitElement, html } from "lit";

import { renderWorkspaceSectionList } from "../components/workspace-section-list";
import type { KanbanWorkspace } from "../types";
import { workspaceHomeStyles, workspaceSectionListStyles } from "../styles";
import { getPaneColumns } from "./workspace-home.utils";

export type WorkspaceHomeMode = "desktop" | "mobile-card";

const MOBILE_BREAKPOINT = 768;

export function resolveWorkspaceHomeMode(width: number): WorkspaceHomeMode {
  return width <= MOBILE_BREAKPOINT ? "mobile-card" : "desktop";
}

export { getPaneColumns } from "./workspace-home.utils";

export class KanbanWorkspaceHome extends LitElement {
  static styles = [workspaceHomeStyles, workspaceSectionListStyles];

  static properties = {
    mode: { attribute: false },
  };

  mode: WorkspaceHomeMode = resolveWorkspaceHomeMode(window.innerWidth);

  protected render() {
    if (this.mode === "mobile-card") {
      return html`
        <main class="workspace-home-shell">
          <section class="workspace-home-hero">
            <div class="workspace-home-eyebrow">Mobile Fallback</div>
            <h1>Kanban Watcher 卡片模式</h1>
            <p>手机端继续保持 Home Assistant 卡片交互。</p>
          </section>
          <section class="workspace-home-placeholder">
            手机端将退回卡片交互；桌面端展示两栏工作区。
          </section>
        </main>
      `;
    }

    return html`
      <main class="workspace-home-shell" data-mode="desktop">
        <section class="workspace-home-hero">
          <div class="workspace-home-eyebrow">Web Workspace</div>
          <h1>Kanban Watcher 网页工作区</h1>
          <p>桌面端使用左侧项目状态栏和右侧多工作区内容区。</p>
        </section>
        <section class="workspace-home-layout">
          <aside class="workspace-home-sidebar">
            ${renderWorkspaceSectionList({
              sections: [],
              collapsedSections: new Set(),
              selectedWorkspaceId: undefined,
              getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => ({
                relativeTime: workspace.relative_time ?? "刚刚",
                filesChanged: workspace.files_changed ?? 0,
                linesAdded: workspace.lines_added ?? 0,
                linesRemoved: workspace.lines_removed ?? 0,
              }),
              onToggleSection: () => undefined,
              onSelectWorkspace: () => undefined,
            })}
          </aside>
          <section
            class="workspace-home-pane-grid"
            style=${`--workspace-pane-columns: ${getPaneColumns(0)};`}
          >
            <div class="empty-state">右侧工作区内容区正在接入。</div>
          </section>
        </section>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "kanban-workspace-home": KanbanWorkspaceHome;
  }
}

if (!customElements.get("kanban-workspace-home")) {
  customElements.define("kanban-workspace-home", KanbanWorkspaceHome);
}

export function mountWorkspaceHome(root: Element) {
  root.innerHTML = "";
  root.append(document.createElement("kanban-workspace-home"));
}
