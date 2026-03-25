import { css } from "lit";

export const workspaceSectionListStyles = css`
  .section {
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in srgb, var(--secondary-background-color, #111827) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 65%, transparent);
  }

  .section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 12px 14px;
    font: inherit;
    text-align: left;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .section-count {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.85rem;
  }

  .chevron {
    color: var(--secondary-text-color, #94a3b8);
    transition: transform 160ms ease;
  }

  .section[collapsed] .chevron {
    transform: rotate(-90deg);
  }

  .section-body {
    display: grid;
    gap: 8px;
    padding: 0 10px 10px;
  }

  .task-card {
    --task-card-accent: color-mix(in srgb, var(--divider-color, #cbd5e1) 32%, transparent);
    display: block;
    width: 100%;
    padding: 9px 12px;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--ha-card-background, var(--card-background-color, #111827)) 82%,
      var(--secondary-background-color, #0f172a)
    );
    border: 1px solid var(--task-card-accent);
    border-left-width: 3px;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .task-card[data-selected="true"] {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-color, #f59e0b) 55%, transparent);
  }

  .task-card.is-attention {
    --task-card-accent: color-mix(in srgb, var(--error-color, #f87171) 58%, transparent);
    border-left-color: var(--error-color, #f87171);
  }

  .task-card.is-running {
    --task-card-accent: color-mix(in srgb, var(--success-color, #10b981) 58%, transparent);
    border-left-color: var(--success-color, #10b981);
  }

  .task-card.is-idle {
    --task-card-accent: color-mix(in srgb, var(--warning-color, #f59e0b) 58%, transparent);
    border-left-color: var(--warning-color, #f59e0b);
  }

  .workspace-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .tone-brand {
    color: var(--primary-color, #f59e0b);
  }

  .tone-error {
    color: var(--error-color, #f87171);
  }

  .tone-success {
    color: var(--success-color, #34d399);
  }

  .tone-merged {
    color: #a78bfa;
  }

  .tone-muted {
    color: var(--secondary-text-color, #94a3b8);
  }

  .file-count {
    color: var(--secondary-text-color, #94a3b8);
  }

  .meta-files {
    justify-self: end;
    white-space: nowrap;
  }

  .lines-added {
    color: #34d399;
  }

  .lines-removed {
    color: #f87171;
  }

  .empty-state {
    padding: 22px 12px;
    border-radius: 14px;
    text-align: center;
    color: var(--secondary-text-color, #94a3b8);
    background: color-mix(in srgb, var(--secondary-background-color, #111827) 72%, transparent);
    border: 1px dashed color-mix(in srgb, var(--divider-color, #cbd5e1) 70%, transparent);
  }
`;

export const workspaceHomeStyles = css`
  :host {
    --workspace-home-panel-height: calc(100vh - 72px);
    --workspace-home-pane-height: calc(var(--workspace-home-panel-height) + 12px);
    display: block;
    min-height: 100vh;
    padding: 32px 24px 40px;
    color: #e5e7eb;
  }

  .workspace-home-shell {
    display: grid;
    gap: 20px;
    width: 100%;
  }

  .workspace-home-hero {
    display: grid;
    gap: 8px;
  }

  .workspace-home-eyebrow {
    font-size: 0.76rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #f59e0b;
    font-weight: 700;
  }

  .workspace-home-hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.05;
  }

  .workspace-home-hero p {
    margin: 0;
    max-width: 56rem;
    color: #94a3b8;
    line-height: 1.6;
  }

  .workspace-home-layout {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    min-height: var(--workspace-home-pane-height);
  }

  .workspace-home-layout[data-sidebar-collapsed="true"] {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-home-layout[data-sidebar-collapsed="false"] {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-home-sidebar,
  .workspace-home-pane-grid,
  .workspace-home-placeholder {
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.72);
    box-shadow: 0 20px 48px rgba(2, 6, 23, 0.32);
    backdrop-filter: blur(14px);
  }

  .workspace-home-sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: min(320px, calc(100vw - 48px));
    padding: 14px;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: var(--workspace-home-panel-height);
    min-height: var(--workspace-home-panel-height);
    overflow: hidden;
    transition: transform 180ms ease, opacity 180ms ease;
  }

  .workspace-home-sidebar[data-collapsed="true"] {
    transform: translateX(calc(-100% - 16px));
    opacity: 0;
    pointer-events: none;
  }

  .workspace-home-sidebar[data-collapsed="false"] {
    transform: translateX(0);
    opacity: 1;
  }

  .workspace-home-sidebar-content {
    min-height: 0;
    overflow-y: auto;
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .workspace-home-sidebar-toggle {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 30;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: auto;
    min-height: 36px;
    padding: 0;
    border-radius: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    line-height: 1;
    cursor: pointer;
  }

  .workspace-home-sidebar-backdrop {
    position: absolute;
    inset: 0;
    z-index: 10;
    border: 0;
    background: rgba(15, 23, 42, 0.22);
    cursor: pointer;
  }

  .task-card.is-compact {
    display: block;
    padding: 7px 9px;
  }

  .task-card.is-expanded {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
  }

  .task-card.is-compact .workspace-name {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 0.8rem;
    line-height: 1.15;
  }

  .task-card.is-expanded .workspace-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
    line-height: 1.2;
  }

  .task-meta {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.82rem;
    line-height: 1.2;
  }

  .meta-status,
  .meta-files {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .relative-time {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .status-icon {
    font-weight: 700;
    line-height: 1;
  }

  .workspace-home-pane-grid {
    height: var(--workspace-home-pane-height);
    min-height: var(--workspace-home-pane-height);
    padding: 14px;
    display: grid;
    grid-template-columns: repeat(var(--workspace-pane-columns, 1), minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    align-items: stretch;
    gap: 12px;
    overflow: hidden;
  }

  .workspace-home-pane-focus-layout {
    height: var(--workspace-home-pane-height);
    min-height: var(--workspace-home-pane-height);
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 520px);
    gap: 12px;
    overflow: hidden;
  }

  .workspace-home-pane-main,
  .workspace-home-pane-preview-rail {
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.72);
    box-shadow: 0 20px 48px rgba(2, 6, 23, 0.32);
    backdrop-filter: blur(14px);
  }

  .workspace-home-pane-main {
    padding: 14px;
    min-width: 0;
    overflow: hidden;
  }

  .workspace-home-pane-main workspace-conversation-pane {
    --workspace-pane-font-size: 0.92rem;
  }

  .workspace-home-pane-preview-rail {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .workspace-home-pane-preview-rail workspace-preview-card {
    flex: 1 1 0;
    min-height: 0;
  }

  .workspace-home-placeholder {
    padding: 24px;
  }

  @media (max-width: 768px) {
    :host {
      padding: 20px 14px 28px;
    }

    .workspace-home-layout {
      grid-template-columns: 1fr;
    }
  }

`;

export const cardStyles = css`
  :host {
    display: block;
    height: 100%;
    min-height: 0;
    font-size: var(--workspace-pane-font-size, 1rem);
  }

  /* 响应式字体大小变量 */
  :host {
    --font-size-base: 1rem;
    --font-size-sm: 0.85rem;
    --font-size-xs: 0.75rem;
  }

  /* 平板端 (768px - 1024px) */
  @media (max-width: 1024px) {
    :host {
      --font-size-base: 0.95rem;
      --font-size-sm: 0.82rem;
      --font-size-xs: 0.72rem;
    }
  }

  /* 手机端 (640px) */
  @media (max-width: 640px) {
    :host {
      --font-size-base: 0.88rem;
      --font-size-sm: 0.78rem;
      --font-size-xs: 0.7rem;
    }
  }

  ha-card {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--warning-color, #f59e0b) 12%, transparent), transparent 25%),
      var(--ha-card-background, var(--card-background-color, #111827));
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 70%, transparent);
    border-radius: 20px;
    box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0, 0, 0, 0.12));
    color: var(--primary-text-color);
    padding: 14px;
  }

  .board {
    display: grid;
    gap: 12px;
  }

  .section {
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in srgb, var(--secondary-background-color, #111827) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 65%, transparent);
  }

  .section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 12px 14px;
    font: inherit;
    text-align: left;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .section-count {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.85rem;
  }

  .chevron {
    color: var(--secondary-text-color, #94a3b8);
    transition: transform 160ms ease;
  }

  .section[collapsed] .chevron {
    transform: rotate(-90deg);
  }

  .section-body {
    display: grid;
    gap: 8px;
    padding: 0 10px 10px;
  }

  .task-card {
    --task-card-accent: color-mix(in srgb, var(--divider-color, #cbd5e1) 32%, transparent);
    display: block;
    width: 100%;
    padding: 9px 12px;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--ha-card-background, var(--card-background-color, #111827)) 82%,
      var(--secondary-background-color, #0f172a)
    );
    border: 1px solid var(--task-card-accent);
    border-left-width: 3px;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .task-card.is-attention {
    --task-card-accent: color-mix(in srgb, var(--error-color, #f87171) 58%, transparent);
    border-left-color: var(--error-color, #f87171);
  }

  .task-card.is-running {
    --task-card-accent: color-mix(in srgb, var(--success-color, #10b981) 58%, transparent);
    border-left-color: var(--success-color, #10b981);
  }

  .task-card.is-idle {
    --task-card-accent: color-mix(in srgb, var(--warning-color, #f59e0b) 58%, transparent);
    border-left-color: var(--warning-color, #f59e0b);
  }

  .workspace-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .tone-brand {
    color: var(--primary-color, #f59e0b);
  }

  .tone-error {
    color: var(--error-color, #f87171);
  }

  .tone-success {
    color: var(--success-color, #34d399);
  }

  .tone-merged {
    color: #a78bfa;
  }

  .tone-muted {
    color: var(--secondary-text-color, #94a3b8);
  }

  .file-count {
    color: var(--secondary-text-color, #94a3b8);
  }

  .meta-files {
    justify-self: end;
    white-space: nowrap;
  }

  .lines-added {
    color: #34d399;
  }

  .lines-removed {
    color: #f87171;
  }

  .empty-state {
    padding: 22px 12px;
    border-radius: 14px;
    text-align: center;
    color: var(--secondary-text-color, #94a3b8);
    background: color-mix(in srgb, var(--secondary-background-color, #111827) 72%, transparent);
    border: 1px dashed color-mix(in srgb, var(--divider-color, #cbd5e1) 70%, transparent);
  }

  .dialog-shell {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 18px;
  }

  .dialog-overlay {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(15, 23, 42, 0.52);
    cursor: pointer;
  }

  .workspace-dialog {
    position: relative;
    z-index: 1;
    width: min(900px, calc(100vw - 24px));
    height: min(88vh, 900px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 16px;
    border-radius: 22px;
    background: var(
      --card-background-color,
      var(--ha-card-background, var(--secondary-background-color, #1f2937))
    );
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 72%, transparent);
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
    color: var(--primary-text-color, #e5e7eb);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .dialog-heading {
    min-width: 0;
  }

  .dialog-title {
    margin: 0;
    font-size: 1.08em;
    line-height: 1.2;
  }

  .dialog-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .dialog-messages {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
  }

  .dialog-panel-title {
    font-size: 0.9em;
    font-weight: 700;
    color: var(--secondary-text-color, #64748b);
  }

  .workspace-pane-shell {
    --workspace-pane-accent: color-mix(in srgb, var(--divider-color, #cbd5e1) 36%, transparent);
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--workspace-pane-accent);
    border-left-width: 3px;
    background: color-mix(
      in srgb,
      var(--ha-card-background, var(--card-background-color, #111827)) 90%,
      var(--secondary-background-color, #0f172a)
    );
    box-sizing: border-box;
  }

  .workspace-pane-shell.is-attention {
    --workspace-pane-accent: color-mix(in srgb, var(--error-color, #f87171) 58%, transparent);
    border-left-color: var(--error-color, #f87171);
  }

  .workspace-pane-shell.is-running {
    --workspace-pane-accent: color-mix(in srgb, var(--success-color, #10b981) 58%, transparent);
    border-left-color: var(--success-color, #10b981);
  }

  .workspace-pane-shell.is-idle {
    --workspace-pane-accent: color-mix(in srgb, var(--warning-color, #f59e0b) 58%, transparent);
    border-left-color: var(--warning-color, #f59e0b);
  }

  .message-list {
    min-height: 0;
    display: grid;
    gap: 8px;
    overflow-y: auto;
    padding: 6px 2px 6px 0;
  }

  .message-row {
    width: 100%;
  }

  .message-tool {
    display: grid;
    gap: 6px;
  }

  .message-tool-button {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 22%, transparent);
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 42%, transparent);
    color: color-mix(in srgb, var(--primary-text-color) 60%, var(--secondary-text-color, #94a3b8));
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .message-tool-button.is-running,
  .message-tool-button.is-success,
  .message-tool-button.is-idle {
    opacity: 0.88;
  }

  .message-tool-button.is-pending {
    border-color: color-mix(in srgb, var(--warning-color, #fbbf24) 40%, transparent);
    background: color-mix(in srgb, var(--warning-color, #fef3c7) 8%, transparent);
    color: color-mix(in srgb, var(--warning-color, #92400e) 85%, var(--secondary-text-color, #78716c));
  }

  .message-tool-button.is-error {
    border-color: color-mix(in srgb, var(--error-color, #f87171) 40%, transparent);
    background: color-mix(in srgb, var(--error-color, #fee2e2) 8%, transparent);
    color: color-mix(in srgb, var(--error-color, #991b1b) 85%, var(--secondary-text-color, #78716c));
  }

  .message-tool-button.is-denied {
    border-color: color-mix(in srgb, var(--error-color, #d1d5db) 25%, transparent);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 20%, transparent);
  }

  .message-tool-icon {
    width: 1.6rem;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.82rem;
    line-height: 1;
    white-space: nowrap;
    opacity: 0.85;
  }

  .message-tool-summary {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
  }

  .message-tool-name {
    color: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    flex: none;
  }

  .message-tool-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.78rem;
  }

  .message-tool-status {
    justify-self: end;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .message-tool-detail {
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 58%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e2e8f0) 20%, transparent);
    color: color-mix(in srgb, var(--primary-text-color) 78%, var(--secondary-text-color, #64748b));
    word-break: break-word;
  }

  .message-tool-detail p,
  .message-tool-detail ul {
    margin: 0;
  }

  .message-tool-detail p + p,
  .message-tool-detail p + ul,
  .message-tool-detail ul + p,
  .message-tool-detail ul + ul {
    margin-top: 6px;
  }

  .message-tool-group-item + .message-tool-group-item {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--divider-color, #e2e8f0) 18%, transparent);
  }

  .message-tool-group-item-summary {
    margin-bottom: 4px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.78rem;
    font-weight: 500;
    word-break: break-word;
  }

  .message-tool-detail pre {
    margin: 6px 0 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--divider-color, #e2e8f0) 14%, transparent);
    overflow-x: auto;
  }

  .message-tool-command {
    margin-bottom: 6px;
    color: var(--secondary-text-color, #94a3b8);
    font-family:
      ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.76rem;
    white-space: nowrap;
    overflow-x: auto;
  }

  .file-change {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--divider-color, #e2e8f0) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e2e8f0) 18%, transparent);
  }

  .file-change-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .file-change-action {
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary-color, #3b82f6) 14%, transparent);
    color: var(--primary-color, #3b82f6);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .file-change-lines {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.74rem;
  }

  .file-change-new-path {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.74rem;
    font-family:
      ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
  }

  .file-change-diff,
  .file-change-code {
    margin: 0;
    padding: 8px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--divider-color, #e2e8f0) 10%, transparent);
    color: var(--primary-text-color, #1e293b);
    font-family:
      ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.74rem;
    line-height: 1.5;
    overflow-x: auto;
  }

  /* Diff line styles - GitHub-like */
  .diff-line {
    display: flex;
    align-items: flex-start;
    min-height: 1.5em;
    line-height: 1.5;
  }

  .diff-line .diff-num {
    flex: none;
    width: 3em;
    padding-right: 8px;
    color: var(--secondary-text-color, #94a3b8);
    text-align: right;
    user-select: none;
    opacity: 0.7;
    font-size: 0.7rem;
  }

  .diff-line .diff-sign {
    flex: none;
    width: 1em;
    text-align: center;
    font-weight: 600;
  }

  .diff-line .diff-content {
    flex: 1;
    min-width: 0;
    white-space: pre;
    overflow-x: auto;
  }

  .diff-header {
    color: var(--secondary-text-color, #64748b);
    background: color-mix(in srgb, var(--divider-color, #e2e8f0) 20%, transparent);
    padding: 4px 8px;
    margin: 4px 0;
    border-radius: 4px;
  }

  .diff-header .diff-content {
    font-size: 0.72rem;
  }

  .diff-add {
    background: color-mix(in srgb, #22c55e 10%, transparent);
  }

  .diff-add .diff-sign {
    color: #16a34a;
  }

  .diff-add .diff-content {
    color: var(--primary-text-color, #1e293b);
  }

  .diff-remove {
    background: color-mix(in srgb, #ef4444 10%, transparent);
  }

  .diff-remove .diff-sign {
    color: #dc2626;
  }

  .diff-remove .diff-content {
    color: var(--primary-text-color, #1e293b);
  }

  .diff-context {
    background: transparent;
  }

  .diff-context .diff-sign {
    color: var(--secondary-text-color, #94a3b8);
  }

  /* Code line styles */
  .code-line {
    display: flex;
    align-items: flex-start;
    min-height: 1.5em;
    line-height: 1.5;
  }

  .code-line .line-num {
    flex: none;
    width: 3em;
    padding-right: 8px;
    color: var(--secondary-text-color, #94a3b8);
    text-align: right;
    user-select: none;
    opacity: 0.7;
    font-size: 0.7rem;
  }

  .code-line .line-content {
    flex: 1;
    min-width: 0;
    white-space: pre;
    overflow-x: auto;
  }

  .file-change + .file-change {
    margin-top: 10px;
  }

  .message-bubble {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border-radius: 10px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 72%, transparent);
    color: inherit;
    text-align: left;
  }

  .message-bubble p,
  .message-bubble ul {
    margin: 0;
  }

  .message-bubble p + p,
  .message-bubble p + ul,
  .message-bubble ul + p,
  .message-bubble ul + ul {
    margin-top: 6px;
  }

  .message-bubble ul {
    padding-left: 18px;
  }

  .message-bubble li + li {
    margin-top: 4px;
  }

  .message-bubble h1,
  .message-bubble h2,
  .message-bubble h3,
  .message-bubble h4,
  .message-bubble h5,
  .message-bubble h6 {
    margin: 0 0 8px 0;
    font-weight: 700;
    line-height: 1.3;
  }

  .message-bubble h1 { font-size: 1.25em; }
  .message-bubble h2 { font-size: 1.18em; }
  .message-bubble h3 { font-size: 1.1em; }
  .message-bubble h4 { font-size: 1.05em; }
  .message-bubble h5 { font-size: 1em; }
  .message-bubble h6 { font-size: 0.95em; }

  .message-bubble pre {
    margin: 8px 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--divider-color, #cbd5e1) 28%, transparent);
    overflow-x: auto;
  }

  .message-bubble pre code {
    padding: 0;
    background: transparent;
    font-size: 0.88em;
    line-height: 1.5;
  }

  /* Highlight.js syntax highlighting colors */
  .message-bubble pre .hljs-keyword,
  .message-bubble pre .hljs-selector-tag,
  .message-bubble pre .hljs-built_in,
  .message-bubble pre .hljs-name,
  .message-bubble pre .hljs-tag {
    color: #a626a4;
  }

  .message-bubble pre .hljs-string,
  .message-bubble pre .hljs-title,
  .message-bubble pre .hljs-section,
  .message-bubble pre .hljs-attribute,
  .message-bubble pre .hljs-literal,
  .message-bubble pre .hljs-template-tag,
  .message-bubble pre .hljs-template-variable,
  .message-bubble pre .hljs-type {
    color: #50a14f;
  }

  .message-bubble pre .hljs-comment,
  .message-bubble pre .hljs-deletion {
    color: #a0a1a7;
    font-style: italic;
  }

  .message-bubble pre .hljs-number,
  .message-bubble pre .hljs-regexp,
  .message-bubble pre .hljs-addition,
  .message-bubble pre .hljs-meta {
    color: #986801;
  }

  .message-bubble pre .hljs-function {
    color: #4078f2;
  }

  .message-bubble pre .hljs-variable,
  .message-bubble pre .hljs-params {
    color: #e45649;
  }

  .message-bubble pre .hljs-symbol,
  .message-bubble pre .hljs-bullet,
  .message-bubble pre .hljs-link {
    color: #0184bc;
  }

  .message-bubble code {
    font-family:
      ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.92em;
    padding: 0.08em 0.35em;
    border-radius: 6px;
    background: color-mix(in srgb, var(--divider-color, #cbd5e1) 36%, transparent);
  }

  .message-bubble.is-user {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary-color, #f59e0b) 24%, transparent);
  }

  .message-bubble.is-ai {
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 72%, transparent);
  }

  .message-bubble.is-smooth-reveal {
    animation: message-smooth-reveal 220ms ease-out;
    transform-origin: left top;
  }

  @keyframes message-smooth-reveal {
    0% {
      opacity: 0;
      transform: translateY(4px) scale(0.985);
      filter: saturate(0.92);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: saturate(1);
    }
  }

  /* 快捷按钮区域 */
  .quick-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0;
  }

  .quick-button {
    padding: 5px 10px;
    border-radius: 8px;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 120ms ease, opacity 120ms ease;
  }

  .quick-button:active {
    transform: scale(0.96);
  }

  .quick-button.is-static {
    border: 0;
    background: var(--primary-color, #f59e0b);
    color: #ffffff;
  }

  .quick-button.is-dynamic {
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: transparent;
    color: inherit;
  }

  .quick-button.is-dynamic:hover {
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 72%, transparent);
  }

  /* 从消息中提取的选项按钮 */
  .quick-button.is-extracted {
    border: 1px solid color-mix(in srgb, var(--primary-color, #f59e0b) 50%, transparent);
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 12%, transparent);
    color: var(--primary-text-color, inherit);
  }

  .quick-button.is-extracted:hover {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 24%, transparent);
  }

  /* LLM 语义联想推荐的按钮 */
  .quick-button.is-suggested {
    border: 1px dashed color-mix(in srgb, var(--accent-color, #3b82f6) 60%, transparent);
    background: color-mix(in srgb, var(--accent-color, #3b82f6) 8%, transparent);
    color: var(--secondary-text-color, inherit);
  }

  .quick-button.is-suggested:hover {
    background: color-mix(in srgb, var(--accent-color, #3b82f6) 18%, transparent);
    border-style: solid;
  }

  /* 推荐按钮包装器 */
  .quick-button-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  /* 信息图标按钮 */
  .quick-button-info {
    padding: 2px 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.75rem;
    opacity: 0.6;
    transition: opacity 150ms ease;
    border-radius: 4px;
  }

  .quick-button-info:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--accent-color, #3b82f6) 15%, transparent);
  }

  /* 理由提示框 */
  .quick-button-reason {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    min-width: 180px;
    max-width: 280px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--primary-background-color, #1f2937);
    color: var(--primary-text-color, #f9fafb);
    font-size: 0.8rem;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    word-wrap: break-word;
  }

  .quick-button-reason.is-visible {
    display: block;
  }

  .quick-button-reason::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 16px;
    border: 6px solid transparent;
    border-top-color: var(--primary-background-color, #1f2937);
  }

  .dialog-composer {
    display: grid;
    gap: 8px;
  }

  .queue-list {
    display: grid;
    gap: 6px;
  }

  .queue-item {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--secondary-background-color, #1e293b) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 60%, transparent);
  }

  .queue-index {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.76rem;
    line-height: 1.2;
  }

  .queue-content {
    line-height: 1.4;
    word-break: break-word;
  }

  .queue-banner {
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary-color, #f59e0b) 28%, transparent);
    color: inherit;
    font-size: 0.84em;
    line-height: 1.4;
  }

  .message-input {
    width: 100%;
    min-height: 44px;
    max-height: 88px;
    resize: none;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, #111827) 92%, transparent);
    color: inherit;
    font: inherit;
    line-height: 1.4;
    box-sizing: border-box;
  }

  .dialog-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dialog-action {
    flex: 1 1 160px;
    min-height: 36px;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
    padding: 0 12px;
  }

  .dialog-action-primary {
    border: 0;
    background: var(--primary-color, #f59e0b);
    color: #ffffff;
    font-weight: 700;
  }

  .dialog-action-primary,
  .dialog-action-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .dialog-action-secondary {
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: transparent;
    color: inherit;
    font-weight: 600;
  }

  .action-spinner {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
    animation: spinner-rotate 900ms linear infinite;
    flex: none;
  }

  .dialog-feedback {
    min-height: 1.25rem;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .dialog-feedback.is-empty {
    visibility: hidden;
  }

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    /* 卡片列表样式 */
    .section-title {
      font-size: 0.9rem;
    }

    .section-count {
      font-size: 0.78rem;
    }

    .workspace-name {
      font-size: 0.88rem;
    }

    .message-tool-button {
      padding: 6px 8px;
      gap: 6px;
    }

    .message-tool-icon {
      width: 1.4rem;
      font-size: 0.8rem;
    }

    .message-tool-summary {
      gap: 4px;
    }

    .message-tool-name {
      font-size: 0.8rem;
    }

    .message-tool-text,
    .message-tool-status {
      font-size: 0.72rem;
    }

    .message-tool-detail {
      padding: 8px;
    }

    .task-meta {
      grid-template-columns: 1fr;
      gap: 6px;
      font-size: 0.75rem;
    }

    .meta-files {
      justify-self: start;
    }

    /* 弹窗样式 */
    .dialog-shell {
      padding: 8px;
      align-items: flex-end;
    }

    .workspace-dialog {
      width: 100%;
      max-width: 100%;
      height: min(85vh, 900px);
      padding: 10px;
      border-radius: 18px 18px 0 0;
      box-sizing: border-box;
    }

    .dialog-header {
      gap: 8px;
    }

    .dialog-title {
      font-size: 0.92rem;
    }

    .dialog-close {
      width: 26px;
      height: 26px;
    }

    .dialog-panel-title {
      font-size: 0.8rem;
    }

    .message-list {
      gap: 6px;
    }

    .message-bubble {
      padding: 5px 7px;
      font-size: 0.82rem;
      line-height: 1.3;
    }

    .message-bubble pre {
      padding: 6px 8px;
      font-size: 0.85em;
    }

    .message-bubble code {
      font-size: 0.85em;
    }

    .queue-index {
      font-size: 0.7rem;
    }

    .dialog-actions {
      flex-direction: column;
      gap: 6px;
    }

    .dialog-action {
      flex: none;
      width: 100%;
      min-height: 32px;
      font-size: 0.85rem;
    }

    .dialog-feedback {
      font-size: 0.72rem;
    }

    /* 快捷按钮移动端样式 */
    .quick-buttons {
      gap: 5px;
    }

    .quick-button {
      padding: 4px 8px;
      font-size: 0.78rem;
    }

    .message-input {
      min-height: 38px;
      padding: 8px 10px;
      font-size: 0.88rem;
    }

    /* 代码编辑/文件修改样式 */
    .file-change {
      padding: 6px 8px;
      margin-top: 6px;
    }

    .file-change-header {
      flex-wrap: wrap;
      gap: 6px;
    }

    .file-change-action {
      font-size: 0.65rem;
      padding: 2px 4px;
    }

    .file-change-lines,
    .file-change-new-path {
      font-size: 0.65rem;
    }

    .file-change-diff,
    .file-change-code {
      padding: 6px;
      font-size: 0.62rem;
      line-height: 1.35;
      overflow-x: visible;
    }

    /* 手机端代码自动换行，隐藏行号 */
    .diff-line {
      min-height: auto;
      line-height: 1.35;
      flex-wrap: wrap;
    }

    .diff-line .diff-num {
      display: none;
    }

    .diff-line .diff-sign {
      width: auto;
      margin-right: 4px;
      font-size: 0.62rem;
    }

    .diff-line .diff-content {
      font-size: 0.62rem;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: visible;
      flex: 1;
      min-width: 0;
    }

    .diff-header {
      padding: 3px 6px;
      margin: 3px 0;
    }

    .diff-header .diff-content {
      font-size: 0.6rem;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .code-line {
      min-height: auto;
      line-height: 1.35;
      flex-wrap: wrap;
    }

    .code-line .line-num {
      display: none;
    }

    .code-line .line-content {
      font-size: 0.62rem;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: visible;
    }

    .file-change + .file-change {
      margin-top: 8px;
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .file-change-diff,
    .file-change-code {
      background: color-mix(in srgb, #1e293b 80%, transparent);
      color: #e2e8f0;
    }

    .diff-header {
      background: color-mix(in srgb, #334155 60%, transparent);
      color: #94a3b8;
    }

    .diff-add {
      background: color-mix(in srgb, #22c55e 15%, transparent);
    }

    .diff-add .diff-sign {
      color: #4ade80;
    }

    .diff-add .diff-content {
      color: #e2e8f0;
    }

    .diff-remove {
      background: color-mix(in srgb, #ef4444 15%, transparent);
    }

    .diff-remove .diff-sign {
      color: #f87171;
    }

    .diff-remove .diff-content {
      color: #e2e8f0;
    }

    .diff-context .diff-content {
      color: #cbd5e1;
    }

    .code-line .line-content {
      color: #e2e8f0;
    }
  }
`;
