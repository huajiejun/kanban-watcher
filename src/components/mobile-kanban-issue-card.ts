import { LitElement, html, css, nothing } from "lit";
import type { RemoteIssue } from "../types/issue";

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
  `;

  issue: RemoteIssue = null!;
  statusColor = "";

  static properties = {
    issue: { type: Object },
    statusColor: { type: String },
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
    this.dispatchEvent(
      new CustomEvent("open-issue-detail", {
        detail: { issue: this.issue },
        bubbles: true,
        composed: true,
      })
    );
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
      </div>
    `;
  }
}

customElements.define("mobile-kanban-issue-card", MobileKanbanIssueCard);
