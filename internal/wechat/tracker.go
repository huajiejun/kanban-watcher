package wechat

import (
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/state"
)

// TrackedWorkspace pairs an EnrichedWorkspace with how long it has been waiting.
type TrackedWorkspace struct {
	Workspace      api.EnrichedWorkspace
	ElapsedMinutes int
}

// Tracker manages notification deduplication and threshold logic.
// It is not goroutine-safe; call from a single goroutine.
type Tracker struct {
	current          state.AppState
	thresholdMinutes int
}

// NewTracker creates a Tracker seeded with persisted state.
func NewTracker(s state.AppState, thresholdMinutes int) *Tracker {
	return &Tracker{
		current:          s,
		thresholdMinutes: thresholdMinutes,
	}
}

// ProcessWorkspaces evaluates the latest workspace data against the current state.
// It returns:
//   - an updated AppState (immutable, caller must call GetState to persist it)
//   - a list of workspaces that should trigger a notification right now
//
// Dedup rule: one notification per (workspace_id, latest_process_completed_at) pair.
func (t *Tracker) ProcessWorkspaces(workspaces []api.EnrichedWorkspace, now time.Time) []TrackedWorkspace {
	threshold := time.Duration(t.thresholdMinutes) * time.Minute

	// Build a set of currently active workspace IDs to clean up stale entries
	activeIDs := make(map[string]struct{}, len(workspaces))
	for _, w := range workspaces {
		activeIDs[w.ID] = struct{}{}
	}

	// Remove entries for workspaces no longer returned by the API
	updated := t.current.WithoutWorkspacesNotIn(activeIDs)

	var toNotify []TrackedWorkspace

	for _, w := range workspaces {
		key := notificationKey(w)

		if !w.NeedsAttention() {
			// Workspace is fine: remove all its tracking entries
			updated = updated.WithoutWorkspace(w.ID)
			continue
		}

		// Workspace needs attention
		existing, found := updated.Entries[key]
		if !found {
			// First time seeing this issue: start the clock
			updated = updated.WithEntry(key, state.AttentionEntry{
				Key:         key,
				FirstSeenAt: now,
			})
			continue
		}

		if existing.NotifiedAt != nil {
			// Already notified for this (workspace, completedAt) pair — skip
			continue
		}

		elapsed := now.Sub(existing.FirstSeenAt)
		if elapsed < threshold {
			// Still within grace period
			continue
		}

		// Threshold exceeded: queue notification and mark as notified
		notifiedAt := now
		updated = updated.WithEntry(key, state.AttentionEntry{
			Key:         existing.Key,
			FirstSeenAt: existing.FirstSeenAt,
			NotifiedAt:  &notifiedAt,
		})
		toNotify = append(toNotify, TrackedWorkspace{
			Workspace:      w,
			ElapsedMinutes: int(elapsed.Minutes()),
		})
	}

	t.current = updated
	return toNotify
}

// GetState returns the current AppState for persistence.
func (t *Tracker) GetState() state.AppState {
	return t.current
}

// notificationKey builds the dedup key for a workspace.
// CompletedAt is "" when the process is running (nil from API).
func notificationKey(w api.EnrichedWorkspace) state.NotificationKey {
	completedAt := ""
	if w.Summary.LatestProcessCompletedAt != nil {
		completedAt = *w.Summary.LatestProcessCompletedAt
	}
	return state.NotificationKey{
		WorkspaceID: w.ID,
		CompletedAt: completedAt,
	}
}
