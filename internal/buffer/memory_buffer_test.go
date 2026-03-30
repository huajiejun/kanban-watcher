package buffer

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// fakeBatchStore 用于测试的 fake store（可被其他 buffer 测试共享）
type fakeBatchStore struct {
	mu            sync.Mutex
	existing      map[int]*store.ProcessEntry
	upsertBatches [][]*store.ProcessEntry
}

func (f *fakeBatchStore) ListProcessEntriesByIndexes(_ context.Context, _ string, entryIndexes []int) (map[int]*store.ProcessEntry, error) {
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

func (f *fakeBatchStore) UpsertProcessEntries(_ context.Context, entries []*store.ProcessEntry) error {
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

func TestMemoryBufferFlushesLatestEntries(t *testing.T) {
	fakeStore := &fakeBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	var (
		mu                sync.Mutex
		flushedProcessID  string
		flushedEntryIndex *int
	)

	buffer := NewMemoryBuffer(20*time.Millisecond, fakeStore, func(_ context.Context, entry *store.ProcessEntry, lastEntryIndex *int) error {
		mu.Lock()
		defer mu.Unlock()
		flushedProcessID = entry.ProcessID
		if lastEntryIndex != nil {
			value := *lastEntryIndex
			flushedEntryIndex = &value
		}
		return nil
	})

	// 测试同一 entryIndex 的覆盖
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

	// 覆盖 entryIndex 1
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

	// 不同 entryIndex 的合并写入
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
	// 验证 entryIndex 1 被覆盖为 "new"
	if fakeStore.upsertBatches[0][0].Content != "new" {
		t.Fatalf("entry 0 content = %q, want new", fakeStore.upsertBatches[0][0].Content)
	}
	// 验证 entryIndex 2 被合并写入
	if fakeStore.upsertBatches[0][1].Content != "tail" {
		t.Fatalf("entry 1 content = %q, want tail", fakeStore.upsertBatches[0][1].Content)
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

func TestMemoryBufferFlushAll(t *testing.T) {
	fakeStore := &fakeBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	buffer := NewMemoryBuffer(time.Hour, fakeStore, nil)

	// 多个 process
	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     1,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "msg1",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-1",
	}, nil)

	buffer.Enqueue("proc-2", &store.ProcessEntry{
		ProcessID:      "proc-2",
		SessionID:      "session-2",
		WorkspaceID:    "ws-2",
		EntryIndex:     1,
		EntryType:      "user_message",
		Role:           "user",
		Content:        "msg2",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-2",
	}, nil)

	if err := buffer.FlushAll(context.Background()); err != nil {
		t.Fatalf("FlushAll 返回错误: %v", err)
	}

	fakeStore.mu.Lock()
	defer fakeStore.mu.Unlock()
	if len(fakeStore.upsertBatches) != 2 {
		t.Fatalf("upsert batches = %d, want 2", len(fakeStore.upsertBatches))
	}
}

func TestMemoryBufferGetProcessEntry(t *testing.T) {
	fakeStore := &fakeBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	buffer := NewMemoryBuffer(time.Hour, fakeStore, nil)

	// 添加到 pending map
	entry := &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     5,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "test",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-test",
	}
	buffer.Enqueue("proc-1", entry, nil)

	// 从 pending map 读取
	got, err := buffer.GetProcessEntry(context.Background(), "proc-1", 5)
	if err != nil {
		t.Fatalf("GetProcessEntry 返回错误: %v", err)
	}
	if got == nil {
		t.Fatal("GetProcessEntry 返回 nil")
	}
	if got.Content != "test" {
		t.Fatalf("GetProcessEntry content = %q, want test", got.Content)
	}

	// 读取不存在的 entry
	notFound, err := buffer.GetProcessEntry(context.Background(), "proc-1", 999)
	if err != nil {
		t.Fatalf("GetProcessEntry 返回错误: %v", err)
	}
	if notFound != nil {
		t.Fatalf("GetProcessEntry 返回 %#v, want nil", notFound)
	}
}

func TestMemoryBufferClose(t *testing.T) {
	fakeStore := &fakeBatchStore{
		existing: make(map[int]*store.ProcessEntry),
	}

	buffer := NewMemoryBuffer(time.Hour, fakeStore, nil)

	buffer.Enqueue("proc-1", &store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     1,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "test",
		EntryTimestamp: time.Now(),
		ContentHash:    "hash-test",
	}, nil)

	if err := buffer.Close(); err != nil {
		t.Fatalf("Close 返回错误: %v", err)
	}

	fakeStore.mu.Lock()
	defer fakeStore.mu.Unlock()
	if len(fakeStore.upsertBatches) != 1 {
		t.Fatalf("upsert batches = %d, want 1", len(fakeStore.upsertBatches))
	}
}
