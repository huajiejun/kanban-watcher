package mqtt

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
)

func TestBuildSessionMessagesProducesDiscoveryStateAndAttributes(t *testing.T) {
	snapshot := sessionlog.SessionConversationSnapshot{
		SessionID:     "d7e7140c-669f-46ab-a7df-f76d31508a53",
		WorkspaceID:   "ws-1",
		WorkspaceName: "Workspace 1",
		LastRole:      "assistant",
		LastMessage:   strings.Repeat("x", 400),
		MessageCount:  20,
		ToolCallCount: 7,
		UpdatedAt:     time.Date(2026, 3, 22, 12, 0, 0, 0, time.UTC),
		RecentMessages: []sessionlog.ConversationMessage{
			{Role: "system", Content: "system-start", Timestamp: time.Date(2026, 3, 22, 11, 0, 0, 0, time.UTC)},
		},
		RecentToolCalls: []sessionlog.ToolCallSummary{
			{Name: "Read", ToolUseID: "tool-1", InputSummary: "{\"path\":\"README.md\"}", Timestamp: time.Date(2026, 3, 22, 11, 1, 0, 0, time.UTC)},
		},
	}

	discovery, err := BuildSessionDiscoveryJSON(snapshot)
	if err != nil {
		t.Fatalf("BuildSessionDiscoveryJSON: %v", err)
	}
	state := BuildSessionStateValue(snapshot)
	attrs, err := BuildSessionAttributesJSON(snapshot)
	if err != nil {
		t.Fatalf("BuildSessionAttributesJSON: %v", err)
	}

	var discoveryPayload map[string]interface{}
	if err := json.Unmarshal(discovery, &discoveryPayload); err != nil {
		t.Fatalf("unmarshal discovery: %v", err)
	}
	if got := discoveryPayload["unique_id"]; got != "kanban_watcher_session_d7e7140c-669f-46ab-a7df-f76d31508a53" {
		t.Fatalf("unique_id = %v", got)
	}
	if len(state) > 255 {
		t.Fatalf("state len = %d, want <= 255", len(state))
	}

	var attrsPayload map[string]interface{}
	if err := json.Unmarshal(attrs, &attrsPayload); err != nil {
		t.Fatalf("unmarshal attrs: %v", err)
	}
	if got := attrsPayload["workspace_name"]; got != "Workspace 1" {
		t.Fatalf("workspace_name = %v", got)
	}
	if got := attrsPayload["tool_call_count"]; got != float64(7) {
		t.Fatalf("tool_call_count = %v", got)
	}
	recentMessages, ok := attrsPayload["recent_messages"].([]interface{})
	if !ok || len(recentMessages) != 1 {
		t.Fatalf("recent_messages malformed: %#v", attrsPayload["recent_messages"])
	}
	recentToolCalls, ok := attrsPayload["recent_tool_calls"].([]interface{})
	if !ok || len(recentToolCalls) != 1 {
		t.Fatalf("recent_tool_calls malformed: %#v", attrsPayload["recent_tool_calls"])
	}
}
