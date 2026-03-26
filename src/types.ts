export interface KanbanWorkspace {
  id: string;
  name: string;
  browser_url?: string;
  browserUrl?: string;
  branch?: string;
  status?: string;
  latest_session_id?: string;
  latestSessionId?: string;
  last_session_id?: string;
  relative_time?: string;
  has_unseen_turns?: boolean;
  hasUnseenActivity?: boolean;
  has_running_dev_server?: boolean;
  hasRunningDevServer?: boolean;
  running_dev_server_process_id?: string;
  has_pending_approval?: boolean;
  files_changed?: number;
  lines_added?: number;
  lines_removed?: number;
  completed_at?: string;
  updated_at?: string;
  last_message_at?: string;
  latest_process_completed_at?: string;  // AI 执行完成时间（与主项目保持一致）
  needs_attention?: boolean;
  latest_process_status?: string;
  latestProcessStatus?: string;
  pr_status?: string;
  prStatus?: string;
  pr_url?: string;
  is_pinned?: boolean;
  isPinned?: boolean;
  // 差异文件相关
  diff_stats?: DiffStats;
}

// 差异文件变更类型
export type DiffKind = "added" | "modified" | "deleted" | "renamed";

// 文件差异
export interface Diff {
  change: DiffKind;
  old_path?: string;
  new_path?: string;
  old_content?: string;
  new_content?: string;
  additions?: number;
  deletions?: number;
  content_omitted: boolean;
  repo_id?: string;
}

// 差异统计
export interface DiffStats {
  files_changed: number;
  lines_added: number;
  lines_removed: number;
}

// 工作区差异汇总
export interface WorkspaceDiff {
  workspace_id: string;
  updated_at: string;
  diffs: Record<string, Diff>;
  stats: DiffStats;
}

// 分支状态
export interface BranchStatus {
  commits_ahead: number;
  commits_behind: number;
  has_uncommitted_changes: boolean;
  head_oid: string;
  uncommitted_count: number;
  untracked_count: number;
  target_branch_name: string;
  remote_commits_ahead: number;
  remote_commits_behind: number;
  is_rebase_in_progress: boolean;
  conflicted_files: string[];
  is_target_remote: boolean;
}

// 仓库分支状态
export interface RepoBranchStatus {
  repo_id: string;
  repo_name: string;
  status: BranchStatus;
}

export interface KanbanEntityAttributes {
  count?: number;
  attention_count?: number;
  updated_at?: string;
  workspaces?: KanbanWorkspace[];
}

export interface KanbanSessionMessage {
  role?: string;
  content?: string;
  timestamp?: string;
}

export interface KanbanSessionAttributes {
  session_id?: string;
  sessionId?: string;
  workspace_id?: string;
  workspaceId?: string;
  workspace_name?: string;
  workspaceName?: string;
  last_message?: string;
  recent_messages?: KanbanSessionMessage[] | string;
}

export interface LocalWorkspaceSummary {
  id: string;
  name: string;
  browser_url?: string;
  branch?: string;
  latest_session_id?: string;
  status?: string;
  has_pending_approval?: boolean;
  has_unseen_turns?: boolean;
  has_running_dev_server?: boolean;
  running_dev_server_process_id?: string;
  files_changed?: number;
  lines_added?: number;
  lines_removed?: number;
  updated_at?: string;
  message_count?: number;
  last_message_at?: string;
  latest_process_completed_at?: string;
}

export interface ActiveWorkspacesResponse {
  workspaces?: LocalWorkspaceSummary[];
}

export interface VibeInfoResponse {
  success?: boolean;
  data?: {
    config?: {
      preview_proxy_port?: number;
    };
  };
}

export interface ExecutionProcessDetail {
  id: string;
  session_id?: string;
  workspace_id?: string;
  run_reason?: string;
  status?: string;
}

export interface WorkspaceViewResponse {
  open_workspace_ids?: string[];
  active_workspace_id?: string;
  dismissed_attention_ids?: string[];
  version?: number;
  updated_at?: string;
}

export interface SessionMessageResponse {
  id?: number;
  session_id?: string;
  process_id?: string;
  entry_index?: number;
  entry_type?: string;
  role?: string;
  content?: string;
  tool_info?: ToolInfo;
  timestamp?: string;
}

export interface SessionMessagesResponse {
  session_id?: string;
  workspace_name?: string;
  messages?: SessionMessageResponse[];
  has_more?: boolean;
}

export interface RealtimeEvent {
  type?: string;
  workspaces?: LocalWorkspaceSummary[];
  session_id?: string;
  messages?: SessionMessageResponse[];
  workspace_view?: WorkspaceViewResponse;
}

export interface WorkspaceMessageResponse {
  success?: boolean;
  workspace_id?: string;
  session_id?: string;
  action?: string;
  message?: string;
  execution_processes?: ExecutionProcessDetail[];
}

export interface WorkspaceFrontendPortResponse {
  success?: boolean;
  data?: {
    workspace_id?: string;
    frontend_port?: number;
    backend_port?: number;
  };
  message?: string;
}

export interface WorkspaceQueueStatusResponse {
  success?: boolean;
  workspace_id?: string;
  session_id?: string;
  status?: "empty" | "queued" | string;
  message?: string;
  queued?: {
    session_id?: string;
    queued_at?: string;
    data?: {
      message?: string;
      executor_config?: Record<string, unknown>;
    };
  } | null;
}

export interface ToolActionInfo {
  action?: string;
  command?: string;
  path?: string;
  q?: string;
  query?: string;
  url?: string;
  description?: string;
  operation?: string;
  changes?: Array<{
    action: "write" | "edit" | "delete" | "rename";
    content?: string;
    unified_diff?: string;
    new_path?: string;
  }>;
  todos?: TodoItem[];
  [key: string]: unknown;
}

export type ToolStatusInfo =
  | string
  | {
      status?: string;
      [key: string]: unknown;
    };

export interface ToolInfo {
  tool_name?: string;
  action_type?: ToolActionInfo;
  status?: ToolStatusInfo;
}

/** 消息类型 */
export type MessageType = 'proposal' | 'decision';

/** 带理由的按钮 */
export interface ButtonWithReason {
  button: string;
  reason: string;
}

/** 快捷按钮规则 */
export interface QuickButtonRules {
  forbiddenActions?: string[];
}

/** 方案类响应（方案评价师） */
export interface ProposalButtonsResponse {
  type: 'proposal';
  extracted: string[];
  suggested: ButtonWithReason[];
}

/** 非方案类响应（任务决策者） */
export interface DecisionButtonsResponse {
  type: 'decision';
  actions: ButtonWithReason[];
}

/** LLM 按钮响应（联合类型） */
export type LLMButtonsResponse = ProposalButtonsResponse | DecisionButtonsResponse;

/** 待办事项状态 */
export type TodoStatus = 'completed' | 'in_progress' | 'cancelled' | 'pending';

/** 待办事项 */
export interface TodoItem {
  content: string;
  status?: TodoStatus | null;
  id?: string;
}

/** 待办事项列表 */
export interface TodoList {
  items: TodoItem[];
  completedCount: number;
  totalCount: number;
  percentage: number;
}
