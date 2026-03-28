package sync

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type fakeProcessEntryBatchStore struct {
	mu            sync.Mutex
	existing      map[int]*store.ProcessEntry
	upsertBatches [][]*store.ProcessEntry
}

func (f *fakeProcessEntryBatchStore) ListProcessEntriesByIndexes(_ context.Context, _ string, entryIndexes []int) (map[int]*store.ProcessEntry, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	result := make(map[int]*store.ProcessEntry, len(entryIndexes))
	for _, entryIndex := range entryIndexes {
		if entry, ok := f.existing[entryIndex]; ok {
			result[entryIndex] = entry
		}
	}
	return result, nil
}

func (f *fakeProcessEntryBatchStore) UpsertProcessEntries(_ context.Context, entries []*store.ProcessEntry) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	batch := make([]*store.ProcessEntry, 0, len(entries))
	for _, entry := range entries {
		copied := *entry
		batch = append(batch, &copied)
		if f.existing == nil {
			f.existing = make(map[int]*store.ProcessEntry)
		}
		f.existing[entry.EntryIndex] = &copied
	}
	f.upsertBatches = append(f.upsertBatches, batch)
	return nil
}

func TestProcessEntryBufferFlushesLatestEntriesWithinWindow(t *testing.T) {
	fakeStore := &fakeProcessEntryBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	var (
		mu                sync.Mutex
		flushedProcessID  string
		flushedEntryIndex *int
	)

	buffer := newProcessEntryBuffer(20*time.Millisecond, fakeStore, func(_ context.Context, entry *store.ProcessEntry, lastEntryIndex *int) error {
		mu.Lock()
		defer mu.Unlock()
		flushedProcessID = entry.ProcessID
		if lastEntryIndex != nil {
			value := *lastEntryIndex
			flushedEntryIndex = &value
		}
		return nil
	})

	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     1,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "old",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-old",
	}, nil)
	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     1,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "new",
		EntryTimestamp: time.Now().Add(time.Second),
		ContentHash:    "hash-new",
	}, nil)
	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     2,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "tail",
		EntryTimestamp: time.Now().Add(2 * time.Second),
		ContentHash:    "hash-tail",
	}, nil)

	time.Sleep(80 * time.Millisecond)

	fakeStore.mu.Lock()
	defer fakeStore.mu.Unlock()
	if len(fakeStore.upsertBatches) != 1 {
		t.Fatalf("upsert batches = %d, want 1", len(fakeStore.upsertBatches))
	}
	if len(fakeStore.upsertBatches[0]) != 2 {
		t.Fatalf("first batch len = %d, want 2", len(fakeStore.upsertBatches[0]))
	}
	if fakeStore.upsertBatches[0][0].Content != "new" {
		t.Fatalf("entry 0 content = %q, want new", fakeStore.upsertBatches[0][0].Content)
	}

	mu.Lock()
	defer mu.Unlock()
	if flushedProcessID != "proc-1" {
		t.Fatalf("flushed process = %q, want proc-1", flushedProcessID)
	}
	if flushedEntryIndex == nil || *flushedEntryIndex != 2 {
		t.Fatalf("flushed last entry index = %#v, want 2", flushedEntryIndex)
	}
}

func TestProcessEntryBufferFlushProcessAdvancesContiguousIndex(t *testing.T) {
	fakeStore := &fakeProcessEntryBatchStore{
		existing: map[int]*store.ProcessEntry{
			1: {
				ProcessID:      "proc-1",
				EntryIndex:     1,
				EntryTimestamp: time.Now(),
				ContentHash:    "hash-1",
			},
		},
	}

	var flushedEntryIndex *int
	buffer := newProcessEntryBuffer(200*time.Millisecond, fakeStore, func(_ context.Context, _ *store.ProcessEntry, lastEntryIndex *int) error {
		if lastEntryIndex != nil {
			value := *lastEntryIndex
			flushedEntryIndex = &value
		}
		return nil
	})

	lastEntryIndex := 1
	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     2,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "two",
		EntryTimestamp: time.Now().Add(time.Second),
		ContentHash:    "hash-2",
	}, &lastEntryIndex)
	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     4,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "four",
		EntryTimestamp: time.Now().Add(2 * time.Second),
		ContentHash:    "hash-4",
	}, &lastEntryIndex)

	if err := buffer.FlushProcess(context.Background(), "proc-1"); err != nil {
		t.Fatalf("FlushProcess 返回错误: %v", err)
	}

	if flushedEntryIndex == nil || *flushedEntryIndex != 2 {
		t.Fatalf("flushed last entry index = %#v, want 2", flushedEntryIndex)
	}
}

func TestSyncServiceStopFlushesBufferedEntries(t *testing.T) {
	fakeStore := &fakeProcessEntryBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	service := &SyncService{
		stopCh: make(chan struct{}),
		processEntryBuffer: newProcessEntryBuffer(time.Hour, fakeStore, func(_ context.Context, _ *store.ProcessEntry, _ *int) error {
			return nil
		}),
	}

	service.processEntryBuffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     1,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "tail",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-tail",
	}, nil)

	service.Stop()

	fakeStore.mu.Lock()
	defer fakeStore.mu.Unlock()
	if len(fakeStore.upsertBatches) != 1 {
		t.Fatalf("upsert batches = %d, want 1", len(fakeStore.upsertBatches))
	}
}
