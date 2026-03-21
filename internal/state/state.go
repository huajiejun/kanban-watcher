package state

import "time"

// NotificationKey uniquely identifies a "notification event" for dedup purposes.
// The same workspace at the same completion timestamp = same key = notify only once.
// CompletedAt is "" when the process is still running (nil from the API).
type NotificationKey struct {
	WorkspaceID string
	CompletedAt string
}

// AttentionEntry tracks when a workspace first entered the "needs attention" state
// for a given NotificationKey, and whether we already sent a notification.
type AttentionEntry struct {
	Key         NotificationKey
	FirstSeenAt time.Time
	NotifiedAt  *time.Time // nil until the notification is sent
}

// AppState is the complete persistent notification state.
// It uses value semantics; all mutations return a new AppState.
type AppState struct {
	Entries map[NotificationKey]AttentionEntry
}

// NewAppState returns an empty AppState.
func NewAppState() AppState {
	return AppState{
		Entries: make(map[NotificationKey]AttentionEntry),
	}
}

// WithEntry returns a NEW AppState with the given entry added or replaced.
func (s AppState) WithEntry(key NotificationKey, entry AttentionEntry) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries)+1)
	for k, v := range s.Entries {
		newEntries[k] = v
	}
	newEntries[key] = entry
	return AppState{Entries: newEntries}
}

// WithoutKey returns a NEW AppState with the given key removed.
func (s AppState) WithoutKey(key NotificationKey) AppState {
	if _, exists := s.Entries[key]; !exists {
		return s
	}
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if k != key {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}

// WithoutWorkspace returns a NEW AppState with all entries for a workspace removed.
func (s AppState) WithoutWorkspace(workspaceID string) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if k.WorkspaceID != workspaceID {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}

// WithoutWorkspacesNotIn returns a NEW AppState keeping only entries for workspace IDs in the set.
func (s AppState) WithoutWorkspacesNotIn(activeIDs map[string]struct{}) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if _, ok := activeIDs[k.WorkspaceID]; ok {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}
