import { LitElement, css, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { renderMessageMarkdown } from "../lib/render-message-markdown";

const AUTO_SCROLL_TOLERANCE_PX = 8;

export class WorkspacePreviewCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 0;
    }

    .workspace-preview-card {
      --workspace-preview-accent: color-mix(in srgb, var(--divider-color, #cbd5e1) 36%, transparent);
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 12px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 8px;
      border-radius: 16px;
      border: 1px solid var(--workspace-preview-accent);
      border-left-width: 3px;
      background: color-mix(
        in srgb,
        var(--ha-card-background, var(--card-background-color, #111827)) 90%,
        var(--secondary-background-color, #0f172a)
      );
      color: inherit;
      min-height: 0;
    }

    .workspace-preview-card.is-attention {
      --workspace-preview-accent: color-mix(in srgb, var(--error-color, #f87171) 58%, transparent);
      border-left-color: var(--error-color, #f87171);
    }

    .workspace-preview-card.is-running {
      --workspace-preview-accent: color-mix(in srgb, var(--success-color, #10b981) 58%, transparent);
      border-left-color: var(--success-color, #10b981);
    }

    .workspace-preview-card.is-idle {
      --workspace-preview-accent: color-mix(in srgb, var(--warning-color, #f59e0b) 58%, transparent);
      border-left-color: var(--warning-color, #f59e0b);
    }

    .workspace-preview-activate {
      width: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }

    .workspace-preview-title-banner {
      padding: 9px 10px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--workspace-preview-accent) 70%, transparent);
      background: color-mix(
        in srgb,
        var(--workspace-preview-accent) 18%,
        var(--primary-background-color, #0f172a)
      );
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
    }

    .workspace-preview-activate:hover .workspace-preview-title-banner,
    .workspace-preview-activate:focus-visible .workspace-preview-title-banner {
      border-color: color-mix(in srgb, var(--workspace-preview-accent) 88%, transparent);
      background: color-mix(
        in srgb,
        var(--workspace-preview-accent) 24%,
        var(--primary-background-color, #0f172a)
      );
      transform: translateY(-1px);
    }

    .workspace-preview-activate:focus-visible {
      outline: none;
    }

    .workspace-preview-title {
      font-size: 0.88rem;
      font-weight: 700;
      line-height: 1.3;
    }

    .workspace-preview-lines {
      display: grid;
      gap: 6px;
      min-height: 0;
      align-content: start;
      overflow-y: auto;
      padding-right: 4px;
    }

    .workspace-preview-message {
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--divider-color, #334155) 42%, transparent);
      background: color-mix(
        in srgb,
        var(--primary-background-color, #0f172a) 76%,
        var(--card-background-color, #111827)
      );
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      min-width: 0;
    }

    .workspace-preview-line {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.45;
      color: var(--secondary-text-color, #cbd5e1);
      overflow: visible;
      word-break: break-word;
    }

    .workspace-preview-line.is-empty {
      color: var(--secondary-text-color, #94a3b8);
    }

    .workspace-preview-markdown > :first-child {
      margin-top: 0;
    }

    .workspace-preview-markdown > :last-child {
      margin-bottom: 0;
    }

    .workspace-preview-markdown p,
    .workspace-preview-markdown ul,
    .workspace-preview-markdown ol {
      margin: 0;
    }

    .workspace-preview-markdown p + p,
    .workspace-preview-markdown p + ul,
    .workspace-preview-markdown ul + p,
    .workspace-preview-markdown ol + p,
    .workspace-preview-markdown ul + ul,
    .workspace-preview-markdown ol + ol {
      margin-top: 6px;
    }

    .workspace-preview-markdown ul,
    .workspace-preview-markdown ol {
      padding-left: 1.1rem;
    }

    .workspace-preview-markdown li + li {
      margin-top: 4px;
    }

    .workspace-preview-markdown h1,
    .workspace-preview-markdown h2,
    .workspace-preview-markdown h3,
    .workspace-preview-markdown h4,
    .workspace-preview-markdown h5,
    .workspace-preview-markdown h6 {
      margin: 0;
      font-size: 0.9em;
      line-height: 1.35;
    }

    .workspace-preview-markdown h1 + p,
    .workspace-preview-markdown h2 + p,
    .workspace-preview-markdown h3 + p,
    .workspace-preview-markdown h4 + p,
    .workspace-preview-markdown h5 + p,
    .workspace-preview-markdown h6 + p {
      margin-top: 6px;
    }

    .workspace-preview-markdown pre {
      margin: 0;
      padding: 8px;
      border-radius: 8px;
      overflow-x: auto;
      background: color-mix(in srgb, var(--primary-background-color, #0f172a) 82%, transparent);
    }

    .workspace-preview-markdown code {
      font-size: 0.92em;
    }
  `;

  static properties = {
    workspaceName: { attribute: false },
    statusAccentClass: { attribute: false },
    previewLines: { attribute: false },
  };

  workspaceName = "";
  statusAccentClass = "is-idle";
  previewLines: string[] = [];
  private shouldAutoScroll = true;

  protected render() {
    return html`
      <section class="workspace-preview-card ${this.statusAccentClass}">
        <button
          class="workspace-preview-activate"
          type="button"
          @click=${this.handleActivate}
        >
          <div class="workspace-preview-title-banner">
            <div class="workspace-preview-title">${this.workspaceName}</div>
          </div>
        </button>
        <div class="workspace-preview-lines" @scroll=${this.handleScroll}>
          ${this.previewLines.length > 0
            ? this.previewLines.map((line) => html`
                <div class="workspace-preview-message">
                  <div class="workspace-preview-line workspace-preview-markdown">
                    ${unsafeHTML(renderMessageMarkdown(line))}
                  </div>
                </div>
              `)
            : html`
                <div class="workspace-preview-message">
                  <p class="workspace-preview-line is-empty">暂无可预览文本消息</p>
                </div>
              `}
        </div>
      </section>
    `;
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has("previewLines") && this.shouldAutoScroll) {
      this.scrollPreviewLinesToBottom();
    }
  }

  private handleActivate = () => {
    this.dispatchEvent(new CustomEvent("preview-activate", {
      bubbles: true,
      composed: true,
    }));
  };

  private handleScroll = () => {
    const container = this.shadowRoot?.querySelector(".workspace-preview-lines") as HTMLDivElement | null;
    if (!container) {
      return;
    }
    const distanceToBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
    this.shouldAutoScroll = distanceToBottom <= AUTO_SCROLL_TOLERANCE_PX;
  };

  private scrollPreviewLinesToBottom() {
    const container = this.shadowRoot?.querySelector(".workspace-preview-lines") as HTMLDivElement | null;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-preview-card": WorkspacePreviewCard;
  }
}

if (!customElements.get("workspace-preview-card")) {
  customElements.define("workspace-preview-card", WorkspacePreviewCard);
}
