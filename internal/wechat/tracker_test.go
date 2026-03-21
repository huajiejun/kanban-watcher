package wechat

import (
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/state"
)

func makeWorkspace(id string, hasUnseen, hasPending bool, completedAt *string) api.EnrichedWorkspace {
	return api.EnrichedWorkspace{
		Workspace: api.Workspace{
			ID:     id,
			Branch: "branch/" + id,
		},
		Summary: api.WorkspaceSummary{
			WorkspaceID:              id,
			HasUnseenTurns:           hasUnseen,
			HasPendingApproval:       hasPending,
			LatestProcessCompletedAt: completedAt,
		},
		DisplayName: id,
	}
}

func strPtr(s string) *string { return &s }

func TestTracker_NoAlertBeforeThreshold(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// First call: starts clock, no notification
	notify := tracker.ProcessWorkspaces(ws, now)
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications, got %d", len(notify))
	}

	// 5 minutes later: still under threshold
	notify = tracker.ProcessWorkspaces(ws, now.Add(5*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications at 5min, got %d", len(notify))
	}
}

func TestTracker_AlertAfterThreshold(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// First call
	tracker.ProcessWorkspaces(ws, now)

	// 11 minutes later: exceeds threshold → should notify
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification at 11min, got %d", len(notify))
	}
	if notify[0].Workspace.ID != "ws1" {
		t.Errorf("expected ws1 notification, got %s", notify[0].Workspace.ID)
	}
	if notify[0].ElapsedMinutes < 11 {
		t.Errorf("expected elapsed >= 11min, got %d", notify[0].ElapsedMinutes)
	}
}

func TestTracker_NoRepeatNotification(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// Seed clock
	tracker.ProcessWorkspaces(ws, now)

	// First notification
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notify))
	}

	// Second call: already notified for this key → no repeat
	notify = tracker.ProcessWorkspaces(ws, now.Add(20*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 repeat notifications, got %d", len(notify))
	}
}

func TestTracker_NewCompletedAtResetsDedup(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()
	completedAt1 := strPtr("2026-03-21T10:00:00Z")

	ws1 := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, completedAt1)}

	// Seed and notify for first completedAt
	tracker.ProcessWorkspaces(ws1, now)
	notify := tracker.ProcessWorkspaces(ws1, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1st notification, got %d", len(notify))
	}

	// New run with different completedAt: should restart tracking
	completedAt2 := strPtr("2026-03-21T11:00:00Z")
	ws2 := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, completedAt2)}

	tracker.ProcessWorkspaces(ws2, now.Add(12*time.Minute))
	notify = tracker.ProcessWorkspaces(ws2, now.Add(25*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected notification for new completedAt, got %d", len(notify))
	}
}

func TestTracker_ResolvedWorkspaceRemoved(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()

	ws := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}
	tracker.ProcessWorkspaces(ws, now)

	// Workspace resolved
	wsResolved := []api.EnrichedWorkspace{makeWorkspace("ws1", false, false, nil)}
	tracker.ProcessWorkspaces(wsResolved, now.Add(2*time.Minute))

	// Should be clean: if it goes needs-attention again, clock restarts
	ws = []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}
	tracker.ProcessWorkspaces(ws, now.Add(3*time.Minute))

	// Only 8 minutes since restart (3+8 - 3 = 8 < 10)
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	// 11 - 3 = 8 minutes elapsed since restart: under threshold
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications after resolve+restart, got %d", len(notify))
	}
}

func TestTracker_StatePersistence(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 10)
	now := time.Now()

	ws := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}
	tracker.ProcessWorkspaces(ws, now)

	// Simulate restart: load state and create new tracker
	savedState := tracker.GetState()
	tracker2 := NewTracker(savedState, 10)

	// 11 minutes after original start: should notify
	notify := tracker2.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected notification after restart with saved state, got %d", len(notify))
	}
}
