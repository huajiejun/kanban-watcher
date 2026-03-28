import { LitElement, html, css, nothing } from "lit";
import {
  fetchOrganizations,
  fetchProjects,
  fetchIssues,
  fetchProjectStatuses,
} from "../lib/issue-api";
import type {
  RemoteIssue,
  RemoteProjectStatus,
  RemoteOrganization,
  RemoteProject,
  KanbanColumn,
} from "../types/issue";
import "./mobile-kanban-column";

const STORAGE_KEY_ORG = "kanban_selected_org_id";
const STORAGE_KEY_PROJECT = "kanban_selected_project_id";

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

    .project-selector {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }

    .selector-select {
      flex: 1;
      padding: 5px 8px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(15, 23, 42, 0.6);
      color: #cbd5e1;
      font-size: 0.76rem;
      font-family: inherit;
      outline: none;
      -webkit-appearance: none;
      max-width: 50%;
    }

    .selector-select:focus {
      border-color: rgba(56, 189, 248, 0.5);
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

  // 项目选择器状态
  organizations: RemoteOrganization[] = [];
  projects: RemoteProject[] = [];
  selectedOrgId = "";
  selectedProjectId = "";
  selectorLoading = false;
  selectorError = "";

  // 看板状态
  columns: KanbanColumn[] = [];
  statuses: RemoteProjectStatus[] = [];
  loading = false;
  error = "";
  activeColumnIndex = 0;

  static properties = {
    baseUrl: { type: String, attribute: "base-url" },
    apiKey: { type: String, attribute: "api-key" },
    organizations: { attribute: false },
    projects: { attribute: false },
    selectedOrgId: { attribute: false },
    selectedProjectId: { attribute: false },
    selectorLoading: { type: Boolean, attribute: false },
    selectorError: { attribute: false },
    columns: { attribute: false },
    statuses: { attribute: false },
    loading: { type: Boolean, attribute: false },
    error: { attribute: false },
    activeColumnIndex: { type: Number, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    void this.initSelector();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("columns") && this.columns.length > 0) {
      this.setupScrollDetection();
    }
  }

  private async initSelector() {
    this.selectorLoading = true;
    this.selectorError = "";
    try {
      const orgs = await fetchOrganizations({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
      });
      this.organizations = orgs;

      // 恢复上次选择
      const savedOrgId = localStorage.getItem(STORAGE_KEY_ORG);
      const orgId = orgs.find((o) => o.id === savedOrgId)
        ? savedOrgId
        : orgs.length > 0
          ? orgs[0].id
          : "";

      if (orgId) {
        await this.handleOrgChange(orgId);
      }
    } catch (err) {
      this.selectorError =
        err instanceof Error ? err.message : "加载组织失败";
    } finally {
      this.selectorLoading = false;
    }
  }

  private async handleOrgChange(orgId: string) {
    this.selectedOrgId = orgId;
    localStorage.setItem(STORAGE_KEY_ORG, orgId);
    this.projects = [];
    this.selectedProjectId = "";
    this.columns = [];

    try {
      const projects = await fetchProjects(
        { baseUrl: this.baseUrl, apiKey: this.apiKey },
        orgId
      );
      this.projects = projects;

      // 恢复上次选择
      const savedProjectId = localStorage.getItem(STORAGE_KEY_PROJECT);
      const projectId = projects.find((p) => p.id === savedProjectId)
        ? savedProjectId
        : projects.length > 0
          ? projects[0].id
          : "";

      if (projectId) {
        await this.handleProjectChange(projectId);
      }
    } catch (err) {
      console.error("加载项目列表失败:", err);
    }
  }

  private async handleProjectChange(projectId: string) {
    this.selectedProjectId = projectId;
    localStorage.setItem(STORAGE_KEY_PROJECT, projectId);
    void this.loadBoard();
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

  private async loadBoard() {
    if (!this.selectedProjectId) return;

    this.loading = true;
    this.error = "";
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
      this.error = err instanceof Error ? err.message : "加载失败";
    } finally {
      this.loading = false;
    }
  }

  private handleRefresh() {
    void this.loadBoard();
  }

  private handleIssueCreated() {
    void this.loadBoard();
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
    // 项目选择器
    const selector = html`
      <div class="project-selector">
        <select
          class="selector-select"
          .value=${this.selectedOrgId}
          @change=${(e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) void this.handleOrgChange(val);
          }}
        >
          <option value="" ?selected=${!this.selectedOrgId}>选择组织</option>
          ${this.organizations.map(
            (org) =>
              html`<option value=${org.id} ?selected=${org.id === this.selectedOrgId}>
                ${org.name}
              </option>`
          )}
        </select>
        <select
          class="selector-select"
          .value=${this.selectedProjectId}
          @change=${(e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) void this.handleProjectChange(val);
          }}
        >
          <option value="" ?selected=${!this.selectedProjectId}>
            选择项目
          </option>
          ${this.projects.map(
            (p) =>
              html`<option value=${p.id} ?selected=${p.id === this.selectedProjectId}>
                ${p.name}
              </option>`
          )}
        </select>
      </div>
    `;

    // 无项目时显示提示
    if (!this.selectedProjectId) {
      return html`
        <div class="kanban-board">
          ${selector}
          <div class="board-empty">
            <span style="font-size:1.5rem">📋</span>
            <span>
              ${this.selectorError
                ? this.selectorError
                : this.organizations.length === 0
                  ? "加载组织中..."
                  : "请选择项目查看看板"}
            </span>
          </div>
        </div>
      `;
    }

    // 加载中
    if (this.loading) {
      return html`
        <div class="kanban-board">
          ${selector}
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
          ${selector}
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
          ${selector}
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
        ${selector}
        <div class="kanban-columns">
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
      </div>
    `;
  }
}

customElements.define("mobile-kanban-board", MobileKanbanBoard);
