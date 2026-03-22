export interface KanbanWorkspace {
  id: string;
  name: string;
  status?: string;
  latest_session_id?: string;
  latestSessionId?: string;
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
  needs_attention?: boolean;
  latest_process_status?: string;
  latestProcessStatus?: string;
  pr_status?: string;
  prStatus?: string;
  pr_url?: string;
  is_pinned?: boolean;
  isPinned?: boolean;
}

export interface KanbanConversationMessage {
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
  message_count?: number;
  tool_call_count?: number;
  updated_at?: string;
  last_message?: string;
  recent_messages?: KanbanConversationMessage[];
  recent_tool_calls?: unknown[];
}

export interface KanbanEntityAttributes {
  count?: number;
  attention_count?: number;
  updated_at?: string;
  workspaces?: KanbanWorkspace[];
}
