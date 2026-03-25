import { summarizeToolCall, type DialogToolStatus } from "./tool-call";
import type { KanbanSessionMessage, SessionMessageResponse } from "../types";

export type DialogTextMessage = {
  key?: string;
  kind: "message";
  sender: "user" | "ai";
  text: string;
  timestamp?: string;
};

export type DialogToolMessage = {
  key?: string;
  kind: "tool";
  toolName: string;
  summary: string;
  detail: string;
  status: DialogToolStatus;
  statusLabel: string;
  icon: string;
  command?: string;
  timestamp?: string;
  changes?: Array<{
    action: "write" | "edit" | "delete" | "rename";
    content?: string;
    unified_diff?: string;
    new_path?: string;
  }>;
};

export type DialogToolGroupMessage = {
  key?: string;
  kind: "tool-group";
  toolName: string;
  summary: string;
  status: DialogToolStatus;
  statusLabel: string;
  icon: string;
  items: DialogToolMessage[];
  timestamp?: string;
};

export type DialogMessage = DialogTextMessage | DialogToolMessage | DialogToolGroupMessage;

export function compactDialogMessageText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]{2,}/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSessionMessage(message: KanbanSessionMessage): DialogMessage | undefined {
  if (!message || typeof message.content !== "string") {
    return undefined;
  }

  const text = message.content.trim();
  if (!text) {
    return undefined;
  }

  return {
    kind: "message",
    sender: message.role === "user" ? "user" : "ai",
    text: compactDialogMessageText(text),
    timestamp: message.timestamp,
  };
}

export function normalizeApiMessages(messages: SessionMessageResponse[] | undefined) {
  return groupConsecutiveToolMessages(normalizeApiMessagesFlat(messages));
}

export function normalizeApiMessagesFlat(messages: SessionMessageResponse[] | undefined) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      if (message.entry_type === "tool_use") {
        return normalizeApiToolMessage(message);
      }
      if (typeof message.content !== "string" || !message.content.trim()) {
        return undefined;
      }

      return {
        key: buildDialogMessageKey(message),
        kind: "message",
        sender: message.role === "user" ? "user" : "ai",
        text: compactDialogMessageText(message.content),
        timestamp: message.timestamp,
      } satisfies DialogTextMessage;
    })
    .filter((message): message is DialogTextMessage | DialogToolMessage => Boolean(message));
}

export function getDialogMessageIdentity(message: DialogMessage) {
  if (message.key) {
    return message.key;
  }
  if (message.kind === "tool-group") {
    return `tool-group:${message.toolName}:${message.summary}:${message.status}`;
  }
  if (message.kind === "tool") {
    return `tool:${message.toolName}:${message.summary}:${message.status}`;
  }
  return `${message.sender}:${message.text}`;
}

function normalizeApiToolMessage(message: SessionMessageResponse) {
  const summary = summarizeToolCall(message);
  if (!summary) {
    return undefined;
  }

  return {
    key: buildDialogMessageKey(message),
    kind: "tool",
    toolName: summary.toolName,
    summary: summary.summary,
    detail: summary.detail,
    status: summary.status,
    statusLabel: summary.statusLabel,
    icon: summary.icon,
    command: summary.command,
    changes: summary.changes,
    timestamp: message.timestamp,
  } satisfies DialogToolMessage;
}

function buildDialogMessageKey(message: SessionMessageResponse) {
  if (typeof message.process_id === "string" && typeof message.entry_index === "number") {
    return `${message.process_id}:${message.entry_index}`;
  }
  if (typeof message.id === "number") {
    return `id:${message.id}`;
  }
  if (typeof message.timestamp === "string" && typeof message.content === "string") {
    return `${message.timestamp}:${message.content}`;
  }
  return undefined;
}

export function groupConsecutiveToolMessages(messages: DialogMessage[]) {
  const grouped: DialogMessage[] = [];

  for (const message of messages) {
    const previous = grouped.at(-1);
    if (
      message.kind === "tool" &&
      previous?.kind === "tool-group" &&
      previous.toolName === message.toolName
    ) {
      previous.items = [...previous.items, message];
      previous.summary = `${previous.items.length} commands`;
      previous.status = getGroupedToolStatus(previous.items);
      previous.statusLabel = previous.items.length > 1 ? `${previous.items.length} 条` : previous.statusLabel;
      previous.timestamp = getLatestDialogTimestamp(previous.items);
      continue;
    }

    if (
      message.kind === "tool" &&
      previous?.kind === "tool" &&
      previous.toolName === message.toolName
    ) {
      grouped[grouped.length - 1] = {
        kind: "tool-group",
        toolName: message.toolName,
        summary: "2 commands",
        status: getGroupedToolStatus([previous, message]),
        statusLabel: "2 条",
        icon: message.icon,
        items: [previous, message],
        timestamp: getLatestDialogTimestamp([previous, message]),
      } satisfies DialogToolGroupMessage;
      continue;
    }

    grouped.push(message);
  }

  return grouped;
}

function getGroupedToolStatus(items: DialogToolMessage[]): DialogToolStatus {
  if (items.some((item) => item.status === "error")) {
    return "error";
  }
  if (items.some((item) => item.status === "pending")) {
    return "pending";
  }
  if (items.some((item) => item.status === "running")) {
    return "running";
  }
  if (items.some((item) => item.status === "denied")) {
    return "denied";
  }
  if (items.every((item) => item.status === "success")) {
    return "success";
  }
  return "idle";
}

function getLatestDialogTimestamp(messages: Array<{ timestamp?: string }>) {
  return messages.reduce<string | undefined>((latest, message) => {
    if (!message.timestamp) {
      return latest;
    }
    if (!latest) {
      return message.timestamp;
    }
    const left = Date.parse(message.timestamp);
    const right = Date.parse(latest);
    if (!Number.isNaN(left) && !Number.isNaN(right)) {
      return left > right ? message.timestamp : latest;
    }
    return message.timestamp.localeCompare(latest) > 0 ? message.timestamp : latest;
  }, undefined);
}
