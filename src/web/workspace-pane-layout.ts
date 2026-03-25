import type { DialogMessage } from "../lib/dialog-messages";

export type WorkspacePaneLayoutMode = "grid" | "focus";

const FOCUS_LAYOUT_BREAKPOINT = 1800;
const PREVIEW_LINE_LIMIT = 10;
const PREVIEW_TEXT_LIMIT = 250;

export function resolveWorkspacePaneLayoutMode(width: number, openPaneCount: number): WorkspacePaneLayoutMode {
  if (openPaneCount <= 1 || width >= FOCUS_LAYOUT_BREAKPOINT) {
    return "grid";
  }

  return "focus";
}

export function summarizeWorkspacePreview(messages: DialogMessage[], maxLines = PREVIEW_LINE_LIMIT) {
  const textMessages = messages
    .filter((message): message is Extract<DialogMessage, { kind: "message" }> => message.kind === "message")
    .map((message) => compactPreviewText(message.text))
    .filter(Boolean);

  if (textMessages.length > 0) {
    return textMessages.slice(-maxLines).reverse();
  }

  const latestMessage = messages.at(-1);
  if (!latestMessage) {
    return [];
  }

  if (latestMessage.kind === "tool" || latestMessage.kind === "tool-group") {
    return [`最近活动: ${latestMessage.toolName}`];
  }

  return [];
}

function compactPreviewText(text: string) {
  const compact = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!compact) {
    return "";
  }
  if (compact.length <= PREVIEW_TEXT_LIMIT) {
    return compact;
  }
  return `${compact.slice(0, PREVIEW_TEXT_LIMIT - 1).trimEnd()}…`;
}
