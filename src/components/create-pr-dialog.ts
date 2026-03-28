import { LitElement, html, css, nothing } from "lit";
import { createPR, fetchRepoBranches, fetchWorkspaceRepos, getFirstUserMessage } from "../lib/http-api";

export class CreatePRDialog extends LitElement {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .pr-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.15s ease-out forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .pr-modal {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      width: 520px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.2s ease-out forwards;
      overflow: hidden;
    }

    .pr-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .pr-title {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0;
    }

    .pr-close {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.15s;
    }

    .pr-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    .pr-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .pr-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .pr-label {
      font-size: 12px;
      font-weight: 500;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .pr-label.required::after {
      content: "*";
      color: #ef4444;
    }

    .pr-input,
    .pr-textarea,
    .pr-select {
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #f1f5f9;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
      font-family: inherit;
    }

    .pr-input:focus,
    .pr-textarea:focus,
    .pr-select:focus {
      border-color: rgba(59, 130, 246, 0.5);
    }

    .pr-input::placeholder,
    .pr-textarea::placeholder {
      color: #64748b;
    }

    .pr-textarea {
      min-height: 100px;
      resize: vertical;
    }

    .pr-select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
    }

    .pr-select option {
      background: #1e293b;
      color: #f1f5f9;
    }

    .pr-checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pr-checkbox {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: #3b82f6;
    }

    .pr-checkbox-label {
      font-size: 13px;
      color: #94a3b8;
      cursor: pointer;
    }

    .pr-error {
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #fca5a5;
      font-size: 12px;
    }

    .pr-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .pr-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .pr-btn-cancel {
      background: transparent;
      color: #94a3b8;
    }

    .pr-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    .pr-btn-submit {
      background: #3b82f6;
      color: #fff;
    }

    .pr-btn-submit:hover {
      background: #2563eb;
    }

    .pr-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  static properties = {
    open: { type: Boolean, reflect: true },
    workspaceId: { type: String },
    repoId: { type: String },
    targetBranch: { type: String },
    baseUrl: { type: String },
    apiKey: { type: String },
    // 表单状态
    prTitle: { type: String },
    prBody: { type: String },
    prBaseBranch: { type: String },
    isDraft: { type: Boolean },
    autoGenerateDescription: { type: Boolean },
    // UI 状态
    branches: { type: Array },
    loading: { type: Boolean },
    creating: { type: Boolean },
    error: { type: String },
  };

  open = false;
  workspaceId = "";
  repoId = "";
  targetBranch = "";
  baseUrl = "";
  apiKey = "";

  prTitle = "";
  prBody = "";
  prBaseBranch = "";
  isDraft = false;
  autoGenerateDescription = true;
  branches: { name: string }[] = [];
  loading = false;
  creating = false;
  error = "";

  private _effectiveRepoId = "";

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        // 重置状态并加载数据
        this.loading = true;
        this.error = "";
        this.prTitle = "";
        this.prBody = "";
        this.prBaseBranch = "";
        this.branches = [];
        this._effectiveRepoId = "";
        void this.loadInitialData();
      }
    }
  }

  private async loadInitialData() {
    this.loading = true;
    this.error = "";

    try {
      // 确定要使用的 repoId
      this._effectiveRepoId = this.repoId;

      // 如果没有传入 repoId，尝试从 workspace 获取
      if (!this._effectiveRepoId && this.workspaceId) {
        const repos = await fetchWorkspaceRepos({
          baseUrl: this.baseUrl,
          apiKey: this.apiKey,
          workspaceId: this.workspaceId,
        });
        if (repos.length > 0) {
          this._effectiveRepoId = repos[0].id;
          // 如果没有传入 targetBranch，使用 workspace repo 的 target_branch
          if (!this.targetBranch && repos[0].target_branch) {
            this.targetBranch = repos[0].target_branch;
          }
        }
      }

      // 加载分支列表
      if (this._effectiveRepoId) {
        const branchList = await fetchRepoBranches({
          baseUrl: this.baseUrl,
          apiKey: this.apiKey,
          repoId: this._effectiveRepoId,
        });
        this.branches = branchList;
      }

      // 尝试获取第一条用户消息作为 PR 标题
      if (this.workspaceId) {
        const firstMessage = await getFirstUserMessage({
          baseUrl: this.baseUrl,
          apiKey: this.apiKey,
          workspaceId: this.workspaceId,
        });
        if (firstMessage?.trim()) {
          // 简单处理：取前80个字符作为标题
          const titleText = firstMessage.trim().slice(0, 80);
          this.prTitle = titleText + (firstMessage.length > 80 ? "..." : "");
          this.prBody = firstMessage.trim();
        }
      }

      // 设置默认目标分支
      if (this.targetBranch) {
        this.prBaseBranch = this.targetBranch;
      } else if (this.branches.length > 0) {
        // 优先选择 main 或 master
        const mainBranch = this.branches.find((b) => b.name === "main" || b.name === "master");
        this.prBaseBranch = mainBranch?.name ?? this.branches[0]?.name ?? "";
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : "加载数据失败";
    } finally {
      this.loading = false;
    }
  }

  private handleOverlayClick = (event: Event) => {
    if ((event.target as HTMLElement).classList.contains("pr-overlay")) {
      this.close();
    }
  };

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private handleClose = () => {
    this.close();
  };

  private handleTitleChange = (e: Event) => {
    this.prTitle = (e.target as HTMLInputElement).value;
  };

  private handleBodyChange = (e: Event) => {
    this.prBody = (e.target as HTMLTextAreaElement).value;
  };

  private handleBranchChange = (e: Event) => {
    this.prBaseBranch = (e.target as HTMLSelectElement).value;
  };

  private handleDraftChange = (e: Event) => {
    this.isDraft = (e.target as HTMLInputElement).checked;
  };

  private handleAutoDescChange = (e: Event) => {
    this.autoGenerateDescription = (e.target as HTMLInputElement).checked;
  };

  private handleSubmit = async () => {
    if (!this.prTitle.trim()) {
      this.error = "请输入 PR 标题";
      return;
    }

    this.creating = true;
    this.error = "";

    try {
      const result = await createPR({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        title: this.prTitle.trim(),
        body: this.prBody.trim() || null,
        targetBranch: this.prBaseBranch || null,
        draft: this.isDraft,
        repoId: this._effectiveRepoId,
        autoGenerateDescription: this.autoGenerateDescription,
      });

      if (result.success && result.data) {
        // 成功：打开 PR URL
        window.open(result.data, "_blank", "noopener");
        this.close();
      } else {
        this.error = result.error || result.message || "创建 PR 失败";
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : "创建 PR 失败";
    } finally {
      this.creating = false;
    }
  };

  protected render() {
    if (!this.open) {
      return nothing;
    }

    return html`
      <div class="pr-overlay" @click=${this.handleOverlayClick}>
        <div class="pr-modal" role="dialog" aria-labelledby="pr-dialog-title">
          <div class="pr-header">
            <h2 class="pr-title" id="pr-dialog-title">创建 Pull Request</h2>
            <button
              class="pr-close"
              type="button"
              aria-label="关闭"
              @click=${this.handleClose}
            >
              ✕
            </button>
          </div>

          <div class="pr-body">
            ${this.error ? html`<div class="pr-error">${this.error}</div>` : nothing}

            <div class="pr-field">
              <label class="pr-checkbox-row">
                <input
                  type="checkbox"
                  class="pr-checkbox"
                  .checked=${this.autoGenerateDescription}
                  @change=${this.handleAutoDescChange}
                />
                <span class="pr-checkbox-label">自动生成描述</span>
              </label>
            </div>

            <div class="pr-field">
              <label class="pr-label required">标题</label>
              <input
                type="text"
                class="pr-input"
                placeholder="Pull Request 标题"
                .value=${this.prTitle}
                @input=${this.handleTitleChange}
                ?disabled=${this.loading || this.creating}
              />
            </div>

            <div class="pr-field">
              <label class="pr-label">描述</label>
              <textarea
                class="pr-textarea"
                placeholder="Pull Request 描述（可选）"
                .value=${this.prBody}
                @input=${this.handleBodyChange}
                ?disabled=${this.loading || this.creating}
              ></textarea>
            </div>

            <div class="pr-field">
              <label class="pr-label">目标分支</label>
              <select
                class="pr-select"
                .value=${this.prBaseBranch}
                @change=${this.handleBranchChange}
                ?disabled=${this.loading || this.creating}
              >
                ${this.branches.length === 0
                  ? html`<option value="">加载中...</option>`
                  : this.branches.map(
                      (branch) => html`
                        <option value=${branch.name} ?selected=${branch.name === this.prBaseBranch}>
                          ${branch.name}
                        </option>
                      `,
                    )}
              </select>
            </div>

            <div class="pr-field">
              <label class="pr-checkbox-row">
                <input
                  type="checkbox"
                  class="pr-checkbox"
                  .checked=${this.isDraft}
                  @change=${this.handleDraftChange}
                  ?disabled=${this.creating}
                />
                <span class="pr-checkbox-label">创建为 Draft PR</span>
              </label>
            </div>
          </div>

          <div class="pr-footer">
            <button
              class="pr-btn pr-btn-cancel"
              type="button"
              @click=${this.handleClose}
              ?disabled=${this.creating}
            >
              取消
            </button>
            <button
              class="pr-btn pr-btn-submit"
              type="button"
              @click=${this.handleSubmit}
              ?disabled=${this.loading || this.creating || !this.prTitle.trim()}
            >
              ${this.creating ? "创建中..." : "创建 PR"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "create-pr-dialog": CreatePRDialog;
  }
}

if (!customElements.get("create-pr-dialog")) {
  customElements.define("create-pr-dialog", CreatePRDialog);
}
