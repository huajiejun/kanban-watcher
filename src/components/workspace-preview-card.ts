import { LitElement, css, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { renderMessageMarkdown } from "../lib/render-message-markdown";

const AUTO_SCROLL_TOLERANCE_PX = 8;
const PREVIEW_DEBUG_STORAGE_KEY = "kanban_watcher_preview_debug";
let previewCardInstanceSeed = 0;

function isPreviewDebugEnabled() {
  try {
    return window.localStorage.getItem(PREVIEW_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function debugPreviewCard(event: string, details: Record<string, unknown>) {
  if (!isPreviewDebugEnabled()) {
    return;
  }
  console.debug(`[PreviewCard] ${event}`, details);
}

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
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
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

    .workspace-preview-activate.is-full-bleed {
      flex: 1 1 auto;
      min-width: 0;
    }

    .workspace-preview-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 15px 15px 0 0;
      border-bottom: 1px solid color-mix(in srgb, var(--workspace-preview-accent) 72%, transparent);
      background: color-mix(
        in srgb,
        var(--workspace-preview-accent) 24%,
        var(--primary-background-color, #0f172a)
      );
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
      transition: background-color 160ms ease, transform 160ms ease;
    }

    .workspace-preview-header:hover,
    .workspace-preview-header:focus-within {
      background: color-mix(
        in srgb,
        var(--workspace-preview-accent) 30%,
        var(--primary-background-color, #0f172a)
      );
    }

    .workspace-preview-activate:focus-visible {
      outline: none;
    }

    .workspace-preview-title-banner {
      min-width: 0;
    }

    .workspace-preview-title {
      font-size: 0.88rem;
      font-weight: 700;
      line-height: 1.3;
      min-width: 0;
    }

    .workspace-preview-close {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: 1px solid color-mix(in srgb, var(--workspace-preview-accent) 78%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-background-color, #0f172a) 82%, transparent);
      color: var(--secondary-text-color, #e2e8f0);
      font: inherit;
      font-size: 0.95rem;
      line-height: 1;
      cursor: pointer;
    }

    .workspace-preview-close:hover,
    .workspace-preview-close:focus-visible {
      background: color-mix(in srgb, var(--workspace-preview-accent) 30%, var(--primary-background-color, #0f172a));
      border-color: color-mix(in srgb, var(--workspace-preview-accent) 92%, transparent);
    }

    .workspace-preview-close:focus-visible {
      outline: none;
    }

    .workspace-preview-menu-container {
      position: relative;
      flex: 0 0 auto;
    }

    .workspace-preview-menu-btn {
      width: 28px;
      height: 28px;
      border: 1px solid color-mix(in srgb, var(--workspace-preview-accent) 78%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-background-color, #0f172a) 82%, transparent);
      color: var(--secondary-text-color, #e2e8f0);
      font: inherit;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .workspace-preview-menu-btn:hover,
    .workspace-preview-menu-btn:focus-visible {
      background: color-mix(in srgb, var(--workspace-preview-accent) 30%, var(--primary-background-color, #0f172a));
      border-color: color-mix(in srgb, var(--workspace-preview-accent) 92%, transparent);
    }

    .workspace-preview-menu-btn:focus-visible {
      outline: none;
    }

    .workspace-preview-menu-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 160px;
      background: var(--primary-background-color, #1e293b);
      border: 1px solid color-mix(in srgb, var(--workspace-preview-accent) 60%, transparent);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 100;
      overflow: hidden;
      animation: menuFadeIn 0.12s ease-out forwards;
    }

    @keyframes menuFadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .workspace-preview-menu-item {
      width: 100%;
      padding: 10px 14px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #e2e8f0);
      font: inherit;
      font-size: 0.82rem;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .workspace-preview-menu-item:hover,
    .workspace-preview-menu-item:focus-visible {
      background: color-mix(in srgb, var(--workspace-preview-accent) 30%, transparent);
      color: var(--text-color, #f1f5f9);
    }

    .workspace-preview-menu-item:focus-visible {
      outline: none;
    }

    .workspace-preview-menu-item.is-danger {
      color: var(--error-color, #f87171);
    }

    .workspace-preview-menu-item.is-danger:hover,
    .workspace-preview-menu-item.is-danger:focus-visible {
      background: color-mix(in srgb, var(--error-color, #f87171) 15%, transparent);
    }

    .workspace-preview-menu-divider {
      height: 1px;
      background: color-mix(in srgb, var(--workspace-preview-accent) 50%, transparent);
      margin: 4px 0;
    }

    .workspace-preview-lines {
      display: grid;
      gap: 6px;
      min-height: 0;
      align-content: start;
      overflow-y: auto;
      padding: 12px;
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
    showMenu: { type: Boolean },
  };

  workspaceName = "";
  statusAccentClass = "is-idle";
  previewLines: string[] = [];
  showMenu = false;
  private shouldAutoScroll = true;
  private readonly debugInstanceId = ++previewCardInstanceSeed;

  connectedCallback() {
    super.connectedCallback();
    debugPreviewCard("connected", {
      instanceId: this.debugInstanceId,
      workspaceName: this.workspaceName,
    });
  }

  disconnectedCallback() {
    debugPreviewCard("disconnected", {
      instanceId: this.debugInstanceId,
      workspaceName: this.workspaceName,
    });
    document.removeEventListener("click", this.handleDocumentClick);
    super.disconnectedCallback();
  }

  protected render() {
    return html`
      <section class="workspace-preview-card ${this.statusAccentClass}">
        <div class="workspace-preview-header">
          <div class="workspace-preview-menu-container">
            <button
              class="workspace-preview-menu-btn"
              type="button"
              aria-label="操作菜单"
              @click=${this.handleMenuToggle}
            >
              ⋮
            </button>
            ${this.showMenu ? this.renderMenu() : nothing}
          </div>
          <button
            class="workspace-preview-activate is-full-bleed"
            type="button"
            @click=${this.handleActivate}
          >
            <div class="workspace-preview-title-banner">
              <div class="workspace-preview-title">${this.workspaceName}</div>
            </div>
          </button>
          <button
            class="workspace-preview-close"
            type="button"
            aria-label="关闭工作区"
            @click=${this.handleClose}
          >
            ×
          </button>
        </div>
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
    const previousPreviewLines = changedProperties.get("previewLines") as string[] | undefined;
    if (
      changedProperties.has("previewLines") &&
      this.shouldAutoScroll &&
      !this.arePreviewLinesEqual(previousPreviewLines, this.previewLines)
    ) {
      debugPreviewCard("auto-scroll", {
        instanceId: this.debugInstanceId,
        workspaceName: this.workspaceName,
        previousPreviewLines,
        nextPreviewLines: this.previewLines,
      });
      this.scrollPreviewLinesToBottom();
    }
  }

  private handleActivate = () => {
    this.dispatchEvent(new CustomEvent("preview-activate", {
      bubbles: true,
      composed: true,
    }));
  };

  private handleClose = (event: Event) => {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("preview-close", {
      bubbles: true,
      composed: true,
    }));
  };

  private handleMenuToggle = (event: Event) => {
    event.stopPropagation();
    this.showMenu = !this.showMenu;
    if (this.showMenu) {
      // 点击菜单按钮时，添加文档级点击监听以关闭菜单
      setTimeout(() => {
        document.addEventListener("click", this.handleDocumentClick);
      }, 0);
    }
  };

  private handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as Node;
    const menuContainer = this.shadowRoot?.querySelector(".workspace-preview-menu-container");
    if (menuContainer && !menuContainer.contains(target)) {
      this.showMenu = false;
      document.removeEventListener("click", this.handleDocumentClick);
    }
  };

  private renderMenu() {
    return html`
      <div class="workspace-preview-menu-dropdown" role="menu">
        <button
          class="workspace-preview-menu-item"
          role="menuitem"
          @click=${(e: Event) => this.handleMenuItemClick(e, "create-pr")}
        >
          <span>🔀</span>
          <span>提交 Pull Request</span>
        </button>
        <button
          class="workspace-preview-menu-item"
          role="menuitem"
          @click=${(e: Event) => this.handleMenuItemClick(e, "open-branch")}
        >
          <span>🌿</span>
          <span>打开分支</span>
        </button>
        <div class="workspace-preview-menu-divider"></div>
        <button
          class="workspace-preview-menu-item is-danger"
          role="menuitem"
          @click=${(e: Event) => this.handleMenuItemClick(e, "delete")}
        >
          <span>🗑️</span>
          <span>删除工作区</span>
        </button>
      </div>
    `;
  }

  private handleMenuItemClick = (event: Event, action: string) => {
    event.stopPropagation();
    this.showMenu = false;
    document.removeEventListener("click", this.handleDocumentClick);
    this.dispatchEvent(new CustomEvent("menu-action", {
      detail: { action },
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
    debugPreviewCard("scroll-state", {
      instanceId: this.debugInstanceId,
      workspaceName: this.workspaceName,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      distanceToBottom,
      shouldAutoScroll: this.shouldAutoScroll,
    });
  };

  private scrollPreviewLinesToBottom() {
    const container = this.shadowRoot?.querySelector(".workspace-preview-lines") as HTMLDivElement | null;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }

  private arePreviewLinesEqual(previousLines: string[] | undefined, nextLines: string[]) {
    if (previousLines === nextLines) {
      return true;
    }
    if (!previousLines || previousLines.length !== nextLines.length) {
      return false;
    }

    return previousLines.every((line, index) => line === nextLines[index]);
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
