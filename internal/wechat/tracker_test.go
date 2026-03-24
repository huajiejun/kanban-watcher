package wechat

import (
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/state"
)

func makeWorkspace(id string, hasUnseen, hasPending bool, completedAt *string) api.EnrichedWorkspace {
	return makeWorkspaceWithSession(id, id+"-session", hasUnseen, hasPending, completedAt)
}

func makeWorkspaceWithSession(id, sessionID string, hasUnseen, hasPending bool, completedAt *string) api.EnrichedWorkspace {
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	return api.EnrichedWorkspace{
		Workspace: api.Workspace{
			ID:        id,
			Branch:    "branch/" + id,
			UpdatedAt: updatedAt,
		},
		Summary: api.WorkspaceSummary{
			WorkspaceID:              id,
			LatestSessionID:          &sessionID,
			HasUnseenTurns:           hasUnseen,
			HasPendingApproval:       hasPending,
			LatestProcessCompletedAt: completedAt,
		},
		DisplayName: id,
	}
}

func makeWorkspaceWithStateVersion(id, sessionID, updatedAt string, hasUnseen, hasPending bool, completedAt *string) api.EnrichedWorkspace {
	workspace := makeWorkspaceWithSession(id, sessionID, hasUnseen, hasPending, completedAt)
	workspace.Workspace.UpdatedAt = updatedAt
	return workspace
}

func strPtr(s string) *string { return &s }

func TestTracker_NoAlertBeforeThreshold(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// First call: starts clock, no notification
	notify := tracker.ProcessWorkspaces(ws, now)
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications, got %d", len(notify))
	}

	// Second call (30s later): confirms stability, still under threshold
	notify = tracker.ProcessWorkspaces(ws, now.Add(30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications at confirm, got %d", len(notify))
	}

	// 5 minutes after confirm: still under threshold
	notify = tracker.ProcessWorkspaces(ws, now.Add(5*time.Minute+30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications at 5min, got %d", len(notify))
	}
}

func TestTracker_AlertAfterThreshold(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// First call: starts clock
	tracker.ProcessWorkspaces(ws, now)

	// Second call (30s later): confirms stability
	tracker.ProcessWorkspaces(ws, now.Add(30*time.Second))

	// 11 minutes after confirm: exceeds threshold → should notify
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute+30*time.Second))
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
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	ws := []api.EnrichedWorkspace{
		makeWorkspace("ws1", true, false, nil),
	}

	// Seed clock with two confirms
	tracker.ProcessWorkspaces(ws, now)
	tracker.ProcessWorkspaces(ws, now.Add(30*time.Second))

	// First notification (after threshold)
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notify))
	}

	// Within repeat_interval (2 minutes later): no repeat notification
	notify = tracker.ProcessWorkspaces(ws, now.Add(13*time.Minute+30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 repeat notifications within interval, got %d", len(notify))
	}

	// After repeat_interval (9 minutes later): should repeat notification (stacked reminder)
	notify = tracker.ProcessWorkspaces(ws, now.Add(20*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected 1 stacked reminder notification, got %d", len(notify))
	}
}

func TestTracker_NewCompletedAtResetsDedup(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
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
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
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
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	ws := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}

	// Two confirms then notify
	tracker.ProcessWorkspaces(ws, now)
	tracker.ProcessWorkspaces(ws, now.Add(30*time.Second))
	notify := tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected notification before save, got %d", len(notify))
	}

	// Simulate restart: load state and create new tracker
	savedState := tracker.GetState()
	tracker2 := NewTracker(savedState, 5, 10, 5)

	// Within repeat_interval after restart: should not notify
	notify = tracker2.ProcessWorkspaces(ws, now.Add(13*time.Minute+30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications within repeat_interval after restart, got %d", len(notify))
	}

	// After repeat_interval (9 minutes later): should notify again (stacked reminder)
	notify = tracker2.ProcessWorkspaces(ws, now.Add(20*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected 1 stacked reminder notification after restart, got %d", len(notify))
	}
}

func TestTracker_TransientFalsePositive(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// First cycle: needs attention
	ws1 := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}
	tracker.ProcessWorkspaces(ws1, now)

	// Second cycle: problem resolved (user viewed it)
	wsResolved := []api.EnrichedWorkspace{makeWorkspace("ws1", false, false, nil)}
	tracker.ProcessWorkspaces(wsResolved, now.Add(30*time.Second))

	// Third cycle: back to needing attention (new problem)
	tracker.ProcessWorkspaces(ws1, now.Add(1*time.Minute))

	// Fourth cycle: confirms the new problem
	tracker.ProcessWorkspaces(ws1, now.Add(1*time.Minute+30*time.Second))

	// Wait for threshold
	notify := tracker.ProcessWorkspaces(ws1, now.Add(11*time.Minute+1*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after resolve+restart, got %d", len(notify))
	}
}

func TestTracker_NewSessionRestartsTimer(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	firstSession := []api.EnrichedWorkspace{
		makeWorkspaceWithSession("ws1", "session-1", true, false, nil),
	}
	tracker.ProcessWorkspaces(firstSession, now)
	tracker.ProcessWorkspaces(firstSession, now.Add(30*time.Second))

	secondSession := []api.EnrichedWorkspace{
		makeWorkspaceWithSession("ws1", "session-2", true, false, nil),
	}

	notify := tracker.ProcessWorkspaces(secondSession, now.Add(10*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications when a new session just entered attention, got %d", len(notify))
	}

	notify = tracker.ProcessWorkspaces(secondSession, now.Add(20*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after the new session waits full threshold, got %d", len(notify))
	}
}

func TestTracker_UpdatedAtChangeRestartsApprovalTimer(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	firstAttention := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session-1", "2026-03-24T12:00:00Z", false, true, nil),
	}
	tracker.ProcessWorkspaces(firstAttention, now)
	tracker.ProcessWorkspaces(firstAttention, now.Add(30*time.Second))

	secondAttention := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session-1", "2026-03-24T12:10:00Z", false, true, nil),
	}

	notify := tracker.ProcessWorkspaces(secondAttention, now.Add(10*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications when a new approval cycle just started, got %d", len(notify))
	}

	notify = tracker.ProcessWorkspaces(secondAttention, now.Add(16*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after the new approval cycle waits full threshold, got %d", len(notify))
	}
}

func TestTracker_BackwardCompatibility(t *testing.T) {
	// 模拟旧版本创建的状态（无 ConfirmedAt）
	now := time.Now()
	key := state.NotificationKey{
		WorkspaceID: "ws1",
		CompletedAt: "",
	}
	oldState := state.NewAppState()
	// 模拟旧状态：已有 FirstSeenAt 但无 ConfirmedAt，且未超时（5分钟前，阈值10分钟）
	oldEntry := state.AttentionEntry{
		Key:         key,
		FirstSeenAt: now.Add(-5 * time.Minute),
		NotifiedAt:  nil,
		// ConfirmedAt 为 nil（模拟旧版本）
	}
	oldState = oldState.WithEntry(key, oldEntry)

	// 创建 Tracker（此时会进行兼容性迁移）
	tracker := NewTracker(oldState, 5, 10, 5)

	ws := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}

	// 未超时迁移后：ConfirmedAt = FirstSeenAt = 5分钟前
	// 2分钟后（即 now + 2分钟）elapsed = 7min < 10min，不会通知
	notify := tracker.ProcessWorkspaces(ws, now.Add(2*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (under threshold), got %d", len(notify))
	}

	// 11分钟后（超过阈值），应该通知
	notify = tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after threshold, got %d", len(notify))
	}
}

func TestTracker_BackwardCompatibility_Expired(t *testing.T) {
	// 模拟旧版本创建的状态（无 ConfirmedAt）且已超时
	now := time.Now()
	key := state.NotificationKey{
		WorkspaceID: "ws1",
		CompletedAt: "",
	}
	oldState := state.NewAppState()
	// 模拟旧状态：已有 FirstSeenAt 但无 ConfirmedAt，且已超时（15分钟前，阈值10分钟）
	oldEntry := state.AttentionEntry{
		Key:         key,
		FirstSeenAt: now.Add(-15 * time.Minute), // 15分钟前（阈值10分钟）
		NotifiedAt:  nil,
	}
	oldState = oldState.WithEntry(key, oldEntry)

	// 创建 Tracker（此时会强制重新确认：ConfirmedAt = now）
	tracker := NewTracker(oldState, 5, 10, 5)

	ws := []api.EnrichedWorkspace{makeWorkspace("ws1", true, false, nil)}

	// 由于已超时，会强制重新确认（ConfirmedAt = now）
	// 立即检查时不会通知（因为刚确认）
	notify := tracker.ProcessWorkspaces(ws, now)
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (just reconfirmed), got %d", len(notify))
	}

	// 需要再等待阈值时间才会通知
	notify = tracker.ProcessWorkspaces(ws, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after threshold, got %d", len(notify))
	}
}
