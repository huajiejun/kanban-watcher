import type { KanbanWorkspace } from "../types";

export interface StatusIcon {
  symbol: string;
  kind:
    | "dev-server"
    | "process-error"
    | "running"
    | "approval"
    | "unseen"
    | "pr-open"
    | "pr-merged"
    | "pin"
    | "idle";
  tone: "brand" | "error" | "success" | "merged" | "muted";
}

export interface StatusMeta {
  icons: StatusIcon[];
  accentClass: string;
}

function hasUnseenActivity(workspace: Partial<KanbanWorkspace>): boolean {
  return Boolean(workspace.has_unseen_turns || workspace.hasUnseenActivity);
}

function hasRunningDevServer(workspace: Partial<KanbanWorkspace>): boolean {
  return Boolean(
    workspace.has_running_dev_server || workspace.hasRunningDevServer,
  );
}

function latestProcessStatus(workspace: Partial<KanbanWorkspace>): string | undefined {
  return workspace.latest_process_status || workspace.latestProcessStatus;
}

function prStatus(workspace: Partial<KanbanWorkspace>): string | undefined {
  return workspace.pr_status || workspace.prStatus;
}

function isPinned(workspace: Partial<KanbanWorkspace>): boolean {
  return Boolean(workspace.is_pinned || workspace.isPinned);
}

export function getStatusMeta(workspace: Partial<KanbanWorkspace>): StatusMeta {
  const icons: StatusIcon[] = [];
  const isRunning = workspace.status === "running";
  const isFailed = !isRunning && ["failed", "killed"].includes(latestProcessStatus(workspace) ?? "");
  const unseen = hasUnseenActivity(workspace);
  const pendingApproval = Boolean(workspace.has_pending_approval);
  const devServer = hasRunningDevServer(workspace);
  const pr = prStatus(workspace);

  if (devServer) {
    icons.push({ symbol: "🖥️", kind: "dev-server", tone: "brand" });
  }

  if (isFailed) {
    icons.push({ symbol: "▲", kind: "process-error", tone: "error" });
  }

  if (pendingApproval) {
    icons.push({ symbol: "✋", kind: "approval", tone: "brand" });
  } else if (isRunning) {
    icons.push({ symbol: "⋯", kind: "running", tone: "brand" });
  }

  if (unseen && !isRunning && !isFailed) {
    icons.push({ symbol: "●", kind: "unseen", tone: "brand" });
  }

  if (pr === "open") {
    icons.push({ symbol: "⎇", kind: "pr-open", tone: "success" });
  } else if (pr === "merged") {
    icons.push({ symbol: "⎇", kind: "pr-merged", tone: "merged" });
  }

  if (isPinned(workspace)) {
    icons.push({ symbol: "📌", kind: "pin", tone: "brand" });
  }

  if (icons.length === 0) {
    icons.push({ symbol: "•", kind: "idle", tone: "muted" });
  }

  const accentClass =
    isRunning && !pendingApproval
      ? "is-running"
      : pendingApproval || (workspace.status === "completed" && unseen)
        ? "is-attention"
        : "is-idle";

  return {
    icons,
    accentClass,
  };
}
