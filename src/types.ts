export interface KanbanWorkspace {
  id: string;
  name: string;
  status?: string;
  latest_session_id?: string;
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
  workspace_id?: string;
  workspace_name?: string;
  last_message?: string;
  recent_messages?: KanbanSessionMessage[] | string;
}
