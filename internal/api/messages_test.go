package api

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestReverseMessagesInPlace(t *testing.T) {
	messages := []store.ProcessEntry{
		{ID: 3, EntryType: "assistant_message", EntryTimestamp: time.Now()},
		{ID: 2, EntryType: "tool_use", EntryTimestamp: time.Now().Add(-time.Second)},
		{ID: 1, EntryType: "user_message", EntryTimestamp: time.Now().Add(-2 * time.Second)},
	}

	reverseMessages(messages)

	if messages[0].ID != 1 || messages[1].ID != 2 || messages[2].ID != 3 {
		t.Fatalf("reverse 后顺序错误: %#v", messages)
	}
}

func TestParseTypesFilter(t *testing.T) {
	got := parseTypesFilter("user_message,assistant_message,tool_use")
	if len(got) != 3 {
		t.Fatalf("types 数量 = %d, want 3", len(got))
	}
	if got[0] != "user_message" || got[2] != "tool_use" {
		t.Fatalf("types = %#v", got)
	}
}

func TestMessageResponseJSONWithToolInfo(t *testing.T) {
	resp := MessageResponse{
		ID:        1,
		SessionID: "session-1",
		ProcessID: "proc-1",
		EntryType: "tool_use",
		Role:      "assistant",
		Content:   "Read file",
		ToolInfo: map[string]interface{}{
			"tool_name":   "Read",
			"action_type": map[string]interface{}{"action": "file_read"},
			"status":      map[string]interface{}{"status": "success"},
		},
		Timestamp: "2026-03-23T10:00:00Z",
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal 失败: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal 失败: %v", err)
	}

	toolInfo, ok := decoded["tool_info"].(map[string]interface{})
	if !ok {
		t.Fatalf("tool_info 类型错误: %#v", decoded["tool_info"])
	}
	if toolInfo["tool_name"] != "Read" {
		t.Fatalf("tool_name = %#v, want Read", toolInfo["tool_name"])
	}
}

func TestActiveWorkspaceResponseJSONIncludesAttentionFields(t *testing.T) {
	resp := ActiveWorkspaceResponse{
		Workspaces: []LocalWorkspaceSummary{
			{
				ID:                "ws-1",
				Name:              "Attention Workspace",
				Branch:            "main",
				Status:            "completed",
				HasUnseenTurns:    true,
				HasPendingApproval: true,
				FilesChanged:      5,
				LinesAdded:        12,
				LinesRemoved:      3,
			},
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal 失败: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal 失败: %v", err)
	}

	workspaces, ok := decoded["workspaces"].([]interface{})
	if !ok || len(workspaces) != 1 {
		t.Fatalf("workspaces 类型错误: %#v", decoded["workspaces"])
	}

	item, ok := workspaces[0].(map[string]interface{})
	if !ok {
		t.Fatalf("workspace item 类型错误: %#v", workspaces[0])
	}
	if item["has_unseen_turns"] != true {
		t.Fatalf("has_unseen_turns = %#v, want true", item["has_unseen_turns"])
	}
	if item["has_pending_approval"] != true {
		t.Fatalf("has_pending_approval = %#v, want true", item["has_pending_approval"])
	}
	if item["files_changed"] != float64(5) {
		t.Fatalf("files_changed = %#v, want 5", item["files_changed"])
	}
}
