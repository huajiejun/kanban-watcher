import type { KanbanWorkspace } from "../types";
import { fetchVibeInfo } from "./http-api";

export const ACTIVE_PANE_MESSAGE_TYPES = [
  "assistant_message",
  "user_message",
  "error_message",
  "tool_use",
];

type RealtimeRuntimeInfoOptions = {
  baseUrl: string;
  apiKey?: string;
};

export async function loadRealtimeRuntimeInfo(options: RealtimeRuntimeInfoOptions) {
  try {
    const response = await fetchVibeInfo({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    });
    return {
      previewProxyPort: response.data?.config?.preview_proxy_port,
      realtimeBaseUrl: response.data?.realtime?.base_url || options.baseUrl,
    };
  } catch {
    return {
      previewProxyPort: undefined,
      realtimeBaseUrl: options.baseUrl,
    };
  }
}

export function getWorkspaceSessionId(workspace?: KanbanWorkspace) {
  return workspace?.latest_session_id ?? workspace?.last_session_id;
}

export function getSelectedWorkspaceSessionId(
  workspaceId: string | undefined,
  workspaces: KanbanWorkspace[],
) {
  if (!workspaceId) {
    return undefined;
  }

  return getWorkspaceSessionId(workspaces.find((workspace) => workspace.id === workspaceId));
}

export function didSelectedWorkspaceSessionChange(args: {
  previousSelectedWorkspaceId: string | undefined;
  previousWorkspaces: KanbanWorkspace[];
  currentSelectedWorkspaceId: string | undefined;
  currentWorkspaces: KanbanWorkspace[];
}) {
  const previousSessionId = getSelectedWorkspaceSessionId(
    args.previousSelectedWorkspaceId,
    args.previousWorkspaces,
  );
  const currentSessionId = getSelectedWorkspaceSessionId(
    args.currentSelectedWorkspaceId,
    args.currentWorkspaces,
  );

  return previousSessionId !== currentSessionId;
}
