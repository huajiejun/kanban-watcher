package sync

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"
)

const workspaceStateRefreshThrottle = 500 * time.Millisecond

type workspaceStateThrottle struct {
	mu             sync.Mutex
	lastRefreshed  map[string]time.Time
	throttleWindow time.Duration
}

func newWorkspaceStateThrottle(window time.Duration) *workspaceStateThrottle {
	return &workspaceStateThrottle{
		lastRefreshed:  make(map[string]time.Time),
		throttleWindow: window,
	}
}

func shouldRefreshWorkspaceState(lastRefreshed *time.Time, now time.Time, throttle time.Duration, processStatus string) bool {
	switch processStatus {
	case "completed", "failed", "cancelled", "error":
		return true
	}
	if lastRefreshed == nil {
		return true
	}
	return now.Sub(*lastRefreshed) >= throttle
}

func (w *workspaceStateThrottle) Allow(workspaceID, processStatus string, now time.Time) bool {
	if w == nil || workspaceID == "" {
		return true
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	lastRefreshed, ok := w.lastRefreshed[workspaceID]
	if !shouldRefreshWorkspaceState(optionalTime(ok, lastRefreshed), now, w.throttleWindow, processStatus) {
		return false
	}
	w.lastRefreshed[workspaceID] = now
	return true
}

func optionalTime(ok bool, value time.Time) *time.Time {
	if !ok {
		return nil
	}
	copied := value
	return &copied
}

func (s *SyncService) refreshWorkspaceRuntimeStateIfDue(ctx context.Context, workspaceID, processStatus string) {
	now := time.Now()
	if s.workspaceStateThrottle != nil && !s.workspaceStateThrottle.Allow(workspaceID, processStatus, now) {
		s.tracef("workspace state refresh throttled workspace=%s status=%s", workspaceID, processStatus)
		return
	}

	if err := s.store.RefreshWorkspaceRuntimeState(ctx, workspaceID); err != nil {
		fmt.Fprintf(os.Stderr, "刷新 workspace 运行态失败 [%s]: %v\n", workspaceID, err)
		return
	}
	if s.realtime != nil {
		if err := s.realtime.PublishWorkspaceSnapshot(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "推送工作区快照失败 [%s]: %v\n", workspaceID, err)
		}
	}
}
