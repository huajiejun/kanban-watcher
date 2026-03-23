package store

import "time"

// Workspace 工作区镜像
type Workspace struct {
	ID                  string     `db:"id"`
	Name                string     `db:"name"`
	Branch              string     `db:"branch"`
	Archived            bool       `db:"archived"`
	Pinned              bool       `db:"pinned"`
	LatestSessionID     *string    `db:"latest_session_id"`
	IsRunning           bool       `db:"is_running"`
	LatestProcessStatus *string    `db:"latest_process_status"`
	HasPendingApproval  bool       `db:"has_pending_approval"`
	HasUnseenTurns      bool       `db:"has_unseen_turns"`
	HasRunningDevServer bool       `db:"has_running_dev_server"`
	FilesChanged        int        `db:"files_changed"`
	LinesAdded          int        `db:"lines_added"`
	LinesRemoved        int        `db:"lines_removed"`
	LastSeenAt          time.Time  `db:"last_seen_at"`
	CreatedAt           *time.Time `db:"created_at"`
	UpdatedAt           *time.Time `db:"updated_at"`
	SyncedAt            time.Time  `db:"synced_at"`
}

// Session 会话镜像
type Session struct {
	ID          string     `db:"id"`
	WorkspaceID string     `db:"workspace_id"`
	CreatedAt   *time.Time `db:"created_at"`
	UpdatedAt   *time.Time `db:"updated_at"`
	SyncedAt    time.Time  `db:"synced_at"`
}

// ExecutionProcess 执行进程镜像
type ExecutionProcess struct {
	ID                 string     `db:"id"`
	SessionID          string     `db:"session_id"`
	WorkspaceID        string     `db:"workspace_id"`
	RunReason          string     `db:"run_reason"`
	Status             string     `db:"status"`
	Executor           *string    `db:"executor"`
	ExecutorActionType *string    `db:"executor_action_type"`
	Dropped            bool       `db:"dropped"`
	CreatedAt          *time.Time `db:"created_at"`
	CompletedAt        *time.Time `db:"completed_at"`
	SyncedAt           time.Time  `db:"synced_at"`
}

// ProcessEntry 对话消息
type ProcessEntry struct {
	ID             int64      `db:"id"`
	ProcessID      string     `db:"process_id"`
	SessionID      string     `db:"session_id"`
	WorkspaceID    string     `db:"workspace_id"`
	EntryIndex     int        `db:"entry_index"`
	EntryType      string     `db:"entry_type"`
	Role           string     `db:"role"`
	Content        string     `db:"content"`
	ToolName       *string    `db:"tool_name"`
	ActionTypeJSON *string    `db:"action_type_json"`
	StatusJSON     *string    `db:"status_json"`
	ErrorType      *string    `db:"error_type"`
	EntryTimestamp time.Time  `db:"entry_timestamp"`
	ContentHash    string     `db:"content_hash"`
	CreatedAt      time.Time  `db:"created_at"`
}

// ActiveWorkspaceSummary 活跃工作区摘要
type ActiveWorkspaceSummary struct {
	ID              string     `db:"id"`
	Name            string     `db:"name"`
	Branch          string     `db:"branch"`
	LatestSessionID *string    `db:"latest_session_id"`
	Status          string     `db:"status"`
	HasPendingApproval bool    `db:"has_pending_approval"`
	HasUnseenTurns   bool      `db:"has_unseen_turns"`
	HasRunningDevServer bool   `db:"has_running_dev_server"`
	FilesChanged     int       `db:"files_changed"`
	LinesAdded       int       `db:"lines_added"`
	LinesRemoved     int       `db:"lines_removed"`
	UpdatedAt       *time.Time `db:"updated_at"`
	MessageCount    int        `db:"message_count"`
	LastMessageAt   *time.Time `db:"last_message_at"`
}

// SyncSubscription 同步订阅状态
type SyncSubscription struct {
	SubscriptionKey  string     `db:"subscription_key"`
	SubscriptionType string     `db:"subscription_type"`
	TargetID         string     `db:"target_id"`
	SessionID        *string    `db:"session_id"`
	WorkspaceID      *string    `db:"workspace_id"`
	LastEntryIndex   *int       `db:"last_entry_index"`
	Status           string     `db:"status"`
	LastError        *string    `db:"last_error"`
	LastSeenAt       time.Time  `db:"last_seen_at"`
	UpdatedAt        time.Time  `db:"updated_at"`
}

// NormalizedEntry 从 vibe-kanban normalized logs 提取的消息
type NormalizedEntry struct {
	Timestamp string              `json:"timestamp"`
	EntryType NormalizedEntryType `json:"entry_type"`
	Content   string              `json:"content"`
}

// NormalizedEntryType 消息类型详情
type NormalizedEntryType struct {
	Type       string      `json:"type"`
	ToolName   *string     `json:"tool_name,omitempty"`
	ActionType interface{} `json:"action_type,omitempty"`
	Status     interface{} `json:"status,omitempty"`
	ErrorType  *struct {
		Type string `json:"type"`
	} `json:"error_type,omitempty"`
}

// MessageTypesToSync 需要同步的消息类型
var MessageTypesToSync = []string{
	"user_message",
	"assistant_message",
	"tool_use",
	"error_message",
}

// ShouldSync 判断是否同步
func ShouldSync(entryType string) bool {
	for _, t := range MessageTypesToSync {
		if t == entryType {
			return true
		}
	}
	return false
}

// ToRole 将 entry_type 转换为角色
func ToRole(entryType string) string {
	switch entryType {
	case "user_message":
		return "user"
	case "assistant_message", "tool_use":
		return "assistant"
	default:
		return "system"
	}
}

func stringPtr(v string) *string {
	return &v
}
