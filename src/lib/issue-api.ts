import type {
  RemoteIssue,
  RemoteProjectStatus,
  CreateIssuePayload,
  UpdateIssuePayload,
} from "../types/issue";

type RequestOptions = {
  baseUrl: string;
  apiKey?: string;
};

function normalizeBaseUrl(baseUrl: string) {
  if (!baseUrl) return "";
  return baseUrl.replace(/\/+$/, "");
}

function buildHeaders(apiKey?: string, hasBody = false) {
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

async function readErrorMessage(response: Response) {
  const text = (await response.text()).trim();
  return text || `请求失败（${response.status}）`;
}

async function fetchJSON<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** GET /api/issues/ - 查询任务列表 */
export async function fetchIssues(
  options: RequestOptions
): Promise<RemoteIssue[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteIssue[];
  }>(`${normalizeBaseUrl(options.baseUrl)}/api/issues/`, {
    method: "GET",
    headers: buildHeaders(options.apiKey),
  });
  return response.data ?? [];
}

/** GET /api/project-statuses - 查询项目状态列表 */
export async function fetchProjectStatuses(
  options: RequestOptions
): Promise<RemoteProjectStatus[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteProjectStatus[];
  }>(`${normalizeBaseUrl(options.baseUrl)}/api/project-statuses`, {
    method: "GET",
    headers: buildHeaders(options.apiKey),
  });
  return response.data ?? [];
}

/** POST /api/issues/ - 创建任务 */
export async function createIssue(
  options: RequestOptions,
  payload: CreateIssuePayload
): Promise<RemoteIssue> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteIssue;
  }>(`${normalizeBaseUrl(options.baseUrl)}/api/issues/`, {
    method: "POST",
    headers: buildHeaders(options.apiKey, true),
    body: JSON.stringify(payload),
  });
  return response.data;
}

/** PATCH /api/issues/{id} - 更新任务 */
export async function updateIssue(
  options: RequestOptions,
  issueId: string,
  payload: UpdateIssuePayload
): Promise<RemoteIssue> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteIssue;
  }>(`${normalizeBaseUrl(options.baseUrl)}/api/issues/${issueId}`, {
    method: "PATCH",
    headers: buildHeaders(options.apiKey, true),
    body: JSON.stringify(payload),
  });
  return response.data;
}

/** DELETE /api/issues/{id} - 删除任务 */
export async function deleteIssue(
  options: RequestOptions,
  issueId: string
): Promise<void> {
  await fetch(
    `${normalizeBaseUrl(options.baseUrl)}/api/issues/${issueId}`,
    {
      method: "DELETE",
      headers: buildHeaders(options.apiKey),
    }
  );
}
