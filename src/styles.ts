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
    width: min(640px, calc(100vw - 36px));
    max-height: min(760px, calc(100vh - 36px));
    overflow: auto;
    display: grid;
    gap: 16px;
    padding: 20px;
    border-radius: 22px;
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color, #f59e0b) 14%, transparent), transparent 32%),
      var(--ha-card-background, var(--card-background-color, #ffffff));
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
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .dialog-eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--secondary-text-color, #94a3b8);
  }

  .dialog-title {
    margin: 0;
    font-size: 1.32rem;
    line-height: 1.2;
  }

  .dialog-close {
    width: 36px;
    height: 36px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 72%, transparent);
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .dialog-summary,
  .dialog-panel {
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 70%, transparent);
    background: color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 60%, transparent);
  }

  .dialog-summary {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .dialog-summary.is-attention {
    border-color: color-mix(in srgb, #f59e0b 45%, var(--divider-color, #e5e7eb));
  }

  .dialog-summary.is-running {
    border-color: color-mix(in srgb, #10b981 45%, var(--divider-color, #e5e7eb));
  }

  .dialog-summary-top,
  .dialog-summary-bottom {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .dialog-summary-time {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.9rem;
  }

  .dialog-summary-bottom {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.88rem;
  }

  .dialog-panel {
    overflow: hidden;
  }

  .dialog-panel-title {
    padding: 14px 16px 0;
    font-size: 0.96rem;
    font-weight: 700;
  }

  .dialog-panel-body {
    display: grid;
    gap: 14px;
    padding: 14px 16px 16px;
  }

  .dialog-content-card {
    display: grid;
    gap: 10px;
    padding: 16px;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--ha-card-background, #ffffff) 94%, #f8fafc),
      color-mix(in srgb, var(--secondary-background-color, #f3f4f6) 86%, #fff7ed)
    );
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 65%, transparent);
  }

  .dialog-content-kicker {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary-color, #f59e0b);
    font-weight: 700;
  }

  .dialog-content-title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .dialog-content-text {
    margin: 0;
    color: var(--secondary-text-color, #94a3b8);
    line-height: 1.5;
  }

  .dialog-content-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .dialog-content-item {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 84%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color, #e5e7eb) 62%, transparent);
  }

  .dialog-content-label {
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.8rem;
  }

  .dialog-content-value {
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .message-input {
    width: 100%;
    min-height: 108px;
    resize: vertical;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, #ffffff) 92%, transparent);
    color: inherit;
    font: inherit;
    box-sizing: border-box;
  }

  .dialog-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .dialog-action {
    flex: 1 1 180px;
    min-height: 42px;
    border-radius: 999px;
    font: inherit;
    cursor: pointer;
    padding: 0 16px;
  }

  .dialog-action-primary {
    border: 0;
    background: var(--primary-color, #f59e0b);
    color: #ffffff;
    font-weight: 700;
  }

  .dialog-action-secondary {
    border: 1px solid color-mix(in srgb, var(--divider-color, #cbd5e1) 72%, transparent);
    background: transparent;
    color: inherit;
    font-weight: 600;
  }

  .dialog-feedback {
    min-height: 1.25rem;
    color: var(--secondary-text-color, #94a3b8);
    font-size: 0.84rem;
    line-height: 1.4;
  }

  @media (max-width: 640px) {
    .workspace-dialog {
      width: min(100vw - 20px, 640px);
      padding: 16px;
      border-radius: 18px;
    }

    .dialog-content-grid {
      grid-template-columns: minmax(0, 1fr);
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
