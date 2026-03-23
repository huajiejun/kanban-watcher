import type { KanbanWorkspace } from "../types";

export interface WorkspaceSections {
  attention: KanbanWorkspace[];
  running: KanbanWorkspace[];
  idle: KanbanWorkspace[];
}

export function groupWorkspaces(
  workspaces: KanbanWorkspace[] = [],
): WorkspaceSections {
  return workspaces.reduce<WorkspaceSections>(
    (sections, workspace) => {
      if (workspace.has_pending_approval) {
        sections.attention.push(workspace);
      } else if (workspace.status === "running") {
        sections.running.push(workspace);
      } else if (workspace.has_unseen_turns) {
        sections.attention.push(workspace);
      } else {
        sections.idle.push(workspace);
      }
      return sections;
    },
    { attention: [], running: [], idle: [] },
  );
}
