package sessionlog

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestExtractSessionSnapshotIncludesSystemControlAndRecentToolCalls(t *testing.T) {
	baseDir := t.TempDir()
	sessionID := "d7e7140c-669f-46ab-a7df-f76d31508a53"
	processDir := filepath.Join(baseDir, "sessions", "d7", sessionID, "processes")
	if err := os.MkdirAll(processDir, 0o755); err != nil {
		t.Fatalf("mkdir process dir: %v", err)
	}

	logPath := filepath.Join(processDir, "latest.jsonl")
	content := `{"Stdout":"{\"type\":\"system\",\"message\":{\"content\":\"system-start\"},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"用户消息\"},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"助手回复\"},{\"type\":\"tool_use\",\"id\":\"tool-1\",\"name\":\"Read\",\"input\":{\"path\":\"README.md\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"control_request\",\"message\":{\"action\":\"approve\"},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"tool-1\",\"content\":\"README content\"}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"control_response\",\"message\":{\"status\":\"ok\"},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-2\",\"name\":\"Edit\",\"input\":{\"path\":\"a.go\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-3\",\"name\":\"Bash\",\"input\":{\"cmd\":\"go test\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-4\",\"name\":\"Write\",\"input\":{\"path\":\"b.go\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-5\",\"name\":\"Search\",\"input\":{\"q\":\"mqtt\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-6\",\"name\":\"Read\",\"input\":{\"path\":\"c.go\"}}]},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"最后总结\"}]},\"session_id\":\"` + sessionID + `\"}"}
`
	if err := os.WriteFile(logPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write log: %v", err)
	}

	extractor := NewExtractor(baseDir, 20, 5)
	snapshot, err := extractor.ExtractSnapshot(SessionTarget{
		SessionID:     sessionID,
		WorkspaceID:   "ws-1",
		WorkspaceName: "Workspace 1",
	})
	if err != nil {
		t.Fatalf("extract snapshot: %v", err)
	}

	if got, want := snapshot.MessageCount, 6; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if got, want := len(snapshot.RecentMessages), 6; got != want {
		t.Fatalf("recent message len = %d, want %d", got, want)
	}
	if snapshot.RecentMessages[0].Role != "system" {
		t.Fatalf("first role = %s, want system", snapshot.RecentMessages[0].Role)
	}
	if snapshot.RecentMessages[3].Role != "control_request" {
		t.Fatalf("fourth role = %s, want control_request", snapshot.RecentMessages[3].Role)
	}
	if snapshot.RecentMessages[5].Content != "最后总结" {
		t.Fatalf("last content = %q, want 最后总结", snapshot.RecentMessages[5].Content)
	}
	if got, want := snapshot.ToolCallCount, 6; got != want {
		t.Fatalf("tool call count = %d, want %d", got, want)
	}
	if got, want := len(snapshot.RecentToolCalls), 5; got != want {
		t.Fatalf("recent tool call len = %d, want %d", got, want)
	}
	if snapshot.RecentToolCalls[0].ToolUseID != "tool-2" {
		t.Fatalf("first retained tool_use_id = %s, want tool-2", snapshot.RecentToolCalls[0].ToolUseID)
	}
	if snapshot.RecentToolCalls[4].ToolUseID != "tool-6" {
		t.Fatalf("last retained tool_use_id = %s, want tool-6", snapshot.RecentToolCalls[4].ToolUseID)
	}
	if snapshot.RecentToolCalls[0].Name != "Edit" {
		t.Fatalf("first retained tool name = %s, want Edit", snapshot.RecentToolCalls[0].Name)
	}
	if snapshot.RecentToolCalls[0].ResultSummary != "" {
		t.Fatalf("unexpected result summary for tool-2: %q", snapshot.RecentToolCalls[0].ResultSummary)
	}
	if snapshot.LastRole != "assistant" {
		t.Fatalf("last role = %s, want assistant", snapshot.LastRole)
	}
	if snapshot.LastMessage != "最后总结" {
		t.Fatalf("last message = %q, want 最后总结", snapshot.LastMessage)
	}
}

func TestExtractSessionSnapshotPrefersCodexCompletedItemsOverDeltaFallback(t *testing.T) {
	baseDir := t.TempDir()
	sessionID := "4f495318-07a4-4882-b4c1-4453ea9e2818"
	processDir := filepath.Join(baseDir, "sessions", "4f", sessionID, "processes")
	if err := os.MkdirAll(processDir, 0o755); err != nil {
		t.Fatalf("mkdir process dir: %v", err)
	}

	logPath := filepath.Join(processDir, "latest.jsonl")
	content := `{"Stdout":"{\"method\":\"item/completed\",\"params\":{\"item\":{\"type\":\"userMessage\",\"id\":\"user-1\",\"content\":[{\"type\":\"text\",\"text\":\"用户提问\"}]}}}"}
{"Stdout":"{\"method\":\"codex/event/agent_message_content_delta\",\"params\":{\"msg\":{\"item_id\":\"msg-1\",\"delta\":\"你\"}}}"}
{"Stdout":"{\"method\":\"item/agentMessage/delta\",\"params\":{\"itemId\":\"msg-1\",\"delta\":\"好\"}}"}
{"Stdout":"{\"method\":\"item/completed\",\"params\":{\"item\":{\"type\":\"agentMessage\",\"id\":\"msg-1\",\"text\":\"你好\"}}}"}
{"Stdout":"{\"method\":\"item/completed\",\"params\":{\"item\":{\"type\":\"reasoning\",\"id\":\"rs-1\",\"summary\":[],\"content\":[]}}}"}
{"Stdout":"{\"method\":\"codex/event/item_completed\",\"params\":{\"msg\":{\"item\":{\"type\":\"AgentMessage\",\"id\":\"msg-2\",\"content\":[{\"type\":\"Text\",\"text\":\"最终答复\"}],\"phase\":\"final_answer\"}}}}"}
{"Stdout":"{\"method\":\"codex/event/agent_message_content_delta\",\"params\":{\"msg\":{\"item_id\":\"msg-3\",\"delta\":\"仅\"}}}"}
{"Stdout":"{\"method\":\"codex/event/agent_message_content_delta\",\"params\":{\"msg\":{\"item_id\":\"msg-3\",\"delta\":\"仅增量\"}}}"}
`
	if err := os.WriteFile(logPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write log: %v", err)
	}

	extractor := NewExtractor(baseDir, 20, 5)
	snapshot, err := extractor.ExtractSnapshot(SessionTarget{
		SessionID:     sessionID,
		WorkspaceID:   "ws-2",
		WorkspaceName: "Workspace 2",
	})
	if err != nil {
		t.Fatalf("extract snapshot: %v", err)
	}

	if got, want := snapshot.MessageCount, 3; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if got, want := len(snapshot.RecentMessages), 3; got != want {
		t.Fatalf("recent message len = %d, want %d", got, want)
	}
	if snapshot.RecentMessages[0].Role != "user" || snapshot.RecentMessages[0].Content != "用户提问" {
		t.Fatalf("first message = %#v, want user/用户提问", snapshot.RecentMessages[0])
	}
	if snapshot.RecentMessages[1].Role != "assistant" || snapshot.RecentMessages[1].Content != "你好" {
		t.Fatalf("second message = %#v, want assistant/你好", snapshot.RecentMessages[1])
	}
	if snapshot.RecentMessages[2].Content != "最终答复" {
		t.Fatalf("third content = %q, want 最终答复", snapshot.RecentMessages[2].Content)
	}
	if snapshot.LastRole != "assistant" || snapshot.LastMessage != "最终答复" {
		t.Fatalf("last = %s/%q, want assistant/最终答复", snapshot.LastRole, snapshot.LastMessage)
	}
}

func TestExtractSessionSnapshotDeduplicatesCodexCompletedEventsByItemID(t *testing.T) {
	baseDir := t.TempDir()
	sessionID := "4f495318-07a4-4882-b4c1-4453ea9e2818"
	processDir := filepath.Join(baseDir, "sessions", "4f", sessionID, "processes")
	if err := os.MkdirAll(processDir, 0o755); err != nil {
		t.Fatalf("mkdir process dir: %v", err)
	}

	logPath := filepath.Join(processDir, "latest.jsonl")
	content := `{"Stdout":"{\"method\":\"codex/event/item_completed\",\"params\":{\"msg\":{\"item\":{\"type\":\"UserMessage\",\"id\":\"user-1\",\"content\":[{\"type\":\"text\",\"text\":\"重复用户消息\"}]}}}}"}
{"Stdout":"{\"method\":\"item/completed\",\"params\":{\"item\":{\"type\":\"userMessage\",\"id\":\"user-1\",\"content\":[{\"type\":\"text\",\"text\":\"重复用户消息\"}]}}}"}
{"Stdout":"{\"method\":\"codex/event/item_completed\",\"params\":{\"msg\":{\"item\":{\"type\":\"AgentMessage\",\"id\":\"assistant-1\",\"text\":\"重复助手消息\"}}}}"}
{"Stdout":"{\"method\":\"item/completed\",\"params\":{\"item\":{\"type\":\"agentMessage\",\"id\":\"assistant-1\",\"text\":\"重复助手消息\"}}}"}
`
	if err := os.WriteFile(logPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write log: %v", err)
	}

	extractor := NewExtractor(baseDir, 20, 5)
	snapshot, err := extractor.ExtractSnapshot(SessionTarget{
		SessionID:     sessionID,
		WorkspaceID:   "ws-dup",
		WorkspaceName: "Workspace Dup",
	})
	if err != nil {
		t.Fatalf("extract snapshot: %v", err)
	}

	if got, want := snapshot.MessageCount, 2; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if got, want := len(snapshot.RecentMessages), 2; got != want {
		t.Fatalf("recent message len = %d, want %d", got, want)
	}
	if snapshot.RecentMessages[0].Content != "重复用户消息" {
		t.Fatalf("first content = %q, want 重复用户消息", snapshot.RecentMessages[0].Content)
	}
	if snapshot.RecentMessages[1].Content != "重复助手消息" {
		t.Fatalf("second content = %q, want 重复助手消息", snapshot.RecentMessages[1].Content)
	}
}

func TestExtractSessionSnapshotAggregatesMessagesAcrossProcessLogs(t *testing.T) {
	baseDir := t.TempDir()
	sessionID := "4f495318-07a4-4882-b4c1-4453ea9e2818"
	processDir := filepath.Join(baseDir, "sessions", "4f", sessionID, "processes")
	if err := os.MkdirAll(processDir, 0o755); err != nil {
		t.Fatalf("mkdir process dir: %v", err)
	}

	olderPath := filepath.Join(processDir, "older.jsonl")
	olderContent := `{"Stdout":"{\"type\":\"user\",\"message\":{\"content\":\"第一条\"},\"session_id\":\"` + sessionID + `\"}"}
{"Stdout":"{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"第二条\"}]},\"session_id\":\"` + sessionID + `\"}"}
`
	if err := os.WriteFile(olderPath, []byte(olderContent), 0o644); err != nil {
		t.Fatalf("write older log: %v", err)
	}
	olderTime := time.Date(2026, 3, 22, 13, 0, 0, 0, time.UTC)
	if err := os.Chtimes(olderPath, olderTime, olderTime); err != nil {
		t.Fatalf("chtimes older log: %v", err)
	}

	latestPath := filepath.Join(processDir, "latest.jsonl")
	latestContent := `{"Stdout":"{\"type\":\"user\",\"message\":{\"content\":\"第三条\"},\"session_id\":\"` + sessionID + `\"}"}
`
	if err := os.WriteFile(latestPath, []byte(latestContent), 0o644); err != nil {
		t.Fatalf("write latest log: %v", err)
	}
	latestTime := time.Date(2026, 3, 22, 14, 0, 0, 0, time.UTC)
	if err := os.Chtimes(latestPath, latestTime, latestTime); err != nil {
		t.Fatalf("chtimes latest log: %v", err)
	}

	extractor := NewExtractor(baseDir, 20, 5)
	snapshot, err := extractor.ExtractSnapshot(SessionTarget{
		SessionID:     sessionID,
		WorkspaceID:   "ws-3",
		WorkspaceName: "Workspace 3",
	})
	if err != nil {
		t.Fatalf("extract snapshot: %v", err)
	}

	if got, want := snapshot.MessageCount, 3; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if got, want := len(snapshot.RecentMessages), 3; got != want {
		t.Fatalf("recent message len = %d, want %d", got, want)
	}
	if snapshot.RecentMessages[0].Content != "第一条" {
		t.Fatalf("first content = %q, want 第一条", snapshot.RecentMessages[0].Content)
	}
	if snapshot.RecentMessages[1].Content != "第二条" {
		t.Fatalf("second content = %q, want 第二条", snapshot.RecentMessages[1].Content)
	}
	if snapshot.RecentMessages[2].Content != "第三条" {
		t.Fatalf("third content = %q, want 第三条", snapshot.RecentMessages[2].Content)
	}
	if !snapshot.UpdatedAt.Equal(latestTime) {
		t.Fatalf("updated_at = %s, want %s", snapshot.UpdatedAt, latestTime)
	}
}
