package diff

import "time"

// DiffKind 变更类型
type DiffKind string

const (
	DiffAdded    DiffKind = "added"
	DiffModified DiffKind = "modified"
	DiffDeleted  DiffKind = "deleted"
	DiffRenamed  DiffKind = "renamed"
)

// Diff 文件差异
type Diff struct {
	Change         DiffKind `json:"change"`
	OldPath        *string  `json:"old_path,omitempty"`
	NewPath        *string  `json:"new_path,omitempty"`
	OldContent     *string  `json:"old_content,omitempty"`
	NewContent     *string  `json:"new_content,omitempty"`
	Additions      *int     `json:"additions,omitempty"`
	Deletions      *int     `json:"deletions,omitempty"`
	ContentOmitted bool     `json:"content_omitted"`
	RepoID         *string  `json:"repo_id,omitempty"`
}

// DiffStats 差异统计
type DiffStats struct {
	FilesChanged int `json:"files_changed"`
	LinesAdded   int `json:"lines_added"`
	LinesRemoved int `json:"lines_removed"`
}

// WorkspaceDiff 工作区差异汇总
type WorkspaceDiff struct {
	WorkspaceID string          `json:"workspace_id"`
	UpdatedAt   time.Time       `json:"updated_at"`
	Diffs       map[string]Diff `json:"diffs"`
	Stats       DiffStats       `json:"stats"`
}

// PatchOperation WebSocket 补丁操作
type PatchOperation struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Value *Diff  `json:"value,omitempty"`
}

// LogMessage WebSocket 日志消息
type LogMessage struct {
	Type  string         `json:"type"`
	Patch *PatchOperation `json:"patch,omitempty"`
	Ready bool           `json:"ready,omitempty"`
}

// RepoBranchStatus 仓库分支状态
type RepoBranchStatus struct {
	RepoID   string       `json:"repo_id"`
	RepoName string       `json:"repo_name"`
	Status   BranchStatus `json:"status"`
}

// BranchStatus 分支状态
type BranchStatus struct {
	CommitsAhead          int      `json:"commits_ahead"`
	CommitsBehind         int      `json:"commits_behind"`
	HasUncommittedChanges bool     `json:"has_uncommitted_changes"`
	HeadOID               string   `json:"head_oid"`
	UncommittedCount      int      `json:"uncommitted_count"`
	UntrackedCount        int      `json:"untracked_count"`
	TargetBranchName      string   `json:"target_branch_name"`
	RemoteCommitsAhead    int      `json:"remote_commits_ahead"`
	RemoteCommitsBehind   int      `json:"remote_commits_behind"`
	Merges                []Merge  `json:"merges"`
	IsRebaseInProgress    bool     `json:"is_rebase_in_progress"`
	ConflictedFiles       []string `json:"conflicted_files"`
	IsTargetRemote        bool     `json:"is_target_remote"`
}

// Merge 合并信息
type Merge struct {
	Type string `json:"type"`
}
