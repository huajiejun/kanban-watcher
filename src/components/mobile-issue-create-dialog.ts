import { LitElement, html, css, nothing } from "lit";
import { createIssue } from "../lib/issue-api";
import type { RemoteProjectStatus } from "../types/issue";

export class MobileIssueCreateDialog extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .dialog-sheet {
      width: 100%;
      max-width: 500px;
      max-height: 85vh;
      background: rgba(39, 39, 42, 0.95);
      border-radius: 16px 16px 0 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }

    .dialog-header h3 {
      margin: 0;
      font-size: 0.95rem;
      color: #e5e7eb;
      font-weight: 700;
    }

    .close-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      font-size: 1.1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    .dialog-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-label {
      font-size: 0.78rem;
      color: #94a3b8;
      font-weight: 500;
      display: block;
      margin-bottom: 4px;
    }

    .form-label .required {
      color: #f87171;
    }

    .form-input,
    .form-textarea,
    .form-select {
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(24, 24, 27, 0.8);
      color: #e5e7eb;
      font-size: 0.85rem;
      font-family: inherit;
      outline: none;
      -webkit-appearance: none;
      box-sizing: border-box;
    }

    .form-input:focus,
    .form-textarea:focus,
    .form-select:focus {
      border-color: rgba(56, 189, 248, 0.5);
    }

    .form-textarea {
      resize: vertical;
      min-height: 60px;
    }

    .form-select {
      cursor: pointer;
    }

    .priority-picker {
      display: flex;
      gap: 6px;
    }

    .priority-option {
      flex: 1;
      padding: 6px 0;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(148, 163, 184, 0.06);
      color: #94a3b8;
      font-size: 0.78rem;
      cursor: pointer;
      text-align: center;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.15s;
    }

    .priority-option.active {
      color: var(--opt-color, #94a3b8);
      border-color: var(--opt-color, #94a3b8);
      background: color-mix(in srgb, var(--opt-color, #94a3b8) 12%, transparent);
    }

    .dialog-footer {
      display: flex;
      gap: 10px;
      padding: 12px 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }

    .btn-cancel {
      flex: 1;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: transparent;
      color: #94a3b8;
      font-size: 0.88rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-submit {
      flex: 2;
      padding: 10px;
      border-radius: 10px;
      border: none;
      background: rgba(56, 189, 248, 0.85);
      color: #0f172a;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-submit:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `;

  statuses: RemoteProjectStatus[] = [];
  baseUrl = "";
  apiKey = "";
  projectId = "";
  visible = false;
  submitting = false;
  errorMessage = "";

  title = "";
  description = "";
  selectedStatusId = "";
  priority = "medium";

  static properties = {
    statuses: { type: Array },
    baseUrl: { type: String },
    apiKey: { type: String },
    projectId: { type: String },
    visible: { type: Boolean },
    submitting: { type: Boolean },
    errorMessage: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("open", this.handleOpen);
  }

  disconnectedCallback() {
    this.removeEventListener("open", this.handleOpen);
    super.disconnectedCallback();
  }

  private handleOpen = () => {
    this.visible = true;
    this.selectedStatusId =
      this.statuses.length > 0 ? this.statuses[0].id : "";
  };

  private close() {
    this.visible = false;
    this.title = "";
    this.description = "";
    this.priority = "medium";
  }

  private async handleSubmit() {
    if (!this.title.trim() || this.submitting) return;
    this.submitting = true;
    this.errorMessage = "";

    try {
      await createIssue(
        { baseUrl: this.baseUrl, apiKey: this.apiKey },
        {
          title: this.title.trim(),
          description: this.description.trim() || undefined,
          priority: this.priority,
          status_id: this.selectedStatusId || undefined,
          project_id: this.projectId,
        }
      );
      this.close();
      this.dispatchEvent(
        new CustomEvent("issue-created", {
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      console.error("创建任务失败:", err);
      const errorText = err instanceof Error ? err.message : String(err);
      if (errorText.includes("400") || errorText.includes("422")) {
        this.errorMessage = "创建失败，请检查必填项是否完整";
      } else if (errorText.includes("401") || errorText.includes("403")) {
        this.errorMessage = "权限不足，无法创建任务";
      } else if (errorText.includes("fetch") || errorText.includes("network")) {
        this.errorMessage = "请求失败，请检查网络连接";
      } else {
        this.errorMessage = "服务异常，请稍后重试";
      }
    } finally {
      this.submitting = false;
    }
  }

  protected render() {
    if (!this.visible) return nothing;

    const priorityOptions = [
      { key: "urgent", label: "紧急", color: "#f87171" },
      { key: "high", label: "高", color: "#fb923c" },
      { key: "medium", label: "中", color: "#fbbf24" },
      { key: "low", label: "低", color: "#34d399" },
    ] as const;

    return html`
      <div class="dialog-overlay" @click=${() => this.close()}>
        <div class="dialog-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <h3>新建任务</h3>
            <button
              class="close-btn"
              type="button"
              @click=${this.close}
            >
              ×
            </button>
          </div>
          <div class="dialog-body">
            <label class="form-label"
              >标题 <span class="required">*</span></label
            >
            <input
              class="form-input"
              type="text"
              placeholder="输入任务标题"
              .value=${this.title}
              @input=${(e: Event) =>
                (this.title = (e.target as HTMLInputElement).value)}
            />

            <label class="form-label">描述</label>
            <textarea
              class="form-textarea"
              placeholder="输入任务描述（可选）"
              rows="3"
              .value=${this.description}
              @input=${(e: Event) =>
                (this.description = (
                  e.target as HTMLTextAreaElement
                ).value)}
            ></textarea>

            ${this.statuses.length > 0
              ? html`
                  <label class="form-label">状态</label>
                  <select
                    class="form-select"
                    .value=${this.selectedStatusId}
                    @change=${(e: Event) =>
                      (this.selectedStatusId = (
                        e.target as HTMLSelectElement
                      ).value)}
                  >
                    ${this.statuses.map(
                      (s) =>
                        html`<option
                          value=${s.id}
                          ?selected=${s.id === this.selectedStatusId}
                        >
                          ${s.name}
                        </option>`
                    )}
                  </select>
                `
              : nothing}

            <label class="form-label">优先级</label>
            <div class="priority-picker">
              ${priorityOptions.map(
                (p) =>
                  html`<button
                    class="priority-option ${this.priority === p.key
                      ? "active"
                      : ""}"
                    type="button"
                    style="--opt-color: ${p.color}"
                    @click=${() => (this.priority = p.key)}
                  >
                    ${p.label}
                  </button>`
              )}
            </div>
          </div>
          <div class="dialog-footer">
            <button
              class="btn-cancel"
              type="button"
              @click=${this.close}
            >
              取消
            </button>
            <button
              class="btn-submit"
              type="button"
              ?disabled=${!this.title.trim() || this.submitting}
              @click=${this.handleSubmit}
            >
              ${this.submitting ? "创建中..." : "创建"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("mobile-issue-create-dialog", MobileIssueCreateDialog);
