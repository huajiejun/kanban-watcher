import type {
  RemoteIssue,
  RemoteProjectStatus,
  RemoteOrganization,
  RemoteProject,
  RemoteWorkspace,
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

/** GET /api/organizations - 查询组织列表 */
export async function fetchOrganizations(
  options: RequestOptions
): Promise<RemoteOrganization[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteOrganization[];
  }>(`${normalizeBaseUrl(options.baseUrl)}/api/organizations`, {
    method: "GET",
    headers: buildHeaders(options.apiKey),
  });
  return response.data ?? [];
}

/** GET /api/projects?organization_id=xxx - 查询项目列表 */
export async function fetchProjects(
  options: RequestOptions,
  organizationId: string
): Promise<RemoteProject[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteProject[];
  }>(
    `${normalizeBaseUrl(options.baseUrl)}/api/projects?organization_id=${organizationId}`,
    {
      method: "GET",
      headers: buildHeaders(options.apiKey),
    }
  );
  return response.data ?? [];
}

/** GET /api/issues/?project_id=xxx - 查询任务列表 */
export async function fetchIssues(
  options: RequestOptions,
  projectId: string
): Promise<RemoteIssue[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteIssue[];
  }>(
    `${normalizeBaseUrl(options.baseUrl)}/api/issues/?project_id=${projectId}`,
    {
      method: "GET",
      headers: buildHeaders(options.apiKey),
    }
  );
  return response.data ?? [];
}

/** GET /api/project-statuses?project_id=xxx - 查询项目状态列表 */
export async function fetchProjectStatuses(
  options: RequestOptions,
  projectId: string
): Promise<RemoteProjectStatus[]> {
  const response = await fetchJSON<{
    success: boolean;
    data: RemoteProjectStatus[];
  }>(
    `${normalizeBaseUrl(options.baseUrl)}/api/project-statuses?project_id=${projectId}`,
    {
      method: "GET",
      headers: buildHeaders(options.apiKey),
    }
  );
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

/** GET /api/issue-workspaces/{id} - 查询任务关联的工作区列表 */
export async function fetchIssueWorkspaces(
  options: RequestOptions,
  issueId: string
): Promise<RemoteWorkspace[]> {
  const response = await fetchJSON<{
    success: boolean;
    workspaces: RemoteWorkspace[];
  }>(
    `${normalizeBaseUrl(options.baseUrl)}/api/issue-workspaces/${issueId}`,
    {
      method: "GET",
      headers: buildHeaders(options.apiKey),
    }
  );
  return response.workspaces ?? [];
}
