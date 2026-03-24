export interface KanbanWorkspace {
  id: string;
  name: string;
  status?: string;
  latest_session_id?: string;
  latestSessionId?: string;
  last_session_id?: string;
  relative_time?: string;
  has_unseen_turns?: boolean;
  hasUnseenActivity?: boolean;
  has_running_dev_server?: boolean;
  hasRunningDevServer?: boolean;
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
  branch?: string;
  latest_session_id?: string;
  status?: string;
  has_pending_approval?: boolean;
  has_unseen_turns?: boolean;
  has_running_dev_server?: boolean;
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
