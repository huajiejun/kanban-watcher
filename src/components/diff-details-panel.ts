import { LitElement, html, css, nothing } from "lit";
import type { Diff, DiffStats } from "../types";
import { connectDiffStream } from "../lib/diff-api";

/**
 * 差异文件详情面板
 * 连接 WebSocket diff 流，展示变更文件列表和差异内容
 */
export class DiffDetailsPanel extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }

    .panel {
      position: relative;
      width: calc(100vw - 32px);
      height: calc(100vh - 32px);
      max-width: 1200px;
      background: var(--primary-background-color, #0f172a);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
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
      color: var(--text-secondary-color, #94a3b8);
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
      padding: 14px 18px;
    }

    /* 统计摘要 */
    .stats-summary {
      display: flex;
      gap: 16px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      margin-bottom: 14px;
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

    .stat-value.files { color: var(--text-primary-color, #e2e8f0); }
    .stat-value.added { color: #22c55e; }
    .stat-value.removed { color: #ef4444; }

    /* 文件列表 */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .file-item {
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .file-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .file-icon {
      font-size: 12px;
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    .file-icon.is-added { color: #22c55e; }
    .file-icon.is-deleted { color: #ef4444; }
    .file-icon.is-modified { color: #f59e0b; }
    .file-icon.is-renamed { color: #8b5cf6; }

    .file-path {
      font-size: 12.5px;
      color: var(--text-primary-color, #e2e8f0);
      flex: 1;
      min-width: 0;
      word-break: break-all;
    }

    .file-stats {
      display: flex;
      gap: 6px;
      font-size: 11px;
      font-weight: 500;
      flex-shrink: 0;
    }

    .file-stats .added { color: #22c55e; }
    .file-stats .removed { color: #ef4444; }

    /* 差异内容展开 */
    .diff-content {
      margin-top: 8px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.3);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11.5px;
      line-height: 1.4;
      overflow-x: auto;
    }

    .diff-line {
      display: block;
      padding: 0 4px;
      min-height: 0;
      white-space: pre;
    }

    .diff-line.is-add { color: #22c55e; background: rgba(34, 197, 94, 0.08); }
    .diff-line.is-remove { color: #ef4444; background: rgba(239, 68, 68, 0.08); }
    .diff-line.is-context { color: var(--text-secondary-color, #94a3b8); }

    .diff-content-omitted {
      margin-top: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: var(--text-secondary-color, #64748b);
      background: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
    }

    /* 状态 */
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

    /* 手机端 */
    @media (max-width: 640px) {
      .panel {
        width: 100%;
        height: 100%;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }

      .stats-summary {
        gap: 10px;
        padding: 8px 10px;
      }

      .stat-value {
        font-size: 15px;
      }

      .file-path {
        font-size: 11.5px;
      }

      .diff-content {
        font-size: 10.5px;
        line-height: 1.3;
        padding: 6px;
      }

      .diff-line {
        padding: 0 2px;
      }
    }
  `;

  static properties = {
    open: { type: Boolean },
    workspaceName: { attribute: false },
    workspaceId: { attribute: false },
    diffStats: { attribute: false },
    baseUrl: { attribute: false },
    apiKey: { attribute: false },
    _diffs: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _expandedPath: { state: true },
  };

  open = false;
  workspaceName = "";
  workspaceId = "";
  diffStats: DiffStats | undefined;
  baseUrl = "";
  apiKey: string | undefined;

  private _diffs: Diff[] = [];
  private _loading = false;
  private _error: string | undefined;
  private _expandedPath: string | undefined;
  private _closeStream: (() => void) | undefined;
  private _diffMap = new Map<string, Diff>();
  private _flushScheduled = false;

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.connectStream();
      } else {
        this.disconnectStream();
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disconnectStream();
  }

  private connectStream() {
    this.disconnectStream();
    this._loading = true;
    this._error = undefined;
    this._diffs = [];
    this._diffMap.clear();
    this._expandedPath = undefined;
    this._flushScheduled = false;
    this.requestUpdate();

    if (!this.workspaceId) {
      this._loading = false;
      return;
    }

    this._closeStream = connectDiffStream(
      this.baseUrl,
      this.workspaceId,
      this.apiKey,
      {
        onDiff: (diff: Diff) => {
          const path = diff.newPath || diff.oldPath || "";
          this._diffMap.set(path, diff);
          this._loading = false;
          this.flushUpdate();
        },
        onReady: () => {
          this._loading = false;
          this.requestUpdate();
        },
        onError: (err: Error) => {
          this._error = err.message;
          this._loading = false;
          this.requestUpdate();
        },
        onClose: () => {
          this._loading = false;
          this.requestUpdate();
        },
      },
    );
  }

  private flushUpdate() {
    if (this._flushScheduled) {
      return;
    }
    this._flushScheduled = true;
    Promise.resolve().then(() => {
      this._flushScheduled = false;
      this._diffs = [...this._diffMap.values()];
      this.requestUpdate();
    });
  }

  private disconnectStream() {
    if (this._closeStream) {
      this._closeStream();
      this._closeStream = undefined;
    }
  }

  private handleClose = () => {
    this.disconnectStream();
    this.open = false;
    this.dispatchEvent(new CustomEvent("diff-details-close", {
      bubbles: true,
      composed: true,
    }));
  };

  private handleOverlayClick = () => {
    this.handleClose();
  };

  private toggleFile = (path: string) => {
    this._expandedPath = this._expandedPath === path ? undefined : path;
    this.requestUpdate();
  };

  render() {
    if (!this.open) {
      return nothing;
    }

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}></div>
      <aside class="panel">
        <div class="panel-header">
          <div class="panel-title">${this.workspaceName} — 变更文件</div>
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
    if (this._loading && this._diffs.length === 0) {
      return html`<div class="loading">加载文件列表...</div>`;
    }

    if (this._error) {
      return html`<div class="error">${this._error}</div>`;
    }

    if (this._diffs.length === 0) {
      return html`<div class="empty">暂无变更文件</div>`;
    }

    return html`
      <div class="file-list">
        ${this._diffs.map((diff) => this.renderFileItem(diff))}
      </div>
    `;
  }

  private renderFileItem(diff: Diff) {
    const path = diff.newPath || diff.oldPath || "";
    const changeKind = diff.change || "modified";
    const icon = this.getChangeIcon(changeKind);
    const isExpanded = this._expandedPath === path;

    return html`
      <div class="file-item" @click=${() => this.toggleFile(path)}>
        <div class="file-row">
          <span class="file-icon is-${changeKind}">${icon}</span>
          <span class="file-path" title=${path}>${path}</span>
          ${(diff.additions != null && diff.additions > 0) || (diff.deletions != null && diff.deletions > 0)
            ? html`
                <span class="file-stats">
                  ${diff.additions ? html`<span class="added">+${diff.additions}</span>` : nothing}
                  ${diff.deletions ? html`<span class="removed">-${diff.deletions}</span>` : nothing}
                </span>
              `
            : nothing}
        </div>
        ${isExpanded ? this.renderDiffContent(diff) : nothing}
      </div>
    `;
  }

  private renderDiffContent(diff: Diff) {
    if (diff.contentOmitted) {
      return html`<div class="diff-content-omitted">文件内容过大，差异已省略</div>`;
    }

    const oldLines = (diff.oldContent || "").split("\n");
    const newLines = (diff.newContent || "").split("\n");

    if (oldLines.length === 1 && !oldLines[0] && newLines.length === 1 && !newLines[0]) {
      return html`<div class="diff-content-omitted">无内容差异</div>`;
    }

    // 过滤空行，只保留有内容的行
    const lines: { text: string; type: string }[] = [];

    for (const line of oldLines) {
      if (line.trim()) {
        lines.push({ text: line, type: "remove" });
      }
    }

    for (const line of newLines) {
      if (line.trim()) {
        lines.push({ text: line, type: "add" });
      }
    }

    if (lines.length === 0) {
      return nothing;
    }

    // 限制最大显示行数，避免卡顿
    const MAX_LINES = 500;
    const truncated = lines.length > MAX_LINES;
    const displayLines = truncated ? lines.slice(0, MAX_LINES) : lines;

    return html`
      <div class="diff-content">
        ${displayLines.map((line) => html`
          <span class="diff-line is-${line.type}">${line.text}</span>
        `)}
        ${truncated ? html`<span class="diff-line is-context">... 还有 ${lines.length - MAX_LINES} 行未显示</span>` : nothing}
      </div>
    `;
  }

  private getChangeIcon(kind: string): string {
    switch (kind) {
      case "added": return "+";
      case "deleted": return "−";
      case "renamed": return "→";
      default: return "●";
    }
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
