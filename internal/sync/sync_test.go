package sync

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestWorkspaceRefreshInterval(t *testing.T) {
	tests := []struct {
		name     string
		interval int
		want     time.Duration
	}{
		{
			name:     "uses fast fallback when config is empty",
			interval: 0,
			want:     15 * time.Second,
		},
		{
			name:     "caps slow config to fast fallback",
			interval: 30,
			want:     15 * time.Second,
		},
		{
			name:     "keeps faster config",
			interval: 3,
			want:     3 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &SyncService{
				cfg: &config.Config{
					Database: config.DatabaseConfig{
						SyncIntervalSecs: tt.interval,
					},
				},
			}
			if got := service.workspaceRefreshInterval(); got != tt.want {
				t.Fatalf("workspaceRefreshInterval() = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestShouldBroadcastRealtimeEntry(t *testing.T) {
	tests := []struct {
		name     string
		existing *store.ProcessEntry
		next     *store.ProcessEntry
		want     bool
	}{
		{
			name: "broadcasts when entry is new",
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			want: true,
		},
		{
			name: "skips when hash is unchanged for same process entry",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			want: false,
		},
		{
			name: "broadcasts when hash changes for same process entry",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-b",
			},
			want: true,
		},
		{
			name: "broadcasts when tool status changes with same content hash",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				EntryType:   "tool_use",
				ContentHash: "hash-a",
				StatusJSON:  stringPtr(`{"state":"running"}`),
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				EntryType:   "tool_use",
				ContentHash: "hash-a",
				StatusJSON:  stringPtr(`{"state":"success"}`),
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldBroadcastRealtimeEntry(tt.existing, tt.next); got != tt.want {
				t.Fatalf("shouldBroadcastRealtimeEntry(%+v, %+v) = %v, want %v", tt.existing, tt.next, got, tt.want)
			}
		})
	}
}

func TestShouldPersistProcessEntryUpdate(t *testing.T) {
	baseTime := time.Date(2026, 3, 24, 0, 30, 0, 0, time.UTC)

	tests := []struct {
		name     string
		existing *store.ProcessEntry
		next     *store.ProcessEntry
		want     bool
	}{
		{
			name: "persists new entry",
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: true,
		},
		{
			name: "skips older replay for same entry",
			existing: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime.Add(2 * time.Second),
			},
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: false,
		},
		{
			name: "keeps same timestamp updates",
			existing: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldPersistProcessEntryUpdate(tt.existing, tt.next); got != tt.want {
				t.Fatalf("shouldPersistProcessEntryUpdate(%+v, %+v) = %v, want %v", tt.existing, tt.next, got, tt.want)
			}
		})
	}
}

func TestMessageContextFromProcessBuildsContextFromExecutorConfig(t *testing.T) {
	now := time.Date(2026, 3, 24, 10, 0, 0, 0, time.UTC)
	process := remoteExecutionProcess{
		ID:        "proc-1",
		SessionID: "session-1",
		RunReason: "codingagent",
		Status:    "running",
	}
	process.ExecutorAction.Typ.Type = "CodingAgentInitialRequest"
	process.ExecutorAction.Typ.ExecutorConfig = map[string]interface{}{
		"executor":  "CLAUDE_CODE",
		"variant":   "ZHIPU",
		"model_id":  "glm-4.5",
		"agent_id":  "coder",
	}

	msgCtx, err := messageContextFromProcess("ws-1", process, now)
	if err != nil {
		t.Fatalf("messageContextFromProcess 返回错误: %v", err)
	}
	if msgCtx == nil {
		t.Fatal("messageContextFromProcess = nil, want context")
	}
	if msgCtx.WorkspaceID != "ws-1" {
		t.Fatalf("workspace_id = %q, want ws-1", msgCtx.WorkspaceID)
	}
	if msgCtx.SessionID != "session-1" {
		t.Fatalf("session_id = %q, want session-1", msgCtx.SessionID)
	}
	if msgCtx.Executor == nil || *msgCtx.Executor != "CLAUDE_CODE" {
		t.Fatalf("executor = %#v, want CLAUDE_CODE", msgCtx.Executor)
	}
	if msgCtx.Variant == nil || *msgCtx.Variant != "ZHIPU" {
		t.Fatalf("variant = %#v, want ZHIPU", msgCtx.Variant)
	}
	if msgCtx.Source != "sync" {
		t.Fatalf("source = %q, want sync", msgCtx.Source)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal([]byte(msgCtx.ExecutorConfigJSON), &decoded); err != nil {
		t.Fatalf("executor_config_json 不是有效 JSON: %v", err)
	}
	if decoded["model_id"] != "glm-4.5" {
		t.Fatalf("model_id = %#v, want glm-4.5", decoded["model_id"])
	}
}

func TestMessageContextFromProcessSkipsWhenExecutorConfigMissing(t *testing.T) {
	msgCtx, err := messageContextFromProcess("ws-1", remoteExecutionProcess{
		ID:        "proc-1",
		SessionID: "session-1",
		RunReason: "codingagent",
	}, time.Now())
	if err != nil {
		t.Fatalf("messageContextFromProcess 返回错误: %v", err)
	}
	if msgCtx != nil {
		t.Fatalf("messageContextFromProcess = %#v, want nil", msgCtx)
	}
}

func TestProcessPromptEntryFromProcessBuildsUserMessage(t *testing.T) {
	now := time.Date(2026, 3, 24, 10, 0, 0, 0, time.UTC)
	createdAt := "2026-03-24T09:58:00Z"
	process := remoteExecutionProcess{
		ID:        "proc-1",
		SessionID: "session-1",
		RunReason: "codingagent",
		Status:    "running",
		CreatedAt: &createdAt,
	}
	process.ExecutorAction.Typ.Type = "CodingAgentFollowUpRequest"
	process.ExecutorAction.Typ.Prompt = "继续处理这个问题"

	entry, err := processPromptEntryFromProcess("ws-1", process, now)
	if err != nil {
		t.Fatalf("processPromptEntryFromProcess 返回错误: %v", err)
	}
	if entry == nil {
		t.Fatal("processPromptEntryFromProcess = nil, want entry")
	}
	if entry.ProcessID != "proc-1" {
		t.Fatalf("process_id = %q, want proc-1", entry.ProcessID)
	}
	if entry.EntryIndex != -1 {
		t.Fatalf("entry_index = %d, want -1", entry.EntryIndex)
	}
	if entry.EntryType != "user_message" {
		t.Fatalf("entry_type = %q, want user_message", entry.EntryType)
	}
	if entry.Content != "继续处理这个问题" {
		t.Fatalf("content = %q, want 继续处理这个问题", entry.Content)
	}
	if got := entry.EntryTimestamp.Format(time.RFC3339); got != createdAt {
		t.Fatalf("entry_timestamp = %q, want %q", got, createdAt)
	}
}

func TestProcessPromptEntryFromProcessSkipsLogDerivedUserMessage(t *testing.T) {
	if store.ShouldSync("user_message") {
		t.Fatal("ShouldSync(user_message) = true, want false")
	}
}
