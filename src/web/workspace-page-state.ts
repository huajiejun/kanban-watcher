import type { KanbanWorkspace } from "../types";

export type WorkspacePageState = {
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
  dismissedAttentionIds: string[];
  previousAttentionMap: Record<string, boolean>;
  hasHydratedAttentionSnapshot: boolean;
};

type WorkspacePageStateInput = Partial<WorkspacePageState>;

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function isAttentionWorkspace(workspace: KanbanWorkspace) {
  return Boolean(workspace.needs_attention || workspace.has_pending_approval);
}

export function createWorkspacePageState(
  input: WorkspacePageStateInput = {},
): WorkspacePageState {
  return {
    openWorkspaceIds: input.openWorkspaceIds ?? [],
    activeWorkspaceId: input.activeWorkspaceId,
    dismissedAttentionIds: input.dismissedAttentionIds ?? [],
    previousAttentionMap: input.previousAttentionMap ?? {},
    hasHydratedAttentionSnapshot: input.hasHydratedAttentionSnapshot ?? false,
  };
}

export function openWorkspacePane(
  state: WorkspacePageState,
  workspaceId: string,
): WorkspacePageState {
  const existingIds = state.openWorkspaceIds.filter((id) => id !== workspaceId);
  const nextOpenWorkspaceIds = uniqueIds([...existingIds, workspaceId]);
  const trimmedOpenWorkspaceIds =
    nextOpenWorkspaceIds.length > 4
      ? nextOpenWorkspaceIds.slice(nextOpenWorkspaceIds.length - 4)
      : nextOpenWorkspaceIds;

  return {
    ...state,
    openWorkspaceIds: trimmedOpenWorkspaceIds,
    activeWorkspaceId: workspaceId,
    dismissedAttentionIds: state.dismissedAttentionIds.filter((id) => id !== workspaceId),
  };
}

export function dismissWorkspacePane(
  state: WorkspacePageState,
  workspaceId: string,
  keepDismissed: boolean,
): WorkspacePageState {
  return {
    ...state,
    openWorkspaceIds: state.openWorkspaceIds.filter((id) => id !== workspaceId),
    activeWorkspaceId:
      state.activeWorkspaceId === workspaceId ? state.openWorkspaceIds.at(-1) : state.activeWorkspaceId,
    dismissedAttentionIds: keepDismissed
      ? uniqueIds([...state.dismissedAttentionIds, workspaceId])
      : state.dismissedAttentionIds.filter((id) => id !== workspaceId),
  };
}

export function reconcileWorkspacePageState(
  state: WorkspacePageState,
  workspaces: KanbanWorkspace[],
): WorkspacePageState {
  const attentionMap = Object.fromEntries(
    workspaces.map((workspace) => [workspace.id, isAttentionWorkspace(workspace)]),
  );
  const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));

  let nextState: WorkspacePageState = {
    ...state,
    openWorkspaceIds: state.openWorkspaceIds.filter((id) => activeWorkspaceIds.has(id)),
    dismissedAttentionIds: state.dismissedAttentionIds.filter(
      (id) => activeWorkspaceIds.has(id) && attentionMap[id],
    ),
    previousAttentionMap: attentionMap,
  };

  if (!state.hasHydratedAttentionSnapshot) {
    return {
      ...nextState,
      hasHydratedAttentionSnapshot: true,
    };
  }

  for (const workspace of workspaces) {
    const isAttention = attentionMap[workspace.id];
    const wasAttention = Boolean(state.previousAttentionMap[workspace.id]);
    const isDismissed = nextState.dismissedAttentionIds.includes(workspace.id);

    if (isAttention && !wasAttention && !isDismissed) {
      nextState = openWorkspacePane(nextState, workspace.id);
    }
  }

  return nextState;
}
