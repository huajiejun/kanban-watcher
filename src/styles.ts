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
    padding: 10px 12px;
    border-radius: 12px;
    width: 100%;
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

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
  }

  .conversation-dialog {
    width: min(720px, 100%);
    max-height: min(80vh, 720px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 14px;
    overflow: hidden;
    border-radius: 20px;
    padding: 18px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--primary-color, #f59e0b) 8%, var(--ha-card-background, var(--card-background-color, #ffffff))) 0%, var(--ha-card-background, var(--card-background-color, #ffffff)) 100%);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 65%, transparent);
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.28);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dialog-title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .dialog-subtitle {
    margin-top: 4px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .dialog-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 85%, transparent);
    color: var(--secondary-text-color, #64748b);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
  }

  .dialog-empty,
  .conversation-list {
    min-height: 0;
    overflow: auto;
  }

  .dialog-empty {
    display: grid;
    place-items: center;
    padding: 28px 16px;
    border-radius: 14px;
    color: var(--secondary-text-color, #94a3b8);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 70%, transparent);
  }

  .conversation-list {
    display: grid;
    gap: 10px;
  }

  .conversation-item {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 55%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 55%, transparent);
  }

  .conversation-item.role-user {
    background: color-mix(in srgb, var(--primary-color, #f59e0b) 10%, var(--ha-card-background, var(--card-background-color, #ffffff)));
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .conversation-role {
    font-weight: 700;
  }

  .conversation-content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
`;
