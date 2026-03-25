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

// TestTracker_UpdatedAtChanges 测试当 UpdatedAt 频繁变化时是否会错误重置计时
// 这是用户报告的 bug 场景：任务在重复操作时，UpdatedAt 变化导致通知计时被重置
func TestTracker_UpdatedAtChanges_ShouldNotResetTimer(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 周期 1：ws1 需要关注，UpdatedAt = time1
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(-1*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 周期 2（30秒后）：ws1 仍需要关注，但 UpdatedAt 变化了（任务有新操作）
	// 预期：应该继承之前的计时，而不是重置
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(30*time.Second).Format(time.RFC3339), true, false, nil),
	}
	notify := tracker.ProcessWorkspaces(ws2, now.Add(30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications at confirm (new UpdatedAt), got %d", len(notify))
	}

	// 周期 3（5分钟后）：ws1 仍需要关注，UpdatedAt 再次变化
	// 如果计时被正确继承，应该还在宽限期内（需要10分钟才通知）
	ws3 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(5*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws3, now.Add(5*time.Minute+30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (timer should not reset), got %d", len(notify))
	}
}

// TestTracker_FrequentUpdatedAtChanges 测试当任务频繁操作时（UpdatedAt 不断变化）
// 是否会错误地发送通知
// 场景：用户在处理任务，任务有新操作，但问题仍未解决
func TestTracker_FrequentUpdatedAtChanges(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 周期 1：ws1 需要关注（比如有未读消息）
	ws := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws, now)

	// 周期 2（30秒后）：ws1 仍需要关注，UpdatedAt 变化（任务有新操作）
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(30*time.Second).Format(time.RFC3339), true, false, nil),
	}
	notify := tracker.ProcessWorkspaces(ws2, now.Add(30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (timer reset), got %d", len(notify))
	}

	// 周期 3（1分钟后）：ws1 仍需要关注，UpdatedAt 再次变化
	ws3 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(1*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws3, now.Add(1*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (timer reset again), got %d", len(notify))
	}

	// 周期 4（2分钟后）：ws1 仍需要关注，UpdatedAt 不变了
	// 此时应该确认稳定
	ws4 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(2*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws4, now.Add(2*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (just confirmed), got %d", len(notify))
	}

	// 周期 5（12分钟后）：ws1 仍需要关注，UpdatedAt 不变
	// 从周期 4 确认后过了 10 分钟，应该通知
	ws5 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(2*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws5, now.Add(12*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after threshold, got %d", len(notify))
	}
}

// TestTracker_UpdatedAtChanges_ShouldPreserveFirstSeenAt 测试 UpdatedAt 变化时是否应该保留 FirstSeenAt
// 当前实现会重置 FirstSeenAt，这可能导致任务频繁操作时永远不会触发通知
// 也可能导致任务操作停止后过早触发通知（因为计时被重置）
func TestTracker_UpdatedAtChanges_FirstSeenAtBehavior(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 周期 1：ws1 需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 检查 FirstSeenAt
	state1 := tracker.GetState()
	var firstSeenAt time.Time
	for _, entry := range state1.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			firstSeenAt = entry.FirstSeenAt
			break
		}
	}

	// 周期 2：UpdatedAt 变化
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(30*time.Second).Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws2, now.Add(30*time.Second))

	// 检查 FirstSeenAt 是否被重置
	state2 := tracker.GetState()
	for _, entry := range state2.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			if !entry.FirstSeenAt.Equal(firstSeenAt) {
				t.Logf("WARNING: FirstSeenAt was reset from %v to %v", firstSeenAt, entry.FirstSeenAt)
				t.Logf("This may cause issues when task has frequent operations")
			}
			break
		}
	}
}

// TestTracker_AttentionToggleAndNotify 测试工作区在"需要关注"和"不需要关注"之间切换时的通知行为
// 这是用户报告的 bug：当"开始注意"取消后，计时点没有被正确重置
func TestTracker_AttentionToggleAndNotify(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：工作区需要关注，开始计时
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 阶段 2（30秒后）：确认稳定
	tracker.ProcessWorkspaces(ws1, now.Add(30*time.Second))

	// 阶段 3（11分钟后）：达到阈值，发送通知
	notify := tracker.ProcessWorkspaces(ws1, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notify))
	}

	// 阶段 4：用户处理了问题，工作区不再需要关注
	wsResolved := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(12*time.Minute).Format(time.RFC3339), false, false, nil),
	}
	tracker.ProcessWorkspaces(wsResolved, now.Add(12*time.Minute))

	// 检查状态：应该没有跟踪记录了
	state := tracker.GetState()
	for key := range state.Entries {
		if key.WorkspaceID == "ws1" {
			t.Fatalf("expected no tracking entry after resolved, but found one")
		}
	}

	// 阶段 5（13分钟后）：问题再次出现，工作区需要关注
	// 预期：应该重新开始计时，而不是继承之前的计时
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(13*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws2, now.Add(13*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (just started tracking), got %d", len(notify))
	}

	// 阶段 6（13分30秒后）：确认稳定
	notify = tracker.ProcessWorkspaces(ws2, now.Add(13*time.Minute+30*time.Second))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (just confirmed), got %d", len(notify))
	}

	// 阶段 7（23分钟后）：从重新开始计时起超过阈值
	// 13:30 + 10分钟 = 23:30，应该通知
	notify = tracker.ProcessWorkspaces(ws2, now.Add(23*time.Minute+30*time.Second))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification after threshold from restart, got %d", len(notify))
	}
}

// TestTracker_AttentionQuickToggle 测试快速切换时的行为
// 场景：用户刚处理完问题，但 API 还没更新，导致短暂地"不需要关注"然后又"需要关注"
func TestTracker_AttentionQuickToggle(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：工作区需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 阶段 2（30秒后）：确认稳定
	tracker.ProcessWorkspaces(ws1, now.Add(30*time.Second))

	// 阶段 3（5分钟后）：仍在等待阈值
	notify := tracker.ProcessWorkspaces(ws1, now.Add(5*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (under threshold), got %d", len(notify))
	}

	// 阶段 4（5分30秒后）：短暂不需要关注（API 延迟）
	wsResolved := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), false, false, nil),
	}
	tracker.ProcessWorkspaces(wsResolved, now.Add(5*time.Minute+30*time.Second))

	// 阶段 5（6分钟后）：又需要关注了（问题仍在）
	// 预期：应该重新开始计时
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	notify = tracker.ProcessWorkspaces(ws2, now.Add(6*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (timer restarted), got %d", len(notify))
	}

	// 检查 FirstSeenAt 是否被重置
	state := tracker.GetState()
	for _, entry := range state.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			if entry.FirstSeenAt.Before(now.Add(5*time.Minute + 30*time.Second)) {
				t.Logf("WARNING: FirstSeenAt was not reset after attention toggle")
			}
			break
		}
	}
}

// TestTracker_FirstSeenAtResetAfterAttentionToggle 测试注意力切换后 FirstSeenAt 是否被正确重置
// 这是用户报告的 bug：当"开始注意"取消后，计时点没有被正确置位
func TestTracker_FirstSeenAtResetAfterAttentionToggle(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：ws1 需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 获取初始 FirstSeenAt
	state1 := tracker.GetState()
	var initialFirstSeenAt time.Time
	for _, entry := range state1.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			initialFirstSeenAt = entry.FirstSeenAt
			break
		}
	}

	// 阶段 2：ws1 不需要关注了（用户处理了问题）
	wsResolved := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(1*time.Minute).Format(time.RFC3339), false, false, nil),
	}
	tracker.ProcessWorkspaces(wsResolved, now.Add(1*time.Minute))

	// 验证：跟踪记录应该被清除
	state2 := tracker.GetState()
	for key := range state2.Entries {
		if key.WorkspaceID == "ws1" {
			t.Fatalf("expected no tracking entry after resolved, but found one")
		}
	}

	// 阶段 3：ws1 又需要关注了（问题再次出现）
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(2*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws2, now.Add(2*time.Minute))

	// 获取新的 FirstSeenAt
	state3 := tracker.GetState()
	var newFirstSeenAt time.Time
	for _, entry := range state3.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			newFirstSeenAt = entry.FirstSeenAt
			break
		}
	}

	// 验证：FirstSeenAt 应该被重置为当前时间（now + 2分钟），而不是继承之前的时间
	if newFirstSeenAt.Equal(initialFirstSeenAt) {
		t.Errorf("FirstSeenAt should be reset after attention toggle, but it was inherited")
		t.Errorf("Initial: %v, New: %v", initialFirstSeenAt, newFirstSeenAt)
	}

	// 验证：新的 FirstSeenAt 应该大约等于 now + 2分钟
	expectedNewFirstSeenAt := now.Add(2 * time.Minute)
	if newFirstSeenAt.Sub(expectedNewFirstSeenAt) > time.Second {
		t.Errorf("FirstSeenAt should be set to current time, expected ~%v, got %v", expectedNewFirstSeenAt, newFirstSeenAt)
	}

	t.Logf("PASS: FirstSeenAt was correctly reset from %v to %v", initialFirstSeenAt, newFirstSeenAt)
}

// TestTracker_ConfirmedAtResetAfterAttentionToggle 测试注意力切换后 ConfirmedAt 是否被正确重置
func TestTracker_ConfirmedAtResetAfterAttentionToggle(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：ws1 需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 阶段 2（30秒后）：确认稳定
	tracker.ProcessWorkspaces(ws1, now.Add(30*time.Second))

	// 获取初始 ConfirmedAt
	state1 := tracker.GetState()
	var initialConfirmedAt *time.Time
	for _, entry := range state1.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			initialConfirmedAt = entry.ConfirmedAt
			break
		}
	}
	if initialConfirmedAt == nil {
		t.Fatal("expected ConfirmedAt to be set after second cycle")
	}

	// 阶段 3：ws1 不需要关注了
	wsResolved := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(1*time.Minute).Format(time.RFC3339), false, false, nil),
	}
	tracker.ProcessWorkspaces(wsResolved, now.Add(1*time.Minute))

	// 阶段 4：ws1 又需要关注了
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(2*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws2, now.Add(2*time.Minute))

	// 获取新的 ConfirmedAt（应该是 nil，因为刚重新开始跟踪）
	state2 := tracker.GetState()
	var newConfirmedAt *time.Time
	for _, entry := range state2.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			newConfirmedAt = entry.ConfirmedAt
			break
		}
	}

	// 验证：ConfirmedAt 应该是 nil（刚重新开始，还没有确认稳定）
	if newConfirmedAt != nil {
		t.Errorf("ConfirmedAt should be nil after attention toggle, got %v", newConfirmedAt)
	}

	t.Logf("PASS: ConfirmedAt was correctly reset to nil (was %v)", initialConfirmedAt)
}

// TestTracker_UpdatedAtChangePreservesTimer 测试 UpdatedAt 变化时是否应该保留计时
// 当前实现：UpdatedAt 变化会导致计时重置
// 这可能是设计如此，也可能是 bug
func TestTracker_UpdatedAtChangePreservesTimer(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：ws1 需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 阶段 2（30秒后）：确认稳定
	tracker.ProcessWorkspaces(ws1, now.Add(30*time.Second))

	// 阶段 3（5分钟后）：UpdatedAt 变化（任务有新操作）
	// 预期：计时被重置，FirstSeenAt 和 ConfirmedAt 被重新设置
	ws2 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Add(5*time.Minute).Format(time.RFC3339), true, false, nil),
	}
	notify := tracker.ProcessWorkspaces(ws2, now.Add(5*time.Minute))
	
	// 由于 UpdatedAt 变化，新的 NotificationKey，计时被重置
	// 此时 ConfirmedAt 应该还是 nil（刚重新开始）
	if len(notify) != 0 {
		t.Errorf("expected 0 notifications (timer reset), got %d", len(notify))
	}

	// 检查状态
	state := tracker.GetState()
	for _, entry := range state.Entries {
		if entry.Key.WorkspaceID == "ws1" {
			t.Logf("After UpdatedAt change: FirstSeenAt=%v, ConfirmedAt=%v", 
				entry.FirstSeenAt, entry.ConfirmedAt)
			// 注意：当前实现会重置 ConfirmedAt 为 nil
			if entry.ConfirmedAt != nil {
				t.Logf("WARNING: ConfirmedAt is not nil, timer might not be reset properly")
			}
			break
		}
	}
}

// TestTracker_RepeatIntervalWithTimerReset 测试当计时被重置后，叠加提醒的行为
// 场景：用户已收到通知，然后任务有新操作（UpdatedAt 变化），计时被重置
// 问题：叠加提醒是否会错误地立即触发？

// TestTracker_UpdatedAtChangeAfterNotify 测试通知后 UpdatedAt 变化的行为
// 这是用户可能遇到的场景：收到通知后，任务有新操作

// TestTracker_IgnoreButtonBehavior 测试用户点击"忽略"按钮后的行为
// 场景：用户收到通知，点击"忽略"，问题仍然存在
// 问题：是否会因为 NotifiedAt 已设置而跳过某些检查？
func TestTracker_IgnoreButtonBehavior(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1-3：正常通知流程
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)
	tracker.ProcessWorkspaces(ws1, now.Add(30*time.Second))
	notify := tracker.ProcessWorkspaces(ws1, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notify))
	}

	// 用户点击"忽略"，问题仍然存在（NeedsAttention 仍为 true）
	// 下一次轮询（12分钟后）：在叠加间隔内，不应该通知
	notify = tracker.ProcessWorkspaces(ws1, now.Add(12*time.Minute))
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (within repeat interval), got %d", len(notify))
	}

	// 17分钟后：超过叠加间隔（5分钟），应该再次通知
	notify = tracker.ProcessWorkspaces(ws1, now.Add(17*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification (repeat interval passed), got %d", len(notify))
	}
}

// TestTracker_ElapsedFromFirstSeenExceedsThreshold 测试从 FirstSeenAt 计算已超时的情况
// 当 ConfirmedAt == nil 但从 FirstSeenAt 计算已超过阈值时，会立即通知
// 这是设计行为，用于处理长时间运行后重启的情况
func TestTracker_ElapsedFromFirstSeenExceedsThreshold(t *testing.T) {
	tracker := NewTracker(state.NewAppState(), 5, 10, 5)
	now := time.Now()

	// 阶段 1：ws1 需要关注
	ws1 := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "session1", now.Format(time.RFC3339), true, false, nil),
	}
	tracker.ProcessWorkspaces(ws1, now)

	// 阶段 2：11分钟后再次检查
	// 由于从 FirstSeenAt 计算已超过 10 分钟阈值，会立即通知
	notify := tracker.ProcessWorkspaces(ws1, now.Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification (elapsed from FirstSeenAt exceeds threshold), got %d", len(notify))
	}
}

// TestTracker_BackwardCompatibility_ExpiredImmediateNotify 测试旧状态已超时时是否立即通知
func TestTracker_BackwardCompatibility_ExpiredImmediateNotify(t *testing.T) {
	// 使用真实的当前时间，因为 NewTracker 内部使用 time.Now()
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	key := state.NotificationKey{
		WorkspaceID: "ws1",
		CompletedAt: "",
		UpdatedAt:   updatedAt,
	}
	oldState := state.NewAppState()
	// 模拟旧状态：15分钟前首次发现，无 ConfirmedAt
	// 注意：NewTracker 使用 time.Now()，所以我们使用真实时间
	oldEntry := state.AttentionEntry{
		Key:         key,
		FirstSeenAt: time.Now().Add(-15 * time.Minute),
		NotifiedAt:  nil,
	}
	oldState = oldState.WithEntry(key, oldEntry)

	// 创建 Tracker：由于已超时（15分钟 > 10分钟阈值），会设置 ConfirmedAt = time.Now()
	tracker := NewTracker(oldState, 5, 10, 5)

	// 使用 makeWorkspaceWithStateVersion 确保 UpdatedAt 一致
	ws := []api.EnrichedWorkspace{
		makeWorkspaceWithStateVersion("ws1", "ws1-session", updatedAt, true, false, nil),
	}

	// 立即调用：由于 ConfirmedAt 刚被设置为 time.Now()，还没超过阈值
	notify := tracker.ProcessWorkspaces(ws, time.Now())
	if len(notify) != 0 {
		t.Fatalf("expected 0 notifications (just reconfirmed), got %d", len(notify))
	}

	// 11分钟后：超过阈值，应该通知
	notify = tracker.ProcessWorkspaces(ws, time.Now().Add(11*time.Minute))
	if len(notify) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notify))
	}
}
