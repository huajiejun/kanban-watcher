import { LitElement, html, nothing } from "lit";
import "./components/workspace-conversation-pane";
import { detectDialogEditLanguage, renderDialogMessage } from "./components/dialog-message-renderer";
import {
  cancelWorkspaceQueue,
  fetchActiveWorkspaces,
  fetchWorkspaceFileBrowserPath,
  fetchWorkspaceFrontendPort,
  fetchVibeInfo,
  fetchWorkspaceLatestMessages,
  fetchWorkspaceQueueStatus,
  markWorkspaceSeen,
  sendWorkspaceMessage,
  startWorkspaceDevServer,
  stopWorkspaceExecution,
  stopWorkspaceDevServer,
} from "./lib/http-api";
import { handleTodoSelectedAndSend, loadTodoPendingCount } from "./lib/todo-helpers";
import { connectRealtime } from "./lib/realtime-api";
import {
  compactDialogMessageText,
  getDialogMessageIdentity,
  groupConsecutiveToolMessages,
  normalizeApiMessages,
  normalizeApiMessagesFlat,
  normalizeSessionMessage,
  type DialogMessage,
  type DialogTextMessage,
  type DialogToolMessage,
} from "./lib/dialog-messages";
import { groupWorkspaces } from "./lib/group-workspaces";
import { formatRelativeTime } from "./lib/format-relative-time";
import {
  extractDynamicButtons,
  getQuickButtonsWithLLM,
  isValidButtonText,
  STATIC_BUTTONS,
} from "./lib/quick-buttons";
import type { ButtonWithReason } from "./types";
import {
  renderWorkspaceSectionList,
  type WorkspaceSectionKey,
} from "./components/workspace-section-list";
import { cardStyles } from "./styles";
import { getStatusMeta } from "./lib/status-meta";
import { getWorkspacePath } from "./lib/workspace-path";
import {
  buildWorkspacePreviewUrlFromFrontendPort,
  getWorkspaceEmbeddedPreviewUrl,
} from "./lib/workspace-web-preview";
import type {
  ActiveWorkspacesResponse,
  KanbanEntityAttributes,
  KanbanSessionAttributes,
  KanbanSessionMessage,
  KanbanWorkspace,
  LocalWorkspaceSummary,
  RealtimeEvent,
  SessionMessageResponse,
  TodoItem,
  WorkspaceQueueStatusResponse,
} from "./types";

type SectionKey = WorkspaceSectionKey;
// Import todo-related components
import "./components/todo-progress-popup";
import "./components/chat-todo-list";

type SectionKey = "attention" | "running" | "idle";

type HomeAssistantState = {
  attributes?: KanbanEntityAttributes | KanbanSessionAttributes;
};

type HomeAssistantLike = {
  states: Record<string, HomeAssistantState>;
};

type CardConfig = {
  entity: string;
  base_url?: string;
  api_key?: string;
  messages_limit?: number;
  llm_enabled?: boolean;
  llm_base_url?: string;
  llm_model?: string;
  quick_button_rules?: {
    forbidden_actions?: string[];
  };
};

type DialogAction = "send" | "queue" | "stop";

const SECTION_ORDER: Array<{ key: SectionKey; label: string }> = [
  { key: "attention", label: "需要注意" },
  { key: "running", label: "运行中" },
  { key: "idle", label: "空闲" },
];

const DEFAULT_MESSAGES_LIMIT = 50;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_DIALOG_FALLBACK_INTERVAL_MS = 5_000;
const DEFAULT_REALTIME_RETRY_DELAY_MS = 3_000;

export class KanbanWatcherCard extends LitElement {
  static styles = cardStyles;

  static properties = {
    hass: { attribute: false },
    collapsedSections: { state: true },
    selectedWorkspaceId: { state: true },
    messageDraft: { state: true },
    actionFeedback: { state: true },
    apiWorkspaces: { state: true },
    boardLoading: { state: true },
    boardError: { state: true },
    dialogLoading: { state: true },
    dialogError: { state: true },
    dialogMessagesByWorkspace: { state: true },
    queueStatusByWorkspace: { state: true },
    optimisticQueueWorkspaceIds: { state: true },
    startingDevServerWorkspaceIds: { state: true },
    stoppingDevServerWorkspaceIds: { state: true },
    devServerProcessIdsByWorkspace: { state: true },
    autoScrollEnabled: { state: true },
    smoothRevealMessageKey: { state: true },
    dynamicButtonsByWorkspace: { state: true },
    todosByWorkspace: { state: true },
    webPreviewWorkspaceId: { state: true },
    webPreviewFallbackUrlByWorkspace: { state: true },
  };

  hass?: HomeAssistantLike;

  private config?: CardConfig;
  private refreshTimer?: number;
  private dialogRefreshTimer?: number;
  private boardRealtimeRetryTimer?: number;
  private realtimeRetryTimer?: number;
  private boardRealtimeSocket?: WebSocket;
  private realtimeSocket?: WebSocket;
  private boardRealtimeConnected = false;
  private realtimeConnected = false;
  private apiAccessBlocked = false;

  private collapsedSections = new Set<SectionKey>();
  private selectedWorkspaceId?: string;
  private messageDraft = "";
  private actionFeedback = "";
  private todoPendingCount = 0;
  private apiWorkspaces: KanbanWorkspace[] = [];
  private boardLoading = false;
  private boardError = "";
  private dialogLoading = false;
  private dialogError = "";
  private dialogMessagesByWorkspace: Record<string, DialogMessage[]> = {};
  private queueStatusByWorkspace: Record<string, WorkspaceQueueStatusResponse> = {};
  private optimisticQueueWorkspaceIds = new Set<string>();
  private startingDevServerWorkspaceIds = new Set<string>();
  private stoppingDevServerWorkspaceIds = new Set<string>();
  private devServerProcessIdsByWorkspace: Record<string, string> = {};
  private autoScrollEnabled = true;
  private messageListScrollHandler?: () => void;
  private smoothRevealMessageKey = "";
  private dialogMessageVersionsByWorkspace: Record<string, string> = {};
  private expandedToolMessageKeys = new Set<string>();
  /** @deprecated 使用 extractedButtonsByWorkspace 和 suggestedButtonsByWorkspace 代替 */
  private dynamicButtonsByWorkspace: Record<string, string[]> = {};
  /** 从消息中提取的选项按钮 */
  private extractedButtonsByWorkspace: Record<string, string[]> = {};
  /** LLM 语义联想推荐的操作按钮（带理由） */
  private suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
  /** 缓存每个工作区最后分析的消息 hash，避免重复调用 LLM */
  private dynamicButtonsMessageHashByWorkspace: Record<string, string> = {};
  /** 每个工作区的待办事项列表 */
  private todosByWorkspace: Record<string, TodoItem[]> = {};
  private webPreviewWorkspaceId?: string;
  private previewProxyPort?: number;
  private webPreviewFallbackUrlByWorkspace: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeyDown);
    this.startApiSyncIfNeeded();
  }

  disconnectedCallback() {
    this.removeEventListener("keydown", this.handleKeyDown);
    this.stopApiSync();
    super.disconnectedCallback();
  }

  setConfig(config: CardConfig) {
    if (!config?.entity) {
      throw new Error("`entity` is required");
    }

    this.config = config;
    this.startApiSyncIfNeeded();
  }

  getCardSize() {
    return Math.max(1, this.visibleSections.length * 2);
  }

  protected render() {
    const sections = this.visibleSections;

    return html`
      <ha-card>
        <div class="board">
          ${this.renderBoardState(sections)}
        </div>
        ${this.renderDialog()}
        ${this.renderWebPreviewOverlay()}
      </ha-card>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("selectedWorkspaceId") && this.selectedWorkspaceId) {
      this.scrollMessagesToBottom();
      this.setupMessageListScrollListener();
    }
    if (changedProperties.has("selectedWorkspaceId") && this.isApiMode) {
      this.restartRealtimeConnection();
      this.updateDialogPolling();
    }
  }

  private renderBoardState(
    sections: Array<{ key: SectionKey; label: string; workspaces: KanbanWorkspace[] }>,
  ) {
    if (this.boardLoading && sections.length === 0) {
      return html`<div class="empty-state">正在加载工作区...</div>`;
    }

    if (this.boardError && sections.length === 0) {
      return html`<div class="empty-state">${this.boardError}</div>`;
    }

    if (sections.length === 0) {
      return html`<div class="empty-state">当前没有任务</div>`;
    }

    return renderWorkspaceSectionList({
      sections,
      collapsedSections: this.collapsedSections,
      selectedWorkspaceId: this.selectedWorkspaceId,
      getWorkspaceDisplayMeta: (workspace) => this.getWorkspaceDisplayMeta(workspace),
      onToggleSection: (key) => this.toggleSection(key),
      onSelectWorkspace: (workspace) => this.openWorkspaceDialog(workspace),
    });
  }

  private renderQuickButtons(workspace: KanbanWorkspace) {
    const isRunning = workspace.status === "running";

    // 运行时隐藏所有快捷按钮
    if (isRunning) {
      return nothing;
    }

    // 获取各类按钮
    const extractedButtons = this.extractedButtonsByWorkspace[workspace.id] || [];
    const suggestedButtons = this.suggestedButtonsByWorkspace[workspace.id] || [];

    // 合并所有按钮：静态 + 提取 + 推荐
    const staticBtns = STATIC_BUTTONS.filter(isValidButtonText);
    const extractedBtns = extractedButtons.filter(isValidButtonText);

    if (staticBtns.length === 0 && extractedBtns.length === 0 && suggestedButtons.length === 0) {
      return nothing;
    }

    return html`
      <div class="quick-buttons">
        ${staticBtns.map((text) => html`
          <button
            class="quick-button is-static"
            type="button"
            @click=${() => void this.handleQuickButtonClick(text)}
          >
            ${text}
          </button>
        `)}
        ${extractedBtns.map((text) => html`
          <button
            class="quick-button is-extracted"
            type="button"
            @click=${() => void this.handleQuickButtonClick(text)}
          >
            ${text}
          </button>
        `)}
        ${suggestedButtons.map((item, index) => html`
          <div class="quick-button-wrapper">
            <button
              class="quick-button is-suggested"
              type="button"
              @click=${() => void this.handleQuickButtonClick(item.button)}
            >
              ${item.button}
            </button>
            <button
              class="quick-button-info"
              type="button"
              title="点击查看理由"
              @click=${(e: Event) => {
                e.stopPropagation();
                const wrapper = (e.target as HTMLElement).closest('.quick-button-wrapper');
                const tooltip = wrapper?.querySelector('.quick-button-reason');
                if (tooltip) {
                  tooltip.classList.toggle('is-visible');
                }
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

  private renderDialog() {
    const workspace = this.selectedWorkspace;

    if (!workspace) {
      return nothing;
    }

    const messages = this.getDialogMessages(workspace);
    const isRunning = workspace.status === "running";
    const statusAccentClass = getStatusMeta(workspace).accentClass;
    const canQueue = isRunning || this.optimisticQueueWorkspaceIds.has(workspace.id);
    const queueStatus = this.queueStatusByWorkspace[workspace.id];
    const isQueued = canQueue && queueStatus?.status === "queued";
    const currentTodos = this.getCurrentTodos(workspace.id);

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
          <workspace-conversation-pane
            .workspaceName=${workspace.name}
            .workspaceId=${workspace.id}
            .workspacePath=${getWorkspacePath(workspace)}
            .resolveWorkspacePath=${() =>
              this.resolveWorkspaceFileBrowserPath(workspace.id, getWorkspacePath(workspace))}
            .messages=${messages}
            .smoothRevealMessageKey=${this.smoothRevealMessageKey}
            .messageDraft=${this.messageDraft}
            .currentFeedback=${this.currentFeedback}
            .queueStatus=${queueStatus}
            .isRunning=${isRunning}
            .statusAccentClass=${statusAccentClass}
            .canQueue=${canQueue}
            .devServerState=${this.getWorkspaceDevServerState(workspace)}
            .showWorkspaceWebPreview=${this.shouldShowWorkspaceWebPreview(workspace)}
            .todoBaseUrl=${this.config?.base_url ?? ""}
            .todoApiKey=${this.config?.api_key}
            .todoPendingCount=${this.todoPendingCount}
            .diffStats=${workspace.files_changed
              ? {
                  files_changed: workspace.files_changed ?? 0,
                  lines_added: workspace.lines_added ?? 0,
                  lines_removed: workspace.lines_removed ?? 0,
                }
              : undefined}
            .renderMessage=${(message: DialogMessage) => this.renderDialogEntry(message)}
            .quickButtonsTemplate=${this.renderQuickButtons(workspace)}
            @pane-close=${this.closeWorkspaceDialog}
            @draft-change=${(event: CustomEvent<string>) => {
              this.messageDraft = event.detail;
            }}
            @action-click=${(event: CustomEvent<DialogAction>) =>
              void this.handleActionClick(event.detail)}
            @workspace-web-preview-toggle=${() => void this.handleOpenWebPreview(workspace)}
            @dev-server-toggle=${() => void this.handleWorkspaceDevServerToggle(workspace)}
            @quick-button-click=${(event: CustomEvent<string>) =>
              void this.handleQuickButtonClick(event.detail)}
            @todo-selected=${(event: CustomEvent<{ content: string; todoId: string }>) =>
              void this.handleTodoSelected(event.detail)}
          ></workspace-conversation-pane>
        </section>
      </div>
    `;
  }

  private get currentFeedback() {
    if (this.actionFeedback) {
      return this.actionFeedback;
    }
    const workspace = this.selectedWorkspace;
    if (workspace) {
      const queueStatus = this.queueStatusByWorkspace[workspace.id];
      if (queueStatus?.status === "queued") {
        return "消息已排队 - 将在当前运行完成时执行";
      }
    }
    if (this.dialogError) {
      return this.dialogError;
    }
    if (this.dialogLoading) {
      return "正在加载消息...";
    }
    return this.isApiMode ? "消息已切换为本地持久化接口。" : "消息操作暂未接入真实接口。";
  }

  private async resolveWorkspaceFileBrowserPath(workspaceId: string, fallbackPath: string) {
    if (!this.isApiMode) {
      return fallbackPath;
    }

    const response = await fetchWorkspaceFileBrowserPath({
      baseUrl: this.config!.base_url!,
      apiKey: this.config?.api_key,
      workspaceId,
    });
    return response.data?.path?.trim() || fallbackPath;
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
    this.dialogError = "";
    this.smoothRevealMessageKey = "";
    this.todoPendingCount = 0;
    void this.loadTodoPendingCount(workspace.id);
    const nextDialogMessagesByWorkspace = { ...this.dialogMessagesByWorkspace };
    delete nextDialogMessagesByWorkspace[workspace.id];
    this.dialogMessagesByWorkspace = nextDialogMessagesByWorkspace;
    if (this.isApiMode) {
      const shouldRefreshQueueStatus = this.shouldRefreshWorkspaceMessages(workspace);
      void this.loadWorkspaceMessages(workspace.id, true);
      if (workspace.status === "running" && (shouldRefreshQueueStatus || !this.queueStatusByWorkspace[workspace.id])) {
        void this.loadWorkspaceQueueStatus(workspace.id);
      }
    }

    // 点击卡片查看内容后，标记工作区为已读，将状态从"需要注意"变为"空闲"
    const hasUnseenTurns = workspace.has_unseen_turns || workspace.hasUnseenActivity;
    if (hasUnseenTurns && this.isApiMode && this.config) {
      const workspaceId = workspace.id;
      void markWorkspaceSeen({
        baseUrl: this.config.base_url!,
        apiKey: this.config.api_key ?? undefined,
        workspaceId,
      }).then(() => {
        this.apiWorkspaces = this.apiWorkspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, has_unseen_turns: false, hasUnseenActivity: false }
            : ws
        );
      }).catch((error) => {
        console.error("标记工作区已读失败:", error);
      });
    }
  }

  private closeWorkspaceDialog = () => {
    const workspaceID = this.selectedWorkspaceId;
    this.selectedWorkspaceId = undefined;
    this.webPreviewWorkspaceId = undefined;
    this.messageDraft = "";
    this.actionFeedback = "";
    this.dialogError = "";
    this.dialogLoading = false;
    if (workspaceID) {
      const next = new Set(this.optimisticQueueWorkspaceIds);
      next.delete(workspaceID);
      this.optimisticQueueWorkspaceIds = next;
    }
    this.expandedToolMessageKeys = new Set();
    this.smoothRevealMessageKey = "";
  };

  private renderDialogEntry(message: DialogMessage) {
    return renderDialogMessage(message, {
      expandedToolMessageKeys: this.expandedToolMessageKeys,
      onToggleToolMessage: (toolKey) => this.toggleToolMessage(toolKey),
      editLanguage: detectDialogEditLanguage(
        this.selectedWorkspaceId ? this.dialogMessagesByWorkspace[this.selectedWorkspaceId] ?? [] : [],
      ),
      smoothRevealMessageKey: this.smoothRevealMessageKey,
    });
  }

  private toggleToolMessage(toolKey: string) {
    const next = new Set(this.expandedToolMessageKeys);
    if (next.has(toolKey)) {
      next.delete(toolKey);
    } else {
      next.add(toolKey);
    }
    this.expandedToolMessageKeys = next;
    this.requestUpdate();
  }

  private handleMessageInput = (event: Event) => {
    this.messageDraft = (event.target as HTMLTextAreaElement).value;
  };

  private async handleTodoSelected(detail: { content: string; todoId: string }) {
    if (!this.selectedWorkspaceId || !this.isApiMode) return;
    this.messageDraft = detail.content;
    await handleTodoSelectedAndSend({
      baseUrl: this.config?.base_url ?? "",
      apiKey: this.config?.api_key,
      workspaceId: this.selectedWorkspaceId,
      todoId: detail.todoId,
      content: detail.content,
      sendAction: () => this.handleActionClick("send"),
      refreshCount: (id) => { void this.loadTodoPendingCount(id); },
    });
  }

  private async loadTodoPendingCount(workspaceId: string) {
    if (!this.isApiMode) return;
    this.todoPendingCount = await loadTodoPendingCount({
      baseUrl: this.config?.base_url ?? "",
      apiKey: this.config?.api_key,
      workspaceId,
    });
  }

  private async handleActionClick(action: DialogAction) {
    const queueStatus = this.selectedWorkspaceId
      ? this.queueStatusByWorkspace[this.selectedWorkspaceId]
      : undefined;
    const isQueued = queueStatus?.status === "queued";

    if (action === "stop" && isQueued) {
      await this.handleCancelQueue();
      return;
    }

    if (action === "stop") {
      if (!this.isApiMode || !this.selectedWorkspaceId) {
        this.actionFeedback = "停止功能暂未接入，当前仅展示界面。";
        return;
      }
      try {
        this.actionFeedback = "正在发送停止请求...";
        const response = await stopWorkspaceExecution({
          baseUrl: this.config!.base_url!,
          apiKey: this.config?.api_key,
          workspaceId: this.selectedWorkspaceId,
        });
        this.actionFeedback = response.message?.trim() || "已发送停止请求";
        void this.loadActiveWorkspaces();
      } catch (error) {
        this.actionFeedback = this.toErrorMessage(error, "停止执行失败");
      }
      return;
    }

    if (!this.isApiMode || !this.selectedWorkspaceId) {
      this.actionFeedback = "发送消息功能暂未接入，当前仅展示界面。";
      return;
    }

    const message = this.messageDraft.trim();
    if (!message) {
      this.actionFeedback = "请输入要发送的消息。";
      return;
    }

    try {
      this.actionFeedback = action === "queue" ? "正在加入队列..." : "正在发送消息...";
      const response = await sendWorkspaceMessage({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
        message,
        mode: action,
      });
      this.applyWorkspaceSessionId(this.selectedWorkspaceId, response.session_id);
      if (action === "send") {
        this.appendOptimisticUserMessage(this.selectedWorkspaceId, message);
      }
      const successPrefix = action === "queue" ? "加入队列成功" : "发送成功";
      this.actionFeedback = response.message?.trim()
        ? `${successPrefix}：${response.message.trim()}`
        : `${successPrefix}。`;
      if (action === "queue") {
        this.messageDraft = message;
        this.setQueueStatus(this.selectedWorkspaceId, {
          ...response,
          status: "queued",
          queued: {
            session_id: response.session_id,
            data: {
              message,
            },
          },
        });
      } else {
        const workspace = this.selectedWorkspace;
        if (workspace && workspace.status !== "running") {
          const next = new Set(this.optimisticQueueWorkspaceIds);
          next.add(workspace.id);
          this.optimisticQueueWorkspaceIds = next;
        }
        this.messageDraft = "";
      }
      this.emitPreviewStatus();
      if (action === "send") {
        await this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
      }
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "发送消息失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async handleQuickButtonClick(text: string) {
    const workspace = this.selectedWorkspace;
    if (!workspace) {
      return;
    }

    const isRunning = workspace.status === "running";
    if (isRunning) {
      this.actionFeedback = "工作区正在运行，无法发送快捷消息。";
      this.emitPreviewStatus(this.actionFeedback);
      return;
    }

    if (!this.isApiMode || !this.selectedWorkspaceId) {
      this.actionFeedback = "发送消息功能暂未接入，当前仅展示界面。";
      this.emitPreviewStatus(this.actionFeedback);
      return;
    }

    try {
      this.actionFeedback = "正在发送快捷消息...";
      this.emitPreviewStatus(this.actionFeedback);
      const response = await sendWorkspaceMessage({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
        message: text,
        mode: "send",
      });

      this.applyWorkspaceSessionId(this.selectedWorkspaceId, response.session_id);
      this.appendOptimisticUserMessage(this.selectedWorkspaceId, text);
      this.actionFeedback = response.message?.trim()
        ? `发送成功：${response.message.trim()}`
        : "快捷消息已发送";
      this.messageDraft = "";
      this.emitPreviewStatus(this.actionFeedback);
      await this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "发送快捷消息失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async handleCancelQueue() {
    if (!this.isApiMode || !this.selectedWorkspaceId) {
      return;
    }

    try {
      this.actionFeedback = "正在取消队列...";
      const response = await cancelWorkspaceQueue({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: this.selectedWorkspaceId,
      });
      this.setQueueStatus(this.selectedWorkspaceId, response);
      this.actionFeedback = response.message?.trim() || "队列已取消";
      this.emitPreviewStatus();
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "取消队列失败");
      this.emitPreviewStatus(this.actionFeedback);
    }
  }

  private async loadWorkspaceQueueStatus(workspaceId: string) {
    if (!this.isApiMode) {
      return;
    }

    try {
      const response = await fetchWorkspaceQueueStatus({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId,
      });
      this.setQueueStatus(workspaceId, response);
      if (
        this.selectedWorkspaceId === workspaceId &&
        response.status === "queued" &&
        !this.messageDraft.trim()
      ) {
        this.messageDraft = response.queued?.data?.message ?? "";
      }
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "获取队列状态失败");
    }
  }

  private setQueueStatus(workspaceId: string, response: WorkspaceQueueStatusResponse) {
    this.queueStatusByWorkspace = {
      ...this.queueStatusByWorkspace,
      [workspaceId]: response,
    };
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

  private getWorkspaceDevServerProcessId(workspace: KanbanWorkspace) {
    return (
      this.devServerProcessIdsByWorkspace[workspace.id]?.trim() ||
      workspace.running_dev_server_process_id?.trim() ||
      ""
    );
  }

  private getWorkspaceDevServerState(workspace: KanbanWorkspace) {
    if (this.startingDevServerWorkspaceIds.has(workspace.id)) {
      return "starting" as const;
    }
    if (this.stoppingDevServerWorkspaceIds.has(workspace.id)) {
      return "stopping" as const;
    }
    if (workspace.has_running_dev_server || workspace.hasRunningDevServer) {
      return "running" as const;
    }
    return "idle" as const;
  }

  private async handleWorkspaceDevServerToggle(workspace: KanbanWorkspace) {
    const state = this.getWorkspaceDevServerState(workspace);
    if (state === "starting" || state === "stopping" || !this.isApiMode) {
      return;
    }

    if (state === "running") {
      await this.handleWorkspaceDevServerStop(workspace);
      return;
    }

    await this.handleWorkspaceDevServerStart(workspace);
  }

  private async handleWorkspaceDevServerStart(workspace: KanbanWorkspace) {
    this.setDevServerStarting(workspace.id, true);
    this.actionFeedback = "正在启动开发服务器...";

    try {
      const response = await startWorkspaceDevServer({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
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
      }
      this.actionFeedback = response.message?.trim() || "开发服务器已启动";
      await this.loadActiveWorkspaces();
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "启动开发服务器失败");
    } finally {
      this.setDevServerStarting(workspace.id, false);
    }
  }

  private async handleWorkspaceDevServerStop(workspace: KanbanWorkspace) {
    this.setDevServerStopping(workspace.id, true);
    this.actionFeedback = "正在停止开发服务器...";

    try {
      const processId = this.getWorkspaceDevServerProcessId(workspace);
      const response = await stopWorkspaceDevServer({
        baseUrl: this.config!.base_url!,
        apiKey: this.config?.api_key,
        workspaceId: workspace.id,
        processId: processId || undefined,
      });
      const nextIds = { ...this.devServerProcessIdsByWorkspace };
      delete nextIds[workspace.id];
      this.devServerProcessIdsByWorkspace = nextIds;
      this.actionFeedback = response.message?.trim() || "开发服务器已停止";
      await this.loadActiveWorkspaces();
    } catch (error) {
      this.actionFeedback = this.toErrorMessage(error, "停止开发服务器失败");
    } finally {
      this.setDevServerStopping(workspace.id, false);
    }
  }

  private handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === "Escape" && this.selectedWorkspace) {
      this.closeWorkspaceDialog();
    }
  };

  private getWorkspaceDisplayMeta(workspace: KanbanWorkspace) {
    const timeSource = this.getWorkspaceDisplayTimeSource(workspace);

    return {
      relativeTime: timeSource ? formatRelativeTime(timeSource) : "recently",
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

    return this.allWorkspaces.find((workspace) => workspace.id === this.selectedWorkspaceId);
  }

  private get visibleSections() {
    const grouped = groupWorkspaces(this.allWorkspaces);

    return SECTION_ORDER.map(({ key, label }) => ({
      key,
      label,
      workspaces: grouped[key],
    })).filter((section) => section.workspaces.length > 0);
  }

  private get allWorkspaces(): KanbanWorkspace[] {
    return this.isApiMode ? this.apiWorkspaces : this.normalizedWorkspaces;
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

  // baseUrl 为 undefined 时表示 mock 模式，空字符串表示使用相对路径（Vite 代理模式）
  private get isApiMode() {
    return this.config?.base_url !== undefined;
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

  private getDialogMessages(workspace: KanbanWorkspace): DialogMessage[] {
    if (this.isApiMode) {
      const apiMessages = this.dialogMessagesByWorkspace[workspace.id];
      if (apiMessages?.length) {
        return apiMessages;
      }
      if (this.dialogLoading) {
        return [{ kind: "message", sender: "ai", text: "正在加载消息..." }];
      }
      if (this.dialogError) {
        return [{ kind: "message", sender: "ai", text: this.dialogError }];
      }
    }

    const recentSessionMessages = this.getRecentSessionMessages(workspace);

    if (recentSessionMessages.length > 0) {
      return recentSessionMessages;
    }

    const sessionId = workspace.latest_session_id ?? workspace.last_session_id;

    return [
      {
        kind: "message",
        sender: "ai",
        text: sessionId
          ? "暂无同步的对话消息。"
          : "当前工作区还没有可展示的对话消息。",
      },
    ];
  }

  private getRecentSessionMessages(workspace: KanbanWorkspace): DialogMessage[] {
    const sessionId = workspace.latest_session_id ?? workspace.last_session_id;

    if (!sessionId || !this.hass) {
      return [];
    }

    const sessionState = Object.values(this.hass.states).find((state) => {
      const attributes = state.attributes as KanbanSessionAttributes | undefined;
      return attributes?.session_id === sessionId;
    });

    if (!sessionState) {
      return [];
    }

    const attributes = sessionState.attributes as KanbanSessionAttributes | undefined;
    const rawRecentMessages = attributes?.recent_messages;
    const parsedMessages = this.parseRecentMessages(rawRecentMessages);

    if (parsedMessages.length > 0) {
      return parsedMessages;
    }

    return typeof attributes?.last_message === "string" && attributes.last_message.trim()
      ? [{ kind: "message", sender: "ai", text: attributes.last_message.trim() }]
      : [];
  }

  private parseRecentMessages(
    rawRecentMessages: KanbanSessionAttributes["recent_messages"],
  ): DialogMessage[] {
    const parsed =
      typeof rawRecentMessages === "string"
        ? this.parseRecentMessagesString(rawRecentMessages)
        : rawRecentMessages;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((message) => normalizeSessionMessage(message))
      .filter((message): message is DialogMessage => Boolean(message));
  }

  private parseRecentMessagesString(rawRecentMessages: string) {
    try {
      return JSON.parse(rawRecentMessages) as KanbanSessionMessage[];
    } catch {
      return [];
    }
  }

  private scrollMessagesToBottom() {
    if (!this.autoScrollEnabled) {
      return;
    }

    const messageList = this.renderRoot.querySelector(".message-list") as
      | HTMLDivElement
      | null;

    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  private setupMessageListScrollListener() {
    if (this.messageListScrollHandler) {
      const oldMessageList = this.renderRoot.querySelector(".message-list");
      if (oldMessageList) {
        oldMessageList.removeEventListener("scroll", this.messageListScrollHandler);
      }
    }

    this.autoScrollEnabled = true;

    const messageList = this.renderRoot.querySelector(".message-list") as HTMLDivElement | null;
    if (messageList) {
      this.messageListScrollHandler = () => this.handleMessageListScroll(messageList);
      messageList.addEventListener("scroll", this.messageListScrollHandler);
    }
  }

  private handleMessageListScroll(messageList: HTMLDivElement) {
    const isAtBottom =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 50;

    if (isAtBottom) {
      if (!this.autoScrollEnabled) {
        this.autoScrollEnabled = true;
      }
    } else {
      if (this.autoScrollEnabled) {
        this.autoScrollEnabled = false;
      }
    }
  }
  private emitPreviewStatus(message?: string) {
    this.dispatchEvent(
      new CustomEvent("kanban-watcher-preview-status", {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private startApiSyncIfNeeded() {
    if (!this.isConnected) {
      return;
    }

    this.stopApiSync();

    if (!this.isApiMode) {
      return;
    }

    void this.initializeApiSync();
  }

  private async initializeApiSync() {
    await this.loadVibeInfo();
    await this.loadActiveWorkspaces();
    if (!this.apiAccessBlocked && this.isConnected) {
      this.connectBoardRealtimeIfNeeded();
      this.startBoardPolling();
    }
  }

  private async loadVibeInfo() {
    if (this.config?.base_url === undefined) {
      return;
    }

    try {
      const response = await fetchVibeInfo({
        baseUrl: this.config.base_url,
        apiKey: this.config.api_key,
      });
      this.previewProxyPort = response.data?.config?.preview_proxy_port;
    } catch {
      this.previewProxyPort = undefined;
    }
  }

  private stopApiSync() {
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
      void this.loadActiveWorkspaces();
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
    if (this.dialogRefreshTimer || !this.selectedWorkspaceId) {
      return;
    }
    this.dialogRefreshTimer = window.setInterval(() => {
      if (this.selectedWorkspaceId) {
        void this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
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
    if (this.realtimeConnected || !this.selectedWorkspaceId) {
      this.stopDialogPolling();
      return;
    }
    this.startDialogPolling();
  }

  private connectBoardRealtimeIfNeeded() {
    // baseUrl 为 undefined 时表示 mock 模式，不连接实时 API
    if (this.config?.base_url === undefined || this.apiAccessBlocked || typeof WebSocket === "undefined") {
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.config.base_url,
      apiKey: this.config.api_key,
      onOpen: () => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.boardRealtimeConnected = true;
        this.emitPreviewStatus(`首页实时已连接：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
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
        this.emitPreviewStatus(`首页实时已断开，已退回轮询：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        void this.loadActiveWorkspaces();
        this.startBoardPolling();
        this.scheduleBoardRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.boardRealtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "workspace_snapshot") {
          this.emitPreviewStatus(`首页实时已更新：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
          this.handleRealtimeEvent(event);
        }
      },
    });
    this.boardRealtimeSocket = socket;
  }

  private connectRealtimeIfNeeded() {
    // baseUrl 为 undefined 时表示 mock 模式，不连接实时 API
    if (this.config?.base_url === undefined || this.apiAccessBlocked || typeof WebSocket === "undefined") {
      return;
    }

    const sessionId = this.selectedWorkspace?.latest_session_id ?? this.selectedWorkspace?.last_session_id;
    if (!sessionId) {
      this.realtimeConnected = false;
      return;
    }
    const socket = connectRealtime({
      baseUrl: this.config.base_url,
      apiKey: this.config.api_key,
      sessionId,
      onOpen: () => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        this.realtimeConnected = true;
        this.emitPreviewStatus(`弹窗实时已连接：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        this.stopDialogPolling();
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
        this.emitPreviewStatus(`弹窗实时已断开，已退回轮询：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        if (this.selectedWorkspaceId) {
          void this.loadWorkspaceMessages(this.selectedWorkspaceId, true);
        }
        this.updateDialogPolling();
        this.scheduleRealtimeReconnect();
      },
      onMessage: (event) => {
        if (this.realtimeSocket !== socket || !this.isConnected) {
          return;
        }
        if (event.type === "session_messages_appended") {
          this.emitPreviewStatus(`弹窗实时已追加：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
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
    if (event.type === "workspace_snapshot") {
      this.apiWorkspaces = this.normalizeApiWorkspaces({
        workspaces: event.workspaces,
      });
      this.requestUpdate();
      return;
    }
    if (event.type === "session_messages_appended" && event.session_id) {
      this.appendRealtimeMessages(event.session_id, event.messages);
    }
  }

  private appendRealtimeMessages(sessionId: string, messages: SessionMessageResponse[] | undefined) {
    const workspace = this.apiWorkspaces.find(
      (item) => item.latest_session_id === sessionId || item.last_session_id === sessionId,
    );
    if (!workspace) {
      return;
    }

    const existing = this.dialogMessagesByWorkspace[workspace.id] ?? [];
    const existingFlat = this.flattenDialogMessages(existing);
    const merged = [...existingFlat];
    const indexByKey = new Map(
      existingFlat.map((item, index) => [this.getDialogMessageIdentity(item), index]),
    );
    const previousLatestTimestamp = this.getLatestDialogTimestamp(existingFlat);
    let hasNewLatestMessage = false;

    // 提取待办事项
    if (Array.isArray(messages)) {
      for (const message of messages) {
        const todos = this.extractTodosFromMessage(message);
        if (todos.length > 0) {
          this.todosByWorkspace = {
            ...this.todosByWorkspace,
            [workspace.id]: todos,
          };
        }
      }
    }

    for (const message of this.normalizeApiMessagesFlat(messages)) {
      const key = this.getDialogMessageIdentity(message);
      const optimisticIndex = this.findMatchingOptimisticUserMessageIndex(merged, message);
      if (typeof optimisticIndex === "number") {
        merged[optimisticIndex] = message;
        indexByKey.set(key, optimisticIndex);
        hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
        continue;
      }
      const existingIndex = indexByKey.get(key);
      if (typeof existingIndex === "number") {
        merged[existingIndex] = message;
        hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
        continue;
      }
      if (!this.isMessageStrictlyAfter(message.timestamp, previousLatestTimestamp)) {
        continue;
      }
      indexByKey.set(key, merged.length);
      merged.push(message);
      hasNewLatestMessage = hasNewLatestMessage || this.isMessageAtOrAfter(message.timestamp, previousLatestTimestamp);
    }

    const sortedMerged = this.sortDialogMessagesByTimestamp(merged);
    if (this.areFlatMessagesEqual(existingFlat, sortedMerged)) {
      return;
    }

    this.smoothRevealMessageKey = this.resolveSmoothRevealMessageKey(existingFlat, sortedMerged);
    this.dialogMessagesByWorkspace = {
      ...this.dialogMessagesByWorkspace,
      [workspace.id]: this.groupConsecutiveToolMessages(sortedMerged),
    };
    this.requestUpdate();
    if (hasNewLatestMessage) {
      void this.updateComplete.then(() => this.scrollMessagesToBottom());
    }
  }

  private async loadActiveWorkspaces() {
    // baseUrl 为 undefined 时表示 mock 模式，不加载真实数据
    if (this.config?.base_url === undefined) {
      return;
    }

    this.boardLoading = true;
    this.boardError = "";

    try {
      const response = await fetchActiveWorkspaces({
        baseUrl: this.config.base_url,
        apiKey: this.config.api_key,
      });
      this.apiWorkspaces = this.normalizeApiWorkspaces(response);
      this.apiAccessBlocked = false;
      this.emitPreviewStatus();
    } catch (error) {
      this.apiWorkspaces = [];
      this.boardError = this.toErrorMessage(error, "加载工作区失败");
      if (this.isUnauthorizedError(error)) {
        this.apiAccessBlocked = true;
        this.stopApiSync();
      }
      this.emitPreviewStatus(this.boardError);
    } finally {
      this.boardLoading = false;
      this.requestUpdate();
    }
  }

  private isUnauthorizedError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /(?:^|\\b)(401|403)\\b/.test(message) || /Unauthorized/i.test(message);
  }

  private normalizeApiWorkspaces(response: ActiveWorkspacesResponse) {
    const items = Array.isArray(response.workspaces) ? response.workspaces : [];
    return items
      .map((workspace) => this.mapApiWorkspace(workspace))
      .sort((left, right) => this.compareWorkspaces(left, right));
  }

  private mapApiWorkspace(workspace: LocalWorkspaceSummary): KanbanWorkspace {
    const displayTimeSource = workspace.latest_process_completed_at || workspace.last_message_at;

    return {
      id: workspace.id,
      name: workspace.name || workspace.id,
      browser_url: workspace.browser_url,
      browserUrl: (workspace as LocalWorkspaceSummary & { browserUrl?: string }).browserUrl,
      status: workspace.status || "completed",
      latest_session_id: workspace.latest_session_id,
      has_pending_approval: workspace.has_pending_approval,
      has_unseen_turns: workspace.has_unseen_turns,
      has_running_dev_server: workspace.has_running_dev_server,
      running_dev_server_process_id: workspace.running_dev_server_process_id,
      latest_process_completed_at: workspace.latest_process_completed_at,
      updated_at: workspace.updated_at,
      last_message_at: workspace.last_message_at,
      relative_time: displayTimeSource ? formatRelativeTime(displayTimeSource) : "recently",
      files_changed: workspace.files_changed ?? 0,
      lines_added: workspace.lines_added ?? 0,
      lines_removed: workspace.lines_removed ?? 0,
    };
  }

  private getWorkspaceDisplayTimeSource(workspace: KanbanWorkspace) {
    const completionTimeSource =
      workspace.latest_process_completed_at ||
      (workspace.status === "completed" ? workspace.completed_at : undefined);
    return completionTimeSource || workspace.last_message_at;
  }

  private getWorkspacePreviewUrl(workspace: KanbanWorkspace) {
    return (
      getWorkspaceEmbeddedPreviewUrl(workspace, this.previewProxyPort) ||
      this.webPreviewFallbackUrlByWorkspace[workspace.id] ||
      ""
    );
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
      baseUrl: this.config!.base_url!,
      apiKey: this.config?.api_key,
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

  private async handleOpenWebPreview(workspace: KanbanWorkspace) {
    const previewUrl = await this.resolveWorkspacePreviewUrl(workspace);
    if (!previewUrl) {
      this.actionFeedback = "快捷网页地址不可用，请先启动开发服务器。";
      return;
    }
    if (window.innerWidth <= 768) {
      const opened = window.open(previewUrl, "_blank", "noopener");
      if (!opened) {
        window.location.assign(previewUrl);
      }
      return;
    }
    this.webPreviewWorkspaceId = workspace.id;
  }

  private handleCloseWebPreview = () => {
    this.webPreviewWorkspaceId = undefined;
  };

  private handleWebPreviewOverlayClick = (event: Event) => {
    if ((event.target as HTMLElement | null)?.classList.contains("workspace-home-web-preview-overlay")) {
      this.handleCloseWebPreview();
    }
  };

  private stopEventPropagation = (event: Event) => {
    event.stopPropagation();
  };

  private renderWebPreviewOverlay() {
    const workspace = this.allWorkspaces.find((item) => item.id === this.webPreviewWorkspaceId);
    const previewUrl = workspace ? this.getWorkspacePreviewUrl(workspace) : "";
    if (!workspace || !previewUrl) {
      return nothing;
    }

    const isMobileWebPreview = window.innerWidth <= 768;

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

  private compareWorkspaces(left: KanbanWorkspace, right: KanbanWorkspace) {
    const leftPinned = Boolean(left.is_pinned);
    const rightPinned = Boolean(right.is_pinned);
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const leftName = (left.name || left.id).trim().toLocaleLowerCase("zh-CN");
    const rightName = (right.name || right.id).trim().toLocaleLowerCase("zh-CN");
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName, "zh-CN");
    }

    return left.id.localeCompare(right.id, "zh-CN");
  }

  private shouldRefreshWorkspaceMessages(workspace: KanbanWorkspace) {
    const cachedMessages = this.dialogMessagesByWorkspace[workspace.id];
    if (!cachedMessages?.length) {
      return true;
    }

    return this.getWorkspaceMessageVersion(workspace) !== this.dialogMessageVersionsByWorkspace[workspace.id];
  }

  private getWorkspaceMessageVersion(workspace: KanbanWorkspace) {
    return workspace.last_message_at || workspace.updated_at || workspace.latest_session_id || "";
  }

  private applyWorkspaceSessionId(workspaceId: string, sessionId?: string) {
    if (!sessionId) {
      return;
    }

    let didChange = false;
    this.apiWorkspaces = this.apiWorkspaces.map((workspace) => {
      if (workspace.id !== workspaceId) {
        return workspace;
      }
      if (workspace.latest_session_id === sessionId && workspace.last_session_id === sessionId) {
        return workspace;
      }
      didChange = true;
      return {
        ...workspace,
        latest_session_id: sessionId,
        last_session_id: sessionId,
      };
    });

    if (!didChange || this.selectedWorkspaceId !== workspaceId || !this.isApiMode) {
      return;
    }

    this.restartRealtimeConnection();
    this.updateDialogPolling();
  }

  private resolveSmoothRevealMessageKey(
    previousMessages: DialogMessage[],
    nextMessages: DialogMessage[],
  ) {
    const nextLastMessage = nextMessages.at(-1);
    const previousLastMessage = previousMessages.at(-1);

    if (!nextLastMessage || nextLastMessage.kind !== "message" || nextLastMessage.sender !== "ai") {
      return "";
    }

    const nextIdentity = this.getDialogMessageIdentity(nextLastMessage);
    const previousIdentity = previousLastMessage
      ? this.getDialogMessageIdentity(previousLastMessage)
      : "";

    if (nextIdentity !== previousIdentity) {
      return nextIdentity;
    }

    if (
      previousLastMessage?.kind === "message" &&
      previousLastMessage.sender === "ai" &&
      previousLastMessage.text !== nextLastMessage.text
    ) {
      return nextIdentity;
    }

    return "";
  }

  private async loadWorkspaceMessages(workspaceId: string, forceRefresh = false) {
    // baseUrl 为 undefined 时表示 mock 模式，不加载真实消息
    if (this.config?.base_url === undefined) {
      return;
    }
    if (!forceRefresh && this.dialogMessagesByWorkspace[workspaceId]) {
      return;
    }

    this.dialogLoading = true;
    this.dialogError = "";

    try {
      const response = await fetchWorkspaceLatestMessages({
        baseUrl: this.config.base_url,
        apiKey: this.config.api_key,
        workspaceId,
        limit: this.config.messages_limit ?? DEFAULT_MESSAGES_LIMIT,
      });
      const previousMessages = this.flattenDialogMessages(this.dialogMessagesByWorkspace[workspaceId] ?? []);
      const normalizedMessages = this.normalizeApiMessages(response.messages);
      this.smoothRevealMessageKey = this.resolveSmoothRevealMessageKey(
        previousMessages,
        normalizedMessages,
      );
      this.dialogMessagesByWorkspace = {
        ...this.dialogMessagesByWorkspace,
        [workspaceId]: this.mergeOptimisticMessages(
          this.dialogMessagesByWorkspace[workspaceId] ?? [],
          normalizedMessages,
        ),
      };
      const workspace = this.allWorkspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        this.dialogMessageVersionsByWorkspace = {
          ...this.dialogMessageVersionsByWorkspace,
          [workspaceId]: this.getWorkspaceMessageVersion(workspace),
        };
        // 非 running 状态都触发 LLM 分析动态按钮（带缓存）
        if (workspace.status !== "running") {
          void this.analyzeDynamicButtons(workspace);
        }
      }
      this.emitPreviewStatus();
      this.requestUpdate();
      await this.updateComplete;
      this.scrollMessagesToBottom();
    } catch (error) {
      this.dialogError = this.toErrorMessage(error, "加载消息失败");
      this.emitPreviewStatus(this.dialogError);
    } finally {
      this.dialogLoading = false;
      this.requestUpdate();
    }
  }

  /**
   * 计算字符串的简单 hash（用于缓存判断）
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转为 32 位整数
    }
    return hash.toString(16);
  }

  /**
   * 分析动态按钮（使用 LLM 或正则匹配）
   * 带缓存：相同消息内容不重复调用 LLM
   */
  private async analyzeDynamicButtons(workspace: KanbanWorkspace) {
    const messages = this.dialogMessagesByWorkspace[workspace.id] || [];

    // 获取最后一条 AI 消息
    const lastAiMessage = [...messages]
      .reverse()
      .find((msg) => msg.kind === "message" && msg.sender === "ai");

    if (!lastAiMessage || !("text" in lastAiMessage)) {
      this.extractedButtonsByWorkspace = {
        ...this.extractedButtonsByWorkspace,
        [workspace.id]: [],
      };
      this.suggestedButtonsByWorkspace = {
        ...this.suggestedButtonsByWorkspace,
        [workspace.id]: [],
      };
      this.dynamicButtonsByWorkspace = {
        ...this.dynamicButtonsByWorkspace,
        [workspace.id]: [],
      };
      // 清除缓存
      delete this.dynamicButtonsMessageHashByWorkspace[workspace.id];
      return;
    }

    const message = lastAiMessage.text;
    const messageHash = this.simpleHash(message);
    const cachedHash = this.dynamicButtonsMessageHashByWorkspace[workspace.id];

    // 如果消息内容相同，使用缓存结果
    if (cachedHash === messageHash) {
      return;
    }

    // 构建消息历史（用于 LLM 上下文分析）
    const recentMessages: SessionMessageResponse[] = messages
      .filter((msg): msg is DialogTextMessage =>
        msg.kind === "message" && (msg.sender === "ai" || msg.sender === "user")
      )
      .slice(-3)
      .map((msg) => ({
        role: msg.sender === "ai" ? "assistant" : "user",
        content: msg.text,
        timestamp: msg.timestamp,
      }));

    // 使用 LLM 分析
    const result = await getQuickButtonsWithLLM({
      message,
      workspaceStatus: workspace.status,
      llmEnabled: this.config?.llm_enabled ?? false,
      llmConfig: {
        baseUrl: this.config?.llm_base_url,
        model: this.config?.llm_model,
      },
      quickButtonRules: {
        forbiddenActions: this.config?.quick_button_rules?.forbidden_actions,
      },
      recentMessages,
    });

    // 更新缓存
    this.dynamicButtonsMessageHashByWorkspace[workspace.id] = messageHash;
    this.extractedButtonsByWorkspace = {
      ...this.extractedButtonsByWorkspace,
      [workspace.id]: result.extractedButtons,
    };
    this.suggestedButtonsByWorkspace = {
      ...this.suggestedButtonsByWorkspace,
      [workspace.id]: result.suggestedButtons,
    };
    // 兼容旧的 dynamicButtons
    this.dynamicButtonsByWorkspace = {
      ...this.dynamicButtonsByWorkspace,
      [workspace.id]: result.dynamicButtons,
    };
    this.requestUpdate();
  }

  private normalizeApiMessages(messages: SessionMessageResponse[] | undefined) {
    return normalizeApiMessages(messages);
  }

  private normalizeApiMessagesFlat(messages: SessionMessageResponse[] | undefined) {
    return normalizeApiMessagesFlat(messages);
  }

  private groupConsecutiveToolMessages(messages: DialogMessage[]) {
    return groupConsecutiveToolMessages(messages);
  }

  /**
   * 从消息中提取待办事项
   * 如果消息包含 todo_management 工具调用，则返回待办事项列表
   */
  private extractTodosFromMessage(message: SessionMessageResponse): TodoItem[] {
    if (message.tool_info?.action_type?.action === 'todo_management') {
      return message.tool_info.action_type.todos || [];
    }
    return [];
  }

  /**
   * 获取指定工作区的当前待办事项
   */
  private getCurrentTodos(workspaceId: string): TodoItem[] {
    return this.todosByWorkspace[workspaceId] || [];
  }

  /**
   * 获取正在进行中的待办事项
   */
  private getInProgressTodo(todos: TodoItem[]): TodoItem | null {
    return todos.find(t => t.status?.toLowerCase() === 'in_progress') || null;
  }

  /**
   * 保存 todo 历史记录
   */
  private saveTodoHistory(workspaceId: string, workspaceName: string, todos: TodoItem[]) {
    if (todos.length === 0) return;

    const completedCount = todos.filter(t => t.status?.toLowerCase() === 'completed').length;

    // 从 localStorage 读取历史记录
    const historyKey = 'kanban-watcher-todo-history';
    let history: TodoHistoryEntry[] = [];

    try {
      const stored = localStorage.getItem(historyKey);
      if (stored) {
        history = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load todo history:', error);
    }

    // 添加新记录
    const newEntry: TodoHistoryEntry = {
      workspaceId,
      workspaceName,
      todos,
      timestamp: Date.now(),
      completedCount,
      totalCount: todos.length,
    };

    // 去重：移除同一工作区的旧记录
    history = history.filter(entry => entry.workspaceId !== workspaceId);

    // 添加新记录到开头
    history.unshift(newEntry);

    // 限制历史记录数量（最多保存 20 条）
    history = history.slice(0, 20);

    // 保存到 localStorage
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save todo history:', error);
    }
  }

  private getDialogMessageIdentity(message: DialogMessage) {
    return getDialogMessageIdentity(message);
  }

  private flattenDialogMessages(messages: DialogMessage[]) {
    return messages.flatMap((message) => {
      if (message.kind === "tool-group") {
        return message.items;
      }
      return [message];
    });
  }

  private sortDialogMessagesByTimestamp(messages: Array<DialogTextMessage | DialogToolMessage>) {
    return [...messages].sort((left, right) => {
      const leftTimestampValue = this.getComparableTimestampValue(left.timestamp);
      const rightTimestampValue = this.getComparableTimestampValue(right.timestamp);
      if (
        leftTimestampValue !== undefined &&
        rightTimestampValue !== undefined &&
        leftTimestampValue !== rightTimestampValue
      ) {
        return leftTimestampValue - rightTimestampValue;
      }

      const leftTimestamp = left.timestamp ?? "";
      const rightTimestamp = right.timestamp ?? "";
      if (leftTimestamp && rightTimestamp && leftTimestamp !== rightTimestamp) {
        return leftTimestamp.localeCompare(rightTimestamp);
      }
      return this.getDialogMessageIdentity(left).localeCompare(this.getDialogMessageIdentity(right), "zh-CN");
    });
  }

  private getLatestDialogTimestamp(messages: Array<{ timestamp?: string }>) {
    return messages.reduce<string | undefined>((latest, message) => {
      if (!message.timestamp) {
        return latest;
      }
      if (this.compareTimestamps(message.timestamp, latest) > 0) {
        return message.timestamp;
      }
      return latest;
    }, undefined);
  }

  private isMessageAtOrAfter(timestamp: string | undefined, baseline: string | undefined) {
    return this.compareTimestamps(timestamp, baseline) >= 0;
  }

  private isMessageStrictlyAfter(timestamp: string | undefined, baseline: string | undefined) {
    return this.compareTimestamps(timestamp, baseline) > 0;
  }

  private compareTimestamps(left: string | undefined, right: string | undefined) {
    if (!left) {
      return right ? -1 : 0;
    }
    if (!right) {
      return 1;
    }

    const leftValue = this.getComparableTimestampValue(left);
    const rightValue = this.getComparableTimestampValue(right);
    if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
      return leftValue - rightValue;
    }

    return left.localeCompare(right);
  }

  private getComparableTimestampValue(timestamp: string | undefined) {
    if (!timestamp) {
      return undefined;
    }

    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }

  private areFlatMessagesEqual(
    left: Array<DialogTextMessage | DialogToolMessage>,
    right: Array<DialogTextMessage | DialogToolMessage>,
  ) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((message, index) => this.getFlatMessageSignature(message) === this.getFlatMessageSignature(right[index]!));
  }

  private getFlatMessageSignature(message: DialogTextMessage | DialogToolMessage) {
    if (message.kind === "tool") {
      return [
        "tool",
        this.getDialogMessageIdentity(message),
        message.timestamp ?? "",
        message.status,
        message.summary,
        message.detail,
        message.command ?? "",
      ].join("::");
    }

    return [
      "message",
      this.getDialogMessageIdentity(message),
      message.timestamp ?? "",
      message.sender,
      message.text,
    ].join("::");
  }

  private appendOptimisticUserMessage(workspaceId: string, text: string) {
    const optimisticMessage: DialogTextMessage = {
      key: `local:${Date.now()}:${text}`,
      kind: "message",
      sender: "user",
      text: compactDialogMessageText(text),
      timestamp: new Date().toISOString(),
    };
    const existing = this.dialogMessagesByWorkspace[workspaceId] ?? [];
    this.dialogMessagesByWorkspace = {
      ...this.dialogMessagesByWorkspace,
      [workspaceId]: [...existing, optimisticMessage],
    };
    this.requestUpdate();
  }

  private mergeOptimisticMessages(existing: DialogMessage[], incoming: DialogMessage[]) {
    const merged = [...incoming];
    const optimisticMessages = existing.filter(
      (message): message is DialogTextMessage =>
        message.kind === "message" &&
        message.sender === "user" &&
        typeof message.key === "string" &&
        message.key.startsWith("local:"),
    );

    for (const optimisticMessage of optimisticMessages) {
      const alreadyPersisted = incoming.some(
        (message) =>
          message.kind === "message" &&
          message.sender === "user" &&
          message.text === optimisticMessage.text,
      );
      if (!alreadyPersisted) {
        merged.push(optimisticMessage);
      }
    }

    return merged;
  }

  private findMatchingOptimisticUserMessageIndex(messages: DialogMessage[], incoming: DialogMessage) {
    if (incoming.kind !== "message" || incoming.sender !== "user") {
      return undefined;
    }

    return messages.findIndex(
      (message) =>
        message.kind === "message" &&
        message.sender === "user" &&
        typeof message.key === "string" &&
        message.key.startsWith("local:") &&
        message.text === incoming.text,
    );
  }

  private toErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
      return `${fallback}：${error.message.trim()}`;
    }
    return fallback;
  }
}
