package api

import "testing"

func TestBuildMenuSummaryPrefersReasonHint(t *testing.T) {
	lastMessage := "最近一条普通消息"
	workspace := Workspace{ID: "ws-1", Branch: "main", LastMessage: &lastMessage}
	summary := WorkspaceSummary{WorkspaceID: "ws-1", HasPendingApproval: true}

	got, source := buildMenuSummary(workspace, summary)

	if got != "待审批：等待你确认下一步" {
		t.Fatalf("summary = %q, want 待审批：等待你确认下一步", got)
	}
	if source != "reason" {
		t.Fatalf("source = %q, want reason", source)
	}
}

func TestBuildMenuSummaryFallsBackToLastMessage(t *testing.T) {
	lastMessage := "### 结论\n\n```go\nfmt.Println(\"ignore\")\n```\n请先看最后一条用户回复。"
	workspace := Workspace{ID: "ws-1", Branch: "main", LastMessage: &lastMessage}
	summary := WorkspaceSummary{WorkspaceID: "ws-1"}

	got, source := buildMenuSummary(workspace, summary)

	if got != "结论 请先看最后一条用户回复。" {
		t.Fatalf("summary = %q", got)
	}
	if source != "last_message" {
		t.Fatalf("source = %q, want last_message", source)
	}
}

func TestBuildMenuSummaryPrefersLastMessageOverUnreadReason(t *testing.T) {
	lastMessage := "这里是未读时应展示的最后一条摘要"
	workspace := Workspace{ID: "ws-1", Branch: "main", LastMessage: &lastMessage}
	summary := WorkspaceSummary{WorkspaceID: "ws-1", HasUnseenTurns: true}

	got, source := buildMenuSummary(workspace, summary)

	if got != lastMessage {
		t.Fatalf("summary = %q, want %q", got, lastMessage)
	}
	if source != "last_message" {
		t.Fatalf("source = %q, want last_message", source)
	}
}

func TestBuildMenuSummaryReturnsEmptyWhenNoReadableText(t *testing.T) {
	lastMessage := "```bash\nnpm test\n```"
	workspace := Workspace{ID: "ws-1", Branch: "main", LastMessage: &lastMessage}
	summary := WorkspaceSummary{WorkspaceID: "ws-1"}

	got, source := buildMenuSummary(workspace, summary)

	if got != "" {
		t.Fatalf("summary = %q, want empty", got)
	}
	if source != "empty" {
		t.Fatalf("source = %q, want empty", source)
	}
}
