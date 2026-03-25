import { LitElement, html, nothing } from "lit";

import "../index";
import "../components/workspace-conversation-pane";
import "../components/workspace-preview-card";
import type {
  ConversationPaneAction,
  WorkspaceConversationPane,
} from "../components/workspace-conversation-pane";
import { renderWorkspaceSectionList } from "../components/workspace-section-list";
import { createPreviewHass, previewEntityId } from "../dev/preview-fixture";
import { formatRelativeTime } from "../lib/format-relative-time";
import { groupWorkspaces } from "../lib/group-workspaces";
import { getStatusMeta } from "../lib/status-meta";
import {
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
  fetchActiveWorkspaces,
  fetchWorkspaceLatestMessages,
  fetchWorkspaceQueueStatus,
  sendWorkspaceMessage,
  stopWorkspaceExecution,
} from "../lib/http-api";
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
import { buildPreviewCardConfig, readPreviewApiOptions } from "../playground";

export type WorkspaceHomeMode = "desktop" | "mobile-card";

const MOBILE_BREAKPOINT = 768;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_DIALOG_FALLBACK_INTERVAL_MS = 3_000;
const DEFAULT_REALTIME_RETRY_DELAY_MS = 3_000;

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
    messageErrorByWorkspace: { attribute: false },
    messageDraftByWorkspace: { attribute: false },
    actionFeedbackByWorkspace: { attribute: false },
    queueStatusByWorkspace: { attribute: false },
    smoothRevealMessageKeyByWorkspace: { attribute: false },
    extractedButtonsByWorkspace: { attribute: false },
    suggestedButtonsByWorkspace: { attribute: false },
  };

  mode: WorkspaceHomeMode = resolveWorkspaceHomeMode(window.innerWidth);
  isSidebarCollapsed = true;
  workspaces: KanbanWorkspace[] = [];
  pageState: WorkspacePageState = createWorkspacePageState(readPersistedWorkspacePageState());
  messagesByWorkspace: Record<string, DialogMessage[]> = {};
  loading = false;
  error = "";
  collapsedSections = new Set<"attention" | "running" | "idle">();
  loadingWorkspaceIds = new Set<string>();
  messageErrorByWorkspace: Record<string, string> = {};
  messageDraftByWorkspace: Record<string, string> = {};
  actionFeedbackByWorkspace: Record<string, string> = {};
  queueStatusByWorkspace: Record<string, WorkspaceQueueStatusResponse> = {};
  smoothRevealMessageKeyByWorkspace: Record<string, string> = {};
  extractedButtonsByWorkspace: Record<string, string[]> = {};
  suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
  private dynamicButtonsMessageHashByWorkspace: Record<string, string> = {};
  private refreshTimer?: number;
  private dialogRefreshTimer?: number;
  private boardRealtimeRetryTimer?: number;
  private realtimeRetryTimer?: number;
  private boardRealtimeSocket?: WebSocket;
  private realtimeSocket?: WebSocket;
  private boardRealtimeConnected = false;
  private realtimeConnected = false;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.handleResize);
    void this.loadWorkspaces();
    this.connectBoardRealtimeIfNeeded();
    this.startBoardPolling();
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.handleResize);
    this.stopRealtimeSync();
    super.disconnectedCallback();
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (this.mode === "mobile-card") {
      this.setupMobileCard();
    }
    if (changedProperties.has("pageState")) {
      writePersistedWorkspacePageState(this.pageState);
      if (this.isApiMode) {
        this.restartRealtimeConnection();
        this.updateDialogPolling();
      }
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
    const paneLayoutMode = resolveWorkspacePaneLayoutMode(window.innerWidth, openWorkspaces.length);

    return html`
      <main class="workspace-home-shell" data-mode="desktop">
        <section
          class="workspace-home-layout"
          data-sidebar-collapsed=${this.isSidebarCollapsed ? "true" : "false"}
        >
          <button
            class="workspace-home-sidebar-toggle"
            type="button"
            @click=${this.handleSidebarToggle}
            aria-expanded=${this.isSidebarCollapsed ? "false" : "true"}
            aria-label=${this.isSidebarCollapsed ? "展开工作区状态栏" : "收起工作区状态栏"}
          >
            <span aria-hidden="true">${this.isSidebarCollapsed ? "»" : "«"}</span>
            <span>${this.isSidebarCollapsed ? "项目状态" : "收起"}</span>
          </button>
          ${this.isSidebarCollapsed
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
          >
            <div class="workspace-home-sidebar-content">
              ${this.loading ? html`<div class="empty-state">正在加载工作区...</div>` : nothing}
              ${this.error ? html`<div class="empty-state">${this.error}</div>` : nothing}
              ${renderWorkspaceSectionList({
                sections,
                collapsedSections: this.collapsedSections,
                compact: false,
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
            </div>
          </aside>
          ${this.renderWorkspacePanes(openWorkspaces, paneLayoutMode)}
        </section>
      </main>
    `;
  }

  private handleSidebarToggle = () => {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  };

  private handleResize = () => {
    const nextMode = resolveWorkspaceHomeMode(window.innerWidth);
    if (nextMode === this.mode) {
      this.requestUpdate();
      return;
    }
    this.mode = nextMode;
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
      const openWorkspaces = this.pageState.openWorkspaceIds
        .map((workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId))
        .filter((workspace): workspace is KanbanWorkspace => Boolean(workspace));

      await Promise.all(
        openWorkspaces.flatMap((workspace) => {
          const jobs: Promise<void>[] = [this.loadWorkspaceMessages(workspace.id, true)];
          if (workspace.status === "running") {
            jobs.push(this.loadWorkspaceQueueStatus(workspace.id));
          }
          return jobs;
        }),
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
      });
      const previousMessages = this.messagesByWorkspace[workspaceId] ?? [];
      const nextMessages = normalizeApiMessages(response.messages);

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
    const wasOpen = this.pageState.openWorkspaceIds.includes(workspace.id);
    const nextMessagesByWorkspace = { ...this.messagesByWorkspace };
    delete nextMessagesByWorkspace[workspace.id];
    this.messagesByWorkspace = nextMessagesByWorkspace;
    this.pageState = openWorkspacePane(this.pageState, workspace.id);
    void this.loadWorkspaceMessages(workspace.id, true);
    if (workspace.status === "running") {
      void this.loadWorkspaceQueueStatus(workspace.id);
    }
    if (wasOpen) {
      void this.focusWorkspaceComposer(workspace.id);
    }
  }

  private handleDraftChange(workspaceId: string, draft: string) {
    this.messageDraftByWorkspace = {
      ...this.messageDraftByWorkspace,
      [workspaceId]: draft,
    };
  }

  private handleCloseWorkspace(workspace: KanbanWorkspace) {
    this.pageState = dismissWorkspacePane(
      this.pageState,
      workspace.id,
      Boolean(workspace.needs_attention || workspace.has_pending_approval || workspace.has_unseen_turns),
    );
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

  private get previewOptions() {
    return readPreviewApiOptions(new URL(window.location.href));
  }

  private get isApiMode() {
    return Boolean(this.previewOptions.baseUrl);
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

  private setWorkspaceLoading(workspaceId: string, loading: boolean) {
    const next = new Set(this.loadingWorkspaceIds);
    if (loading) {
      next.add(workspaceId);
    } else {
      next.delete(workspaceId);
    }
    this.loadingWorkspaceIds = next;
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

  private stopRealtimeSync() {
    this.stopBoardPolling();
    this.stopDialogPolling();
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
    this.boardRealtimeConnected = false;
    this.realtimeConnected = false;
  }

  private startBoardPolling() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = window.setInterval(() => {
      void this.loadWorkspaces();
    }, DEFAULT_REFRESH_INTERVAL_MS);
  }

  private stopBoardPolling() {
    if (!this.refreshTimer) {
      return;
    }
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private startDialogPolling() {
    if (this.dialogRefreshTimer) {
      return;
    }
    this.dialogRefreshTimer = window.setInterval(() => {
      for (const workspace of this.getDialogPollingWorkspaces()) {
        void this.loadWorkspaceMessages(workspace.id, true);
        if (workspace.status === "running") {
          void this.loadWorkspaceQueueStatus(workspace.id);
        }
      }
    }, DEFAULT_DIALOG_FALLBACK_INTERVAL_MS);
  }

  private stopDialogPolling() {
    if (!this.dialogRefreshTimer) {
      return;
    }
    window.clearInterval(this.dialogRefreshTimer);
    this.dialogRefreshTimer = undefined;
  }

  private updateDialogPolling() {
    if (!this.isApiMode || this.getDialogPollingWorkspaces().length === 0) {
      this.stopDialogPolling();
      return;
    }
    this.startDialogPolling();
  }

  private connectBoardRealtimeIfNeeded() {
    if (!this.isApiMode || typeof WebSocket === "undefined") {
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      onOpen: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.boardRealtimeConnected = true;
        this.stopBoardPolling();
        if (this.boardRealtimeRetryTimer) {
          window.clearTimeout(this.boardRealtimeRetryTimer);
          this.boardRealtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.boardRealtimeConnected = false;
        void this.loadWorkspaces();
        this.startBoardPolling();
        this.scheduleBoardRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "workspace_snapshot") {
          this.handleRealtimeEvent(event);
        }
      },
    });
    this.boardRealtimeSocket = socket;
  }

  private connectRealtimeIfNeeded() {
    if (!this.isApiMode || typeof WebSocket === "undefined") {
      return;
    }
    const sessionId = this.activeWorkspace?.latest_session_id ?? this.activeWorkspace?.last_session_id;
    if (!sessionId) {
      this.realtimeConnected = false;
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      sessionId,
      onOpen: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.realtimeConnected = true;
        this.updateDialogPolling();
        if (this.realtimeRetryTimer) {
          window.clearTimeout(this.realtimeRetryTimer);
          this.realtimeRetryTimer = undefined;
        }
      },
      onClose: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.realtimeConnected = false;
        const workspace = this.activeWorkspace;
        if (workspace) {
          void this.loadWorkspaceMessages(workspace.id, true);
        }
        this.updateDialogPolling();
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
    if (this.boardRealtimeRetryTimer || !this.isApiMode) {
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
    if (this.realtimeRetryTimer || !this.isApiMode) {
      return;
    }
    this.realtimeRetryTimer = window.setTimeout(() => {
      this.realtimeRetryTimer = undefined;
      this.restartRealtimeConnection();
    }, DEFAULT_REALTIME_RETRY_DELAY_MS);
  }

  private handleRealtimeEvent(event: RealtimeEvent) {
    if (event.type === "workspace_snapshot") {
      this.workspaces = (event.workspaces ?? []).map((workspace) => this.toKanbanWorkspace(workspace));
      this.pageState = reconcileWorkspacePageState(this.pageState, this.workspaces);
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

    merged.sort((left, right) => this.compareDialogTimestamps(left.timestamp, right.timestamp));
    this.messagesByWorkspace = {
      ...this.messagesByWorkspace,
      [workspace.id]: this.groupDialogMessages(merged),
    };
    this.requestUpdate();
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

  private compareDialogTimestamps(left?: string, right?: string) {
    if (!left) {
      return right ? -1 : 0;
    }
    if (!right) {
      return 1;
    }
    const leftValue = Date.parse(left);
    const rightValue = Date.parse(right);
    if (!Number.isNaN(leftValue) && !Number.isNaN(rightValue) && leftValue !== rightValue) {
      return leftValue - rightValue;
    }
    return left.localeCompare(right);
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

  private getDialogPollingWorkspaces() {
    const openWorkspaces = this.pageState.openWorkspaceIds
      .map((workspaceId) => this.workspaces.find((workspace) => workspace.id === workspaceId))
      .filter((workspace): workspace is KanbanWorkspace => Boolean(workspace));

    if (!this.realtimeConnected || !this.activeWorkspace) {
      return openWorkspaces;
    }

    return openWorkspaces.filter((workspace) => workspace.id !== this.activeWorkspace?.id);
  }

  private get activeWorkspace() {
    return this.pageState.activeWorkspaceId
      ? this.workspaces.find((workspace) => workspace.id === this.pageState.activeWorkspaceId)
      : undefined;
  }

  private async focusWorkspaceComposer(workspaceId: string) {
    await this.updateComplete;
    await Promise.resolve();

    const panes = [
      ...(this.renderRoot.querySelectorAll("workspace-conversation-pane") ?? []),
    ] as Array<WorkspaceConversationPane>;
    if (panes.length === 1) {
      panes[0]?.focusComposer();
      return;
    }

    const paneIndex = this.pageState.openWorkspaceIds.indexOf(workspaceId);
    if (paneIndex < 0) {
      return;
    }

    panes[paneIndex]?.focusComposer();
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

    return html`
      <workspace-conversation-pane
        .workspaceName=${workspace.name}
        .messages=${this.messagesByWorkspace[workspace.id] ?? []}
        .messageDraft=${this.messageDraftByWorkspace[workspace.id] ?? ""}
        .currentFeedback=${this.getWorkspaceFeedback(workspace.id)}
        .smoothRevealMessageKey=${this.smoothRevealMessageKeyByWorkspace[workspace.id]}
        .statusAccentClass=${statusAccentClass}
        .quickButtonsTemplate=${this.renderQuickButtons(workspace)}
        .queueStatus=${queueStatus}
        .isRunning=${isRunning}
        .canQueue=${Boolean(isRunning || queueStatus?.status === "queued")}
        @draft-change=${(event: CustomEvent<string>) =>
          this.handleDraftChange(workspace.id, event.detail)}
        @action-click=${(event: CustomEvent<ConversationPaneAction>) =>
          void this.handlePaneAction(workspace, event.detail)}
        @pane-close=${() => this.handleCloseWorkspace(workspace)}
      ></workspace-conversation-pane>
    `;
  }

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
      .filter((message): message is Extract<DialogMessage, { kind: "message"; sender: "ai" }> =>
        message.kind === "message" && message.sender === "ai",
      )
      .slice(-5)
      .map((message) => ({
        role: "assistant",
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
