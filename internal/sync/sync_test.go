package sync

import (
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestWorkspaceRefreshInterval(t *testing.T) {
	tests := []struct {
		name     string
		interval int
		want     time.Duration
	}{
		{
			name:     "uses fast fallback when config is empty",
			interval: 0,
			want:     15 * time.Second,
		},
		{
			name:     "caps slow config to fast fallback",
			interval: 30,
			want:     15 * time.Second,
		},
		{
			name:     "keeps faster config",
			interval: 3,
			want:     3 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := &SyncService{
				cfg: &config.Config{
					Database: config.DatabaseConfig{
						SyncIntervalSecs: tt.interval,
					},
				},
			}
			if got := service.workspaceRefreshInterval(); got != tt.want {
				t.Fatalf("workspaceRefreshInterval() = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestShouldBroadcastRealtimeEntry(t *testing.T) {
	tests := []struct {
		name     string
		existing *store.ProcessEntry
		next     *store.ProcessEntry
		want     bool
	}{
		{
			name: "broadcasts when entry is new",
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			want: true,
		},
		{
			name: "skips when hash is unchanged for same process entry",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			want: false,
		},
		{
			name: "broadcasts when hash changes for same process entry",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-a",
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				ContentHash: "hash-b",
			},
			want: true,
		},
		{
			name: "broadcasts when tool status changes with same content hash",
			existing: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				EntryType:   "tool_use",
				ContentHash: "hash-a",
				StatusJSON:  stringPtr(`{"state":"running"}`),
			},
			next: &store.ProcessEntry{
				ProcessID:   "proc-1",
				EntryIndex:  3,
				EntryType:   "tool_use",
				ContentHash: "hash-a",
				StatusJSON:  stringPtr(`{"state":"success"}`),
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldBroadcastRealtimeEntry(tt.existing, tt.next); got != tt.want {
				t.Fatalf("shouldBroadcastRealtimeEntry(%+v, %+v) = %v, want %v", tt.existing, tt.next, got, tt.want)
			}
		})
	}
}

func TestShouldPersistProcessEntryUpdate(t *testing.T) {
	baseTime := time.Date(2026, 3, 24, 0, 30, 0, 0, time.UTC)

	tests := []struct {
		name     string
		existing *store.ProcessEntry
		next     *store.ProcessEntry
		want     bool
	}{
		{
			name: "persists new entry",
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: true,
		},
		{
			name: "skips older replay for same entry",
			existing: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime.Add(2 * time.Second),
			},
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: false,
		},
		{
			name: "keeps same timestamp updates",
			existing: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			next: &store.ProcessEntry{
				ProcessID:      "proc-1",
				EntryIndex:     2,
				EntryTimestamp: baseTime,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldPersistProcessEntryUpdate(tt.existing, tt.next); got != tt.want {
				t.Fatalf("shouldPersistProcessEntryUpdate(%+v, %+v) = %v, want %v", tt.existing, tt.next, got, tt.want)
			}
		})
	}
}
