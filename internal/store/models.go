package store

import "time"

// Workspace 工作区
type Workspace struct {
	ID              string    `db:"id"`
	Name            string    `db:"name"`
	Branch          string    `db:"branch"`
	Archived        bool      `db:"archived"`
	Pinned          bool      `db:"pinned"`
	LatestSessionID *string   `db:"latest_session_id"`
	CreatedAt       time.Time `db:"created_at"`
	UpdatedAt       time.Time `db:"updated_at"`
	SyncedAt        time.Time `db:"synced_at"`
}

// Session 会话
type Session struct {
	ID          string    `db:"id"`
	WorkspaceID string    `db:"workspace_id"`
	Executor    string    `db:"executor"`
	Variant     string    `db:"variant"`
	Name        string    `db:"name"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
	SyncedAt    time.Time `db:"synced_at"`
}

// ExecutionProcess 执行进程
type ExecutionProcess struct {
	ID           string    `db:"id"`
	SessionID    string    `db:"session_id"`
	RunReason    string    `db:"run_reason"`
	Status        string    `db:"status"`
	StartedAt     time.Time `db:"started_at"`
	CompletedAt   *time.Time `db:"completed_at"`
	CreatedAt     time.Time `db:"created_at"`
	SyncedAt      time.Time `db:"synced_at"`
}

// SessionMessage 对话消息
type SessionMessage struct {
	ID          int64     `db:"id"`
	SessionID    string   `db:"session_id"`
	ProcessID    *string  `db:"process_id"`
	EntryType   string   `db:"entry_type"`
	Content     string   `db:"content"`
	ToolInfo    string   `db:"tool_info"` // JSON string
	Timestamp   time.Time `db:"timestamp"`
	CreatedAt    time.Time `db:"created_at"`
}

// NormalizedEntry 从 vibe-kanban WebSocket 接收的消息格式
type NormalizedEntry struct {
	Timestamp string            `json:"timestamp"`
	EntryType  NormalizedEntryType `json:"entry_type"`
	Content   string             `json:"content"`
}

// NormalizedEntryType 消息类型详情
type NormalizedEntryType struct {
	Type        string      `json:"type"`
	ToolName    *string   `json:"tool_name,omitempty"`
	ActionType  *string   `json:"action_type,omitempty"`
	Status      *ToolStatus `json:"status,omitempty"`
}

// ToolStatus 工具状态
type ToolStatus struct {
	Status string  `json:"status"`
	Reason *string  `json:"reason,omitempty"`
}

// MessageTypes 需要同步的消息类型
var MessageTypesToSync = []string{
	"user_message",
	"assistant_message",
	"tool_use",
	"error_message",
}

// ShouldSync 判断是否需要同步该消息类型
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
