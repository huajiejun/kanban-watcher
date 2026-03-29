import type {
  ActiveWorkspacesResponse,
  ExecutionProcessDetail,
  SessionMessagesResponse,
  VibeInfoResponse,
  WorkspaceFileBrowserPathResponse,
  WorkspaceFrontendPortResponse,
  WorkspaceTodosResponse,
  WorkspaceTodo,
  WorkspaceViewResponse,
  WorkspaceMessageResponse,
  WorkspaceQueueStatusResponse,
} from "../types";

type RequestOptions = {
  baseUrl: string;
  apiKey?: string;
};

function buildHeaders(apiKey?: string, hasBody = false) {
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function normalizeBaseUrl(baseUrl: string) {
  // 支持空字符串（相对路径），用于 Vite 代理模式
  if (!baseUrl) {
    return "";
  }
  return baseUrl.replace(/\/+$/, "");
}

async function readErrorMessage(response: Response) {
  const text = (await response.text()).trim();
  return text || `请求失败（${response.status}）`;
}

async function fetchJSON<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function fetchActiveWorkspaces({
  baseUrl,
  apiKey,
}: RequestOptions): Promise<ActiveWorkspacesResponse> {
  return fetchJSON<ActiveWorkspacesResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/active`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchVibeInfo({
  baseUrl,
  apiKey,
}: RequestOptions): Promise<VibeInfoResponse> {
  return fetchJSON<VibeInfoResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/info`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchWorkspaceView({
  baseUrl,
  apiKey,
}: RequestOptions): Promise<WorkspaceViewResponse> {
  return fetchJSON<WorkspaceViewResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace-view`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function updateWorkspaceView({
  baseUrl,
  apiKey,
  openWorkspaceIds,
  activeWorkspaceId,
  dismissedAttentionIds,
}: RequestOptions & {
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
  dismissedAttentionIds: string[];
}): Promise<WorkspaceViewResponse> {
  return fetchJSON<WorkspaceViewResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace-view`,
    {
      method: "PUT",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({
        open_workspace_ids: openWorkspaceIds,
        active_workspace_id: activeWorkspaceId,
        dismissed_attention_ids: dismissedAttentionIds,
      }),
    },
  );
}

export async function fetchWorkspaceLatestMessages({
  baseUrl,
  apiKey,
  workspaceId,
  limit,
  types,
}: RequestOptions & {
  workspaceId: string;
  limit: number;
  types?: string[];
}): Promise<SessionMessagesResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (Array.isArray(types) && types.length > 0) {
    query.set("types", types.join(","));
  }
  return fetchJSON<SessionMessagesResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/latest-messages?${query.toString()}`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function sendWorkspaceFollowUp({
  baseUrl,
  apiKey,
  workspaceId,
  message,
}: RequestOptions & {
  workspaceId: string;
  message: string;
}): Promise<WorkspaceMessageResponse> {
  return sendWorkspaceMessage({
    baseUrl,
    apiKey,
    workspaceId,
    message,
    mode: "send",
  });
}

export async function sendWorkspaceMessage({
  baseUrl,
  apiKey,
  workspaceId,
  message,
  mode,
}: RequestOptions & {
  workspaceId: string;
  message: string;
  mode: "send" | "queue";
}): Promise<WorkspaceMessageResponse> {
  return fetchJSON<WorkspaceMessageResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/message`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ message, mode }),
    },
  );
}

export async function sendWorkspaceLegacyFollowUp({
  baseUrl,
  apiKey,
  workspaceId,
  message,
}: RequestOptions & {
  workspaceId: string;
  message: string;
}): Promise<WorkspaceMessageResponse> {
  return fetchJSON<WorkspaceMessageResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/follow-up`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ message }),
    },
  );
}

export async function fetchWorkspaceQueueStatus({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceQueueStatusResponse> {
  return fetchJSON<WorkspaceQueueStatusResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/queue`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function cancelWorkspaceQueue({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceQueueStatusResponse> {
  return fetchJSON<WorkspaceQueueStatusResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/queue`,
    {
      method: "DELETE",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function stopWorkspaceExecution({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceMessageResponse> {
  return fetchJSON<WorkspaceMessageResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/stop`,
    {
      method: "POST",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function startWorkspaceDevServer({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceMessageResponse> {
  return fetchJSON<WorkspaceMessageResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/dev-server`,
    {
      method: "POST",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchWorkspaceFrontendPort({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceFrontendPortResponse> {
  return fetchJSON<WorkspaceFrontendPortResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/frontend-port`,
    {
      method: "POST",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchWorkspaceFileBrowserPath({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<WorkspaceFileBrowserPathResponse> {
  return fetchJSON<WorkspaceFileBrowserPathResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/file-browser-path`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function stopWorkspaceDevServer({
  baseUrl,
  apiKey,
  workspaceId,
  processId,
}: RequestOptions & {
  workspaceId: string;
  processId?: string;
}): Promise<WorkspaceMessageResponse> {
  const requestUrl = new URL(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/dev-server`,
    window.location.origin,
  );
  if (processId?.trim()) {
    requestUrl.searchParams.set("process_id", processId.trim());
  }

  return fetchJSON<WorkspaceMessageResponse>(
    `${requestUrl.pathname}${requestUrl.search}`,
    {
      method: "DELETE",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchExecutionProcess({
  baseUrl,
  apiKey,
  processId,
}: RequestOptions & {
  processId: string;
}): Promise<{ success?: boolean; data?: ExecutionProcessDetail }> {
  return fetchJSON<{ success?: boolean; data?: ExecutionProcessDetail }>(
    `${normalizeBaseUrl(baseUrl)}/api/execution-processes/${processId}`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function markWorkspaceSeen({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<{ success?: boolean; workspace_id?: string }> {
  return fetchJSON<{ success?: boolean; workspace_id?: string }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/seen`,
    {
      method: "PUT",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchWorkspaceTodos({
  baseUrl,
  apiKey,
  workspaceId,
  includeCompleted,
}: RequestOptions & {
  workspaceId: string;
  includeCompleted?: boolean;
}): Promise<WorkspaceTodosResponse> {
  const query = new URLSearchParams();
  if (includeCompleted) {
    query.set("include_completed", "true");
  }
  const queryString = query.toString();
  const url = `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos${queryString ? `?${queryString}` : ""}`;
  return fetchJSON<WorkspaceTodosResponse>(url, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
}

export async function createWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  content,
}: RequestOptions & {
  workspaceId: string;
  content: string;
}): Promise<WorkspaceTodo> {
  return fetchJSON<WorkspaceTodo>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ content }),
    },
  );
}

export async function updateWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  todoId,
  content,
  isCompleted,
}: RequestOptions & {
  workspaceId: string;
  todoId: string;
  content: string;
  isCompleted: boolean;
}): Promise<{ success: boolean }> {
  return fetchJSON<{ success: boolean }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos/${todoId}`,
    {
      method: "PUT",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ content, is_completed: isCompleted }),
    },
  );
}

export async function deleteWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  todoId,
}: RequestOptions & {
  workspaceId: string;
  todoId: string;
}): Promise<{ success: boolean }> {
  return fetchJSON<{ success: boolean }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos/${todoId}`,
    {
      method: "DELETE",
      headers: buildHeaders(apiKey),
    },
  );
}

export async function fetchWorkspaceRepos({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<{
  id: string;
  name: string;
  path: string;
  display_name: string;
  target_branch: string;
  default_target_branch: string | null;
}[]> {
  return fetchJSON<{
    success: boolean;
    data?: {
      id: string;
      name: string;
      path: string;
      display_name: string;
      target_branch: string;
      default_target_branch: string | null;
    }[];
  }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/repos`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  ).then((result) => result.data ?? []);
}

export async function fetchRepoBranches({
  baseUrl,
  apiKey,
  repoId,
}: RequestOptions & {
  repoId: string;
}): Promise<{ name: string; is_current?: boolean; is_remote?: boolean }[]> {
  return fetchJSON<{
    success: boolean;
    data?: { name: string; is_current?: boolean; is_remote?: boolean }[];
  }>(
    `${normalizeBaseUrl(baseUrl)}/api/repos/${repoId}/branches`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  ).then((result) => result.data ?? []);
}

export async function createPR({
  baseUrl,
  apiKey,
  workspaceId,
  title,
  body,
  targetBranch,
  draft,
  repoId,
  autoGenerateDescription,
}: RequestOptions & {
  workspaceId: string;
  title: string;
  body: string | null;
  targetBranch: string | null;
  draft: boolean | null;
  repoId: string;
  autoGenerateDescription: boolean;
}): Promise<{ success: boolean; data?: string; error?: string; message?: string }> {
  return fetchJSON<{ success: boolean; data?: string; error?: string; message?: string }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/pull-requests`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({
        title,
        body,
        target_branch: targetBranch,
        draft,
        repo_id: repoId,
        auto_generate_description: autoGenerateDescription,
      }),
    },
  );
}

export async function getFirstUserMessage({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<string> {
  return fetchJSON<{ success: boolean; data?: string; message?: string }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/messages/first`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  ).then((result) => result.data ?? "");
}
