import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DiffStats } from "../types";

/**
 * 差异文件统计标签组件
 * 显示格式: 3 files, +15/-5
 */
@customElement("diff-stats-tag")
export class DiffStatsTag extends LitElement {
  @property({ type: Object, attribute: "stats" })
  stats: DiffStats | undefined = nothing;

  @property({ type: Boolean, attribute: "compact" })
  compact = boolean = false;

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--diff-stats-color, #666);
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--diff-stats-bg, #f5f5f5);
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

  render() {
    if (!this.stats || this.stats.files_changed === 0) {
      return nothing;
    }

    const { files_changed, lines_added, lines_removed } = this.stats;
    const compactClass = this.compact ? "compact" : "";

    if (this.compact) {
      return html`
        <span class="container ${compactClass}">
          <span class="files-changed">${files_changed}</span>
          <span class="lines-added">+${lines_added}</span>
          <span class="lines-removed">-${lines_removed}</span>
        </span>
      `;
    }

    return html`
      <span class="container ${compactClass}">
        <span class="files-changed">${files_changed} files</span>
        <span class="lines-added">+${lines_added}</span>
        <span class="lines-removed">-${lines_removed}</span>
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "diff-stats-tag": DiffStatsTag;
  }
}
