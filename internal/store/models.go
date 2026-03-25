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

// MessageContext 工作区消息发送上下文
type MessageContext struct {
	WorkspaceID        string    `db:"workspace_id"`
	SessionID          string    `db:"session_id"`
	ProcessID          *string   `db:"process_id"`
	Executor           *string   `db:"executor"`
	Variant            *string   `db:"variant"`
	ExecutorConfigJSON string    `db:"executor_config_json"`
	ForceWhenDirty     *bool     `db:"force_when_dirty"`
	PerformGitReset    *bool     `db:"perform_git_reset"`
	DefaultSendMode    string    `db:"default_send_mode"`
	Source             string    `db:"source"`
	UpdatedAt          time.Time `db:"updated_at"`
	SyncedAt           time.Time `db:"synced_at"`
}

// ProcessEntry 对话消息
type ProcessEntry struct {
	ID             int64     `db:"id"`
	ProcessID      string    `db:"process_id"`
	SessionID      string    `db:"session_id"`
	WorkspaceID    string    `db:"workspace_id"`
	EntryIndex     int       `db:"entry_index"`
	EntryType      string    `db:"entry_type"`
	Role           string    `db:"role"`
	Content        string    `db:"content"`
	ToolName       *string   `db:"tool_name"`
	ActionTypeJSON *string   `db:"action_type_json"`
	StatusJSON     *string   `db:"status_json"`
	ErrorType      *string   `db:"error_type"`
	EntryTimestamp time.Time `db:"entry_timestamp"`
	ContentHash    string    `db:"content_hash"`
	CreatedAt      time.Time `db:"created_at"`
}

// ActiveWorkspaceSummary 活跃工作区摘要
type ActiveWorkspaceSummary struct {
	ID                       string     `db:"id"`
	Name                     string     `db:"name"`
	Branch                   string     `db:"branch"`
	LatestSessionID          *string    `db:"latest_session_id"`
	Status                   string     `db:"status"`
	HasPendingApproval       bool       `db:"has_pending_approval"`
	HasUnseenTurns           bool       `db:"has_unseen_turns"`
	HasRunningDevServer      bool       `db:"has_running_dev_server"`
	FilesChanged             int        `db:"files_changed"`
	LinesAdded               int        `db:"lines_added"`
	LinesRemoved             int        `db:"lines_removed"`
	UpdatedAt                *time.Time `db:"updated_at"`
	MessageCount             int        `db:"message_count"`
	LastMessageAt            *time.Time `db:"last_message_at"`
	LatestProcessCompletedAt *time.Time `db:"latest_process_completed_at"`
	LastMessage              *string    `db:"last_message"`
}

// WorkspaceView 服务级共享工作区布局
type WorkspaceView struct {
	ScopeKey                  string     `db:"scope_key"`
	OpenWorkspaceIDsJSON      string     `db:"open_workspace_ids_json"`
	ActiveWorkspaceID         *string    `db:"active_workspace_id"`
	DismissedAttentionIDsJSON string     `db:"dismissed_attention_ids_json"`
	Version                   int64      `db:"version"`
	UpdatedAt                 time.Time  `db:"updated_at"`
	CreatedAt                 *time.Time `db:"created_at"`
}

// SyncSubscription 同步订阅状态
type SyncSubscription struct {
	SubscriptionKey  string    `db:"subscription_key"`
	SubscriptionType string    `db:"subscription_type"`
	TargetID         string    `db:"target_id"`
	SessionID        *string   `db:"session_id"`
	WorkspaceID      *string   `db:"workspace_id"`
	LastEntryIndex   *int      `db:"last_entry_index"`
	Status           string    `db:"status"`
	LastError        *string   `db:"last_error"`
	LastSeenAt       time.Time `db:"last_seen_at"`
	UpdatedAt        time.Time `db:"updated_at"`
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

func boolPtr(v bool) *bool {
	return &v
}

// TokenUsageDaily 按天聚合的 Token 用量
type TokenUsageDaily struct {
	ID           int64     `json:"id"`
	StatDate     time.Time `json:"stat_date"`     // 天时间点，如 2026-03-24
	Executor     string    `json:"executor"`      // CLAUDE_CODE / CODEX / OPENCODE 等
	InputTokens  int64     `json:"input_tokens"`  // 输入 token 数
	OutputTokens int64     `json:"output_tokens"` // 输出 token 数
	TotalTokens  int64     `json:"total_tokens"`  // 总 token 数
	SessionCount int       `json:"session_count"` // 该天会话数
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
