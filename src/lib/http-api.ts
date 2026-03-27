import type {
  ActiveWorkspacesResponse,
  ExecutionProcessDetail,
  SessionMessagesResponse,
  VibeInfoResponse,
  WorkspaceFileBrowserPathResponse,
  WorkspaceFrontendPortResponse,
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
}: RequestOptions & {
  workspaceId: string;
  limit: number;
}): Promise<SessionMessagesResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
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
