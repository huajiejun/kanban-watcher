import { LitElement, html, css, nothing } from "lit";
import type { KanbanColumn, RemoteProjectStatus } from "../types/issue";
import "./mobile-kanban-issue-card";

export class MobileKanbanColumn extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-width: calc(100vw - 48px);
      max-width: calc(100vw - 48px);
      scroll-snap-align: center;
      flex-shrink: 0;
    }

    .kanban-column {
      display: flex;
      flex-direction: column;
      height: 100%;
      border-radius: 14px;
      background: rgba(39, 39, 42, 0.8);
      border: 1px solid
        color-mix(in srgb, var(--divider-color, #cbd5e1) 18%, transparent);
      overflow: hidden;
    }

    .column-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }

    .column-color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .column-name {
      font-size: 0.88rem;
      font-weight: 700;
      color: #e5e7eb;
    }

    .column-count {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--secondary-text-color, #94a3b8);
      background: rgba(148, 163, 184, 0.1);
      padding: 1px 8px;
      border-radius: 10px;
    }

    .column-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
    }

    .column-body::-webkit-scrollbar {
      width: 3px;
    }

    .column-body::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.2);
      border-radius: 3px;
    }

    .column-empty {
      text-align: center;
      color: var(--secondary-text-color, #94a3b8);
      font-size: 0.8rem;
      padding: 32px 0;
    }
  `;

  column: KanbanColumn = {
    status: {
      id: "",
      project_id: "",
      name: "",
      color: "",
      sort_order: 0,
      hidden: false,
      created_at: "",
    },
    issues: [],
  };
  baseUrl = "";
  apiKey = "";
  statuses: RemoteProjectStatus[] = [];

  static properties = {
    column: { type: Object },
    statuses: { type: Array },
    baseUrl: { type: String },
    apiKey: { type: String },
  };

  protected render() {
    const { status, issues } = this.column;

    return html`
      <div class="kanban-column">
        <div class="column-header">
          <span
            class="column-color-dot"
            style="background: ${status.color || "#94a3b8"}"
          ></span>
          <span class="column-name">${status.name}</span>
          <span class="column-count">${issues.length}</span>
        </div>
        <div class="column-body">
          ${issues.length === 0
            ? html`<div class="column-empty">暂无任务</div>`
            : issues.map(
                (issue) =>
                  html`<mobile-kanban-issue-card
                    .issue=${issue}
                    .statusColor=${status.color}
                    .statuses=${this.statuses}
                    .baseUrl=${this.baseUrl}
                    .apiKey=${this.apiKey}
                  ></mobile-kanban-issue-card>`
              )}
        </div>
      </div>
    `;
  }
}

customElements.define("mobile-kanban-column", MobileKanbanColumn);
