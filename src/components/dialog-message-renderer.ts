import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { detectLanguageFromPath, renderCodeWithHighlight, renderDiffWithHighlight } from "../lib/highlight-code";
import { renderMessageMarkdown } from "../lib/render-message-markdown";
import {
  getDialogMessageIdentity,
  type DialogMessage,
  type DialogToolMessage,
} from "../lib/dialog-messages";

type DialogRendererOptions = {
  expandedToolMessageKeys?: ReadonlySet<string>;
  onToggleToolMessage?: (toolKey: string) => void;
  editLanguage?: string;
};

export function renderDialogMessage(message: DialogMessage, options: DialogRendererOptions = {}) {
  if (message.kind === "tool") {
    return renderToolMessage(message, options);
  }
  if (message.kind === "tool-group") {
    return renderToolGroupMessage(message, options);
  }

  return html`
    <div class="message-row">
      <div class="message-bubble ${message.sender === "user" ? "is-user" : "is-ai"}">
        ${unsafeHTML(renderMessageMarkdown(message.text))}
      </div>
    </div>
  `;
}

export function detectDialogEditLanguage(messages: DialogMessage[]) {
  for (const message of messages) {
    if (message.kind === "tool" && message.toolName === "修改文件" && message.summary) {
      return detectLanguageFromPath(message.summary);
    }
    if (message.kind === "tool-group") {
      const matched = message.items.find((item) => item.toolName === "修改文件" && item.summary);
      if (matched?.summary) {
        return detectLanguageFromPath(matched.summary);
      }
    }
  }
  return undefined;
}

function renderToolMessage(message: DialogToolMessage, options: DialogRendererOptions) {
  const toolKey = getDialogMessageIdentity(message);
  const expanded = options.expandedToolMessageKeys?.has(toolKey) ?? false;

  return html`
    <div class="message-tool">
      <button
        class="message-tool-button is-${message.status}"
        type="button"
        @click=${() => options.onToggleToolMessage?.(toolKey)}
      >
        <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
        <span class="message-tool-summary">
          <span class="message-tool-name">${message.toolName}</span>
          <span class="message-tool-text">${message.summary}</span>
        </span>
        <span class="message-tool-status">${message.statusLabel}</span>
      </button>
      ${expanded
        ? html`
            <div class="message-tool-detail">
              ${message.command ? html`<div class="message-tool-command">${message.command}</div>` : nothing}
              ${message.detail ? html`${unsafeHTML(renderMessageMarkdown(message.detail))}` : nothing}
              ${message.changes?.length
                ? message.changes.map((change) => renderFileChange(change, options.editLanguage))
                : nothing}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderToolGroupMessage(message: Extract<DialogMessage, { kind: "tool-group" }>, options: DialogRendererOptions) {
  const toolKey = getDialogMessageIdentity(message);
  const expanded = options.expandedToolMessageKeys?.has(toolKey) ?? false;

  return html`
    <div class="message-tool">
      <button
        class="message-tool-button is-${message.status}"
        type="button"
        @click=${() => options.onToggleToolMessage?.(toolKey)}
      >
        <span class="message-tool-icon" aria-hidden="true">${message.icon}</span>
        <span class="message-tool-summary">
          <span class="message-tool-name">${message.toolName}</span>
          <span class="message-tool-text">${message.summary}</span>
        </span>
        <span class="message-tool-status">${message.statusLabel}</span>
      </button>
      ${expanded
        ? html`
            <div class="message-tool-detail">
              ${message.items.map((item) => html`
                <div class="message-tool-group-item">
                  <div class="message-tool-group-item-summary">${item.command ?? item.summary}</div>
                  ${item.detail ? html`${unsafeHTML(renderMessageMarkdown(item.detail))}` : nothing}
                  ${item.changes?.length
                    ? item.changes.map((change) => renderFileChange(change, options.editLanguage))
                    : nothing}
                </div>
              `)}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderFileChange(
  change: NonNullable<DialogToolMessage["changes"]>[number],
  editLanguage?: string,
) {
  const actionLabel: Record<string, string> = {
    write: "写入",
    edit: "编辑",
    delete: "删除",
    rename: "重命名",
  };

  if (change.action === "edit" && change.unified_diff) {
    return html`
      <div class="file-change">
        <div class="file-change-header">
          <span class="file-change-action">${actionLabel[change.action]}</span>
        </div>
        <div class="file-change-diff">${unsafeHTML(renderDiffWithHighlight(change.unified_diff, editLanguage))}</div>
      </div>
    `;
  }

  if (change.action === "write" && change.content) {
    const lines = change.content.split("\n").length;
    return html`
      <div class="file-change">
        <div class="file-change-header">
          <span class="file-change-action">${actionLabel[change.action]}</span>
          <span class="file-change-lines">${lines} 行</span>
        </div>
        <div class="file-change-code">
          ${unsafeHTML(renderCodeWithHighlight(truncateContent(change.content, 50), editLanguage))}
        </div>
      </div>
    `;
  }

  if (change.action === "delete") {
    return html`
      <div class="file-change">
        <div class="file-change-header">
          <span class="file-change-action">${actionLabel[change.action]}</span>
        </div>
      </div>
    `;
  }

  if (change.action === "rename" && change.new_path) {
    return html`
      <div class="file-change">
        <div class="file-change-header">
          <span class="file-change-action">${actionLabel[change.action]}</span>
          <span class="file-change-new-path">→ ${change.new_path}</span>
        </div>
      </div>
    `;
  }

  return nothing;
}

function truncateContent(content: string, maxLines: number) {
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content;
  }
  return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} 行已省略)`;
}
