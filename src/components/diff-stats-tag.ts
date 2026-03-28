import { LitElement, html, css, nothing } from "lit";
import type { DiffStats } from "../types";

/**
 * 差异文件统计标签组件
 * 显示格式: 3 files, +15/-5
 * 点击可触发 diff-details-request 事件
 */
export class DiffStatsTag extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--diff-stats-color, #94a3b8);
      padding: 2px 6px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--primary-background-color, #0f172a) 60%, transparent);
      cursor: pointer;
      transition: opacity 160ms ease;
    }

    :host(:hover) {
      opacity: 0.75;
    }

    .files-changed {
      font-weight: 500;
    }

    .lines-added {
      color: #22c55e;
    }

    .lines-removed {
      color: #ef4444;
    }

    :host([compact]) .container {
      gap: 2px;
    }
  `;

  static properties = {
    stats: { attribute: false },
    compact: { type: Boolean },
  };

  stats: DiffStats | undefined;
  compact = false;

  render() {
    if (!this.stats || this.stats.files_changed === 0) {
      return nothing;
    }

    const { files_changed, lines_added, lines_removed } = this.stats;
    const compactClass = this.compact ? "compact" : "";

    if (this.compact) {
      return html`
        <span class="container ${compactClass}" @click=${this.handleClick}>
          <span class="files-changed">${files_changed}</span>
          <span class="lines-added">+${lines_added}</span>
          <span class="lines-removed">-${lines_removed}</span>
        </span>
      `;
    }

    return html`
      <span class="container ${compactClass}" @click=${this.handleClick}>
        <span class="files-changed">${files_changed} files</span>
        <span class="lines-added">+${lines_added}</span>
        <span class="lines-removed">-${lines_removed}</span>
      </span>
    `;
  }

  private handleClick = (event: Event) => {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("diff-details-request", {
      bubbles: true,
      composed: true,
      detail: this.stats,
    }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "diff-stats-tag": DiffStatsTag;
  }
}

if (!customElements.get("diff-stats-tag")) {
  customElements.define("diff-stats-tag", DiffStatsTag);
}
