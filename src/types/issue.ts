/** 任务优先级 */
export type IssuePriority = "urgent" | "high" | "medium" | "low";

/** 远程任务（对应 Go RemoteIssue） */
export interface RemoteIssue {
  id: string;
  project_id: string;
  issue_number: number;
  simple_id: string;
  status_id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  completed_at?: string | null;
  sort_order: number;
  parent_issue_id?: string | null;
  parent_issue_sort_order?: number | null;
  creator_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** 项目状态（对应 Go RemoteProjectStatus） */
export interface RemoteProjectStatus {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  hidden: boolean;
  created_at: string;
}

/** 创建任务请求体 */
export interface CreateIssuePayload {
  title: string;
  description?: string;
  priority?: string;
  status_id?: string;
  project_id?: string;
}

/** 更新任务请求体 */
export interface UpdateIssuePayload {
  status_id?: string;
  title?: string;
  description?: string;
  priority?: string;
}

/** 看板列（状态 + 归属该状态的 issue 列表） */
export interface KanbanColumn {
  status: RemoteProjectStatus;
  issues: RemoteIssue[];
}

/** 组织 */
export interface RemoteOrganization {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  issue_prefix: string;
  created_at: string;
  updated_at: string;
}

/** 项目 */
export interface RemoteProject {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 远程工作区（对应 Go RemoteWorkspace） */
export interface RemoteWorkspace {
  id: string;
  project_id: string;
  name: string | null;
  issue_id: string | null;
  local_workspace_id: string | null;
  archived: boolean;
  files_changed: number | null;
  lines_added: number | null;
  lines_removed: number | null;
  created_at: string;
  updated_at: string;
}
