import type { KanbanWorkspace } from "../types";

export interface StatusMeta {
  leadingIcon: string;
  unseenIcon?: string;
  approvalIcon?: string;
  accentClass: string;
}

export function getStatusMeta(workspace: Partial<KanbanWorkspace>): StatusMeta {
  const unseenIcon = workspace.has_unseen_turns ? "●" : undefined;
  const approvalIcon = workspace.has_pending_approval ? "✋" : undefined;

  if (workspace.status === "running") {
    return {
      leadingIcon: "▶",
      ...(unseenIcon ? { unseenIcon } : {}),
      ...(approvalIcon ? { approvalIcon } : {}),
      accentClass: "is-running",
    };
  }

  if (workspace.status === "completed" && workspace.has_unseen_turns) {
    return {
      leadingIcon: "●",
      ...(unseenIcon ? { unseenIcon } : {}),
      ...(approvalIcon ? { approvalIcon } : {}),
      accentClass: "is-attention",
    };
  }

  if (workspace.has_pending_approval) {
    return {
      leadingIcon: "•",
      approvalIcon,
      accentClass: "is-attention",
    };
  }

  return {
      leadingIcon: "•",
    ...(approvalIcon ? { approvalIcon } : {}),
    accentClass: "is-idle",
  };
}
