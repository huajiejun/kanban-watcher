import { LitElement, html, nothing } from "lit";

import "../components/workspace-conversation-pane";
import "../components/workspace-preview-card";
import type {
  ConversationPaneAction,
} from "../components/workspace-conversation-pane";
import { createPreviewHass, previewEntityId } from "../dev/preview-fixture";
import { formatRelativeTime } from "../lib/format-relative-time";
import { groupWorkspaces } from "../lib/group-workspaces";
import { getStatusMeta } from "../lib/status-meta";
import {
  compareDialogMessageOrder,
  getDialogMessageIdentity,
  normalizeApiMessages,
  normalizeApiMessagesFlat,
  normalizeSessionMessage,
  type DialogMessage,
} from "../lib/dialog-messages";
import {
  extractDynamicButtons,
  getQuickButtonsWithLLM,
  isValidButtonText,
  STATIC_BUTTONS,
} from "../lib/quick-buttons";
import { connectRealtime } from "../lib/realtime-api";
import {
  cancelWorkspaceQueue,
  fetchExecutionProcess,
  fetchActiveWorkspaces,
  fetchWorkspaceFileBrowserPath,
  fetchWorkspaceFrontendPort,
  fetchWorkspaceView,
  fetchWorkspaceLatestMessages,
  fetchWorkspaceQueueStatus,
  markWorkspaceSeen,
  sendWorkspaceMessage,
  startWorkspaceDevServer,
  stopWorkspaceDevServer,
  stopWorkspaceExecution,
  updateWorkspaceView,
} from "../lib/http-api";
import { handleTodoSelectedAndSend, loadTodoPendingCount } from "../lib/todo-helpers";
import type {
  KanbanSessionAttributes,
  KanbanWorkspace,
  LocalWorkspaceSummary,
  WorkspaceQueueStatusResponse,
  type ButtonWithReason,
  type RealtimeEvent,
  type SessionMessageResponse,
} from "../types";
import { workspaceHomeStyles, workspaceSectionListStyles } from "../styles";
import { getPaneColumns } from "./workspace-home.utils";
import {
  createWorkspacePageState,
  dismissWorkspacePane,
  openWorkspacePane,
  reconcileWorkspacePageState,
  type WorkspacePageState,
} from "./workspace-page-state";
import {
  readPersistedWorkspacePageState,
  writePersistedWorkspacePageState,
} from "./workspace-page-state-storage";
import {
  resolveWorkspacePaneLayoutMode,
  summarizeWorkspacePreview,
} from "./workspace-pane-layout";
import {
  buildPreviewCardConfig as buildPreviewCardConfigFromOptions,
  readPreviewApiOptions,
} from "../lib/preview-options";
import { getWorkspacePath } from "../lib/workspace-path";
import {
  buildWorkspacePreviewUrlFromFrontendPort,
  getWorkspaceEmbeddedPreviewUrl,
} from "../lib/workspace-web-preview";
import {
  ACTIVE_PANE_MESSAGE_TYPES,
  didSelectedWorkspaceMessageVersionChange,
  getSelectedWorkspaceSessionId,
  loadRealtimeRuntimeInfo,
} from "../lib/realtime-sync";

export type WorkspaceHomeMode = "desktop" | "mobile-card";

const MOBILE_BREAKPOINT = 768;
const DEFAULT_REALTIME_RETRY_DELAY_MS = 3_000;
const PREVIEW_DEBUG_STORAGE_KEY = "kanban_watcher_preview_debug";

let kanbanWatcherCardDefinitionPromise: Promise<void> | undefined;

async function ensureKanbanWatcherCardDefined() {
  if (customElements.get("kanban-watcher-card")) {
    return;
  }
  if (!kanbanWatcherCardDefinitionPromise) {
    kanbanWatcherCardDefinitionPromise = import("../index").then(() => undefined);
  }
  await kanbanWatcherCardDefinitionPromise;
}

function isPreviewDebugEnabled() {
  try {
    return window.localStorage.getItem(PREVIEW_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function debugPreview(event: string, details: Record<string, unknown>) {
  if (!isPreviewDebugEnabled()) {
    return;
  }
  console.debug(`[WorkspacePreview] ${event}`, details);
}

export function resolveWorkspaceHomeMode(width: number): WorkspaceHomeMode {
  return width <= MOBILE_BREAKPOINT ? "mobile-card" : "desktop";
}

export { getPaneColumns } from "./workspace-home.utils";

export class KanbanWorkspaceHome extends LitElement {
  static styles = [workspaceHomeStyles, workspaceSectionListStyles];

  static properties = {
    mode: { attribute: false },
    isSidebarCollapsed: { type: Boolean },
    workspaces: { attribute: false },
    pageState: { attribute: false },
    messagesByWorkspace: { attribute: false },
    loading: { type: Boolean },
    error: { attribute: false },
    collapsedSections: { attribute: false },
    loadingWorkspaceIds: { attribute: false },
    startingDevServerWorkspaceIds: { attribute: false },
    stoppingDevServerWorkspaceIds: { attribute: false },
    devServerProcessIdsByWorkspace: { attribute: false },
    devServerProcessStatusByWorkspace: { attribute: false },
    messageErrorByWorkspace: { attribute: false },
    messageDraftByWorkspace: { attribute: false },
    actionFeedbackByWorkspace: { attribute: false },
    queueStatusByWorkspace: { attribute: false },
    smoothRevealMessageKeyByWorkspace: { attribute: false },
    extractedButtonsByWorkspace: { attribute: false },
    suggestedButtonsByWorkspace: { attribute: false },
    webPreviewFallbackUrlByWorkspace: { attribute: false },
    todoPendingCountByWorkspace: { attribute: false },
  };

  mode: WorkspaceHomeMode = resolveWorkspaceHomeMode(window.innerWidth);
  workspaces: KanbanWorkspace[] = [];
  pageState: WorkspacePageState = createWorkspacePageState(readPersistedWorkspacePageState());
  isSidebarCollapsed = this.resolveSidebarCollapsed(this.pageState.openWorkspaceIds.length);
  messagesByWorkspace: Record<string, DialogMessage[]> = {};
  loading = false;
  error = "";
  collapsedSections = new Set<"attention" | "running" | "idle">();
  loadingWorkspaceIds = new Set<string>();
  startingDevServerWorkspaceIds = new Set<string>();
  stoppingDevServerWorkspaceIds = new Set<string>();
  devServerProcessIdsByWorkspace: Record<string, string> = {};
  devServerProcessStatusByWorkspace: Record<string, string> = {};
  messageErrorByWorkspace: Record<string, string> = {};
  messageDraftByWorkspace: Record<string, string> = {};
  actionFeedbackByWorkspace: Record<string, string> = {};
  queueStatusByWorkspace: Record<string, WorkspaceQueueStatusResponse> = {};
  todoPendingCountByWorkspace: Record<string, number> = {};
  smoothRevealMessageKeyByWorkspace: Record<string, string> = {};
  extractedButtonsByWorkspace: Record<string, string[]> = {};
  suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
  webPreviewFallbackUrlByWorkspace: Record<string, string> = {};
  private dynamicButtonsMessageHashByWorkspace: Record<string, string> = {};
  private boardRealtimeRetryTimer?: number;
  private realtimeRetryTimer?: number;
  private boardRealtimeSocket?: WebSocket;
  private realtimeSocket?: WebSocket;
  private lastSidebarSyncPaneCount = this.pageState.openWorkspaceIds.length;
  private hasHydratedRemoteWorkspaceView = false;
  private isApplyingRemoteWorkspaceView = false;
  private lastPushedWorkspaceViewSignature = "";
  private apiAccessBlocked = false;
  private mobileCardConfigSignature = "";
  private previewProxyPort?: number;
  private realtimeBaseUrl?: string;
  private previewDrawerWorkspaceId?: string;
  private webPreviewWorkspaceId?: string;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.handleResize);
    if (this.mode !== "mobile-card") {
      void this.initializeWorkspaceHome();
    }
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.handleResize);
    this.stopRealtimeSync();
    super.disconnectedCallback();
  }

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has("pageState")) {
      this.syncSidebarCollapsed(this.pageState.openWorkspaceIds.length);
    }
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (this.mode === "mobile-card") {
      void this.setupMobileCard();
    }
    if (changedProperties.has("pageState")) {
      writePersistedWorkspacePageState(this.pageState);
      if (this.isApiMode) {
        void this.pushWorkspaceView();
      }
    }
    if (this.isApiMode && (changedProperties.has("pageState") || changedProperties.has("workspaces"))) {
      const previousPageState = (changedProperties.get("pageState") as WorkspacePageState | undefined) ?? this.pageState;
      const previousWorkspaces = (changedProperties.get("workspaces") as KanbanWorkspace[] | undefined) ?? this.workspaces;
      const previousSessionId = this.getActiveSessionId(previousPageState, previousWorkspaces);
      const currentSessionId = this.getActiveSessionId(this.pageState, this.workspaces);

      if (previousSessionId !== currentSessionId) {
        this.restartRealtimeConnection();
      }
    }
  }

  protected render() {
    if (this.mode === "mobile-card") {
      return html`
        <main class="workspace-home-shell">
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
    const paneLayoutMode = resolveWorkspacePaneLayoutMode(window.innerWidth, openWorkspaces.length);
    const isSidebarDocked = openWorkspaces.length <= 1;

    return html`
      <main class="workspace-home-shell" data-mode="desktop">
        <section
          class="workspace-home-layout"
          data-sidebar-collapsed=${this.isSidebarCollapsed ? "true" : "false"}
          data-sidebar-docked=${isSidebarDocked ? "true" : "false"}
        >
          <button
            class="workspace-home-sidebar-toggle ${this.isSidebarCollapsed ? "is-collapsed" : "is-expanded"}"
            type="button"
            @click=${this.handleSidebarToggle}
            aria-expanded=${this.isSidebarCollapsed ? "false" : "true"}
            aria-label=${this.isSidebarCollapsed ? "展开工作区状态栏" : "收起工作区状态栏"}
          >
            ${this.isSidebarCollapsed
              ? html`<span aria-hidden="true">≡</span>`
              : html`
                  <span aria-hidden="true">«</span>
                  <span>收起</span>
                `}
          </button>
          ${this.isSidebarCollapsed || isSidebarDocked
            ? nothing
            : html`<button
                class="workspace-home-sidebar-backdrop"
                type="button"
                @click=${this.handleSidebarToggle}
                aria-label="关闭工作区状态栏"
              ></button>`}
          <aside
            class="workspace-home-sidebar"
            data-collapsed=${this.isSidebarCollapsed ? "true" : "false"}
            data-docked=${isSidebarDocked ? "true" : "false"}
          >
            <div class="workspace-home-sidebar-content">
              ${this.loading ? html`<div class="empty-state">正在加载工作区...</div>` : nothing}
              ${this.error ? html`<div class="empty-state">${this.error}</div>` : nothing}
              ${sections.map((section) => this.renderWorkspaceSection(section))}
            </div>
          </aside>
          ${this.renderWorkspacePanes(openWorkspaces, paneLayoutMode)}
          ${this.renderPreviewDrawer()}
          ${this.renderWebPreviewOverlay()}
        </section>
      </main>
    `;
  }

  private handleSidebarToggle = () => {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.lastSidebarSyncPaneCount = this.pageState.openWorkspaceIds.length;
  };

  private handleResize = () => {
    const nextMode = resolveWorkspaceHomeMode(window.innerWidth);
    if (nextMode === this.mode) {
      this.requestUpdate();
      return;
    }
    const previousMode = this.mode;
    this.mode = nextMode;
    if (nextMode === "mobile-card") {
      this.stopRealtimeSync();
      return;
    }
    if (previousMode === "mobile-card") {
      void this.initializeWorkspaceHome();
    }
  };

  private async loadWorkspaces() {
    this.loading = true;
    this.error = "";

    try {
      const workspaces = this.isApiMode
        ? await this.fetchApiWorkspaces()
        : this.readMockWorkspaces();
      const orderedWorkspaces = this.preserveWorkspaceOrder(workspaces);

      await this.hydrateRunningDevServerProcesses(orderedWorkspaces);
      this.workspaces = orderedWorkspaces;
      this.pruneDevServerProcessState(orderedWorkspaces);
      this.pageState = reconcileWorkspacePageState(this.pageState, orderedWorkspaces);
      const openWorkspaces = this.pageState.openWorkspaceIds
        .map((workspaceId) => orderedWorkspaces.find((workspace) => workspace.id === workspaceId))
        .filter((workspace): workspace is KanbanWorkspace => Boolean(workspace));

      await Promise.all(
        openWorkspaces.flatMap((workspace) => {
          const jobs: Promise<void>[] = [
            this.loadWorkspaceMessages(workspace.id, true),
            this.loadTodoPendingCount(workspace.id),
          ];
          if (workspace.status === "running") {
            jobs.push(this.loadWorkspaceQueueStatus(workspace.id));
          }
          return jobs;
        }),
      );
      this.apiAccessBlocked = false;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "加载工作区失败";
      if (this.isUnauthorizedError(error)) {
        this.apiAccessBlocked = true;
        this.stopRealtimeSync();
      }
    } finally {
      this.loading = false;
    }
  }

  private async initializeWorkspaceHome() {
    if (this.isApiMode) {
      await this.loadVibeInfo();
      await this.hydrateRemoteWorkspaceView();
    }
    await this.loadWorkspaces();
    if (!this.apiAccessBlocked) {
      this.connectBoardRealtimeIfNeeded();
    }
  }

  private async loadVibeInfo() {
    const runtimeInfo = await loadRealtimeRuntimeInfo({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
    });
    this.previewProxyPort = runtimeInfo.previewProxyPort;
    this.realtimeBaseUrl = runtimeInfo.realtimeBaseUrl;
  }

  private async hydrateRemoteWorkspaceView() {
    try {
      const response = await fetchWorkspaceView({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
      });
      this.applyRemoteWorkspaceView(response);
    } catch {
      this.hasHydratedRemoteWorkspaceView = true;
    }
  }

  private resolveSidebarCollapsed(openPaneCount: number) {
    return openPaneCount > 1;
  }

  private syncSidebarCollapsed(openPaneCount: number) {
    if (this.lastSidebarSyncPaneCount === openPaneCount) {
      return;
    }
    this.lastSidebarSyncPaneCount = openPaneCount;
    this.isSidebarCollapsed = this.resolveSidebarCollapsed(openPaneCount);
  }

  private async fetchApiWorkspaces() {
    const response = await fetchActiveWorkspaces({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
    });

    return (response.workspaces ?? []).map((workspace) => this.toKanbanWorkspace(workspace));
  }

  private applyRemoteWorkspaceView(response: {
    open_workspace_ids?: string[];
    active_workspace_id?: string;
    dismissed_attention_ids?: string[];
  }) {
    const openWorkspaceIds = Array.isArray(response.open_workspace_ids)
      ? response.open_workspace_ids.filter((value): value is string => typeof value === "string").slice(0, 4)
      : [];
    const dismissedAttentionIds = Array.isArray(response.dismissed_attention_ids)
      ? response.dismissed_attention_ids.filter((value): value is string => typeof value === "string")
      : [];
    const activeWorkspaceId =
      typeof response.active_workspace_id === "string" ? response.active_workspace_id : undefined;

    this.isApplyingRemoteWorkspaceView = true;
    this.pageState = createWorkspacePageState({
      ...this.pageState,
      openWorkspaceIds,
      activeWorkspaceId,
      dismissedAttentionIds,
      previousAttentionMap: this.pageState.previousAttentionMap,
      hasHydratedAttentionSnapshot: this.pageState.hasHydratedAttentionSnapshot,
    });
    this.lastPushedWorkspaceViewSignature = this.getWorkspaceViewSignature(this.pageState);
    this.hasHydratedRemoteWorkspaceView = true;
    queueMicrotask(() => {
      this.isApplyingRemoteWorkspaceView = false;
    });
  }

  private getWorkspaceViewSignature(state: WorkspacePageState) {
    return JSON.stringify({
      openWorkspaceIds: state.openWorkspaceIds,
      activeWorkspaceId: state.activeWorkspaceId ?? "",
      dismissedAttentionIds: state.dismissedAttentionIds,
    });
  }

  private async pushWorkspaceView() {
    if (!this.hasHydratedRemoteWorkspaceView || this.isApplyingRemoteWorkspaceView) {
      return;
    }

    const signature = this.getWorkspaceViewSignature(this.pageState);
    if (signature === this.lastPushedWorkspaceViewSignature) {
      return;
    }

    this.lastPushedWorkspaceViewSignature = signature;
    try {
      const response = await updateWorkspaceView({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        openWorkspaceIds: this.pageState.openWorkspaceIds,
        activeWorkspaceId: this.pageState.activeWorkspaceId,
        dismissedAttentionIds: this.pageState.dismissedAttentionIds,
      });
      this.lastPushedWorkspaceViewSignature = JSON.stringify({
        openWorkspaceIds: response.open_workspace_ids ?? [],
        activeWorkspaceId: response.active_workspace_id ?? "",
        dismissedAttentionIds: response.dismissed_attention_ids ?? [],
      });
    } catch {
      this.lastPushedWorkspaceViewSignature = "";
    }
  }

  private toKanbanWorkspace(workspace: LocalWorkspaceSummary): KanbanWorkspace {
    return {
      id: workspace.id,
      name: workspace.name,
      browser_url: workspace.browser_url,
      browserUrl: (workspace as LocalWorkspaceSummary & { browserUrl?: string }).browserUrl,
      branch: workspace.branch,
      status: workspace.status,
      latest_session_id: workspace.latest_session_id,
      has_pending_approval: workspace.has_pending_approval,
      has_unseen_turns: workspace.has_unseen_turns,
      has_running_dev_server: workspace.has_running_dev_server,
      running_dev_server_process_id: workspace.running_dev_server_process_id,
      files_changed: workspace.files_changed,
      lines_added: workspace.lines_added,
      lines_removed: workspace.lines_removed,
      updated_at: workspace.updated_at,
      last_message_at: workspace.last_message_at,
      latest_process_completed_at: workspace.latest_process_completed_at,
      needs_attention: Boolean(workspace.has_pending_approval || workspace.has_unseen_turns),
    };
  }

  private preserveWorkspaceOrder(nextWorkspaces: KanbanWorkspace[]) {
    if (this.workspaces.length === 0) {
      return nextWorkspaces;
    }

    const nextById = new Map(nextWorkspaces.map((workspace) => [workspace.id, workspace]));
    const ordered: KanbanWorkspace[] = [];

    this.workspaces.forEach((workspace) => {
      const nextWorkspace = nextById.get(workspace.id);
      if (!nextWorkspace) {
        return;
      }
      ordered.push(nextWorkspace);
      nextById.delete(workspace.id);
    });

    nextWorkspaces.forEach((workspace) => {
      if (nextById.has(workspace.id)) {
        ordered.push(workspace);
        nextById.delete(workspace.id);
      }
    });

    return ordered;
  }

  private readMockWorkspaces() {
    const attributes = createPreviewHass().states[previewEntityId]?.attributes;
    return Array.isArray(attributes?.workspaces) ? attributes.workspaces : [];
  }

  private async loadWorkspaceMessages(workspaceId: string, forceRefresh = false) {
    if (!forceRefresh && this.messagesByWorkspace[workspaceId]) {
      return;
    }

    this.setWorkspaceLoading(workspaceId, true);
    this.messageErrorByWorkspace = {
      ...this.messageErrorByWorkspace,
      [workspaceId]: "",
    };

    try {
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
            .map((message) => normalizeSessionMessage(message))
            .filter((message): message is DialogMessage => Boolean(message)),
        };
        this.analyzeDynamicButtons(workspaceId);
        return;
      }

      const response = await fetchWorkspaceLatestMessages({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId,
        limit: this.previewOptions.messagesLimit ?? 50,
        types: workspaceId === this.activeWorkspace?.id ? ACTIVE_PANE_MESSAGE_TYPES : undefined,
      });
      const previousMessages = this.messagesByWorkspace[workspaceId] ?? [];
      const nextMessages = normalizeApiMessages(response.messages);
      const previousPreviewLines = summarizeWorkspacePreview(previousMessages);
      const nextPreviewLines = summarizeWorkspacePreview(nextMessages);

      debugPreview("messages-loaded", {
        workspaceId,
        forceRefresh,
        responseMessages: response.messages,
        previousPreviewLines,
        nextPreviewLines,
        previewLinesChanged: JSON.stringify(previousPreviewLines) !== JSON.stringify(nextPreviewLines),
      });

      this.messagesByWorkspace = {
        ...this.messagesByWorkspace,
        [workspaceId]: nextMessages,
      };
      this.smoothRevealMessageKeyByWorkspace = {
        ...this.smoothRevealMessageKeyByWorkspace,
        [workspaceId]: this.resolveSmoothRevealMessageKey(
          workspaceId,
          previousMessages,
          nextMessages,
        ),
      };
      this.analyzeDynamicButtons(workspaceId);
    } catch (error) {
      this.messageErrorByWorkspace = {
        ...this.messageErrorByWorkspace,
        [workspaceId]: error instanceof Error ? error.message : "加载消息失败",
      };
    } finally {
      this.setWorkspaceLoading(workspaceId, false);
    }
  }

  private handleOpenWorkspace(workspace: KanbanWorkspace) {
    const nextMessagesByWorkspace = { ...this.messagesByWorkspace };
    delete nextMessagesByWorkspace[workspace.id];
    this.messagesByWorkspace = nextMessagesByWorkspace;
    this.pageState = openWorkspacePane(this.pageState, workspace.id);
    void this.loadWorkspaceMessages(workspace.id, true);
    if (workspace.status === "running") {
      void this.loadWorkspaceQueueStatus(workspace.id);
    }

    // 点击卡片查看内容后，标记工作区为已读，将状态从"需要注意"变为"空闲"
    const hasUnseenTurns = workspace.has_unseen_turns || workspace.hasUnseenActivity;
    if (hasUnseenTurns && this.isApiMode) {
      const workspaceId = workspace.id;
      void markWorkspaceSeen({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey ?? undefined,
        workspaceId,
      }).then(() => {
        // 乐观更新：立即更新本地状态，不等待下一次同步
        this.workspaces = this.workspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, has_unseen_turns: false, hasUnseenActivity: false }
            : ws
        );
      }).catch((error) => {
        console.error("标记工作区已读失败:", error);
      });
    }
  }

  private async handleWorkspaceRun(workspace: KanbanWorkspace) {
    if (this.isWorkspaceDevServerRunning(workspace)) {
      return;
    }
    if (!this.isApiMode) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "预览模式暂不支持启动开发服务器。",
      };
      return;
    }

    this.setDevServerStarting(workspace.id, true);
    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspace.id]: "正在启动开发服务器...",
    };

    try {
      const response = await startWorkspaceDevServer({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId: workspace.id,
      });
      const startedProcess = response.execution_processes?.find(
        (process) => process.workspace_id === workspace.id,
      ) ?? response.execution_processes?.[0];
      if (startedProcess?.id) {
        this.devServerProcessIdsByWorkspace = {
          ...this.devServerProcessIdsByWorkspace,
          [workspace.id]: startedProcess.id,
        };
        this.devServerProcessStatusByWorkspace = {
          ...this.devServerProcessStatusByWorkspace,
          [workspace.id]: startedProcess.status ?? "running",
        };
        await this.refreshWorkspaceDevServerProcess(workspace.id);
      }
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: response.message?.trim() || "开发服务器已启动",
      };
      await this.loadWorkspaces();
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: error instanceof Error ? error.message : "启动开发服务器失败",
      };
    } finally {
      this.setDevServerStarting(workspace.id, false);
    }
  }

  private async handleWorkspaceDevServerStop(workspace: KanbanWorkspace) {
    if (!this.isApiMode || this.stoppingDevServerWorkspaceIds.has(workspace.id)) {
      return;
    }

    this.setDevServerStopping(workspace.id, true);
    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspace.id]: "正在停止开发服务器...",
    };

    try {
      const processId = this.devServerProcessIdsByWorkspace[workspace.id]?.trim();
      const response = await stopWorkspaceDevServer({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId: workspace.id,
        processId: processId || undefined,
      });
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: response.message?.trim() || "开发服务器已停止",
      };
      this.clearWorkspaceDevServerProcess(workspace.id);
      await this.loadWorkspaces();
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: error instanceof Error ? error.message : "停止开发服务器失败",
      };
    } finally {
      this.setDevServerStopping(workspace.id, false);
    }
  }

  private async handleWorkspaceDevServerToggle(workspace: KanbanWorkspace) {
    const state = this.getWorkspaceDevServerState(workspace);
    if (state === "running") {
      await this.handleWorkspaceDevServerStop(workspace);
      return;
    }
    if (state === "idle") {
      await this.handleWorkspaceRun(workspace);
    }
  }

  private async handleOpenPreviewDrawer(workspace: KanbanWorkspace) {
    const previewUrl = await this.resolveWorkspacePreviewUrl(workspace);
    if (!previewUrl) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "快捷网页地址不可用，请先启动开发服务器。",
      };
      return;
    }
    this.previewDrawerWorkspaceId = workspace.id;
    this.requestUpdate();
  }

  private handleClosePreviewDrawer = () => {
    this.previewDrawerWorkspaceId = undefined;
    this.requestUpdate();
  };

  private openWorkspacePreviewPage(previewUrl: string) {
    const opened = window.open(previewUrl, "_blank", "noopener");
    if (!opened) {
      window.location.assign(previewUrl);
    }
  }

  private async handleOpenWebPreview(workspace: KanbanWorkspace) {
    const previewUrl = await this.resolveWorkspacePreviewUrl(workspace);
    if (!previewUrl) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "快捷网页地址不可用，请先启动开发服务器。",
      };
      return;
    }
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      this.openWorkspacePreviewPage(previewUrl);
      return;
    }
    this.webPreviewWorkspaceId = workspace.id;
    this.requestUpdate();
  }

  private handleCloseWebPreview = () => {
    this.webPreviewWorkspaceId = undefined;
    this.requestUpdate();
  };

  private handleDraftChange(workspaceId: string, draft: string) {
    this.messageDraftByWorkspace = {
      ...this.messageDraftByWorkspace,
      [workspaceId]: draft,
    };
  }

  private handleCloseWorkspace(workspace: KanbanWorkspace) {
    if (this.webPreviewWorkspaceId === workspace.id) {
      this.webPreviewWorkspaceId = undefined;
    }
    this.pageState = dismissWorkspacePane(
      this.pageState,
      workspace.id,
      Boolean(workspace.needs_attention || workspace.has_pending_approval || workspace.has_unseen_turns),
    );
  }

  private async handleTodoSelected(workspace: KanbanWorkspace, detail: { content: string; todoId: string }) {
    if (!this.isApiMode) return;
    if (workspace.status === "running") return;
    this.messageDraftByWorkspace = {
      ...this.messageDraftByWorkspace,
      [workspace.id]: detail.content,
    };
    await handleTodoSelectedAndSend({
      baseUrl: this.previewOptions.baseUrl ?? "",
      apiKey: this.previewOptions.apiKey,
      workspaceId: workspace.id,
      todoId: detail.todoId,
      content: detail.content,
      sendAction: () => this.handlePaneAction(workspace, "send"),
      refreshCount: (id) => { void this.loadTodoPendingCount(id); },
    });
  }

  private async loadTodoPendingCount(workspaceId: string) {
    if (!this.isApiMode) return;
    const count = await loadTodoPendingCount({
      baseUrl: this.previewOptions.baseUrl ?? "",
      apiKey: this.previewOptions.apiKey,
      workspaceId,
    });
    this.todoPendingCountByWorkspace = {
      ...this.todoPendingCountByWorkspace,
      [workspaceId]: count,
    };
  }

  private async handlePaneAction(workspace: KanbanWorkspace, action: ConversationPaneAction) {
    if (action === "stop") {
      if (this.queueStatusByWorkspace[workspace.id]?.status === "queued") {
        await this.handleCancelWorkspaceQueue(workspace.id);
        return;
      }
      await this.handleStopWorkspace(workspace.id);
      return;
    }

    const message = (this.messageDraftByWorkspace[workspace.id] ?? "").trim();
    if (!message) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "请输入要发送的消息。",
      };
      return;
    }

    if (!this.isApiMode) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "预览模式暂不支持发送消息。",
      };
      return;
    }

    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspace.id]: action === "queue" ? "正在加入队列..." : "正在发送消息...",
    };

    try {
      const response = await sendWorkspaceMessage({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId: workspace.id,
        message,
        mode: action,
      });

      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: response.message?.trim()
          ? `${action === "queue" ? "加入队列成功" : "发送成功"}：${response.message.trim()}`
          : action === "queue"
            ? "加入队列成功。"
            : "发送成功。",
      };
      if (action === "send") {
        this.messageDraftByWorkspace = {
          ...this.messageDraftByWorkspace,
          [workspace.id]: "",
        };
      }
      await this.loadWorkspaceMessages(workspace.id, true);
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: error instanceof Error ? error.message : "发送消息失败",
      };
    }
  }

  private async handleStopWorkspace(workspaceId: string) {
    if (!this.isApiMode) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: "预览模式暂不支持停止执行。",
      };
      return;
    }

    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspaceId]: "正在发送停止请求...",
    };

    try {
      const response = await stopWorkspaceExecution({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId,
      });
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: response.message?.trim() || "已发送停止请求",
      };
      await this.loadWorkspaces();
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: error instanceof Error ? error.message : "停止执行失败",
      };
    }
  }

  private async handleCancelWorkspaceQueue(workspaceId: string) {
    if (!this.isApiMode) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: "预览模式暂不支持取消队列。",
      };
      return;
    }

    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspaceId]: "正在取消队列...",
    };

    try {
      const response = await cancelWorkspaceQueue({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId,
      });
      this.queueStatusByWorkspace = {
        ...this.queueStatusByWorkspace,
        [workspaceId]: response,
      };
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: response.message?.trim() || "队列已取消",
      };
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: error instanceof Error ? error.message : "取消队列失败",
      };
    }
  }

  private async loadWorkspaceQueueStatus(workspaceId: string) {
    if (!this.isApiMode) {
      return;
    }

    try {
      const response = await fetchWorkspaceQueueStatus({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId,
      });
      this.queueStatusByWorkspace = {
        ...this.queueStatusByWorkspace,
        [workspaceId]: response,
      };
      if (response.status === "queued" && !(this.messageDraftByWorkspace[workspaceId] ?? "").trim()) {
        this.messageDraftByWorkspace = {
          ...this.messageDraftByWorkspace,
          [workspaceId]: response.queued?.data?.message ?? "",
        };
      }
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspaceId]: error instanceof Error ? error.message : "获取队列状态失败",
      };
    }
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

  private renderWorkspaceSection(section: {
    key: "attention" | "running" | "idle";
    label: string;
    workspaces: KanbanWorkspace[];
  }) {
    const collapsed = this.collapsedSections.has(section.key);

    return html`
      <section class="section" ?collapsed=${collapsed}>
        <button class="section-toggle" type="button" @click=${() => this.toggleSection(section.key)}>
          <span class="section-title-row">
            <span class="section-title">${section.label}</span>
            <span class="section-count">${section.workspaces.length}</span>
          </span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
        ${collapsed
          ? nothing
          : html`
              <div class="section-body">
                ${section.workspaces.map((workspace) => this.renderWorkspaceCard(workspace))}
              </div>
            `}
      </section>
    `;
  }

  private renderWorkspaceCard(workspace: KanbanWorkspace) {
    const statusMeta = getStatusMeta(workspace);
    const relativeTime = this.getWorkspaceCardRelativeTime(workspace);
    const filesChanged = workspace.files_changed ?? 0;
    const linesAdded = workspace.lines_added ?? 0;
    const linesRemoved = workspace.lines_removed ?? 0;
    const localFeedback = this.getWorkspaceCardFeedback(workspace.id);

    return html`
      <div
        class="task-card ${statusMeta.accentClass}"
        data-selected=${workspace.id === this.pageState.activeWorkspaceId ? "true" : "false"}
      >
        <button
          class="task-card-main"
          type="button"
          @click=${() => this.handleOpenWorkspace(workspace)}
          aria-label=${`打开工作区 ${workspace.name}`}
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
              ><span class="file-count">📄 ${filesChanged}</span> <span class="lines-added"
                >+${linesAdded}</span
              >
              <span class="lines-removed">-${linesRemoved}</span></span
            >
          </div>
        </button>
        ${localFeedback
          ? html`<div class="task-card-feedback" role="status">${localFeedback}</div>`
          : nothing}
      </div>
    `;
  }

  private getWorkspaceCardRelativeTime(workspace: KanbanWorkspace) {
    const timestamp = this.getWorkspaceCardTimestamp(workspace);
    return timestamp ? formatRelativeTime(timestamp) : "recently";
  }

  private getWorkspaceCardTimestamp(workspace: KanbanWorkspace) {
    return workspace.latest_process_completed_at || workspace.last_message_at;
  }

  private get previewOptions() {
    return readPreviewApiOptions(new URL(window.location.href));
  }

  private get isApiMode() {
    return this.previewOptions.baseUrl !== undefined;
  }

  private isUnauthorizedError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /(?:^|\\b)(401|403)\\b/.test(message) || /Unauthorized/i.test(message);
  }

  private getWorkspaceFeedback(workspaceId: string) {
    if (this.actionFeedbackByWorkspace[workspaceId]) {
      return this.actionFeedbackByWorkspace[workspaceId];
    }
    const queueStatus = this.queueStatusByWorkspace[workspaceId];
    if (queueStatus?.status === "queued") {
      return "消息已排队 - 将在当前运行完成时执行";
    }
    if (this.messageErrorByWorkspace[workspaceId]) {
      return this.messageErrorByWorkspace[workspaceId];
    }
    if (this.loadingWorkspaceIds.has(workspaceId)) {
      return "正在同步最新消息...";
    }
    return "";
  }

  private getWorkspaceCardFeedback(workspaceId: string) {
    const feedback = this.actionFeedbackByWorkspace[workspaceId] ?? "";
    if (!feedback) {
      return "";
    }
    return feedback;
  }

  private setWorkspaceLoading(workspaceId: string, loading: boolean) {
    const next = new Set(this.loadingWorkspaceIds);
    if (loading) {
      next.add(workspaceId);
    } else {
      next.delete(workspaceId);
    }
    this.loadingWorkspaceIds = next;
  }

  private setDevServerStarting(workspaceId: string, starting: boolean) {
    const next = new Set(this.startingDevServerWorkspaceIds);
    if (starting) {
      next.add(workspaceId);
    } else {
      next.delete(workspaceId);
    }
    this.startingDevServerWorkspaceIds = next;
  }

  private setDevServerStopping(workspaceId: string, stopping: boolean) {
    const next = new Set(this.stoppingDevServerWorkspaceIds);
    if (stopping) {
      next.add(workspaceId);
    } else {
      next.delete(workspaceId);
    }
    this.stoppingDevServerWorkspaceIds = next;
  }

  private isWorkspaceDevServerRunning(workspace: KanbanWorkspace) {
    return Boolean(
        workspace.has_running_dev_server ||
        workspace.hasRunningDevServer ||
        this.devServerProcessStatusByWorkspace[workspace.id] === "running" ||
        this.startingDevServerWorkspaceIds.has(workspace.id),
    );
  }

  private pruneDevServerProcessState(workspaces: KanbanWorkspace[]) {
    const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const nextIds: Record<string, string> = {};
    const nextStatuses: Record<string, string> = {};

    for (const workspaceId of Object.keys(this.devServerProcessIdsByWorkspace)) {
      if (!workspaceIds.has(workspaceId)) {
        continue;
      }
      nextIds[workspaceId] = this.devServerProcessIdsByWorkspace[workspaceId];
      const status = this.devServerProcessStatusByWorkspace[workspaceId];
      if (status) {
        nextStatuses[workspaceId] = status;
      }
    }

    this.devServerProcessIdsByWorkspace = nextIds;
    this.devServerProcessStatusByWorkspace = nextStatuses;
  }

  private clearWorkspaceDevServerProcess(workspaceId: string) {
    const nextIds = { ...this.devServerProcessIdsByWorkspace };
    const nextStatuses = { ...this.devServerProcessStatusByWorkspace };
    delete nextIds[workspaceId];
    delete nextStatuses[workspaceId];
    this.devServerProcessIdsByWorkspace = nextIds;
    this.devServerProcessStatusByWorkspace = nextStatuses;
  }

  private async refreshWorkspaceDevServerProcess(workspaceId: string) {
    const processId = this.devServerProcessIdsByWorkspace[workspaceId];
    if (!this.isApiMode || !processId) {
      return;
    }

    try {
      const response = await fetchExecutionProcess({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        processId,
      });
      const status = response.data?.status?.trim();
      if (!status) {
        return;
      }
      this.devServerProcessStatusByWorkspace = {
        ...this.devServerProcessStatusByWorkspace,
        [workspaceId]: status,
      };
      if (status !== "running") {
        this.clearWorkspaceDevServerProcess(workspaceId);
      }
    } catch {
      // 详情接口只是辅助状态源，请求失败时保留当前状态，避免打断主交互。
    }
  }

  private async hydrateRunningDevServerProcesses(workspaces: KanbanWorkspace[]) {
    const jobs: Promise<void>[] = [];

    for (const workspace of workspaces) {
      const processId = workspace.running_dev_server_process_id?.trim();
      if (!processId) {
        continue;
      }

      this.devServerProcessIdsByWorkspace = {
        ...this.devServerProcessIdsByWorkspace,
        [workspace.id]: processId,
      };
      jobs.push(this.refreshWorkspaceDevServerProcess(workspace.id));
    }

    if (jobs.length > 0) {
      await Promise.all(jobs);
    }
  }

  private async setupMobileCard() {
    await ensureKanbanWatcherCardDefined();

    const card = this.renderRoot.querySelector("kanban-watcher-card") as
      | (HTMLElement & {
          hass?: ReturnType<typeof createPreviewHass>;
          setConfig: (config: ReturnType<typeof buildPreviewCardConfigFromOptions>) => void;
        })
      | null;

    if (!card) {
      return;
    }

    const nextConfig = buildPreviewCardConfigFromOptions(previewEntityId, this.previewOptions);
    const nextConfigSignature = JSON.stringify(nextConfig);

    if (this.mobileCardConfigSignature !== nextConfigSignature) {
      card.setConfig(nextConfig);
      this.mobileCardConfigSignature = nextConfigSignature;
    }

    // baseUrl 为 undefined 时使用 mock 数据，空字符串表示使用相对路径（Vite 代理模式）
    if (this.previewOptions.baseUrl === undefined) {
      card.hass = createPreviewHass();
    }
  }

  private stopRealtimeSync() {
    if (this.boardRealtimeRetryTimer) {
      window.clearTimeout(this.boardRealtimeRetryTimer);
      this.boardRealtimeRetryTimer = undefined;
    }
    if (this.realtimeRetryTimer) {
      window.clearTimeout(this.realtimeRetryTimer);
      this.realtimeRetryTimer = undefined;
    }
    if (this.boardRealtimeSocket) {
      const socket = this.boardRealtimeSocket;
      this.boardRealtimeSocket = undefined;
      socket.close();
    }
    if (this.realtimeSocket) {
      const socket = this.realtimeSocket;
      this.realtimeSocket = undefined;
      socket.close();
    }
  }

  private connectBoardRealtimeIfNeeded() {
    if (!this.isApiMode || this.apiAccessBlocked || typeof WebSocket === "undefined") {
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.realtimeBaseUrl || this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      onOpen: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (this.boardRealtimeRetryTimer) {
          window.clearTimeout(this.boardRealtimeRetryTimer);
          this.boardRealtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        void this.loadWorkspaces();
        this.scheduleBoardRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "workspace_snapshot" || event.type === "workspace_view_updated") {
          this.handleRealtimeEvent(event);
        }
      },
    });
    this.boardRealtimeSocket = socket;
  }

  private connectRealtimeIfNeeded() {
    if (!this.isApiMode || this.apiAccessBlocked || typeof WebSocket === "undefined") {
      return;
    }
    const sessionId = this.activeWorkspace?.latest_session_id ?? this.activeWorkspace?.last_session_id;
    if (!sessionId) {
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.realtimeBaseUrl || this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      sessionId,
      onOpen: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (this.realtimeRetryTimer) {
          window.clearTimeout(this.realtimeRetryTimer);
          this.realtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        const workspace = this.activeWorkspace;
        if (workspace) {
          void this.loadWorkspaceMessages(workspace.id, true);
        }
        this.scheduleRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.handleRealtimeEvent(event);
      },
    });
    this.realtimeSocket = socket;
  }

  private restartRealtimeConnection() {
    if (!this.isApiMode) {
      return;
    }
    if (this.realtimeSocket) {
      const socket = this.realtimeSocket;
      this.realtimeSocket = undefined;
      socket.close();
    }
    this.connectRealtimeIfNeeded();
  }

  private scheduleBoardRealtimeReconnect() {
    if (this.boardRealtimeRetryTimer || !this.isApiMode || this.apiAccessBlocked) {
      return;
    }
    this.boardRealtimeRetryTimer = window.setTimeout(() => {
      this.boardRealtimeRetryTimer = undefined;
      if (this.boardRealtimeSocket) {
        const socket = this.boardRealtimeSocket;
        this.boardRealtimeSocket = undefined;
        socket.close();
      }
      this.connectBoardRealtimeIfNeeded();
    }, DEFAULT_REALTIME_RETRY_DELAY_MS);
  }

  private scheduleRealtimeReconnect() {
    if (this.realtimeRetryTimer || !this.isApiMode || this.apiAccessBlocked) {
      return;
    }
    this.realtimeRetryTimer = window.setTimeout(() => {
      this.realtimeRetryTimer = undefined;
      this.restartRealtimeConnection();
    }, DEFAULT_REALTIME_RETRY_DELAY_MS);
  }

  private handleRealtimeEvent(event: RealtimeEvent) {
    if (event.type === "workspace_view_updated" && event.workspace_view) {
      const previousOpenWorkspaceIds = [...this.pageState.openWorkspaceIds];
      this.applyRemoteWorkspaceView(event.workspace_view);
      const newlyOpenedWorkspaceIds = this.pageState.openWorkspaceIds.filter(
        (workspaceId) => !previousOpenWorkspaceIds.includes(workspaceId),
      );
      newlyOpenedWorkspaceIds.forEach((workspaceId) => {
        void this.loadWorkspaceMessages(workspaceId, true);
      });
      return;
    }
    if (event.type === "workspace_snapshot") {
      const previousOpenWorkspaceIds = [...this.pageState.openWorkspaceIds];
      const previousWorkspaces = this.workspaces;
      const nextWorkspaces = this.preserveWorkspaceOrder(
        (event.workspaces ?? []).map((workspace) => this.toKanbanWorkspace(workspace)),
      );
      const shouldRefreshActiveWorkspaceMessages = didSelectedWorkspaceMessageVersionChange({
        previousSelectedWorkspaceId: this.pageState.activeWorkspaceId,
        previousWorkspaces,
        currentSelectedWorkspaceId: this.pageState.activeWorkspaceId,
        currentWorkspaces: nextWorkspaces,
      });
      void this.hydrateRunningDevServerProcesses(nextWorkspaces);
      this.workspaces = nextWorkspaces;
      this.pruneDevServerProcessState(nextWorkspaces);
      this.pageState = reconcileWorkspacePageState(this.pageState, this.workspaces);
      if (shouldRefreshActiveWorkspaceMessages && this.pageState.activeWorkspaceId) {
        void this.loadWorkspaceMessages(this.pageState.activeWorkspaceId, true);
      }
      const newlyOpenedWorkspaceIds = this.pageState.openWorkspaceIds.filter(
        (workspaceId) => !previousOpenWorkspaceIds.includes(workspaceId),
      );
      newlyOpenedWorkspaceIds.forEach((workspaceId) => {
        void this.loadWorkspaceMessages(workspaceId, true);
        const workspace = this.workspaces.find((item) => item.id === workspaceId);
        if (workspace?.status === "running") {
          void this.loadWorkspaceQueueStatus(workspaceId);
        }
      });
      this.requestUpdate();
      return;
    }
    if (event.type === "session_messages_appended" && event.session_id) {
      this.appendRealtimeMessages(event.session_id, event.messages);
    }
  }

  private appendRealtimeMessages(sessionId: string, messages: SessionMessageResponse[] | undefined) {
    const workspace = this.workspaces.find(
      (item) => item.latest_session_id === sessionId || item.last_session_id === sessionId,
    );
    if (!workspace) {
      return;
    }
    if (!this.shouldAcceptRealtimeMessages(workspace.id)) {
      return;
    }

    const existing = this.flattenDialogMessages(this.messagesByWorkspace[workspace.id] ?? []);
    const merged = [...existing];
    const indexByKey = new Map(existing.map((item, index) => [item.key ?? `${item.timestamp}:${index}`, index]));

    for (const message of normalizeApiMessagesFlat(messages)) {
      const key = message.key ?? `${message.timestamp}:${message.kind}:${merged.length}`;
      const existingIndex = indexByKey.get(key);
      if (typeof existingIndex === "number") {
        merged[existingIndex] = message;
      } else {
        indexByKey.set(key, merged.length);
        merged.push(message);
      }
    }

    merged.sort(compareDialogMessageOrder);
    this.messagesByWorkspace = {
      ...this.messagesByWorkspace,
      [workspace.id]: this.groupDialogMessages(merged),
    };
    this.requestUpdate();
  }

  private shouldAcceptRealtimeMessages(workspaceId: string) {
    const workspace = this.workspaces.find((item) => item.id === workspaceId);
    return Boolean(workspace);
  }

  private flattenDialogMessages(messages: DialogMessage[]) {
    return messages.flatMap((message) => {
      if (message.kind === "tool-group") {
        return message.items;
      }
      return [message];
    });
  }

  private groupDialogMessages(messages: DialogMessage[]) {
    const grouped: DialogMessage[] = [];

    for (const message of messages) {
      const previous = grouped.at(-1);
      if (
        message.kind === "tool" &&
        previous?.kind === "tool-group" &&
        previous.toolName === message.toolName
      ) {
        previous.items = [...previous.items, message];
        previous.summary = `${previous.items.length} commands`;
        previous.statusLabel = `${previous.items.length} 条`;
        previous.timestamp = message.timestamp ?? previous.timestamp;
        continue;
      }

      if (
        message.kind === "tool" &&
        previous?.kind === "tool" &&
        previous.toolName === message.toolName
      ) {
        grouped[grouped.length - 1] = {
          kind: "tool-group",
          toolName: message.toolName,
          summary: "2 commands",
          status: message.status,
          statusLabel: "2 条",
          icon: message.icon,
          items: [previous, message],
          timestamp: message.timestamp ?? previous.timestamp,
        };
        continue;
      }

      grouped.push(message);
    }

    return grouped;
  }

  private resolveSmoothRevealMessageKey(
    workspaceId: string,
    previousMessages: DialogMessage[],
    nextMessages: DialogMessage[],
  ) {
    if (workspaceId === this.activeWorkspace?.id) {
      return "";
    }

    const nextLastMessage = nextMessages.at(-1);
    const previousLastMessage = previousMessages.at(-1);

    if (!nextLastMessage || nextLastMessage.kind !== "message" || nextLastMessage.sender !== "ai") {
      return "";
    }

    const nextIdentity = getDialogMessageIdentity(nextLastMessage);
    const previousIdentity = previousLastMessage ? getDialogMessageIdentity(previousLastMessage) : "";

    return nextIdentity !== previousIdentity ? nextIdentity : "";
  }

  private get activeWorkspace() {
    return this.pageState.activeWorkspaceId
      ? this.workspaces.find((workspace) => workspace.id === this.pageState.activeWorkspaceId)
      : undefined;
  }

  private get activeWorkspaceBrowserUrl() {
    return this.activeWorkspace ? this.getWorkspacePreviewUrl(this.activeWorkspace) : "";
  }

  private getWorkspacePreviewUrl(workspace: KanbanWorkspace) {
    return (
      getWorkspaceEmbeddedPreviewUrl(workspace, this.previewProxyPort) ||
      this.webPreviewFallbackUrlByWorkspace[workspace.id] ||
      ""
    );
  }

  private async resolveWorkspaceFileBrowserPath(workspaceId: string, fallbackPath: string) {
    if (!this.isApiMode) {
      return fallbackPath;
    }

    const response = await fetchWorkspaceFileBrowserPath({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      workspaceId,
    });
    return response.data?.path?.trim() || fallbackPath;
  }

  private shouldShowWorkspaceWebPreview(workspace: KanbanWorkspace) {
    return this.getWorkspaceDevServerState(workspace) === "running";
  }

  private async resolveWorkspacePreviewUrl(workspace: KanbanWorkspace) {
    const existingUrl = this.getWorkspacePreviewUrl(workspace);
    if (existingUrl) {
      return existingUrl;
    }
    if (this.getWorkspaceDevServerState(workspace) !== "running" || !this.isApiMode) {
      return "";
    }

    const response = await fetchWorkspaceFrontendPort({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      workspaceId: workspace.id,
    });
    const frontendPort = response.data?.frontend_port;
    if (!frontendPort) {
      return "";
    }

    const previewUrl = buildWorkspacePreviewUrlFromFrontendPort(frontendPort);
    this.webPreviewFallbackUrlByWorkspace = {
      ...this.webPreviewFallbackUrlByWorkspace,
      [workspace.id]: previewUrl,
    };
    return previewUrl;
  }

  private getWorkspaceDevServerState(workspace: KanbanWorkspace) {
    if (this.startingDevServerWorkspaceIds.has(workspace.id)) {
      return "starting" as const;
    }
    if (this.stoppingDevServerWorkspaceIds.has(workspace.id)) {
      return "stopping" as const;
    }
    if (this.devServerProcessStatusByWorkspace[workspace.id] === "running") {
      return "running" as const;
    }
    if (workspace.has_running_dev_server || workspace.hasRunningDevServer) {
      return "running" as const;
    }
    return "idle" as const;
  }

  private getActiveSessionId(
    pageState: WorkspacePageState,
    workspaces: KanbanWorkspace[],
  ) {
    return getSelectedWorkspaceSessionId(pageState.activeWorkspaceId, workspaces) ?? "";
  }

  private renderWorkspacePanes(
    openWorkspaces: KanbanWorkspace[],
    paneLayoutMode: "grid" | "focus",
  ) {
    if (openWorkspaces.length === 0) {
      return html`<section class="workspace-home-pane-grid">
        <div class="empty-state">从左侧选择工作区后，这里会显示对话内容。</div>
      </section>`;
    }

    if (paneLayoutMode === "focus" && this.activeWorkspace) {
      const secondaryWorkspaces = openWorkspaces.filter((workspace) => workspace.id !== this.activeWorkspace?.id);
      return html`
        <section class="workspace-home-pane-focus-layout">
          <div class="workspace-home-pane-main">
            ${this.renderWorkspacePane(this.activeWorkspace)}
          </div>
          ${secondaryWorkspaces.length > 0
            ? html`
                <aside class="workspace-home-pane-preview-rail">
                  ${secondaryWorkspaces.map((workspace) => this.renderWorkspacePreviewCard(workspace))}
                </aside>
              `
            : nothing}
        </section>
      `;
    }

    return html`
      <section
        class="workspace-home-pane-grid"
        style=${`--workspace-pane-columns: ${getPaneColumns(openWorkspaces.length, window.innerWidth)};`}
      >
        ${openWorkspaces.map((workspace) => this.renderWorkspacePane(workspace))}
      </section>
    `;
  }

  private renderWorkspacePane(workspace: KanbanWorkspace) {
    const queueStatus = this.queueStatusByWorkspace[workspace.id];
    const isRunning = workspace.status === "running";
    const statusAccentClass = getStatusMeta(workspace).accentClass;
    const workspacePath = getWorkspacePath(workspace);

    return html`
      <workspace-conversation-pane
        .workspaceName=${workspace.name}
        .workspaceId=${workspace.id}
        .workspacePath=${workspacePath}
        .resolveWorkspacePath=${() => this.resolveWorkspaceFileBrowserPath(workspace.id, workspacePath)}
        .messages=${this.messagesByWorkspace[workspace.id] ?? []}
        .messageDraft=${this.messageDraftByWorkspace[workspace.id] ?? ""}
        .currentFeedback=${this.getWorkspaceFeedback(workspace.id)}
        .smoothRevealMessageKey=${this.smoothRevealMessageKeyByWorkspace[workspace.id]}
        .statusAccentClass=${statusAccentClass}
        .quickButtonsTemplate=${this.renderQuickButtons(workspace)}
        .queueStatus=${queueStatus}
        .isRunning=${isRunning}
        .canQueue=${Boolean(isRunning || queueStatus?.status === "queued")}
        .devServerState=${this.getWorkspaceDevServerState(workspace)}
        .showWorkspaceWebPreview=${this.shouldShowWorkspaceWebPreview(workspace)}
        .todoBaseUrl=${this.previewOptions.baseUrl ?? ""}
        .todoApiKey=${this.previewOptions.apiKey}
        .todoPendingCount=${this.todoPendingCountByWorkspace[workspace.id] ?? 0}
        @draft-change=${(event: CustomEvent<string>) =>
          this.handleDraftChange(workspace.id, event.detail)}
        @action-click=${(event: CustomEvent<ConversationPaneAction>) =>
          void this.handlePaneAction(workspace, event.detail)}
        @dev-server-toggle=${() => void this.handleWorkspaceDevServerToggle(workspace)}
        @workspace-web-preview-toggle=${() => void this.handleOpenWebPreview(workspace)}
        @pane-close=${() => this.handleCloseWorkspace(workspace)}
        @todo-selected=${(event: CustomEvent<{ content: string; todoId: string }>) =>
          void this.handleTodoSelected(workspace, event.detail)}
      ></workspace-conversation-pane>
    `;
  }

  private renderPreviewDrawer() {
    const workspace = this.workspaces.find((item) => item.id === this.previewDrawerWorkspaceId);
    const previewUrl = workspace ? this.getWorkspacePreviewUrl(workspace) : "";
    if (!workspace || !previewUrl) {
      return nothing;
    }

    return html`
      <aside class="workspace-home-preview-drawer" data-open="true">
        <div class="workspace-home-preview-drawer-header">
          <div class="workspace-home-preview-drawer-title">${workspace.name}</div>
          <button
            class="workspace-home-preview-drawer-close"
            type="button"
            @click=${this.handleClosePreviewDrawer}
          >
            ✕
          </button>
        </div>
        <iframe
          class="workspace-home-preview-drawer-frame"
          src=${previewUrl}
          title=${`${workspace.name} 预览`}
        ></iframe>
      </aside>
    `;
  }

  private renderWebPreviewOverlay() {
    const workspace = this.workspaces.find((item) => item.id === this.webPreviewWorkspaceId);
    const previewUrl = workspace ? this.getWorkspacePreviewUrl(workspace) : "";
    if (!workspace || !previewUrl) {
      return nothing;
    }
    const isMobileWebPreview = window.innerWidth <= MOBILE_BREAKPOINT;

    return html`
      <div
        class="workspace-home-web-preview-overlay"
        data-layout=${isMobileWebPreview ? "mobile" : "desktop"}
        @click=${this.handleWebPreviewOverlayClick}
      >
        <section
          class=${`workspace-home-web-preview-modal${isMobileWebPreview ? " is-mobile" : ""}`}
          @click=${this.stopEventPropagation}
        >
          <div class="workspace-home-web-preview-header">
            <div class="workspace-home-web-preview-title">${workspace.name}</div>
            <button
              class="workspace-home-web-preview-close"
              type="button"
              aria-label="关闭快捷网页"
              @click=${this.handleCloseWebPreview}
            >
              ✕
            </button>
          </div>
          <iframe
            class="workspace-home-web-preview-frame"
            src=${previewUrl}
            title=${`${workspace.name} 快捷网页`}
          ></iframe>
        </section>
      </div>
    `;
  }

  private handleWebPreviewOverlayClick = (event: Event) => {
    if ((event.target as HTMLElement | null)?.classList.contains("workspace-home-web-preview-overlay")) {
      this.handleCloseWebPreview();
    }
  };

  private stopEventPropagation = (event: Event) => {
    event.stopPropagation();
  };

  private renderWorkspacePreviewCard(workspace: KanbanWorkspace) {
    const statusAccentClass = getStatusMeta(workspace).accentClass;
    const previewLines = summarizeWorkspacePreview(this.messagesByWorkspace[workspace.id] ?? []);

    return html`
      <workspace-preview-card
        .workspaceName=${workspace.name}
        .statusAccentClass=${statusAccentClass}
        .previewLines=${previewLines}
        @preview-activate=${() => this.handleOpenWorkspace(workspace)}
        @preview-close=${() => this.handleCloseWorkspace(workspace)}
      ></workspace-preview-card>
    `;
  }

  private renderQuickButtons(workspace: KanbanWorkspace) {
    if (workspace.status === "running") {
      return nothing;
    }

    const extractedButtons = this.extractedButtonsByWorkspace[workspace.id] || [];
    const suggestedButtons = this.suggestedButtonsByWorkspace[workspace.id] || [];
    const staticButtons = STATIC_BUTTONS.filter(isValidButtonText);
    const extracted = extractedButtons.filter(isValidButtonText);

    if (staticButtons.length === 0 && extracted.length === 0 && suggestedButtons.length === 0) {
      return nothing;
    }

    return html`
      <div class="quick-buttons">
        ${staticButtons.map((text) => html`
          <button
            class="quick-button is-static"
            type="button"
            @click=${() => void this.handleQuickButtonClick(workspace, text)}
          >
            ${text}
          </button>
        `)}
        ${extracted.map((text) => html`
          <button
            class="quick-button is-extracted"
            type="button"
            @click=${() => void this.handleQuickButtonClick(workspace, text)}
          >
            ${text}
          </button>
        `)}
        ${suggestedButtons.map((item) => html`
          <div class="quick-button-wrapper">
            <button
              class="quick-button is-suggested"
              type="button"
              @click=${() => void this.handleQuickButtonClick(workspace, item.button)}
            >
              ${item.button}
            </button>
            <button
              class="quick-button-info"
              type="button"
              title="点击查看理由"
              @click=${(event: Event) => {
                event.stopPropagation();
                const wrapper = (event.target as HTMLElement).closest(".quick-button-wrapper");
                const tooltip = wrapper?.querySelector(".quick-button-reason");
                tooltip?.classList.toggle("is-visible");
              }}
            >
              ℹ️
            </button>
            <div class="quick-button-reason">${item.reason}</div>
          </div>
        `)}
      </div>
    `;
  }

  private async handleQuickButtonClick(workspace: KanbanWorkspace, text: string) {
    if (workspace.status === "running") {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "工作区正在运行，无法发送快捷消息。",
      };
      return;
    }

    if (!this.isApiMode) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: "发送消息功能暂未接入，当前仅展示界面。",
      };
      return;
    }

    this.actionFeedbackByWorkspace = {
      ...this.actionFeedbackByWorkspace,
      [workspace.id]: "正在发送快捷消息...",
    };

    try {
      const response = await sendWorkspaceMessage({
        baseUrl: this.previewOptions.baseUrl!,
        apiKey: this.previewOptions.apiKey,
        workspaceId: workspace.id,
        message: text,
        mode: "send",
      });
      this.messageDraftByWorkspace = {
        ...this.messageDraftByWorkspace,
        [workspace.id]: "",
      };
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: response.message?.trim() ? `发送成功：${response.message.trim()}` : "快捷消息已发送",
      };
      await this.loadWorkspaceMessages(workspace.id, true);
    } catch (error) {
      this.actionFeedbackByWorkspace = {
        ...this.actionFeedbackByWorkspace,
        [workspace.id]: error instanceof Error ? error.message : "发送快捷消息失败",
      };
    }
  }

  private async analyzeDynamicButtons(workspaceId: string) {
    const workspace = this.workspaces.find((item) => item.id === workspaceId);
    if (!workspace || workspace.status === "running") {
      return;
    }

    const messages = this.messagesByWorkspace[workspaceId] || [];
    const lastAiMessage = [...messages]
      .reverse()
      .find((message) => message.kind === "message" && message.sender === "ai");

    if (!lastAiMessage || !("text" in lastAiMessage)) {
      this.extractedButtonsByWorkspace = {
        ...this.extractedButtonsByWorkspace,
        [workspaceId]: [],
      };
      this.suggestedButtonsByWorkspace = {
        ...this.suggestedButtonsByWorkspace,
        [workspaceId]: [],
      };
      delete this.dynamicButtonsMessageHashByWorkspace[workspaceId];
      return;
    }

    const messageHash = this.simpleHash(lastAiMessage.text);
    if (this.dynamicButtonsMessageHashByWorkspace[workspaceId] === messageHash) {
      return;
    }

    const extractedButtons = extractDynamicButtons(lastAiMessage.text).filter(isValidButtonText);
    this.extractedButtonsByWorkspace = {
      ...this.extractedButtonsByWorkspace,
      [workspaceId]: extractedButtons,
    };

    const recentMessages = messages
      .filter((message): message is Extract<DialogMessage, { kind: "message"; sender: "ai" | "user" }> =>
        message.kind === "message" && (message.sender === "ai" || message.sender === "user"),
      )
      .slice(-3)
      .map((message) => ({
        role: message.sender === "ai" ? "assistant" : "user",
        content: message.text,
        timestamp: message.timestamp,
      }));

    const result = await getQuickButtonsWithLLM({
      message: lastAiMessage.text,
      workspaceStatus: workspace.status,
      llmEnabled: false,
      llmConfig: {
        baseUrl: undefined,
        model: undefined,
      },
      recentMessages,
    });

    this.dynamicButtonsMessageHashByWorkspace[workspaceId] = messageHash;
    this.extractedButtonsByWorkspace = {
      ...this.extractedButtonsByWorkspace,
      [workspaceId]: result.extractedButtons,
    };
    this.suggestedButtonsByWorkspace = {
      ...this.suggestedButtonsByWorkspace,
      [workspaceId]: result.suggestedButtons,
    };
  }

  private simpleHash(str: string) {
    let hash = 0;
    for (let index = 0; index < str.length; index += 1) {
      const char = str.charCodeAt(index);
      hash = (hash << 5) - hash + char;
      hash &= hash;
    }
    return hash.toString(16);
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
