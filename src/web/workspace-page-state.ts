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

function trimOpenWorkspaceIds(
  openWorkspaceIds: string[],
  maxVisible: number,
  activeWorkspaceId?: string,
) {
  if (openWorkspaceIds.length <= maxVisible) {
    return openWorkspaceIds;
  }

  const nextOpenWorkspaceIds = [...openWorkspaceIds];
  while (nextOpenWorkspaceIds.length > maxVisible) {
    const removableIndex = nextOpenWorkspaceIds.findIndex((id) => id !== activeWorkspaceId);
    nextOpenWorkspaceIds.splice(removableIndex >= 0 ? removableIndex : 0, 1);
  }
  return nextOpenWorkspaceIds;
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
  const nextOpenWorkspaceIds = state.openWorkspaceIds.includes(workspaceId)
    ? state.openWorkspaceIds
    : uniqueIds([...state.openWorkspaceIds, workspaceId]);
  const trimmedOpenWorkspaceIds = trimOpenWorkspaceIds(nextOpenWorkspaceIds, 4, workspaceId);

  return {
    ...state,
    openWorkspaceIds: trimmedOpenWorkspaceIds,
    activeWorkspaceId: workspaceId,
    dismissedAttentionIds: state.dismissedAttentionIds.filter((id) => id !== workspaceId),
  };
}

export function appendWorkspacePane(
  state: WorkspacePageState,
  workspaceId: string,
): WorkspacePageState {
  const nextOpenWorkspaceIds = state.openWorkspaceIds.includes(workspaceId)
    ? state.openWorkspaceIds
    : uniqueIds([...state.openWorkspaceIds, workspaceId]);
  const trimmedOpenWorkspaceIds = trimOpenWorkspaceIds(
    nextOpenWorkspaceIds,
    4,
    state.activeWorkspaceId,
  );

  return {
    ...state,
    openWorkspaceIds: trimmedOpenWorkspaceIds,
    activeWorkspaceId: state.activeWorkspaceId ?? trimmedOpenWorkspaceIds.at(-1),
    dismissedAttentionIds: state.dismissedAttentionIds.filter((id) => id !== workspaceId),
  };
}

export function dismissWorkspacePane(
  state: WorkspacePageState,
  workspaceId: string,
  keepDismissed: boolean,
): WorkspacePageState {
  const nextOpenWorkspaceIds = state.openWorkspaceIds.filter((id) => id !== workspaceId);
  return {
    ...state,
    openWorkspaceIds: nextOpenWorkspaceIds,
    activeWorkspaceId:
      state.activeWorkspaceId === workspaceId ? nextOpenWorkspaceIds.at(-1) : state.activeWorkspaceId,
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
  const nextOpenWorkspaceIds = state.openWorkspaceIds.filter((id) => activeWorkspaceIds.has(id));
  const nextActiveWorkspaceId =
    state.activeWorkspaceId && nextOpenWorkspaceIds.includes(state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : nextOpenWorkspaceIds.at(-1);

  let nextState: WorkspacePageState = {
    ...state,
    openWorkspaceIds: nextOpenWorkspaceIds,
    activeWorkspaceId: nextActiveWorkspaceId,
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
      nextState = appendWorkspacePane(nextState, workspace.id);
    }
  }

  return nextState;
}
