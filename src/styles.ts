import { css } from "lit";

export const cardStyles = css`
  :host {
    display: block;
  }

  ha-card {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--warning-color, #f59e0b) 12%, transparent), transparent 28%),
      var(--ha-card-background, var(--card-background-color, #ffffff));
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
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 65%, transparent);
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
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color, #ffffff)) 82%, var(--secondary-background-color, #f3f4f6));
    border-left: 3px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 85%, transparent);
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .task-card.is-attention {
    border-left-color: #f59e0b;
  }

  .task-card.is-running {
    border-left-color: #10b981;
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
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 65%, transparent);
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
    background: var(--ha-card-background, var(--card-background-color, #ffffff));
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 72%, transparent);
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
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
    font-size: 1.08rem;
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
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--secondary-text-color, #64748b);
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

  .message-bubble {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border-radius: 10px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 44%, transparent);
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
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 44%, transparent);
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
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 72%, transparent);
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

  .message-input {
    width: 100%;
    min-height: 44px;
    max-height: 88px;
    resize: none;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 92%, transparent);
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

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .workspace-dialog {
      width: min(100vw - 12px, 900px);
      height: min(92vh, 900px);
      padding: 12px;
      border-radius: 18px;
    }

    .task-meta {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .meta-files {
      justify-self: start;
    }
  }
`;
