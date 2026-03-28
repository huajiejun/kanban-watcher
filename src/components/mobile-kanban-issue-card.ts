import { LitElement, html, css, nothing } from "lit";
import { updateIssue } from "../lib/issue-api";
import type { RemoteIssue, RemoteProjectStatus } from "../types/issue";

export class MobileKanbanIssueCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .issue-card {
      display: block;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(39, 39, 42, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-left: 3px solid var(--card-accent, #94a3b8);
      cursor: pointer;
      transition: background 0.15s;
      -webkit-tap-highlight-color: transparent;
    }

    .issue-card:active {
      background: rgba(39, 39, 42, 0.9);
    }

    .issue-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .issue-id {
      font-size: 0.7rem;
      color: var(--secondary-text-color, #94a3b8);
      font-weight: 500;
    }

    .issue-priority {
      font-size: 0.65rem;
      padding: 1px 6px;
      border-radius: 6px;
      color: var(--p-color, #94a3b8);
      background: color-mix(in srgb, var(--p-color, #94a3b8) 15%, transparent);
      font-weight: 600;
    }

    .issue-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #e5e7eb;
      line-height: 1.35;
    }

    .issue-desc {
      font-size: 0.76rem;
      color: var(--secondary-text-color, #94a3b8);
      margin-top: 4px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .issue-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 0.68rem;
      color: rgba(148, 163, 184, 0.6);
    }

    /* 展开后的操作区域 */
    .issue-expanded {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    }

    .expanded-desc {
      font-size: 0.78rem;
      color: var(--secondary-text-color, #94a3b8);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
    }

    .action-row {
      display: flex;
      gap: 6px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .action-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(148, 163, 184, 0.08);
      color: #cbd5e1;
      font-size: 0.72rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .action-btn:active {
      background: rgba(148, 163, 184, 0.16);
    }

    .action-btn.danger {
      border-color: rgba(248, 113, 113, 0.3);
      color: #f87171;
      background: rgba(248, 113, 113, 0.08);
    }

    /* 状态选择器 */
    .status-picker {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .status-option {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(148, 163, 184, 0.08);
      color: #cbd5e1;
      font-size: 0.72rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      -webkit-tap-highlight-color: transparent;
    }

    .status-option:active {
      background: rgba(148, 163, 184, 0.16);
    }

    .status-option-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;

  issue: RemoteIssue = null!;
  statusColor = "";
  statuses: RemoteProjectStatus[] = [];
  baseUrl = "";
  apiKey = "";
  expanded = false;
  showStatusPicker = false;
  moving = false;

  static properties = {
    issue: { type: Object },
    statusColor: { type: String },
    statuses: { type: Array },
    baseUrl: { type: String },
    apiKey: { type: String },
    expanded: { type: Boolean },
    showStatusPicker: { type: Boolean },
    moving: { type: Boolean },
  };

  private get priorityLabel(): string {
    const map: Record<string, string> = {
      urgent: "紧急",
      high: "高",
      medium: "中",
      low: "低",
    };
    return map[this.issue.priority ?? ""] ?? "";
  }

  private get priorityColor(): string {
    const map: Record<string, string> = {
      urgent: "#f87171",
      high: "#fb923c",
      medium: "#fbbf24",
      low: "#34d399",
    };
    return map[this.issue.priority ?? ""] ?? "#94a3b8";
  }

  private get descriptionPreview(): string {
    if (!this.issue.description) return "";
    return this.issue.description.length > 80
      ? this.issue.description.slice(0, 80) + "..."
      : this.issue.description;
  }

  private get timeAgo(): string {
    const now = Date.now();
    const updated = new Date(this.issue.updated_at).getTime();
    const diff = now - updated;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(this.issue.updated_at).toLocaleDateString("zh-CN");
  }

  private handleCardClick() {
    this.expanded = !this.expanded;
    this.showStatusPicker = false;
  }

  private async handleMoveStatus(newStatusId: string) {
    this.moving = true;
    try {
      await updateIssue(
        { baseUrl: this.baseUrl, apiKey: this.apiKey },
        this.issue.id,
        { status_id: newStatusId }
      );
      this.dispatchEvent(
        new CustomEvent("issue-updated", {
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      console.error("移动状态失败:", err);
    } finally {
      this.moving = false;
    }
  }

  protected render() {
    return html`
      <div
        class="issue-card"
        style="--card-accent: ${this.statusColor || "#94a3b8"}"
        @click=${this.handleCardClick}
      >
        <div class="issue-top">
          <span class="issue-id"
            >${this.issue.simple_id || `#${this.issue.issue_number}`}</span
          >
          ${this.priorityLabel
            ? html`<span
                class="issue-priority"
                style="--p-color: ${this.priorityColor}"
                >${this.priorityLabel}</span
              >`
            : nothing}
        </div>
        <div class="issue-title">${this.issue.title}</div>
        ${this.descriptionPreview
          ? html`<div class="issue-desc">${this.descriptionPreview}</div>`
          : nothing}
        <div class="issue-meta">
          <span>${this.timeAgo}</span>
        </div>

        ${this.expanded
          ? html`
              <div class="issue-expanded" @click=${(e: Event) => e.stopPropagation()}>
                ${this.issue.description
                  ? html`<div class="expanded-desc">
                      ${this.issue.description}
                    </div>`
                  : nothing}
                <div class="action-row">
                  <button
                    class="action-btn"
                    type="button"
                    @click=${() =>
                      (this.showStatusPicker = !this.showStatusPicker)}
                  >
                    ${this.moving ? "移动中..." : "移动状态"}
                  </button>
                </div>
                ${this.showStatusPicker
                  ? html`<div class="status-picker">
                      ${this.statuses.map(
                        (s) => html`
                          <button
                            class="status-option"
                            type="button"
                            @click=${() => this.handleMoveStatus(s.id)}
                          >
                            <span
                              class="status-option-dot"
                              style="background: ${s.color || "#94a3b8"}"
                            ></span>
                            ${s.name}
                          </button>
                        `
                      )}
                    </div>`
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define("mobile-kanban-issue-card", MobileKanbanIssueCard);
