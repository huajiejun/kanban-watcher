package buffer

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// FallbackBuffer Redis 优先 + 内存降级
type FallbackBuffer struct {
	redis    *RedisBuffer
	memory   *MemoryBuffer
	redisRDB *redis.Client

	mu      sync.RWMutex
	healthy bool
	stopCh  chan struct{}
}

// NewFallbackBuffer 创建降级 buffer
func NewFallbackBuffer(redisBuf *RedisBuffer, memBuf *MemoryBuffer, healthCheckInterval time.Duration) *FallbackBuffer {
	fb := &FallbackBuffer{
		redis:    redisBuf,
		memory:   memBuf,
		redisRDB: redisBuf.rdb,
		healthy:  true,
		stopCh:   make(chan struct{}),
	}
	go fb.healthCheckLoop(healthCheckInterval)
	return fb
}

func (fb *FallbackBuffer) Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int) {
	fb.mu.RLock()
	useRedis := fb.healthy
	fb.mu.RUnlock()

	if useRedis {
		fb.redis.Enqueue(processID, entry, lastEntryIndex)
	} else {
		fb.memory.Enqueue(processID, entry, lastEntryIndex)
	}
}

func (fb *FallbackBuffer) FlushProcess(ctx context.Context, processID string) error {
	fb.mu.RLock()
	useRedis := fb.healthy
	fb.mu.RUnlock()

	if useRedis {
		return fb.redis.FlushProcess(ctx, processID)
	}
	return fb.memory.FlushProcess(ctx, processID)
}

func (fb *FallbackBuffer) FlushAll(ctx context.Context) error {
	fb.mu.RLock()
	useRedis := fb.healthy
	fb.mu.RUnlock()

	if useRedis {
		return fb.redis.FlushAll(ctx)
	}
	return fb.memory.FlushAll(ctx)
}

func (fb *FallbackBuffer) LastEntryIndex(processID string) *int {
	fb.mu.RLock()
	useRedis := fb.healthy
	fb.mu.RUnlock()

	if useRedis {
		return fb.redis.LastEntryIndex(processID)
	}
	return fb.memory.LastEntryIndex(processID)
}

func (fb *FallbackBuffer) GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error) {
	fb.mu.RLock()
	useRedis := fb.healthy
	fb.mu.RUnlock()

	if useRedis {
		return fb.redis.GetProcessEntry(ctx, processID, entryIndex)
	}
	return fb.memory.GetProcessEntry(ctx, processID, entryIndex)
}

func (fb *FallbackBuffer) Close() error {
	close(fb.stopCh)
	// 先刷内存 buffer（可能有降级期间的数据）
	if err := fb.memory.FlushAll(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "[buffer] 内存 buffer flush 失败: %v\n", err)
	}
	// 再刷 Redis buffer
	if err := fb.redis.FlushAll(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "[buffer] Redis buffer flush 失败: %v\n", err)
	}
	return nil
}

func (fb *FallbackBuffer) healthCheckLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-fb.stopCh:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			err := fb.redisRDB.Ping(ctx).Err()
			cancel()

			fb.mu.Lock()
			wasHealthy := fb.healthy
			if err == nil {
				if !wasHealthy {
					fmt.Fprintf(os.Stderr, "[buffer] Redis 恢复，刷出内存积压数据\n")
					go fb.flushAllPendingToMySQL()
					fb.healthy = true
				}
			} else {
				if wasHealthy {
					fmt.Fprintf(os.Stderr, "[buffer] Redis 不可用，降级到内存 buffer: %v\n", err)
					fb.healthy = false
				}
			}
			fb.mu.Unlock()
		}
	}
}

func (fb *FallbackBuffer) flushAllPendingToMySQL() {
	if err := fb.memory.FlushAll(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "[buffer] 内存积压数据刷到 MySQL 失败: %v\n", err)
	}
}
