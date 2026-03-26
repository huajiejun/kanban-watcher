import type { KanbanWorkspace } from "../types";

const DEFAULT_WORKTREE_BASE_PATH = "/Users/huajiejun/github/vibe-kanban/.vibe-kanban-workspaces";

export function getWorkspacePath(workspace: KanbanWorkspace) {
  const branchSlug = workspace.branch?.replace(/^vibe\//, "") ?? workspace.id;
  const worktreeBasePath = import.meta.env.VITE_WORKTREE_BASE_PATH || DEFAULT_WORKTREE_BASE_PATH;

  return `${worktreeBasePath}/${branchSlug}/kanban-watcher`;
}
