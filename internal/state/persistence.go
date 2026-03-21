package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const stateVersion = 1

// persistedEntry is the on-disk representation of an AttentionEntry.
type persistedEntry struct {
	WorkspaceID string     `json:"workspace_id"`
	CompletedAt string     `json:"completed_at"`
	FirstSeenAt time.Time  `json:"first_seen_at"`
	NotifiedAt  *time.Time `json:"notified_at,omitempty"`
}

// persistedState is the top-level on-disk format.
type persistedState struct {
	Version int              `json:"version"`
	Entries []persistedEntry `json:"entries"`
}

// StatePath returns the path to the state file.
func StatePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	return filepath.Join(home, ".config", "kanban-watcher", "state.json"), nil
}

// LoadState reads persisted state from disk.
// Returns an empty AppState if the file does not exist.
func LoadState() (AppState, error) {
	path, err := StatePath()
	if err != nil {
		return NewAppState(), err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return NewAppState(), nil
		}
		return NewAppState(), fmt.Errorf("read state %s: %w", path, err)
	}

	var ps persistedState
	if err := json.Unmarshal(data, &ps); err != nil {
		// Corrupt state file: start fresh
		fmt.Fprintf(os.Stderr, "warning: corrupt state file %s, starting fresh: %v\n", path, err)
		return NewAppState(), nil
	}

	s := NewAppState()
	for _, e := range ps.Entries {
		key := NotificationKey{
			WorkspaceID: e.WorkspaceID,
			CompletedAt: e.CompletedAt,
		}
		s = s.WithEntry(key, AttentionEntry{
			Key:         key,
			FirstSeenAt: e.FirstSeenAt,
			NotifiedAt:  e.NotifiedAt,
		})
	}
	return s, nil
}

// MustLoad loads state or returns empty state on any error (logs warning).
func MustLoad() AppState {
	s, err := LoadState()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: load state: %v\n", err)
	}
	return s
}

// SaveState writes the AppState to disk atomically (write temp → rename).
func SaveState(s AppState) error {
	path, err := StatePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}

	entries := make([]persistedEntry, 0, len(s.Entries))
	for _, e := range s.Entries {
		entries = append(entries, persistedEntry{
			WorkspaceID: e.Key.WorkspaceID,
			CompletedAt: e.Key.CompletedAt,
			FirstSeenAt: e.FirstSeenAt,
			NotifiedAt:  e.NotifiedAt,
		})
	}

	ps := persistedState{
		Version: stateVersion,
		Entries: entries,
	}

	data, err := json.MarshalIndent(ps, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	// Atomic write: write to temp file then rename
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write temp state: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename state file: %w", err)
	}
	return nil
}
