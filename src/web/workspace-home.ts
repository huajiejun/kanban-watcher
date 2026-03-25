import { LitElement, html, nothing } from "lit";

import "../index";
import "../components/workspace-conversation-pane";
import type { ConversationPaneAction } from "../components/workspace-conversation-pane";
import { renderWorkspaceSectionList } from "../components/workspace-section-list";
import { createPreviewHass, previewEntityId } from "../dev/preview-fixture";
import { formatRelativeTime } from "../lib/format-relative-time";
import { groupWorkspaces } from "../lib/group-workspaces";
import { normalizeApiMessages, normalizeSessionMessage, type DialogMessage } from "../lib/dialog-messages";
import {
  extractDynamicButtons,
  getQuickButtonsWithLLM,
  isValidButtonText,
  STATIC_BUTTONS,
} from "../lib/quick-buttons";
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
    loadingWorkspaceIds: { attribute: false },
    messageErrorByWorkspace: { attribute: false },
    messageDraftByWorkspace: { attribute: false },
    actionFeedbackByWorkspace: { attribute: false },
    queueStatusByWorkspace: { attribute: false },
    extractedButtonsByWorkspace: { attribute: false },
    suggestedButtonsByWorkspace: { attribute: false },
  };

  mode: WorkspaceHomeMode = resolveWorkspaceHomeMode(window.innerWidth);
  workspaces: KanbanWorkspace[] = [];
  pageState: WorkspacePageState = createWorkspacePageState();
  messagesByWorkspace: Record<string, DialogMessage[]> = {};
  loading = false;
  error = "";
  collapsedSections = new Set<"attention" | "running" | "idle">();
  loadingWorkspaceIds = new Set<string>();
  messageErrorByWorkspace: Record<string, string> = {};
  messageDraftByWorkspace: Record<string, string> = {};
  actionFeedbackByWorkspace: Record<string, string> = {};
  queueStatusByWorkspace: Record<string, WorkspaceQueueStatusResponse> = {};
  extractedButtonsByWorkspace: Record<string, string[]> = {};
  suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
  private dynamicButtonsMessageHashByWorkspace: Record<string, string> = {};
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
                  (workspace) => {
                    const queueStatus = this.queueStatusByWorkspace[workspace.id];
                    const isRunning = workspace.status === "running";

                    return html`
                    <workspace-conversation-pane
                      .workspaceName=${workspace.name}
                      .messages=${this.messagesByWorkspace[workspace.id] ?? []}
                      .messageDraft=${this.messageDraftByWorkspace[workspace.id] ?? ""}
                      .currentFeedback=${this.getWorkspaceFeedback(workspace.id)}
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
                  },
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

      this.messagesByWorkspace = {
        ...this.messagesByWorkspace,
        [workspaceId]: normalizeApiMessages(response.messages),
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
    this.pageState = openWorkspacePane(this.pageState, workspace.id);
    void this.loadWorkspaceMessages(workspace.id, true);
    if (workspace.status === "running") {
      void this.loadWorkspaceQueueStatus(workspace.id);
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
    return this.isApiMode ? "消息已切换为本地持久化接口。" : "消息操作暂未接入真实接口。";
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
