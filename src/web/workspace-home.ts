import { LitElement, html, nothing } from "lit";

import "../index";
import "../components/workspace-conversation-pane";
import { renderWorkspaceSectionList } from "../components/workspace-section-list";
import { createPreviewHass, previewEntityId } from "../dev/preview-fixture";
import { formatRelativeTime } from "../lib/format-relative-time";
import { groupWorkspaces } from "../lib/group-workspaces";
import { fetchActiveWorkspaces, fetchWorkspaceLatestMessages } from "../lib/http-api";
import type { KanbanSessionAttributes, KanbanWorkspace, LocalWorkspaceSummary } from "../types";
import { workspaceHomeStyles, workspaceSectionListStyles } from "../styles";
import { getPaneColumns } from "./workspace-home.utils";
import {
  createWorkspacePageState,
  openWorkspacePane,
  reconcileWorkspacePageState,
  type WorkspacePageState,
} from "./workspace-page-state";
import { buildPreviewCardConfig, readPreviewApiOptions } from "../playground";

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
    workspaces: { attribute: false },
    pageState: { attribute: false },
    messagesByWorkspace: { attribute: false },
    loading: { type: Boolean },
    error: { attribute: false },
    collapsedSections: { attribute: false },
  };

  mode: WorkspaceHomeMode = resolveWorkspaceHomeMode(window.innerWidth);
  workspaces: KanbanWorkspace[] = [];
  pageState: WorkspacePageState = createWorkspacePageState();
  messagesByWorkspace: Record<string, Array<{ kind: "message"; sender: "user" | "ai"; text: string }>> = {};
  loading = false;
  error = "";
  collapsedSections = new Set<"attention" | "running" | "idle">();
  private refreshTimer?: number;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.handleResize);
    void this.loadWorkspaces();
    this.refreshTimer = window.setInterval(() => {
      void this.loadWorkspaces();
    }, 30_000);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.handleResize);
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    super.disconnectedCallback();
  }

  protected updated() {
    if (this.mode === "mobile-card") {
      this.setupMobileCard();
    }
  }

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
            <kanban-watcher-card></kanban-watcher-card>
          </section>
        </main>
      `;
    }

    const sections = this.buildSections();
    const openWorkspaces = this.pageState.openWorkspaceIds
      .map((id) => this.workspaces.find((workspace) => workspace.id === id))
      .filter((workspace): workspace is KanbanWorkspace => Boolean(workspace));

    return html`
      <main class="workspace-home-shell" data-mode="desktop">
        <section class="workspace-home-hero">
          <div class="workspace-home-eyebrow">Web Workspace</div>
          <h1>Kanban Watcher 网页工作区</h1>
          <p>桌面端使用左侧项目状态栏和右侧多工作区内容区。</p>
        </section>
        <section class="workspace-home-layout">
          <aside class="workspace-home-sidebar">
            ${this.loading ? html`<div class="empty-state">正在加载工作区...</div>` : nothing}
            ${this.error ? html`<div class="empty-state">${this.error}</div>` : nothing}
            ${renderWorkspaceSectionList({
              sections,
              collapsedSections: this.collapsedSections,
              selectedWorkspaceId: this.pageState.activeWorkspaceId,
              getWorkspaceDisplayMeta: (workspace: KanbanWorkspace) => ({
                relativeTime: workspace.relative_time ?? formatRelativeTime(workspace.updated_at),
                filesChanged: workspace.files_changed ?? 0,
                linesAdded: workspace.lines_added ?? 0,
                linesRemoved: workspace.lines_removed ?? 0,
              }),
              onToggleSection: (key) => this.toggleSection(key),
              onSelectWorkspace: (workspace) => this.handleOpenWorkspace(workspace),
            })}
          </aside>
          <section
            class="workspace-home-pane-grid"
            style=${`--workspace-pane-columns: ${getPaneColumns(openWorkspaces.length)};`}
          >
            ${openWorkspaces.length === 0
              ? html`<div class="empty-state">从左侧选择工作区后，这里会显示对话内容。</div>`
              : openWorkspaces.map(
                  (workspace) => html`
                    <workspace-conversation-pane
                      .workspaceName=${workspace.name}
                      .messages=${this.messagesByWorkspace[workspace.id] ?? []}
                      .messageDraft=${""}
                      .currentFeedback=${"桌面端工作区已接入同步刷新基础骨架。"}
                      .quickButtons=${[]}
                    ></workspace-conversation-pane>
                  `,
                )}
          </section>
        </section>
      </main>
    `;
  }

  private handleResize = () => {
    this.mode = resolveWorkspaceHomeMode(window.innerWidth);
  };

  private async loadWorkspaces() {
    this.loading = true;
    this.error = "";

    try {
      const workspaces = this.isApiMode
        ? await this.fetchApiWorkspaces()
        : this.readMockWorkspaces();

      this.workspaces = workspaces;
      this.pageState = reconcileWorkspacePageState(this.pageState, workspaces);
      await Promise.all(
        this.pageState.openWorkspaceIds.map((workspaceId) =>
          this.loadWorkspaceMessages(workspaceId),
        ),
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : "加载工作区失败";
    } finally {
      this.loading = false;
    }
  }

  private async fetchApiWorkspaces() {
    const response = await fetchActiveWorkspaces({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
    });

    return (response.workspaces ?? []).map((workspace) => this.toKanbanWorkspace(workspace));
  }

  private toKanbanWorkspace(workspace: LocalWorkspaceSummary): KanbanWorkspace {
    return {
      id: workspace.id,
      name: workspace.name,
      status: workspace.status,
      latest_session_id: workspace.latest_session_id,
      has_pending_approval: workspace.has_pending_approval,
      has_unseen_turns: workspace.has_unseen_turns,
      has_running_dev_server: workspace.has_running_dev_server,
      files_changed: workspace.files_changed,
      lines_added: workspace.lines_added,
      lines_removed: workspace.lines_removed,
      updated_at: workspace.updated_at,
      last_message_at: workspace.last_message_at,
      latest_process_completed_at: workspace.latest_process_completed_at,
      needs_attention: Boolean(workspace.has_pending_approval || workspace.has_unseen_turns),
    };
  }

  private readMockWorkspaces() {
    const attributes = createPreviewHass().states[previewEntityId]?.attributes;
    return Array.isArray(attributes?.workspaces) ? attributes.workspaces : [];
  }

  private async loadWorkspaceMessages(workspaceId: string) {
    if (this.messagesByWorkspace[workspaceId]) {
      return;
    }

    if (!this.isApiMode) {
      const previewSession = Object.values(createPreviewHass().states).find((state) => {
        const attributes = state.attributes as KanbanSessionAttributes | undefined;
        return attributes?.workspace_id === workspaceId;
      })?.attributes as KanbanSessionAttributes | undefined;

      const recentMessages = Array.isArray(previewSession?.recent_messages)
        ? previewSession.recent_messages
        : [];

      this.messagesByWorkspace = {
        ...this.messagesByWorkspace,
        [workspaceId]: recentMessages
          .filter((message): message is NonNullable<typeof recentMessages>[number] =>
            Boolean(message?.content),
          )
          .map((message) => ({
            kind: "message" as const,
            sender: message.role === "user" ? "user" : "ai",
            text: message.content!,
          })),
      };
      return;
    }

    const response = await fetchWorkspaceLatestMessages({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      workspaceId,
      limit: this.previewOptions.messagesLimit ?? 50,
    });

    this.messagesByWorkspace = {
      ...this.messagesByWorkspace,
      [workspaceId]: (response.messages ?? [])
        .filter((message): message is typeof message & { content: string } => Boolean(message.content))
        .map((message) => ({
          kind: "message" as const,
          sender: message.role === "user" ? "user" : "ai",
          text: message.content,
        })),
    };
  }

  private handleOpenWorkspace(workspace: KanbanWorkspace) {
    this.pageState = openWorkspacePane(this.pageState, workspace.id);
    void this.loadWorkspaceMessages(workspace.id);
  }

  private toggleSection(key: "attention" | "running" | "idle") {
    const next = new Set(this.collapsedSections);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.collapsedSections = next;
  }

  private buildSections() {
    const grouped = groupWorkspaces(this.workspaces);
    return [
      { key: "attention" as const, label: "需要注意", workspaces: grouped.attention },
      { key: "running" as const, label: "运行中", workspaces: grouped.running },
      { key: "idle" as const, label: "空闲", workspaces: grouped.idle },
    ].filter((section) => section.workspaces.length > 0);
  }

  private get previewOptions() {
    return readPreviewApiOptions(new URL(window.location.href));
  }

  private get isApiMode() {
    return Boolean(this.previewOptions.baseUrl);
  }

  private setupMobileCard() {
    const card = this.renderRoot.querySelector("kanban-watcher-card") as
      | (HTMLElement & {
          hass?: ReturnType<typeof createPreviewHass>;
          setConfig: (config: ReturnType<typeof buildPreviewCardConfig>) => void;
        })
      | null;

    if (!card) {
      return;
    }

    card.setConfig(buildPreviewCardConfig(this.previewOptions));
    if (!this.previewOptions.baseUrl) {
      card.hass = createPreviewHass();
    }
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
