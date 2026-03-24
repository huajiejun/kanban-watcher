package sync

import (
	"errors"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestExtractEntryPatchesFromInitialSnapshot(t *testing.T) {
	message := []byte(`{
		"JsonPatch": [
			{
				"op": "replace",
				"path": "/entries",
				"value": [
					{
						"type": "NORMALIZED_ENTRY",
						"content": {
							"timestamp": "2026-03-23T10:00:00Z",
							"entry_type": {"type": "user_message"},
							"content": "hello"
						}
					},
					{
						"type": "NORMALIZED_ENTRY",
						"content": {
							"timestamp": "2026-03-23T10:00:01Z",
							"entry_type": {"type": "assistant_message"},
							"content": "world"
						}
					}
				]
			}
		]
	}`)

	patches, err := extractEntryPatches(message)
	if err != nil {
		t.Fatalf("extractEntryPatches 返回错误: %v", err)
	}
	if len(patches) != 2 {
		t.Fatalf("patches 数量 = %d, want 2", len(patches))
	}
	if patches[0].EntryIndex != 0 || patches[1].EntryIndex != 1 {
		t.Fatalf("entry_index 错误: %#v", patches)
	}
}

func TestExtractEntryPatchesIncludesNestedContentUpdate(t *testing.T) {
	message := []byte(`{
		"JsonPatch": [
			{
				"op": "replace",
				"path": "/entries/1/content/content",
				"value": "实现和验证都已经收口"
			}
		]
	}`)

	patches, err := extractEntryPatches(message)
	if err != nil {
		t.Fatalf("extractEntryPatches 返回错误: %v", err)
	}
	if len(patches) != 1 {
		t.Fatalf("patches 数量 = %d, want 1", len(patches))
	}
	if patches[0].EntryIndex != 1 {
		t.Fatalf("entry_index = %d, want 1", patches[0].EntryIndex)
	}
	if !patches[0].IsPartial {
		t.Fatalf("IsPartial = false, want true")
	}
	if patches[0].Entry.Content != "实现和验证都已经收口" {
		t.Fatalf("content = %q, want 完整增量文本", patches[0].Entry.Content)
	}
}

func TestMergeEntryPatchAppliesPartialContentUpdate(t *testing.T) {
	base := store.NormalizedEntry{
		Timestamp: "2026-03-23T10:00:00Z",
		EntryType: store.NormalizedEntryType{Type: "assistant_message"},
		Content:   "实",
	}

	merged, ok := mergeEntryPatch(base, entryPatch{
		EntryIndex: 1,
		IsPartial:  true,
		Entry: store.NormalizedEntry{
			Content: "实现和验证都已经收口",
		},
	})
	if !ok {
		t.Fatalf("mergeEntryPatch 返回 ok=false, want true")
	}
	if merged.Content != "实现和验证都已经收口" {
		t.Fatalf("merged content = %q, want 完整增量文本", merged.Content)
	}
	if merged.EntryType.Type != "assistant_message" {
		t.Fatalf("merged entry_type = %q, want assistant_message", merged.EntryType.Type)
	}
}

func TestExtractExecutionProcessesFromSnapshotAndIncrementalPatch(t *testing.T) {
	message := []byte(`{
		"JsonPatch": [
			{
				"op": "replace",
				"path": "/execution_processes",
				"value": {
					"proc-1": {
						"id": "proc-1",
						"session_id": "session-1",
						"run_reason": "codingagent",
						"status": "running",
						"dropped": false,
						"created_at": "2026-03-23T10:00:00Z",
						"executor_action": {
							"typ": {
								"type": "CodingAgentInitialRequest",
								"executor_config": {
									"executor": "CLAUDE_CODE",
									"variant": "ZHIPU",
									"model_id": "glm-4.5"
								}
							}
						}
					}
				}
			},
			{
				"op": "add",
				"path": "/execution_processes/proc-2",
				"value": {
					"id": "proc-2",
					"session_id": "session-1",
					"run_reason": "setupscript",
					"status": "completed",
					"dropped": false,
					"created_at": "2026-03-23T09:59:00Z",
					"executor_action": {"typ": {"type": "ScriptRequest"}}
				}
			}
		]
	}`)

	processes, err := extractExecutionProcesses(message)
	if err != nil {
		t.Fatalf("extractExecutionProcesses 返回错误: %v", err)
	}
	if len(processes) != 2 {
		t.Fatalf("process 数量 = %d, want 2", len(processes))
	}
	if processes[0].ID != "proc-1" || processes[1].ID != "proc-2" {
		t.Fatalf("process 列表错误: %#v", processes)
	}
	if got := processes[0].ExecutorAction.Typ.ExecutorConfig["executor"]; got != "CLAUDE_CODE" {
		t.Fatalf("executor = %#v, want CLAUDE_CODE", got)
	}
	if got := processes[0].ExecutorAction.Typ.ExecutorConfig["variant"]; got != "ZHIPU" {
		t.Fatalf("variant = %#v, want ZHIPU", got)
	}
}

func TestExtractWorkspacePatchesFromSnapshotAndIncrementalPatch(t *testing.T) {
	message := []byte(`{
		"JsonPatch": [
			{
				"op": "replace",
				"path": "/workspaces",
				"value": {
					"ws-1": {
						"id": "ws-1",
						"name": "Workspace One",
						"branch": "main",
						"archived": false,
						"pinned": false,
						"created_at": "2026-03-23T10:00:00Z",
						"updated_at": "2026-03-23T10:01:00Z",
						"is_running": false,
						"is_errored": false
					}
				}
			},
			{
				"op": "replace",
				"path": "/workspaces/ws-2",
				"value": {
					"id": "ws-2",
					"name": "Workspace Two",
					"branch": "feature/realtime",
					"archived": false,
					"pinned": true,
					"created_at": "2026-03-23T10:02:00Z",
					"updated_at": "2026-03-23T10:03:00Z",
					"is_running": true,
					"is_errored": false
				}
			}
		]
	}`)

	workspaces, err := extractWorkspacePatches(message)
	if err != nil {
		t.Fatalf("extractWorkspacePatches 返回错误: %v", err)
	}
	if len(workspaces) != 2 {
		t.Fatalf("workspace 数量 = %d, want 2", len(workspaces))
	}
	if workspaces[0].ID != "ws-1" || workspaces[1].ID != "ws-2" {
		t.Fatalf("workspace 列表错误: %#v", workspaces)
	}
	if !workspaces[1].IsRunning {
		t.Fatalf("ws-2 is_running = false, want true")
	}
}

func TestShouldReconnectStream(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "unexpected eof",
			err:  errors.New("websocket: close 1006 (abnormal closure): unexpected EOF"),
			want: true,
		},
		{
			name: "bad handshake",
			err:  errors.New("websocket: bad handshake"),
			want: true,
		},
		{
			name: "normal close",
			err:  errors.New("websocket: close 1000 (normal)"),
			want: false,
		},
		{
			name: "nil",
			err:  nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldReconnectStream(tt.err)
			if got != tt.want {
				t.Fatalf("shouldReconnectStream(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestShouldReconnectProcessLog(t *testing.T) {
	tests := []struct {
		name         string
		status       string
		receivedData bool
		err          error
		want         bool
	}{
		{
			name:         "running process eof reconnect",
			status:       "running",
			receivedData: true,
			err:          errors.New("websocket: close 1006 (abnormal closure): unexpected EOF"),
			want:         true,
		},
		{
			name:         "completed process eof no reconnect",
			status:       "completed",
			receivedData: true,
			err:          errors.New("websocket: close 1006 (abnormal closure): unexpected EOF"),
			want:         false,
		},
		{
			name:         "completed process handshake fail no reconnect",
			status:       "completed",
			receivedData: false,
			err:          errors.New("websocket: bad handshake"),
			want:         false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldReconnectProcessLog(tt.status, tt.receivedData, tt.err)
			if got != tt.want {
				t.Fatalf("shouldReconnectProcessLog(%q, %v, %v) = %v, want %v", tt.status, tt.receivedData, tt.err, got, tt.want)
			}
		})
	}
}

func TestShouldReconnectRunningProcessByLatestStatus(t *testing.T) {
	tests := []struct {
		name   string
		status *string
		want   bool
	}{
		{name: "missing process stops reconnect", status: nil, want: false},
		{name: "latest running keeps reconnect", status: stringPtr("running"), want: true},
		{name: "latest completed stops reconnect", status: stringPtr("completed"), want: false},
		{name: "latest failed stops reconnect", status: stringPtr("failed"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldReconnectRunningProcessByLatestStatus(tt.status)
			if got != tt.want {
				t.Fatalf("shouldReconnectRunningProcessByLatestStatus(%v) = %v, want %v", tt.status, got, tt.want)
			}
		})
	}
}

func TestShouldSkipCompletedProcessSubscription(t *testing.T) {
	tests := []struct {
		name   string
		status string
		sub    string
		want   bool
	}{
		{name: "running never skip", status: "running", sub: "completed", want: false},
		{name: "completed already synced", status: "completed", sub: "completed", want: true},
		{name: "completed active sync", status: "completed", sub: "active", want: false},
		{name: "failed already synced", status: "failed", sub: "completed", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldSkipHistoricalProcess(tt.status, tt.sub)
			if got != tt.want {
				t.Fatalf("shouldSkipHistoricalProcess(%q, %q) = %v, want %v", tt.status, tt.sub, got, tt.want)
			}
		})
	}
}

func TestShouldSkipEntryByIndex(t *testing.T) {
	tests := []struct {
		name           string
		lastEntryIndex *int
		entryIndex     int
		want           bool
	}{
		{name: "no checkpoint", lastEntryIndex: nil, entryIndex: 3, want: false},
		{name: "older index", lastEntryIndex: intPtr(10), entryIndex: 3, want: true},
		{name: "same index update", lastEntryIndex: intPtr(10), entryIndex: 10, want: false},
		{name: "newer index", lastEntryIndex: intPtr(10), entryIndex: 11, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldSkipEntryByIndex(tt.lastEntryIndex, tt.entryIndex)
			if got != tt.want {
				t.Fatalf("shouldSkipEntryByIndex(%v, %d) = %v, want %v", tt.lastEntryIndex, tt.entryIndex, got, tt.want)
			}
		})
	}
}

func intPtr(v int) *int {
	return &v
}

func TestResolveProcessSubscriptionStatus(t *testing.T) {
	tests := []struct {
		name            string
		processStatus   string
		receivedEntries bool
		stopping        bool
		err             error
		wantStatus      string
		wantErrEmpty    bool
	}{
		{
			name:            "completed with entries",
			processStatus:   "completed",
			receivedEntries: true,
			wantStatus:      "completed_with_entries",
			wantErrEmpty:    true,
		},
		{
			name:            "completed empty",
			processStatus:   "completed",
			receivedEntries: false,
			wantStatus:      "completed_empty",
			wantErrEmpty:    true,
		},
		{
			name:          "stopping session",
			processStatus: "running",
			stopping:      true,
			err:           errors.New("read tcp 1.1.1.1:123->2.2.2.2:443: use of closed network connection"),
			wantStatus:    "stopped",
			wantErrEmpty:  true,
		},
		{
			name:          "connect error",
			processStatus: "running",
			err:           errors.New("websocket: bad handshake"),
			wantStatus:    "error",
			wantErrEmpty:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, errText := resolveProcessSubscriptionStatus(tt.processStatus, tt.receivedEntries, tt.stopping, tt.err)
			if status != tt.wantStatus {
				t.Fatalf("status = %q, want %q", status, tt.wantStatus)
			}
			if (errText == "") != tt.wantErrEmpty {
				t.Fatalf("errText empty = %v, want %v", errText == "", tt.wantErrEmpty)
			}
		})
	}
}
