import { LitElement, html, css, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { updateIssue, deleteIssue, fetchIssueWorkspaces } from "../lib/issue-api";
import { renderMessageMarkdown } from "../lib/render-message-markdown";
import type {
  RemoteIssue,
  RemoteProjectStatus,
  RemoteWorkspace,
  IssuePriority,
} from "../types/issue";

const PRIORITY_OPTIONS: { key: IssuePriority; label: string; color: string }[] = [
  { key: "urgent", label: "紧急", color: "#f87171" },
  { key: "high", label: "高", color: "#fb923c" },
  { key: "medium", label: "中", color: "#fbbf24" },
  { key: "low", label: "低", color: "#34d399" },
];

export class MobileIssueDetailPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .panel-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(24, 24, 27, 0.98);
      display: flex;
      flex-direction: column;
      animation: slideInRight 0.25s ease-out;
    }

    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    /* Header */
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
      gap: 8px;
    }

    .panel-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .btn-back {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-back:active {
      background: rgba(148, 163, 184, 0.2);
    }

    .issue-id {
      font-size: 0.78rem;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-close {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-close:active {
      background: rgba(148, 163, 184, 0.2);
    }

    /* Body */
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
    }

    .panel-body::-webkit-scrollbar {
      width: 3px;
    }

    .panel-body::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.2);
      border-radius: 3px;
    }

    /* Property Row */
    .property-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .prop-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.15);
      background: rgba(39, 39, 42, 0.7);
      color: #cbd5e1;
      font-size: 0.78rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s;
    }

    .prop-btn:active {
      background: rgba(148, 163, 184, 0.15);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .priority-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Title */
    .title-input {
      width: 100%;
      border: none;
      background: transparent;
      color: #e5e7eb;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
      resize: none;
      outline: none;
      font-family: inherit;
      padding: 0;
      margin: 0 0 8px;
      box-sizing: border-box;
    }

    .divider {
      height: 1px;
      background: rgba(148, 163, 184, 0.1);
      margin: 4px 0 12px;
    }

    /* Description */
    .description-section {
      position: relative;
    }

    .desc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .desc-label {
      font-size: 0.72rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .save-hint {
      font-size: 0.7rem;
      color: #34d399;
    }

    .desc-preview {
      min-height: 40px;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(39, 39, 42, 0.5);
      color: #cbd5e1;
      font-size: 0.82rem;
      line-height: 1.6;
      word-break: break-word;
      cursor: text;
      -webkit-tap-highlight-color: transparent;
    }

    .desc-preview p {
      margin: 0 0 8px;
    }

    .desc-preview p:last-child {
      margin-bottom: 0;
    }

    .desc-preview ul,
    .desc-preview ol {
      margin: 4px 0 8px;
      padding-left: 1.4em;
    }

    .desc-preview li {
      margin-bottom: 2px;
    }

    .desc-preview code {
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(148, 163, 184, 0.12);
      color: #e2e8f0;
      font-size: 0.78rem;
      font-family: "SF Mono", "Fira Code", monospace;
    }

    .desc-preview pre {
      margin: 8px 0;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(24, 24, 27, 0.6);
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .desc-preview pre code {
      padding: 0;
      background: transparent;
      font-size: 0.76rem;
    }

    .desc-preview blockquote {
      margin: 8px 0;
      padding: 4px 10px;
      border-left: 3px solid rgba(148, 163, 184, 0.25);
      color: #94a3b8;
    }

    .desc-preview h1, .desc-preview h2, .desc-preview h3,
    .desc-preview h4, .desc-preview h5, .desc-preview h6 {
      margin: 10px 0 6px;
      color: #e2e8f0;
    }

    .desc-preview a {
      color: #38bdf8;
      text-decoration: none;
    }

    .desc-preview table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 0.78rem;
    }

    .desc-preview th, .desc-preview td {
      padding: 4px 8px;
      border: 1px solid rgba(148, 163, 184, 0.15);
      text-align: left;
    }

    .desc-preview th {
      background: rgba(148, 163, 184, 0.08);
      color: #e2e8f0;
    }

    .desc-preview img {
      max-width: 100%;
      border-radius: 4px;
    }

    .desc-preview hr {
      border: none;
      border-top: 1px solid rgba(148, 163, 184, 0.15);
      margin: 8px 0;
    }

    .desc-placeholder {
      color: rgba(148, 163, 184, 0.5);
    }

    .desc-input {
      width: 100%;
      min-height: 80px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(39, 39, 42, 0.7);
      color: #e5e7eb;
      font-size: 0.82rem;
      line-height: 1.5;
      resize: none;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
    }

    .desc-input:focus {
      border-color: rgba(56, 189, 248, 0.4);
    }

    /* Meta */
    .meta-row {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.08);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .meta-item {
      font-size: 0.72rem;
      color: #64748b;
    }

    /* Footer */
    .panel-footer {
      padding: 8px 14px;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid rgba(148, 163, 184, 0.08);
      flex-shrink: 0;
    }

    .btn-delete {
      width: 100%;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid rgba(248, 113, 113, 0.2);
      background: rgba(248, 113, 113, 0.06);
      color: #f87171;
      font-size: 0.82rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-delete:active {
      background: rgba(248, 113, 113, 0.12);
    }

    .delete-confirm {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .delete-confirm span {
      flex: 1;
      font-size: 0.78rem;
      color: #f87171;
    }

    .btn-confirm-delete {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid rgba(248, 113, 113, 0.3);
      background: rgba(248, 113, 113, 0.1);
      color: #f87171;
      font-size: 0.78rem;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-cancel-delete {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(148, 163, 184, 0.08);
      color: #94a3b8;
      font-size: 0.78rem;
      cursor: pointer;
      white-space: nowrap;
    }

    /* Workspaces Section */
    .ws-section {
      margin-top: 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.08);
      padding-top: 12px;
    }

    .ws-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .ws-title {
      font-size: 0.78rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .ws-count {
      font-size: 0.72rem;
      color: #64748b;
    }

    .ws-card {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(39, 39, 42, 0.5);
      margin-bottom: 8px;
      border: 1px solid rgba(148, 163, 184, 0.08);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .ws-card:active {
      background: rgba(148, 163, 184, 0.08);
    }

    .ws-card-row1 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .ws-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 0.68rem;
      font-weight: 500;
      flex-shrink: 0;
    }

    .ws-status-badge.active {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
    }

    .ws-status-badge.archived {
      background: rgba(148, 163, 184, 0.1);
      color: #64748b;
    }

    .ws-status-badge.running {
      background: rgba(56, 189, 248, 0.12);
      color: #38bdf8;
    }

    .ws-name {
      font-size: 0.82rem;
      color: #e2e8f0;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .ws-card-row2 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.72rem;
      color: #64748b;
    }

    .ws-time {
      flex-shrink: 0;
    }

    .ws-code-stats {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .ws-code-stats .added {
      color: #34d399;
    }

    .ws-code-stats .removed {
      color: #f87171;
    }

    .ws-empty {
      text-align: center;
      padding: 16px 0;
      color: #4a5568;
      font-size: 0.78rem;
    }

    .ws-loading {
      text-align: center;
      padding: 12px 0;
      color: #64748b;
      font-size: 0.78rem;
    }

    .ws-empty-state {
      padding: 20px 16px;
      text-align: center;
    }

    .ws-empty-text {
      color: #64748b;
      font-size: 0.8rem;
      margin-bottom: 16px;
    }

    .ws-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ws-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .ws-action-btn.primary {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }

    .ws-action-btn.primary:active {
      background: rgba(56, 189, 248, 0.25);
    }

    .ws-action-btn.secondary {
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
    }

    .ws-action-btn.secondary:active {
      background: rgba(148, 163, 184, 0.2);
    }

    .ws-action-icon {
      font-size: 1rem;
    }

    .ws-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ws-add-btn {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    .ws-add-btn:active {
      background: rgba(56, 189, 248, 0.25);
    }

    /* Picker Overlay */
    .picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 110;
      display: flex;
      align-items: flex-end;
      animation: fadeIn 0.15s;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .picker-sheet {
      width: 100%;
      max-height: 40vh;
      background: rgba(39, 39, 42, 0.98);
      border-radius: 14px 14px 0 0;
      overflow-y: auto;
      padding: 8px 0;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .picker-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: #cbd5e1;
      font-size: 0.82rem;
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s;
    }

    .picker-item:active {
      background: rgba(148, 163, 184, 0.1);
    }

    .picker-item.active {
      color: #e5e7eb;
    }

    .picker-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .picker-check {
      margin-left: auto;
      color: #38bdf8;
      font-size: 0.82rem;
    }
  `;

  issue: RemoteIssue | null = null;
  statuses: RemoteProjectStatus[] = [];
  baseUrl = "";
  apiKey = "";
  visible = false;

  saving = false;
  deleting = false;
  showDeleteConfirm = false;
  editingDescription = false;
  showStatusPicker = false;
  showPriorityPicker = false;
  saveStatus: "idle" | "saved" = "idle";
  workspaces: RemoteWorkspace[] = [];
  wsLoading = false;

  private _editTitle = "";
  private _editDescription = "";
  private _titleTimer: ReturnType<typeof setTimeout> | null = null;
  private _descTimer: ReturnType<typeof setTimeout> | null = null;
  private _saveHintTimer: ReturnType<typeof setTimeout> | null = null;

  static properties = {
    issue: { type: Object, attribute: false },
    statuses: { type: Array, attribute: false },
    baseUrl: { type: String, attribute: "base-url" },
    apiKey: { type: String, attribute: "api-key" },
    visible: { type: Boolean },
    saving: { type: Boolean, attribute: false },
    deleting: { type: Boolean, attribute: false },
    showDeleteConfirm: { type: Boolean, attribute: false },
    editingDescription: { type: Boolean, attribute: false },
    showStatusPicker: { type: Boolean, attribute: false },
    showPriorityPicker: { type: Boolean, attribute: false },
    saveStatus: { attribute: false },
    workspaces: { type: Array, attribute: false },
    wsLoading: { type: Boolean, attribute: false },
  };

  updated(changed: Map<string, unknown>) {
    if (changed.has("issue") && this.issue) {
      this._editTitle = this.issue.title;
      this._editDescription = this.issue.description ?? "";
      this.editingDescription = false;
      this.showDeleteConfirm = false;
      this.showStatusPicker = false;
      this.showPriorityPicker = false;
      this.saveStatus = "idle";
      this.cancelPendingSaves();
      void this.loadWorkspaces();
    }
    if (changed.has("visible") && !this.visible) {
      this.cancelPendingSaves();
      this.editingDescription = false;
      this.showDeleteConfirm = false;
      this.showStatusPicker = false;
      this.showPriorityPicker = false;
      this.workspaces = [];
    }
  }

  private cancelPendingSaves() {
    if (this._titleTimer) { clearTimeout(this._titleTimer); this._titleTimer = null; }
    if (this._descTimer) { clearTimeout(this._descTimer); this._descTimer = null; }
    if (this._saveHintTimer) { clearTimeout(this._saveHintTimer); this._saveHintTimer = null; }
  }

  private showSaveHint() {
    this.saveStatus = "saved";
    if (this._saveHintTimer) clearTimeout(this._saveHintTimer);
    this._saveHintTimer = setTimeout(() => {
      this._saveHintTimer = null;
      this.saveStatus = "idle";
    }, 1500);
  }

  private get currentStatus() {
    return this.statuses.find((s) => s.id === this.issue?.status_id);
  }

  private get priorityOption() {
    return PRIORITY_OPTIONS.find((p) => p.key === this.issue?.priority);
  }

  // --- Title ---

  private handleTitleInput(e: Event) {
    this._editTitle = (e.target as HTMLTextAreaElement).value;
    if (this._titleTimer) clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => {
      this._titleTimer = null;
      void this.saveTitle();
    }, 500);
  }

  private async saveTitle() {
    if (!this.issue || !this._editTitle.trim()) return;
    try {
      await updateIssue({ baseUrl: this.baseUrl, apiKey: this.apiKey }, this.issue.id, {
        title: this._editTitle,
      });
      this.showSaveHint();
      this.dispatchUpdate();
    } catch (err) {
      console.error("保存标题失败:", err);
    }
  }

  // --- Description ---

  private startEditDesc() {
    this.editingDescription = true;
    void this.updateComplete.then(() => {
      const textarea = this.renderRoot.querySelector(".desc-input") as HTMLTextAreaElement | null;
      textarea?.focus();
    });
  }

  private handleDescInput(e: Event) {
    this._editDescription = (e.target as HTMLTextAreaElement).value;
    if (this._descTimer) clearTimeout(this._descTimer);
    this._descTimer = setTimeout(() => {
      this._descTimer = null;
      void this.saveDescription();
    }, 500);
  }

  private handleDescBlur() {
    if (this._descTimer) {
      clearTimeout(this._descTimer);
      this._descTimer = null;
    }
    void this.saveDescription();
    this.editingDescription = false;
  }

  private async saveDescription() {
    if (!this.issue) return;
    try {
      await updateIssue({ baseUrl: this.baseUrl, apiKey: this.apiKey }, this.issue.id, {
        description: this._editDescription || null,
      });
      this.showSaveHint();
      this.dispatchUpdate();
    } catch (err) {
      console.error("保存描述失败:", err);
    }
  }

  // --- Status ---

  private async handleStatusChange(statusId: string) {
    this.showStatusPicker = false;
    if (!this.issue || statusId === this.issue.status_id) return;
    try {
      await updateIssue({ baseUrl: this.baseUrl, apiKey: this.apiKey }, this.issue.id, {
        status_id: statusId,
      });
      this.dispatchUpdate();
    } catch (err) {
      console.error("更新状态失败:", err);
    }
  }

  // --- Priority ---

  private async handlePriorityChange(priority: IssuePriority) {
    this.showPriorityPicker = false;
    if (!this.issue || priority === this.issue.priority) return;
    try {
      await updateIssue({ baseUrl: this.baseUrl, apiKey: this.apiKey }, this.issue.id, {
        priority,
      });
      this.dispatchUpdate();
    } catch (err) {
      console.error("更新优先级失败:", err);
    }
  }

  // --- Delete ---

  private async handleDelete() {
    if (!this.issue) return;
    this.deleting = true;
    try {
      await deleteIssue({ baseUrl: this.baseUrl, apiKey: this.apiKey }, this.issue.id);
      this.dispatchEvent(new CustomEvent("issue-deleted", { bubbles: true, composed: true }));
    } catch (err) {
      console.error("删除失败:", err);
    } finally {
      this.deleting = false;
    }
  }

  // --- Events ---

  private dispatchUpdate() {
    this.dispatchEvent(new CustomEvent("issue-updated", { bubbles: true, composed: true }));
  }

  close() {
    this.visible = false;
    this.dispatchEvent(
      new CustomEvent("panel-closed", { bubbles: true, composed: true })
    );
  }

  private formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private formatRelativeTime(dateStr: string) {
    const now = Date.now();
    const d = new Date(dateStr).getTime();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return this.formatTime(dateStr);
  }

  // --- Workspaces ---

  private async loadWorkspaces() {
    if (!this.issue) return;
    this.wsLoading = true;
    try {
      this.workspaces = await fetchIssueWorkspaces(
        { baseUrl: this.baseUrl, apiKey: this.apiKey },
        this.issue.id
      );
    } catch (err) {
      console.error("加载工作区失败:", err);
      this.workspaces = [];
    } finally {
      this.wsLoading = false;
    }
  }

  private handleCreateWorkspace() {
    // 派发事件给父组件处理新建工作区，包含任务详情作为默认提示词
    this.dispatchEvent(
      new CustomEvent("create-workspace-for-issue", {
        detail: {
          issueId: this.issue?.id,
          issueSimpleId: this.issue?.simple_id,
          title: this.issue?.title,
          description: this.issue?.description
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleLinkWorkspace() {
    // 显示工作区选择器来关联现有工作区
    this.dispatchEvent(
      new CustomEvent("link-workspace-to-issue", {
        detail: { issueId: this.issue?.id, issueSimpleId: this.issue?.simple_id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private showLinkWorkspacePicker() {
    // 显示工作区选择器（用于已有工作区时添加更多）
    this.dispatchEvent(
      new CustomEvent("show-workspace-picker", {
        detail: { issueId: this.issue?.id, currentWorkspaces: this.workspaces.map(w => w.id) },
        bubbles: true,
        composed: true,
      })
    );
  }

  private renderWorkspaces() {
    if (this.wsLoading) {
      return html`
        <div class="ws-section">
          <div class="ws-header">
            <span class="ws-title">关联工作区</span>
          </div>
          <div class="ws-loading">加载中...</div>
        </div>
      `;
    }

    const active = this.workspaces.filter((w) => !w.archived);
    const archived = this.workspaces.filter((w) => w.archived);
    const total = active.length + archived.length;

    if (total === 0) {
      return html`
        <div class="ws-section">
          <div class="ws-header">
            <span class="ws-title">关联工作区</span>
          </div>
          <div class="ws-empty-state">
            <div class="ws-empty-text">暂无关联工作区</div>
            <div class="ws-actions">
              <button class="ws-action-btn primary" @click=${() => this.handleCreateWorkspace()}>
                <span class="ws-action-icon">+</span>
                <span>新建工作区</span>
              </button>
              <button class="ws-action-btn secondary" @click=${() => this.handleLinkWorkspace()}>
                <span class="ws-action-icon">🔗</span>
                <span>关联现有</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="ws-section">
        <div class="ws-header">
          <span class="ws-title">关联工作区</span>
          <div class="ws-header-actions">
            <span class="ws-count">${total}</span>
            <button class="ws-add-btn" @click=${() => this.showLinkWorkspacePicker()} title="关联工作区">
              +
            </button>
          </div>
        </div>
        ${active.map((ws) => this.renderWorkspaceCard(ws))}
        ${archived.length > 0
          ? html`<div style="margin-top:4px">${archived.map((ws) => this.renderWorkspaceCard(ws))}</div>`
          : nothing}
      </div>
    `;
  }

  private handleWorkspaceClick(ws: RemoteWorkspace) {
    this.dispatchEvent(
      new CustomEvent("workspace-selected", {
        detail: { workspaceId: ws.id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private renderWorkspaceCard(ws: RemoteWorkspace) {
    const name = ws.name || "未命名";
    const badgeClass = ws.archived ? "archived" : "active";
    const badgeLabel = ws.archived ? "归档" : "活跃";
    const filesChanged = ws.files_changed ?? 0;
    const linesAdded = ws.lines_added ?? 0;
    const linesRemoved = ws.lines_removed ?? 0;

    return html`
      <div class="ws-card" @click=${() => this.handleWorkspaceClick(ws)}>
        <div class="ws-card-row1">
          <span class="ws-status-badge ${badgeClass}">${badgeLabel}</span>
          <span class="ws-name">${name}</span>
        </div>
        <div class="ws-card-row2">
          <span class="ws-time">${this.formatRelativeTime(ws.updated_at)}</span>
          ${filesChanged > 0
            ? html`<span class="ws-code-stats">
                ${linesAdded > 0 ? html`<span class="added">+${linesAdded}</span>` : nothing}
                ${linesRemoved > 0 ? html`<span class="removed">-${linesRemoved}</span>` : nothing}
              </span>`
            : nothing}
        </div>
      </div>
    `;
  }

  protected render() {
    if (!this.visible || !this.issue) return nothing;

    const status = this.currentStatus;
    const priority = this.priorityOption;

    return html`
      <div class="panel-overlay">
        <!-- Header -->
        <div class="panel-header">
          <div class="panel-header-left">
            <button class="btn-back" type="button" @click=${() => this.close()}>←</button>
            <span class="issue-id">${this.issue.simple_id}</span>
          </div>
          <button class="btn-close" type="button" @click=${() => this.close()}>×</button>
        </div>

        <!-- Body -->
        <div class="panel-body">
          <!-- Property Row -->
          <div class="property-row">
            <button
              class="prop-btn"
              type="button"
              @click=${() => { this.showStatusPicker = true; }}
            >
              ${status
                ? html`<span class="status-dot" style="background:${status.color}"></span>
                    <span>${status.name}</span>`
                : html`<span style="color:#64748b">未设置</span>`}
              ▾
            </button>
            <button
              class="prop-btn"
              type="button"
              @click=${() => { this.showPriorityPicker = true; }}
            >
              ${priority
                ? html`<span class="priority-dot" style="background:${priority.color}"></span>
                    <span>${priority.label}</span>`
                : html`<span style="color:#64748b">无优先级</span>`}
              ▾
            </button>
          </div>

          <!-- Title -->
          <textarea
            class="title-input"
            .value=${this._editTitle}
            @input=${this.handleTitleInput}
            rows="1"
          ></textarea>

          <div class="divider"></div>

          <!-- Description -->
          <div class="description-section">
            <div class="desc-header">
              <span class="desc-label">描述</span>
              ${this.saveStatus === "saved"
                ? html`<span class="save-hint">已保存</span>`
                : nothing}
            </div>
            ${this.editingDescription
              ? html`<textarea
                  class="desc-input"
                  .value=${this._editDescription}
                  @input=${this.handleDescInput}
                  @blur=${this.handleDescBlur}
                  placeholder="添加描述..."
                ></textarea>`
              : html`<div class="desc-preview" @click=${this.startEditDesc}>
                  ${this._editDescription
                    ? unsafeHTML(renderMessageMarkdown(this._editDescription))
                    : html`<span class="desc-placeholder">点击添加描述...</span>`}
                </div>`}
          </div>

          <!-- Workspaces -->
          ${this.renderWorkspaces()}

          <!-- Meta -->
          <div class="meta-row">
            <span class="meta-item">创建: ${this.formatTime(this.issue.created_at)}</span>
            <span class="meta-item">更新: ${this.formatTime(this.issue.updated_at)}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="panel-footer">
          ${!this.showDeleteConfirm
            ? html`<button
                class="btn-delete"
                type="button"
                @click=${() => { this.showDeleteConfirm = true; }}
              >删除任务</button>`
            : html`<div class="delete-confirm">
                <span>确认删除？</span>
                <button class="btn-cancel-delete" type="button"
                  @click=${() => { this.showDeleteConfirm = false; }}
                >取消</button>
                <button class="btn-confirm-delete" type="button"
                  @click=${this.handleDelete}
                >删除</button>
              </div>`}
        </div>

        <!-- Status Picker -->
        ${this.showStatusPicker
          ? html`<div class="picker-overlay" @click=${() => { this.showStatusPicker = false; }}>
              <div class="picker-sheet" @click=${(e: Event) => e.stopPropagation()}>
                ${this.statuses.map(
                  (s) => html`<button
                    class="picker-item ${s.id === this.issue?.status_id ? "active" : ""}"
                    type="button"
                    @click=${() => this.handleStatusChange(s.id)}
                  >
                    <span class="picker-dot" style="background:${s.color}"></span>
                    <span>${s.name}</span>
                    ${s.id === this.issue?.status_id
                      ? html`<span class="picker-check">✓</span>`
                      : nothing}
                  </button>`
                )}
              </div>
            </div>`
          : nothing}

        <!-- Priority Picker -->
        ${this.showPriorityPicker
          ? html`<div class="picker-overlay" @click=${() => { this.showPriorityPicker = false; }}>
              <div class="picker-sheet" @click=${(e: Event) => e.stopPropagation()}>
                ${PRIORITY_OPTIONS.map(
                  (p) => html`<button
                    class="picker-item ${p.key === this.issue?.priority ? "active" : ""}"
                    type="button"
                    @click=${() => this.handlePriorityChange(p.key)}
                  >
                    <span class="picker-dot" style="background:${p.color}"></span>
                    <span>${p.label}</span>
                    ${p.key === this.issue?.priority
                      ? html`<span class="picker-check">✓</span>`
                      : nothing}
                  </button>`
                )}
              </div>
            </div>`
          : nothing}
      </div>
    `;
  }
}

customElements.define("mobile-issue-detail-panel", MobileIssueDetailPanel);
