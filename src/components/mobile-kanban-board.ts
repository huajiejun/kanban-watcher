import { LitElement, html, css, nothing } from "lit";
import {
  fetchIssues,
  fetchProjectStatuses,
} from "../lib/issue-api";
import type {
  RemoteIssue,
  RemoteProjectStatus,
  KanbanColumn,
} from "../types/issue";
import "./mobile-kanban-column";
import "./mobile-issue-detail-panel";

export class MobileKanbanBoard extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .kanban-board {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .kanban-columns {
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      flex: 1;
      gap: 12px;
      padding: 12px;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .kanban-columns::-webkit-scrollbar {
      display: none;
    }

    .board-loading,
    .board-error,
    .board-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #94a3b8);
      gap: 12px;
      font-size: 0.88rem;
    }

    .board-error button {
      padding: 6px 16px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(148, 163, 184, 0.1);
      color: #e5e7eb;
      cursor: pointer;
      font-size: 0.82rem;
    }

    .fab-create {
      position: fixed;
      bottom: 24px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: rgba(56, 189, 248, 0.85);
      color: #0f172a;
      font-size: 1.5rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    .column-indicators {
      display: flex;
      justify-content: center;
      gap: 6px;
      padding: 6px 0 10px;
    }

    .column-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(148, 163, 184, 0.3);
      transition: background 0.2s;
    }

    .column-dot.active {
      background: #38bdf8;
    }
  `;

  baseUrl = "";
  apiKey = "";
  selectedProjectId = "";

  // 看板状态
  columns: KanbanColumn[] = [];
  statuses: RemoteProjectStatus[] = [];
  loading = false;
  error = "";
  activeColumnIndex = 0;
  selectedIssue: RemoteIssue | null = null;
  panelVisible = false;

  static properties = {
    baseUrl: { type: String, attribute: "base-url" },
    apiKey: { type: String, attribute: "api-key" },
    selectedProjectId: { attribute: "selected-project-id" },
    columns: { attribute: false },
    statuses: { attribute: false },
    loading: { type: Boolean, attribute: false },
    error: { attribute: false },
    activeColumnIndex: { type: Number, attribute: false },
    selectedIssue: { attribute: false },
    panelVisible: { type: Boolean, attribute: false },
  };

  updated(changed: Map<string, unknown>) {
    if (changed.has("columns") && this.columns.length > 0) {
      this.setupScrollDetection();
    }
    if (changed.has("selectedProjectId") && this.selectedProjectId) {
      this.activeColumnIndex = 0;
      void this.loadBoard();
    }
  }

  private setupScrollDetection() {
    const container = this.renderRoot.querySelector(".kanban-columns");
    if (!container) return;

    container.addEventListener("scroll", () => {
      const scrollLeft = container.scrollLeft;
      const colWidth = (container.scrollWidth - 24) / this.columns.length;
      const idx = Math.round(scrollLeft / colWidth);
      if (idx !== this.activeColumnIndex) {
        this.activeColumnIndex = Math.min(idx, this.columns.length - 1);
      }
    });
  }

  private async loadBoard(silent = false) {
    if (!this.selectedProjectId) return;

    if (!silent) {
      this.loading = true;
      this.error = "";
    }
    try {
      const [statuses, issues] = await Promise.all([
        fetchProjectStatuses(
          { baseUrl: this.baseUrl, apiKey: this.apiKey },
          this.selectedProjectId
        ),
        fetchIssues(
          { baseUrl: this.baseUrl, apiKey: this.apiKey },
          this.selectedProjectId
        ),
      ]);

      const visibleStatuses = statuses
        .filter((s) => !s.hidden)
        .sort((a, b) => a.sort_order - b.sort_order);

      const issuesByStatus = new Map<string, RemoteIssue[]>();
      for (const issue of issues) {
        const list = issuesByStatus.get(issue.status_id) ?? [];
        issuesByStatus.set(issue.status_id, [...list, issue]);
      }

      this.statuses = visibleStatuses;
      this.columns = visibleStatuses.map((status) => ({
        status,
        issues: (issuesByStatus.get(status.id) ?? []).sort(
          (a, b) => a.sort_order - b.sort_order
        ),
      }));
    } catch (err) {
      if (!silent) {
        this.error = err instanceof Error ? err.message : "加载失败";
      }
    } finally {
      if (!silent) {
        this.loading = false;
      }
    }
  }

  private handleRefresh() {
    void this.loadBoard();
  }

  private handleIssueCreated() {
    void this.loadBoard();
  }

  private handleOpenIssueDetail(e: CustomEvent) {
    const { issue } = e.detail;
    this.selectedIssue = { ...issue };
    this.panelVisible = true;
  }

  private handleIssueDetailUpdated() {
    void this.loadBoard(true);
  }

  private handleIssueDeleted() {
    this.panelVisible = false;
    this.selectedIssue = null;
    void this.loadBoard();
  }

  private handlePanelClosed() {
    this.panelVisible = false;
    this.selectedIssue = null;
  }

  private scrollToColumn(index: number) {
    const container = this.renderRoot.querySelector(".kanban-columns");
    if (!container) return;
    const colWidth = (container.scrollWidth - 24) / this.columns.length;
    container.scrollTo({ left: colWidth * index, behavior: "smooth" });
  }

  private openCreateDialog() {
    const dialog = this.renderRoot.querySelector(
      "mobile-issue-create-dialog"
    );
    if (dialog) {
      (dialog as HTMLElement).dispatchEvent(
        new CustomEvent("open", { bubbles: true, composed: true })
      );
    }
  }

  protected render() {
    // 无项目时显示提示
    if (!this.selectedProjectId) {
      return html`
        <div class="kanban-board">
          <div class="board-empty">
            <span style="font-size:1.5rem">📋</span>
            <span>请选择项目查看看板</span>
          </div>
        </div>
      `;
    }

    // 加载中
    if (this.loading) {
      return html`
        <div class="kanban-board">
          <div class="board-loading">
            <span style="font-size:1.5rem">⏳</span>
            <span>加载中...</span>
          </div>
        </div>
      `;
    }

    // 错误
    if (this.error) {
      return html`
        <div class="kanban-board">
          <div class="board-error">
            <span style="font-size:1.5rem">⚠️</span>
            <p>${this.error}</p>
            <button type="button" @click=${this.handleRefresh}>重试</button>
          </div>
        </div>
      `;
    }

    // 空看板
    if (this.columns.length === 0) {
      return html`
        <div class="kanban-board">
          <div class="board-empty">
            <span style="font-size:1.5rem">📭</span>
            <span>暂无任务状态配置</span>
          </div>
        </div>
      `;
    }

    // 正常看板
    return html`
      <div class="kanban-board">
        <div
          class="kanban-columns"
          @open-issue-detail=${this.handleOpenIssueDetail}
        >
          ${this.columns.map(
            (col) =>
              html`<mobile-kanban-column
                .column=${col}
                .statuses=${this.statuses}
                .baseUrl=${this.baseUrl}
                .apiKey=${this.apiKey}
                @issue-updated=${() => void this.loadBoard()}
              ></mobile-kanban-column>`
          )}
        </div>
        ${this.columns.length > 1
          ? html`<div class="column-indicators">
              ${this.columns.map(
                (_, i) =>
                  html`<div
                    class="column-dot ${i === this.activeColumnIndex
                      ? "active"
                      : ""}"
                    @click=${() => this.scrollToColumn(i)}
                  ></div>`
              )}
            </div>`
          : nothing}
        <button
          class="fab-create"
          type="button"
          @click=${this.openCreateDialog}
          title="新建任务"
        >
          +
        </button>
        <mobile-issue-create-dialog
          .statuses=${this.columns.map((c) => c.status)}
          .baseUrl=${this.baseUrl}
          .apiKey=${this.apiKey}
          @issue-created=${this.handleIssueCreated}
        ></mobile-issue-create-dialog>
        <mobile-issue-detail-panel
          .issue=${this.selectedIssue}
          .statuses=${this.statuses}
          .baseUrl=${this.baseUrl}
          .apiKey=${this.apiKey}
          .visible=${this.panelVisible}
          @issue-updated=${this.handleIssueDetailUpdated}
          @issue-deleted=${this.handleIssueDeleted}
          @panel-closed=${this.handlePanelClosed}
        ></mobile-issue-detail-panel>
      </div>
    `;
  }
}

customElements.define("mobile-kanban-board", MobileKanbanBoard);
