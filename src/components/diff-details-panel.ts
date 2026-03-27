import { LitElement, html, css, nothing } from "lit";
import type { DiffStats, RepoBranchStatus } from "../types";
import { fetchWorkspaceBranchStatus, formatDiffStats } from "../lib/diff-api";

/**
 * 差异文件详情面板
 * 展示工作区的 git 分支状态和差异统计
 */
export class DiffDetailsPanel extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: stretch;
      justify-content: flex-end;
    }

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
    }

    .panel {
      position: relative;
      width: 420px;
      max-width: 90vw;
      background: var(--primary-background-color, #0f172a);
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary-color, #e2e8f0);
    }

    .panel-close {
      background: none;
      border: none;
      color: var(--text-primary-color, #94a3b8);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1;
    }

    .panel-close:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .stats-summary {
      display: flex;
      gap: 16px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-secondary-color, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
    }

    .stat-value.files {
      color: var(--text-primary-color, #e2e8f0);
    }

    .stat-value.added {
      color: #22c55e;
    }

    .stat-value.removed {
      color: #ef4444;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary-color, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .repo-item {
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .repo-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary-color, #e2e8f0);
      margin-bottom: 6px;
    }

    .repo-branch {
      font-size: 12px;
      color: var(--text-secondary-color, #94a3b8);
      margin-bottom: 6px;
    }

    .repo-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--text-secondary-color, #64748b);
    }

    .repo-meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .repo-meta-item.is-ahead {
      color: #22c55e;
    }

    .repo-meta-item.is-behind {
      color: #f59e0b;
    }

    .repo-meta-item.is-conflicted {
      color: #ef4444;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 0;
      color: var(--text-secondary-color, #64748b);
      font-size: 13px;
    }

    .error {
      padding: 12px 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 6px;
      color: #ef4444;
      font-size: 13px;
    }

    .empty {
      padding: 40px 0;
      text-align: center;
      color: var(--text-secondary-color, #64748b);
      font-size: 13px;
    }
  `;

  static properties = {
    open: { type: Boolean },
    workspaceName: { attribute: false },
    workspaceId: { attribute: false },
    diffStats: { attribute: false },
    baseUrl: { attribute: false },
    apiKey: { attribute: false },
  };

  open = false;
  workspaceName = "";
  workspaceId = "";
  diffStats: DiffStats | undefined;
  baseUrl = "";
  apiKey: string | undefined;

  private branchStatuses: RepoBranchStatus[] = [];
  private loading = false;
  private error: string | undefined;

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has("open") && this.open) {
      void this.loadBranchStatus();
    }
  }

  private async loadBranchStatus() {
    if (!this.baseUrl || !this.workspaceId) {
      return;
    }

    this.loading = true;
    this.error = undefined;
    this.requestUpdate();

    try {
      this.branchStatuses = await fetchWorkspaceBranchStatus({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
      });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "加载分支状态失败";
    } finally {
      this.loading = false;
    }
  }

  private handleClose = () => {
    this.open = false;
    this.dispatchEvent(new CustomEvent("diff-details-close", {
      bubbles: true,
      composed: true,
    }));
  };

  private handleOverlayClick = () => {
    this.handleClose();
  };

  render() {
    if (!this.open) {
      return nothing;
    }

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}></div>
      <aside class="panel">
        <div class="panel-header">
          <div class="panel-title">${this.workspaceName} - 差异文件</div>
          <button class="panel-close" type="button" @click=${this.handleClose}>✕</button>
        </div>
        <div class="panel-body">
          ${this.diffStats ? this.renderStatsSummary() : nothing}
          ${this.renderBody()}
        </div>
      </aside>
    `;
  }

  private renderStatsSummary() {
    return html`
      <div class="stats-summary">
        <div class="stat-item">
          <span class="stat-label">文件</span>
          <span class="stat-value files">${this.diffStats!.files_changed}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">新增</span>
          <span class="stat-value added">+${this.diffStats!.lines_added}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">删除</span>
          <span class="stat-value removed">-${this.diffStats!.lines_removed}</span>
        </div>
      </div>
    `;
  }

  private renderBody() {
    if (this.loading) {
      return html`<div class="loading">加载中...</div>`;
    }

    if (this.error) {
      return html`<div class="error">${this.error}</div>`;
    }

    if (this.branchStatuses.length === 0) {
      return html`<div class="empty">暂无分支信息</div>`;
    }

    return html`
      <div class="section-title">仓库分支状态</div>
      ${this.branchStatuses.map((repo) => this.renderRepoItem(repo))}
    `;
  }

  private renderRepoItem(repo: RepoBranchStatus) {
    const { status } = repo;
    return html`
      <div class="repo-item">
        <div class="repo-name">${repo.repo_name}</div>
        <div class="repo-branch">${status.target_branch_name}</div>
        <div class="repo-meta">
          <span class="repo-meta-item ${status.commits_ahead > 0 ? "is-ahead" : ""}">
            ↑${status.commits_ahead}
          </span>
          <span class="repo-meta-item ${status.commits_behind > 0 ? "is-behind" : ""}">
            ↓${status.commits_behind}
          </span>
          ${status.has_uncommitted_changes
            ? html`<span class="repo-meta-item is-behind">
                ${status.uncommitted_count} 未提交
              </span>`
            : nothing}
          ${status.untracked_count > 0
            ? html`<span class="repo-meta-item">
                ${status.untracked_count} 未跟踪
              </span>`
            : nothing}
          ${status.is_rebase_in_progress
            ? html`<span class="repo-meta-item is-conflicted">rebase 进行中</span>`
            : nothing}
          ${status.conflicted_files.length > 0
            ? html`<span class="repo-meta-item is-conflicted">
                ${status.conflicted_files.length} 冲突
              </span>`
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "diff-details-panel": DiffDetailsPanel;
  }
}

if (!customElements.get("diff-details-panel")) {
  customElements.define("diff-details-panel", DiffDetailsPanel);
}
