package buffer

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func newTestRedisClient(addr string) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr: addr,
		DB:   0,
	})
}

func setupFallbackTest(t *testing.T) (*miniredis.Miniredis, *FallbackBuffer, *fakeBatchStore) {
	t.Helper()

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis 启动失败: %v", err)
	}

	rdb := newTestRedisClient(mr.Addr())
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}

	rb := NewRedisBuffer(RedisBufferOptions{
		FlushThreshold: 50,
		FlushInterval:  time.Hour,
		TTL:            time.Hour,
		RetryMax:       3,
	}, rdb, fakeStore, nil)

	mb := NewMemoryBuffer(time.Hour, fakeStore, nil)

	fb := NewFallbackBuffer(rb, mb, 50*time.Millisecond)

	return mr, fb, fakeStore
}

func TestFallbackBufferUsesRedisWhenHealthy(t *testing.T) {
	mr, fb, _ := setupFallbackTest(t)
	defer mr.Close()
	defer fb.Close()

	entry := &store.ProcessEntry{
		ProcessID:   "proc-1",
		EntryIndex:  1,
		Content:     "hello",
		ContentHash: "h1",
	}

	fb.Enqueue("proc-1", entry, nil)

	time.Sleep(30 * time.Millisecond)

	got, err := fb.GetProcessEntry(context.Background(), "proc-1", 1)
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

func TestFallbackBufferDegradesOnRedisFailure(t *testing.T) {
	mr, fb, fakeStore := setupFallbackTest(t)

	entry := &store.ProcessEntry{
		ProcessID:   "proc-1",
		EntryIndex:  1,
		Content:     "fallback-data",
		ContentHash: "h1",
	}

	// 关闭 Redis 模拟故障
	mr.Close()

	// 等待健康检查发现故障（至少两个周期确保检测到）
	time.Sleep(200 * time.Millisecond)

	fb.Enqueue("proc-1", entry, nil)

	// 内存 buffer 应该接收了这条消息
	got, err := fb.GetProcessEntry(context.Background(), "proc-1", 1)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got == nil {
		t.Fatal("entry is nil after fallback, want non-nil")
	}
	if got.Content != "fallback-data" {
		t.Fatalf("content = %q, want fallback-data", got.Content)
	}

	// 手动 flush 内存 buffer
	if err := fb.memory.FlushAll(context.Background()); err != nil {
		t.Fatalf("FlushAll error: %v", err)
	}

	batches := fakeStore.getUpsertBatches()
	if len(batches) < 1 {
		t.Fatalf("upsert batches = %d, want >= 1", len(batches))
	}

	_ = fb.Close()
}

func TestFallbackBufferGetProcessEntryMiss(t *testing.T) {
	mr, fb, _ := setupFallbackTest(t)
	defer mr.Close()
	defer fb.Close()

	got, err := fb.GetProcessEntry(context.Background(), "proc-1", 999)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got != nil {
		t.Fatal("entry should be nil for missing key")
	}
}
