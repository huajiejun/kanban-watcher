package mqtt

import (
	"strings"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
)

func TestPlanSessionPublishesTracksChangesAndStaleSessions(t *testing.T) {
	publisher := &Publisher{}

	first := []sessionlog.SessionConversationSnapshot{
		{
			SessionID:     "session-a",
			WorkspaceID:   "ws-1",
			WorkspaceName: "Workspace 1",
			LastMessage:   "hello",
			LastRole:      "assistant",
			MessageCount:  1,
			UpdatedAt:     time.Date(2026, 3, 22, 10, 0, 0, 0, time.UTC),
		},
	}

	publishes, stale, err := publisher.planSessionPublishes(first)
	if err != nil {
		t.Fatalf("planSessionPublishes first: %v", err)
	}
	if len(publishes) != 1 {
		t.Fatalf("first publishes len = %d, want 1", len(publishes))
	}
	if len(stale) != 0 {
		t.Fatalf("first stale len = %d, want 0", len(stale))
	}

	publishes, stale, err = publisher.planSessionPublishes(first)
	if err != nil {
		t.Fatalf("planSessionPublishes unchanged: %v", err)
	}
	if len(publishes) != 0 {
		t.Fatalf("unchanged publishes len = %d, want 0", len(publishes))
	}
	if len(stale) != 0 {
		t.Fatalf("unchanged stale len = %d, want 0", len(stale))
	}

	second := []sessionlog.SessionConversationSnapshot{
		{
			SessionID:     "session-b",
			WorkspaceID:   "ws-2",
			WorkspaceName: "Workspace 2",
			LastMessage:   "next",
			LastRole:      "assistant",
			MessageCount:  2,
			UpdatedAt:     time.Date(2026, 3, 22, 11, 0, 0, 0, time.UTC),
		},
	}

	publishes, stale, err = publisher.planSessionPublishes(second)
	if err != nil {
		t.Fatalf("planSessionPublishes changed: %v", err)
	}
	if len(publishes) != 1 {
		t.Fatalf("changed publishes len = %d, want 1", len(publishes))
	}
	if len(stale) != 1 || stale[0] != "session-a" {
		t.Fatalf("stale = %#v, want [session-a]", stale)
	}
}

func TestPublishSessionSnapshotsRestoresCacheOnFailure(t *testing.T) {
	publisher := NewPublisher(config.MQTTConfig{})
	publisher.publishFn = func(topic string, qos byte, retained bool, payload []byte) error {
		return errPublishFailed
	}

	initial := []sessionlog.SessionConversationSnapshot{
		{
			SessionID:     "session-a",
			WorkspaceID:   "ws-1",
			WorkspaceName: "Workspace 1",
			LastMessage:   "hello",
			LastRole:      "assistant",
			MessageCount:  1,
			UpdatedAt:     time.Date(2026, 3, 22, 10, 0, 0, 0, time.UTC),
		},
	}

	if _, _, err := publisher.PublishSessionSnapshots(nil, initial); err == nil {
		t.Fatalf("PublishSessionSnapshots error = nil, want failure")
	}

	publisher.publishFn = func(topic string, qos byte, retained bool, payload []byte) error {
		return nil
	}

	publishes, stale, err := publisher.planSessionPublishes(initial)
	if err != nil {
		t.Fatalf("planSessionPublishes after rollback: %v", err)
	}
	if len(publishes) != 1 || len(stale) != 0 {
		t.Fatalf("after rollback publishes=%d stale=%d, want 1/0", len(publishes), len(stale))
	}
}

func TestFormatSessionSyncLogIncludesPublishedAndCleanedIDs(t *testing.T) {
	publishes := []sessionPublish{
		{snapshot: sessionlog.SessionConversationSnapshot{SessionID: "session-a"}},
		{snapshot: sessionlog.SessionConversationSnapshot{SessionID: "session-b"}},
	}
	logLine := formatSessionSyncLog(publishes, []string{"session-stale"}, 1)

	wantParts := []string{
		"mqtt: session sync",
		"published=2",
		"cleaned=1",
		"extract_errors=1",
		"published_ids=[session-a,session-b]",
		"cleaned_ids=[session-stale]",
	}
	for _, want := range wantParts {
		if !strings.Contains(logLine, want) {
			t.Fatalf("formatSessionSyncLog() = %q, missing %q", logLine, want)
		}
	}
}

var errPublishFailed = publishError("publish failed")

type publishError string

func (e publishError) Error() string { return string(e) }
