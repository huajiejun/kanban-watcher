import type { SessionMessageResponse, ToolActionInfo, ToolInfo, ToolStatusInfo, TodoItem } from "../types";

export type DialogToolStatus = "running" | "success" | "pending" | "error" | "denied" | "idle";

export type DialogToolSummary = {
  toolName: string;
  summary: string;
  detail: string;
  status: DialogToolStatus;
  statusLabel: string;
  icon: string;
  command?: string;
  changes?: Array<{
    action: "write" | "edit" | "delete" | "rename";
    content?: string;
    unified_diff?: string;
    new_path?: string;
  }>;
};

export function summarizeToolCall(message: SessionMessageResponse): DialogToolSummary | undefined {
  const toolInfo = message.tool_info;
  if (!toolInfo) {
    return undefined;
  }

  const action = getActionType(toolInfo);
  const toolName = getToolName(toolInfo, action);
  const command = getCommand(toolInfo);
  const changes = getChanges(toolInfo);

  // 针对 todo_management 工具生成特定的详情
  const detail = action === "todo_management"
    ? getTodoDetail(toolInfo, message.content)
    : compactText(message.content ?? "");

  return {
    toolName,
    summary: getToolSummary(toolInfo, toolName),
    detail,
    status: getToolStatus(toolInfo),
    statusLabel: getToolStatusLabel(toolInfo),
    icon: getToolIcon(action),
    command,
    changes,
  };
}

function getToolName(toolInfo: ToolInfo, action?: string) {
  if (typeof toolInfo.tool_name === "string" && toolInfo.tool_name.trim()) {
    return toolInfo.tool_name.trim();
  }

  const fallbackMap: Record<string, string> = {
    command_run: "命令",
    file_read: "读取文件",
    file_edit: "修改文件",
    search: "搜索",
    web_fetch: "抓取网页",
    task_create: "创建任务",
    todo_management: "更新待办",
  };
  return fallbackMap[action ?? ""] ?? "工具调用";
}

function getToolSummary(toolInfo: ToolInfo, toolName: string) {
  const action = toolInfo.action_type;

  if (!action || typeof action !== "object") {
    return toolName;
  }

  switch (action.action) {
    case "command_run":
      return typeof action.command === "string" && action.command.trim()
        ? action.command.trim()
        : toolName;
    case "file_read":
      return typeof action.path === "string" && action.path.trim()
        ? action.path.trim()
        : toolName;
    case "file_edit":
      return typeof action.path === "string" && action.path.trim()
        ? action.path.trim()
        : toolName;
    case "search":
      return typeof action.query === "string" && action.query.trim()
        ? action.query.trim()
        : typeof action.q === "string" && action.q.trim()
          ? action.q.trim()
          : toolName;
    case "web_fetch":
      return typeof action.url === "string" && action.url.trim()
        ? action.url.trim()
        : toolName;
    case "task_create":
      return typeof action.description === "string" && action.description.trim()
        ? action.description.trim()
        : toolName;
    case "todo_management": {
      const todos = action.todos || [];
      if (todos.length > 0) {
        const completed = todos.filter(t => t.status?.toLowerCase() === 'completed').length;
        return `更新待办事项 (${completed}/${todos.length})`;
      }
      return typeof action.operation === "string" && action.operation.trim()
        ? action.operation.trim()
        : toolName;
    }
    default:
      return toolName;
  }
}

function getToolStatus(toolInfo: ToolInfo): DialogToolStatus {
  const status = readStatus(toolInfo.status);

  switch (status) {
    case "running":
      return "running";
    case "success":
    case "completed":
      return "success";
    case "pending_approval":
      return "pending";
    case "error":
    case "failed":
      return "error";
    case "denied":
    case "rejected":
      return "denied";
    default:
      return "idle";
  }
}

function getToolStatusLabel(toolInfo: ToolInfo) {
  const status = getToolStatus(toolInfo);
  const labelMap: Record<DialogToolStatus, string> = {
    running: "运行中",
    success: "完成",
    pending: "待确认",
    error: "失败",
    denied: "已拒绝",
    idle: "已记录",
  };
  return labelMap[status];
}

function getToolIcon(action?: string) {
  const iconMap: Record<string, string> = {
    file_read: "📄",
    file_edit: "✏️",
    search: "🔎",
    web_fetch: "🌐",
    command_run: ">_",
    task_create: "⇢",
    todo_management: "☑",
  };
  return iconMap[action ?? ""] ?? "🛠";
}

function getCommand(toolInfo: ToolInfo) {
  return toolInfo.action_type?.action === "command_run" &&
    typeof toolInfo.action_type.command === "string" &&
    toolInfo.action_type.command.trim()
    ? toolInfo.action_type.command.trim()
    : undefined;
}

function getChanges(toolInfo: ToolInfo): DialogToolSummary["changes"] {
  if (toolInfo.action_type?.action !== "file_edit") {
    return undefined;
  }
  const changes = toolInfo.action_type.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return undefined;
  }
  return changes;
}

function getActionType(toolInfo: ToolInfo) {
  return toolInfo.action_type?.action;
}

function readStatus(status: ToolStatusInfo | undefined) {
  if (!status) {
    return "";
  }
  if (typeof status === "string") {
    return status.trim().toLowerCase();
  }
  if (typeof status.status === "string") {
    return status.status.trim().toLowerCase();
  }
  return "";
}

function compactText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]{2,}/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 获取 todo_management 工具的详情
 * 将待办事项列表格式化为可读的文本
 */
function getTodoDetail(toolInfo: ToolInfo, originalContent?: string): string {
  const todos = toolInfo.action_type?.todos;

  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    // 如果没有待办事项数据，返回原始内容
    return compactText(originalContent ?? "");
  }

  // 格式化待办事项列表
  const todoLines = todos.map((todo: TodoItem) => {
    const status = todo.status || 'pending';
    const statusIcon = status.toLowerCase() === 'completed' ? 'x' : ' ';
    return `- [${statusIcon}] ${todo.content}`;
  });

  return todoLines.join('\n');
}
