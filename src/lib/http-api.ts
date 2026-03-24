import type {
  ActiveWorkspacesResponse,
  SessionMessagesResponse,
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
