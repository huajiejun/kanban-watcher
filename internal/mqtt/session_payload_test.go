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
	if _, ok := discoveryPayload["unit_of_measurement"]; ok {
		t.Fatalf("unit_of_measurement should be omitted for session sensor: %#v", discoveryPayload["unit_of_measurement"])
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

func TestBuildSessionAttributesJSONTruncatesLargePayloadsForHomeAssistant(t *testing.T) {
	recentMessages := make([]sessionlog.ConversationMessage, 0, 20)
	for i := 0; i < 20; i++ {
		recentMessages = append(recentMessages, sessionlog.ConversationMessage{
			Role:      "assistant",
			Content:   strings.Repeat("m", 600),
			Timestamp: time.Date(2026, 3, 22, 11, i, 0, 0, time.UTC),
		})
	}

	snapshot := sessionlog.SessionConversationSnapshot{
		SessionID:       "bbe90c0d-55b8-4da5-8745-9eaaca739a47",
		WorkspaceID:     "ws-1",
		WorkspaceName:   "Workspace 1",
		LastRole:        "assistant",
		LastMessage:     strings.Repeat("x", 4000),
		MessageCount:    200,
		ToolCallCount:   0,
		UpdatedAt:       time.Date(2026, 3, 22, 12, 0, 0, 0, time.UTC),
		RecentMessages:  recentMessages,
		RecentToolCalls: nil,
	}

	attrs, err := BuildSessionAttributesJSON(snapshot)
	if err != nil {
		t.Fatalf("BuildSessionAttributesJSON: %v", err)
	}
	if len(attrs) > maxSessionAttributesLength {
		t.Fatalf("attrs len = %d, want <= %d", len(attrs), maxSessionAttributesLength)
	}

	var attrsPayload map[string]interface{}
	if err := json.Unmarshal(attrs, &attrsPayload); err != nil {
		t.Fatalf("unmarshal attrs: %v", err)
	}
	if got := attrsPayload["truncated"]; got != true {
		t.Fatalf("truncated = %v, want true", got)
	}
	recentMessagesPayload, ok := attrsPayload["recent_messages"].([]interface{})
	if !ok {
		t.Fatalf("recent_messages malformed: %#v", attrsPayload["recent_messages"])
	}
	if len(recentMessagesPayload) >= len(recentMessages) {
		t.Fatalf("recent_messages len = %d, want less than %d", len(recentMessagesPayload), len(recentMessages))
	}
}
