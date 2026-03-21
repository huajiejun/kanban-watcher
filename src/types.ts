export interface KanbanWorkspace {
  id: string;
  name: string;
  status?: string;
  relative_time?: string;
  has_unseen_turns?: boolean;
  has_pending_approval?: boolean;
  files_changed?: number;
  lines_added?: number;
  lines_removed?: number;
  completed_at?: string;
  needs_attention?: boolean;
  pr_status?: string;
  pr_url?: string;
}

export interface KanbanEntityAttributes {
  count?: number;
  attention_count?: number;
  updated_at?: string;
  workspaces?: KanbanWorkspace[];
}
