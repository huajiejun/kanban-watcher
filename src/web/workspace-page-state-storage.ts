import type { WorkspacePageState } from "./workspace-page-state";

export const WORKSPACE_PAGE_STATE_STORAGE_KEY = "kanban-watcher.workspace-home.state.v1";

type PersistedWorkspacePageState = Pick<WorkspacePageState, "openWorkspaceIds" | "activeWorkspaceId">;

export function readPersistedWorkspacePageState(): Partial<WorkspacePageState> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_PAGE_STATE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspacePageState>;
    const openWorkspaceIds = Array.isArray(parsed.openWorkspaceIds)
      ? parsed.openWorkspaceIds.filter((value): value is string => typeof value === "string").slice(0, 4)
      : [];

    return {
      openWorkspaceIds,
      activeWorkspaceId:
        typeof parsed.activeWorkspaceId === "string" ? parsed.activeWorkspaceId : undefined,
    };
  } catch {
    return {};
  }
}

export function writePersistedWorkspacePageState(state: WorkspacePageState) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: PersistedWorkspacePageState = {
    openWorkspaceIds: state.openWorkspaceIds,
    activeWorkspaceId: state.activeWorkspaceId,
  };

  window.localStorage.setItem(WORKSPACE_PAGE_STATE_STORAGE_KEY, JSON.stringify(payload));
}
