import type {
  ActiveWorkspacesResponse,
  SessionMessagesResponse,
} from "../types";

type RequestOptions = {
  baseUrl: string;
  apiKey?: string;
};

type FollowUpResponse = {
  message?: string;
  success?: boolean;
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
}): Promise<FollowUpResponse> {
  return fetchJSON<FollowUpResponse>(
    `${normalizeBaseUrl(baseUrl)}/api/workspace/${workspaceId}/follow-up`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ message }),
    },
  );
}
