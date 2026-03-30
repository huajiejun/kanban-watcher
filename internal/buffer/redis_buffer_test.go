package buffer

import (
	"context"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func setupTestRedisBuffer(t *testing.T, fakeStore *fakeBatchStore, onFlush FlushCallback) (*miniredis.Miniredis, *RedisBuffer) {
	t.Helper()

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis 启动失败: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
		DB:   0,
	})

	buf := NewRedisBuffer(RedisBufferOptions{
		FlushThreshold: 3,
		FlushInterval:  50 * time.Millisecond,
		TTL:            time.Hour,
		RetryMax:       3,
	}, rdb, fakeStore, onFlush)

	return mr, buf
}

func makeEntry(processID string, entryIndex int, content, contentHash string) *store.ProcessEntry {
	return &store.ProcessEntry{
		ProcessID:   processID,
		EntryIndex:  entryIndex,
		Content:     content,
		ContentHash: contentHash,
	}
}

func TestRedisBufferEnqueueWritesToRedis(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	entry := makeEntry("proc-1", 1, "hello", "h1")
	buf.Enqueue("proc-1", entry, nil)

	time.Sleep(20 * time.Millisecond)

	got, err := buf.GetProcessEntry(context.Background(), "proc-1", 1)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got == nil {
		t.Fatal("entry is nil, want non-nil")
	}
	if got.Content != "hello" {
		t.Fatalf("content = %q, want hello", got.Content)
	}
}

func TestRedisBufferGetProcessEntryMiss(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	got, err := buf.GetProcessEntry(context.Background(), "proc-1", 999)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got != nil {
		t.Fatal("entry should be nil for missing key")
	}
}

func TestRedisBufferFlushProcessWritesToStore(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "entry1", "h1"), nil)
	buf.Enqueue("proc-1", makeEntry("proc-1", 2, "entry2", "h2"), nil)

	if err := buf.FlushProcess(context.Background(), "proc-1"); err != nil {
		t.Fatalf("FlushProcess error: %v", err)
	}

	batches := fakeStore.getUpsertBatches()
	if len(batches) != 1 {
		t.Fatalf("upsert batches = %d, want 1", len(batches))
	}
	if len(batches[0]) != 2 {
		t.Fatalf("batch size = %d, want 2", len(batches[0]))
	}
	if batches[0][0].Content != "entry1" {
		t.Fatalf("first entry content = %q, want entry1", batches[0][0].Content)
	}
	if batches[0][1].Content != "entry2" {
		t.Fatalf("second entry content = %q, want entry2", batches[0][1].Content)
	}
}

func TestRedisBufferFlushAll(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "msg1", "h1"), nil)
	buf.Enqueue("proc-2", makeEntry("proc-2", 1, "msg2", "h2"), nil)

	if err := buf.FlushAll(context.Background()); err != nil {
		t.Fatalf("FlushAll error: %v", err)
	}

	batches := fakeStore.getUpsertBatches()
	if len(batches) != 2 {
		t.Fatalf("upsert batches = %d, want 2", len(batches))
	}
}

func TestRedisBufferOnFlushCallback(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}

	var (
		mu              sync.Mutex
		flushedEntry    *store.ProcessEntry
		flushedLastIdx  *int
	)
	onFlush := func(_ context.Context, entry *store.ProcessEntry, lastIdx *int) error {
		mu.Lock()
		defer mu.Unlock()
		flushedEntry = entry
		if lastIdx != nil {
			v := *lastIdx
			flushedLastIdx = &v
		}
		return nil
	}

	mr, buf := setupTestRedisBuffer(t, fakeStore, onFlush)
	defer mr.Close()
	defer buf.Close()

	lastIdx := 5
	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "data", "h1"), &lastIdx)

	if err := buf.FlushProcess(context.Background(), "proc-1"); err != nil {
		t.Fatalf("FlushProcess error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if flushedEntry == nil {
		t.Fatal("onFlush not called")
	}
	if flushedEntry.Content != "data" {
		t.Fatalf("flushed content = %q, want data", flushedEntry.Content)
	}
	if flushedLastIdx == nil || *flushedLastIdx != 5 {
		t.Fatalf("flushed lastIdx = %v, want 5", flushedLastIdx)
	}
}

func TestRedisBufferZSETDedup(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	// 同一 entryIndex 写入两次，应覆盖
	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "old", "h1"), nil)
	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "new", "h2"), nil)

	got, err := buf.GetProcessEntry(context.Background(), "proc-1", 1)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got == nil {
		t.Fatal("entry is nil")
	}
	if got.Content != "new" {
		t.Fatalf("content = %q, want new (should overwrite)", got.Content)
	}
}

func TestRedisBufferFlushCleansZSET(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	mr, buf := setupTestRedisBuffer(t, fakeStore, nil)
	defer mr.Close()
	defer buf.Close()

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "data", "h1"), nil)

	if err := buf.FlushProcess(context.Background(), "proc-1"); err != nil {
		t.Fatalf("FlushProcess error: %v", err)
	}

	// flush 后 ZSET 应为空
	card, err := buf.rdb.ZCard(context.Background(), redisZSETKeyPrefix+"proc-1").Result()
	if err != nil {
		t.Fatalf("ZCard error: %v", err)
	}
	if card != 0 {
		t.Fatalf("ZSET card = %d, want 0 after flush", card)
	}

	// Hash 应保留（TTL 读缓存）
	val, err := buf.rdb.HGet(context.Background(), redisHashKeyPrefix+"proc-1", strconv.Itoa(1)).Result()
	if err != nil {
		t.Fatalf("HGet error: %v", err)
	}
	if val == "" {
		t.Fatal("Hash value empty, want preserved after flush")
	}
}

// getUpsertBatches 返回 upsert 批次（线程安全）
func (f *fakeBatchStore) getUpsertBatches() [][]*store.ProcessEntry {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.upsertBatches
}
