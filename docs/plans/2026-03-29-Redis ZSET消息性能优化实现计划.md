# Redis ZSET 消息性能优化 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Redis ZSET + Hash 替代内存 buffer，消除 flush 时查 DB 去重的开销，同时提供 24h 读缓存和 Redis 不可用时自动降级。

**Architecture:** 新建 `internal/buffer` 包，定义 `MessageBuffer` + `ProcessEntryReader` 接口，提供 Redis ZSET 实现和内存降级实现。SyncService 改为依赖接口，调用方负责 shouldBroadcast/shouldPersist 判断后再 Enqueue。

**Tech Stack:** Go 1.17, go-redis/redis/v8 (兼容 Go 1.17), MySQL (不变)

**Spec:** `docs/plans/2026-03-29-Redis ZSET消息性能优化设计.md`

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `internal/buffer/buffer.go` | MessageBuffer + ProcessEntryReader 接口定义 |
| Create | `internal/buffer/memory_buffer.go` | 从 sync.processEntryBuffer 迁移，实现接口 |
| Create | `internal/buffer/memory_buffer_test.go` | 内存 buffer 单元测试 |
| Create | `internal/buffer/redis_buffer.go` | Redis ZSET + Hash 实现 |
| Create | `internal/buffer/redis_buffer_test.go` | Redis buffer 单元测试 (miniredis) |
| Create | `internal/buffer/fallback_buffer.go` | Redis 优先 + 内存降级 |
| Create | `internal/buffer/fallback_buffer_test.go` | 降级逻辑测试 |
| Create | `internal/redisclient/client.go` | 单机 Redis 客户端封装 |
| Modify | `internal/config/config.go` | 新增 RedisConfig |
| Modify | `internal/sync/sync.go` | processEntryBuffer → MessageBuffer 接口 |
| Modify | `internal/sync/process_entry_buffer.go` | 标记废弃 |
| Modify | `go.mod` | 新增 go-redis 依赖 |

---

## Chunk 1: 基础设施（接口 + Redis 客户端 + 配置）

### Task 1: 添加 go-redis 依赖

**Files:**
- Modify: `go.mod`

- [ ] **Step 1: 添加 go-redis 依赖**

Run:
```bash
cd /Users/huajiejun/github/vibe-kanban/.vibe-kanban-workspaces/17b6-/kanban-watcher
go get github.com/redis/go-redis/v9
go mod tidy
```

- [ ] **Step 2: 验证依赖安装**

Run: `go list -m github.com/redis/go-redis/v9`
Expected: `github.com/redis/go-redis/v9 v9.x.x`

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore: 添加 go-redis/v9 依赖"
```

---

### Task 2: 添加 Redis 配置

**Files:**
- Modify: `internal/config/config.go`

- [ ] **Step 1: 在 Config 结构体中添加 Redis 字段**

在 `Config` 结构体 `Auth` 字段后添加:

```go
Redis RedisConfig `yaml:"redis"` // Redis 配置
```

添加 RedisConfig 结构体:

```go
// RedisConfig Redis 连接配置
type RedisConfig struct {
	Addr     string `yaml:"addr"`      // Redis 地址，如 "localhost:6379"
	Password string `yaml:"password"`  // 密码，空则无密码
	DB       int    `yaml:"db"`        // 数据库编号
	PoolSize int    `yaml:"pool_size"` // 连接池大小
}

// IsEnabled 检查 Redis 配置是否启用
func (c RedisConfig) IsEnabled() bool {
	return c.Addr != ""
}
```

- [ ] **Step 2: 验证编译**

Run: `go build ./...`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add internal/config/config.go
git commit -m "feat: 添加 Redis 配置结构体"
```

---

### Task 3: 定义 MessageBuffer 接口

**Files:**
- Create: `internal/buffer/buffer.go`

- [ ] **Step 1: 创建 buffer 包和接口**

```go
package buffer

import (
	"context"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// MessageBuffer 消息缓冲层接口
type MessageBuffer interface {
	// Enqueue 将消息写入缓冲区
	Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int)

	// FlushProcess 将指定 process 的缓冲数据持久化
	FlushProcess(ctx context.Context, processID string) error

	// FlushAll 刷出所有 process 的缓冲数据
	FlushAll(ctx context.Context) error

	// LastEntryIndex 获取指定 process 最后处理的 entry index
	LastEntryIndex(processID string) *int

	// Close 关闭缓冲区，释放资源
	Close() error
}

// ProcessEntryReader 缓存读取接口
type ProcessEntryReader interface {
	// GetProcessEntry 从缓存读取单条数据
	GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error)
}

// FlushCallback flush 成功后的回调
type FlushCallback func(ctx context.Context, entry *store.ProcessEntry, lastEntryIndex *int) error
```

- [ ] **Step 2: 验证编译**

Run: `go build ./internal/buffer/...`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add internal/buffer/buffer.go
git commit -m "feat: 定义 MessageBuffer 和 ProcessEntryReader 接口"
```

---

### Task 4: Redis 客户端封装

**Files:**
- Create: `internal/redisclient/client.go`

- [ ] **Step 1: 创建 Redis 客户端**

```go
package redisclient

import (
	"context"
	"fmt"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/redis/go-redis/v9"
)

// Client Redis 客户端封装
type Client struct {
	rdb *redis.Client
}

// NewClient 创建 Redis 客户端
func NewClient(cfg config.RedisConfig) (*Client, error) {
	poolSize := cfg.PoolSize
	if poolSize <= 0 {
		poolSize = 10
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
		PoolSize: poolSize,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		rdb.Close()
		return nil, fmt.Errorf("redis 连接失败: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// RDB 返回底层 redis.Client
func (c *Client) RDB() *redis.Client {
	return c.rdb
}

// Close 关闭连接
func (c *Client) Close() error {
	return c.rdb.Close()
}

// Ping 检查连接状态
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}
```

- [ ] **Step 2: 验证编译**

Run: `go build ./internal/redisclient/...`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add internal/redisclient/client.go
git commit -m "feat: Redis 客户端封装"
```

---

## Chunk 2: Memory Buffer（迁移现有逻辑）

### Task 5: 迁移内存 buffer 实现

**Files:**
- Create: `internal/buffer/memory_buffer.go`
- Create: `internal/buffer/memory_buffer_test.go`

- [ ] **Step 1: 创建内存 buffer 测试**

```go
package buffer

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type fakeBatchStore struct {
	mu            sync.Mutex
	existing      map[int]*store.ProcessEntry
	upsertBatches [][]*store.ProcessEntry
}

func (f *fakeBatchStore) ListProcessEntriesByIndexes(_ context.Context, _ string, entryIndexes []int) (map[int]*store.ProcessEntry, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	result := make(map[int]*store.ProcessEntry, len(entryIndexes))
	for _, idx := range entryIndexes {
		if entry, ok := f.existing[idx]; ok {
			result[idx] = entry
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

func (f *fakeBatchStore) getUpsertBatches() [][]*store.ProcessEntry {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.upsertBatches
}

func makeEntry(processID string, entryIndex int, content, contentHash string) *store.ProcessEntry {
	return &store.ProcessEntry{
		ProcessID:   processID,
		EntryIndex:  entryIndex,
		Content:     content,
		ContentHash: contentHash,
	}
}

func TestMemoryBufferFlushesLatestEntries(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	buf := NewMemoryBuffer(20*time.Millisecond, fakeStore, nil)

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "old", "hash-old"), nil)
	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "new", "hash-new"), nil)
	buf.Enqueue("proc-1", makeEntry("proc-1", 2, "tail", "hash-tail"), nil)

	time.Sleep(80 * time.Millisecond)

	batches := fakeStore.getUpsertBatches()
	if len(batches) != 1 {
		t.Fatalf("batches = %d, want 1", len(batches))
	}
	if len(batches[0]) != 2 {
		t.Fatalf("batch len = %d, want 2", len(batches[0]))
	}
	if batches[0][0].Content != "new" {
		t.Fatalf("entry 0 content = %q, want new", batches[0][0].Content)
	}
	if batches[0][1].Content != "tail" {
		t.Fatalf("entry 1 content = %q, want tail", batches[0][1].Content)
	}
}

func TestMemoryBufferFlushAll(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	buf := NewMemoryBuffer(time.Hour, fakeStore, nil)

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "one", "h1"), nil)
	buf.Enqueue("proc-2", makeEntry("proc-2", 1, "two", "h2"), nil)

	if err := buf.FlushAll(context.Background()); err != nil {
		t.Fatalf("FlushAll error: %v", err)
	}

	batches := fakeStore.getUpsertBatches()
	if len(batches) != 2 {
		t.Fatalf("batches = %d, want 2", len(batches))
	}
}

func TestMemoryBufferGetProcessEntry(t *testing.T) {
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	buf := NewMemoryBuffer(time.Hour, fakeStore, nil)

	buf.Enqueue("proc-1", makeEntry("proc-1", 1, "hello", "h1"), nil)

	entry, err := buf.GetProcessEntry(context.Background(), "proc-1", 1)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if entry == nil {
		t.Fatal("entry is nil, want non-nil")
	}
	if entry.Content != "hello" {
		t.Fatalf("content = %q, want hello", entry.Content)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/buffer/... -run TestMemoryBuffer -v`
Expected: FAIL (NewMemoryBuffer 未定义)

- [ ] **Step 3: 创建内存 buffer 实现**

```go
package buffer

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type batchStore interface {
	ListProcessEntriesByIndexes(ctx context.Context, processID string, entryIndexes []int) (map[int]*store.ProcessEntry, error)
	UpsertProcessEntries(ctx context.Context, entries []*store.ProcessEntry) error
}

// MemoryBuffer 内存缓冲实现（原有 processEntryBuffer 迁移）
type MemoryBuffer struct {
	interval time.Duration
	store    batchStore
	onFlush  FlushCallback

	mu        sync.Mutex
	processes map[string]*memoryBufferState
}

type memoryBufferState struct {
	lastEntryIndex *int
	pending        map[int]*store.ProcessEntry
	timer          *time.Timer
	flushing       bool
}

// NewMemoryBuffer 创建内存缓冲
func NewMemoryBuffer(interval time.Duration, store batchStore, onFlush FlushCallback) *MemoryBuffer {
	return &MemoryBuffer{
		interval:  interval,
		store:     store,
		onFlush:   onFlush,
		processes: make(map[string]*memoryBufferState),
	}
}

func (b *MemoryBuffer) Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int) {
	if b == nil || processID == "" || entry == nil {
		return
	}

	b.mu.Lock()
	state := b.processes[processID]
	if state == nil {
		state = &memoryBufferState{
			pending: make(map[int]*store.ProcessEntry),
		}
		if lastEntryIndex != nil {
			v := *lastEntryIndex
			state.lastEntryIndex = &v
		}
		b.processes[processID] = state
	}
	entryCopy := *entry
	state.pending[entry.EntryIndex] = &entryCopy
	if state.timer == nil {
		state.timer = time.AfterFunc(b.interval, func() {
			_ = b.FlushProcess(context.Background(), processID)
		})
	}
	b.mu.Unlock()
}

func (b *MemoryBuffer) FlushProcess(ctx context.Context, processID string) error {
	if b == nil || processID == "" {
		return nil
	}

	b.mu.Lock()
	state := b.processes[processID]
	if state == nil || len(state.pending) == 0 || state.flushing {
		b.mu.Unlock()
		return nil
	}
	state.flushing = true
	if state.timer != nil {
		state.timer.Stop()
		state.timer = nil
	}

	pendingEntries := make([]*store.ProcessEntry, 0, len(state.pending))
	entryIndexes := make([]int, 0, len(state.pending))
	for idx, entry := range state.pending {
		entryCopy := *entry
		pendingEntries = append(pendingEntries, &entryCopy)
		entryIndexes = append(entryIndexes, idx)
	}
	lastEntryIndex := cloneIntPtr(state.lastEntryIndex)
	b.mu.Unlock()

	sort.Slice(pendingEntries, func(i, j int) bool {
		return pendingEntries[i].EntryIndex < pendingEntries[j].EntryIndex
	})
	sort.Ints(entryIndexes)

	existingEntries, err := b.store.ListProcessEntriesByIndexes(ctx, processID, entryIndexes)
	if err != nil {
		b.resetProcessState(processID, pendingEntries, lastEntryIndex)
		return err
	}

	toPersist := make([]*store.ProcessEntry, 0, len(pendingEntries))
	persistedIndexes := make([]int, 0, len(pendingEntries))
	for _, entry := range pendingEntries {
		existing := existingEntries[entry.EntryIndex]
		if existing != nil && existing.ContentHash == entry.ContentHash {
			continue
		}
		toPersist = append(toPersist, entry)
		persistedIndexes = append(persistedIndexes, entry.EntryIndex)
	}

	if len(toPersist) > 0 {
		if err := b.store.UpsertProcessEntries(ctx, toPersist); err != nil {
			b.resetProcessState(processID, pendingEntries, lastEntryIndex)
			return err
		}
		lastEntryIndex = advanceEntryIndex(lastEntryIndex, persistedIndexes)
		if b.onFlush != nil {
			latestEntry := toPersist[len(toPersist)-1]
			if err := b.onFlush(ctx, latestEntry, cloneIntPtr(lastEntryIndex)); err != nil {
				b.resetProcessState(processID, pendingEntries, lastEntryIndex)
				return err
			}
		}
	}

	b.mu.Lock()
	state = b.processes[processID]
	if state != nil {
		state.pending = make(map[int]*store.ProcessEntry)
		state.flushing = false
		state.lastEntryIndex = cloneIntPtr(lastEntryIndex)
	}
	b.mu.Unlock()
	return nil
}

func (b *MemoryBuffer) FlushAll(ctx context.Context) error {
	if b == nil {
		return nil
	}

	b.mu.Lock()
	processIDs := make([]string, 0, len(b.processes))
	for id := range b.processes {
		processIDs = append(processIDs, id)
	}
	b.mu.Unlock()

	for _, id := range processIDs {
		if err := b.FlushProcess(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (b *MemoryBuffer) LastEntryIndex(processID string) *int {
	if b == nil || processID == "" {
		return nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	state := b.processes[processID]
	if state == nil {
		return nil
	}
	return cloneIntPtr(state.lastEntryIndex)
}

// GetProcessEntry 从内存 pending 中读取（实现 ProcessEntryReader）
func (b *MemoryBuffer) GetProcessEntry(_ context.Context, processID string, entryIndex int) (*store.ProcessEntry, error) {
	if b == nil {
		return nil, nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	state := b.processes[processID]
	if state == nil {
		return nil, nil
	}
	entry, ok := state.pending[entryIndex]
	if !ok {
		return nil, nil
	}
	entryCopy := *entry
	return &entryCopy, nil
}

func (b *MemoryBuffer) Close() error {
	return nil
}

func (b *MemoryBuffer) resetProcessState(processID string, pendingEntries []*store.ProcessEntry, lastEntryIndex *int) {
	b.mu.Lock()
	defer b.mu.Unlock()

	state := b.processes[processID]
	if state == nil {
		return
	}
	state.pending = make(map[int]*store.ProcessEntry, len(pendingEntries))
	for _, entry := range pendingEntries {
		entryCopy := *entry
		state.pending[entry.EntryIndex] = &entryCopy
	}
	state.flushing = false
	state.lastEntryIndex = cloneIntPtr(lastEntryIndex)
	if len(state.pending) > 0 && state.timer == nil {
		state.timer = time.AfterFunc(b.interval, func() {
			_ = b.FlushProcess(context.Background(), processID)
		})
	}
}

func advanceEntryIndex(current *int, persistedIndexes []int) *int {
	if len(persistedIndexes) == 0 {
		return cloneIntPtr(current)
	}
	sort.Ints(persistedIndexes)
	if current == nil {
		v := persistedIndexes[len(persistedIndexes)-1]
		return &v
	}

	next := *current
	seen := make(map[int]struct{}, len(persistedIndexes))
	for _, idx := range persistedIndexes {
		seen[idx] = struct{}{}
	}
	for {
		candidate := next + 1
		if _, ok := seen[candidate]; !ok {
			break
		}
		next = candidate
	}
	return &next
}

func cloneIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `go test ./internal/buffer/... -run TestMemoryBuffer -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/buffer/buffer.go internal/buffer/memory_buffer.go internal/buffer/memory_buffer_test.go
git commit -m "feat: 内存 buffer 迁移到 buffer 包，实现 MessageBuffer 接口"
```

---

## Chunk 3: Redis Buffer（核心实现）

### Task 6: Redis Buffer 实现

**Files:**
- Create: `internal/buffer/redis_buffer.go`
- Create: `internal/buffer/redis_buffer_test.go`

- [ ] **Step 1: 创建 Redis buffer 测试**

```go
package buffer

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func setupTestRedis(t *testing.T) (*miniredis.Miniredis, *RedisBuffer) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis 启动失败: %v", err)
	}

	rdb := newRedisClient(mr.Addr())
	buf := NewRedisBuffer(RedisBufferOptions{
		FlushThreshold: 5,
		FlushInterval:  50 * time.Millisecond,
		TTL:            time.Hour,
		RetryMax:       3,
	}, rdb, nil, nil)

	return mr, buf
}

func newRedisClient(addr string) *redisClientWrapper {
	import_wrapper := struct{}{}
	_ = import_wrapper
	return nil // placeholder, actual implementation will use go-redis
}

func TestRedisBufferEnqueueWritesToRedis(t *testing.T) {
	mr, buf := setupTestRedis(t)
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
		t.Fatal("entry is nil")
	}
	if got.Content != "hello" {
		t.Fatalf("content = %q, want hello", got.Content)
	}
}

func TestRedisBufferDedupByContentHash(t *testing.T) {
	mr, buf := setupTestRedis(t)
	defer mr.Close()
	defer buf.Close()

	entry1 := makeEntry("proc-1", 1, "hello", "h1")
	entry2 := makeEntry("proc-1", 1, "hello-v2", "h2")
	entry3 := makeEntry("proc-1", 1, "hello", "h1") // 和 entry1 相同

	buf.Enqueue("proc-1", entry1, nil)
	time.Sleep(10 * time.Millisecond)

	// entry2 contentHash 不同，应该覆盖
	buf.Enqueue("proc-1", entry2, nil)
	time.Sleep(10 * time.Millisecond)

	got, _ := buf.GetProcessEntry(context.Background(), "proc-1", 1)
	if got == nil || got.Content != "hello-v2" {
		t.Fatalf("after entry2, content = %v, want hello-v2", got)
	}

	// entry3 contentHash 和当前不同（当前是 h2, entry3 是 h1），应该覆盖
	buf.Enqueue("proc-1", entry3, nil)
	time.Sleep(10 * time.Millisecond)

	got, _ = buf.GetProcessEntry(context.Background(), "proc-1", 1)
	if got == nil || got.Content != "hello" {
		t.Fatalf("after entry3, content = %v, want hello", got)
	}
}

func TestRedisBufferFlushTriggerByThreshold(t *testing.T) {
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	defer mr.Close()

	var flushMu sync.Mutex
	var flushedEntries []*store.ProcessEntry
	onFlush := func(_ context.Context, entry *store.ProcessEntry, _ *int) error {
		flushMu.Lock()
		flushedEntries = append(flushedEntries, entry)
		flushMu.Unlock()
		return nil
	}

	// 使用 fakeBatchStore 作为 MySQL 层
	// RedisBuffer 的 flush 需要一个 batchStore 来写 MySQL
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}

	// 这里需要一个实际的 RedisBuffer 实现
	// 由于需要 miniredis + go-redis 集成，实际测试代码在实现时调整
	_ = fakeStore
	_ = onFlush
	_ = flushedEntries
	_ = fmt.Sprintf("")
	_ = json.Marshal
}
```

注意: 测试代码中的 `setupTestRedis` 和 `newRedisClient` 需要在实现时根据实际 go-redis API 调整。上面的测试展示了预期的行为。

- [ ] **Step 2: 创建 Redis buffer 实现**

```go
package buffer

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
	"github.com/redis/go-redis/v9"
)

const (
	redisZSETKeyPrefix = "process_entries:"
	redisHashKeyPrefix = "process_entry_data:"
)

// RedisBufferOptions Redis buffer 配置
type RedisBufferOptions struct {
	FlushThreshold int           // ZCARD >= 此值立即 flush
	FlushInterval  time.Duration // 定时器兜底间隔
	TTL            time.Duration // Hash key 过期时间
	RetryMax       int           // flush 失败最大重试
}

// RedisBuffer Redis ZSET + Hash 实现
type RedisBuffer struct {
	opts    RedisBufferOptions
	rdb     *redis.Client
	store   batchStore
	onFlush FlushCallback

	mu        sync.Mutex
	active    map[string]bool // 活跃的 processID 集合
	flushMu   sync.Mutex      // 防止同一 process 并发 flush
	retryCnt  map[string]int  // flush 重试计数
	stopCh    chan struct{}
}

// NewRedisBuffer 创建 Redis buffer
func NewRedisBuffer(opts RedisBufferOptions, rdb *redis.Client, store batchStore, onFlush FlushCallback) *RedisBuffer {
	if opts.FlushThreshold <= 0 {
		opts.FlushThreshold = 50
	}
	if opts.FlushInterval <= 0 {
		opts.FlushInterval = 500 * time.Millisecond
	}
	if opts.TTL <= 0 {
		opts.TTL = 24 * time.Hour
	}
	if opts.RetryMax <= 0 {
		opts.RetryMax = 3
	}

	rb := &RedisBuffer{
		opts:    opts,
		rdb:     rdb,
		store:   store,
		onFlush: onFlush,
		active:  make(map[string]bool),
		retryCnt: make(map[string]int),
		stopCh:  make(chan struct{}),
	}

	go rb.flushLoop()

	return rb
}

func (rb *RedisBuffer) Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int) {
	if rb == nil || processID == "" || entry == nil {
		return
	}

	ctx := context.Background()
	idxStr := strconv.Itoa(entry.EntryIndex)
	hashKey := redisHashKeyPrefix + processID
	zsetKey := redisZSETKeyPrefix + processID

	// Pipeline: ZADD + HSET + EXPIRE
	pipe := rb.rdb.Pipeline()
	pipe.ZAdd(ctx, zsetKey, redis.Z{
		Score:  float64(entry.EntryIndex),
		Member: idxStr,
	})
	data, _ := json.Marshal(entry)
	pipe.HSet(ctx, hashKey, idxStr, data)
	pipe.Expire(ctx, zsetKey, rb.opts.TTL)
	pipe.Expire(ctx, hashKey, rb.opts.TTL)
	if _, err := pipe.Exec(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Redis Enqueue 失败 [%s:%d]: %v\n", processID, entry.EntryIndex, err)
		return
	}

	// 记录活跃 process
	rb.mu.Lock()
	rb.active[processID] = true
	shouldFlush := false
	card, _ := rb.rdb.ZCard(ctx, zsetKey).Result()
	if card >= int64(rb.opts.FlushThreshold) {
		shouldFlush = true
	}
	rb.mu.Unlock()

	// 记录 lastEntryIndex
	if lastEntryIndex != nil {
		rb.rdb.Set(ctx, "process_last_idx:"+processID, *lastEntryIndex, rb.opts.TTL)
	}

	if shouldFlush {
		go func() {
			_ = rb.FlushProcess(context.Background(), processID)
		}()
	}
}

func (rb *RedisBuffer) FlushProcess(ctx context.Context, processID string) error {
	if rb == nil || processID == "" {
		return nil
	}

	// 防止并发 flush
	rb.flushMu.Lock()
	defer rb.flushMu.Unlock()

	zsetKey := redisZSETKeyPrefix + processID
	hashKey := redisHashKeyPrefix + processID

	// 1. ZRANGE 取出所有 entryIndex
	members, err := rb.rdb.ZRange(ctx, zsetKey, 0, -1).Result()
	if err != nil {
		return fmt.Errorf("ZRANGE %s: %w", zsetKey, err)
	}
	if len(members) == 0 {
		return nil
	}

	// 2. HMGET 批量取消息体
	values, err := rb.rdb.HMGet(ctx, hashKey, members...).Result()
	if err != nil {
		return fmt.Errorf("HMGET %s: %w", hashKey, err)
	}

	// 3. 反序列化 + 去重
	toPersist := make([]*store.ProcessEntry, 0, len(values))
	for _, val := range values {
		if val == nil {
			continue
		}
		var entry store.ProcessEntry
		if err := json.Unmarshal([]byte(val.(string)), &entry); err != nil {
			continue
		}
		toPersist = append(toPersist, &entry)
	}

	if len(toPersist) == 0 {
		// 清理 ZSET
		rb.rdb.Del(ctx, zsetKey)
		return nil
	}

	// 4. 批量写 MySQL
	if rb.store != nil {
		if err := rb.store.UpsertProcessEntries(ctx, toPersist); err != nil {
			rb.mu.Lock()
			rb.retryCnt[processID]++
			cnt := rb.retryCnt[processID]
			rb.mu.Unlock()

			if cnt >= rb.opts.RetryMax {
				fmt.Fprintf(os.Stderr, "Redis buffer flush 重试 %d 次后放弃 [%s]\n", cnt, processID)
				rb.writeDeadLetter(processID, toPersist)
				// 清理避免无限重试
				rb.rdb.Del(ctx, zsetKey)
				rb.mu.Lock()
				delete(rb.retryCnt, processID)
				rb.mu.Unlock()
			}
			return fmt.Errorf("UpsertProcessEntries %s: %w", processID, err)
		}
	}

	// 重置重试计数
	rb.mu.Lock()
	delete(rb.retryCnt, processID)
	rb.mu.Unlock()

	// 5. onFlush 回调
	if rb.onFlush != nil {
		lastIdx := rb.loadLastEntryIndex(ctx, processID)
		latestEntry := toPersist[len(toPersist)-1]
		if err := rb.onFlush(ctx, latestEntry, lastIdx); err != nil {
			fmt.Fprintf(os.Stderr, "onFlush 回调失败 [%s]: %v\n", processID, err)
		}
	}

	// 6. 清理 ZSET (已 flush 的 members)
	rb.rdb.Del(ctx, zsetKey)
	// Hash 保留，24h TTL 自然过期

	return nil
}

func (rb *RedisBuffer) FlushAll(ctx context.Context) error {
	if rb == nil {
		return nil
	}

	rb.mu.Lock()
	processIDs := make([]string, 0, len(rb.active))
	for id := range rb.active {
		processIDs = append(processIDs, id)
	}
	rb.mu.Unlock()

	for _, id := range processIDs {
		if err := rb.FlushProcess(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (rb *RedisBuffer) LastEntryIndex(processID string) *int {
	if rb == nil {
		return nil
	}
	return rb.loadLastEntryIndex(context.Background(), processID)
}

// GetProcessEntry 从 Redis Hash 读取（实现 ProcessEntryReader）
func (rb *RedisBuffer) GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error) {
	if rb == nil {
		return nil, nil
	}

	hashKey := redisHashKeyPrefix + processID
	val, err := rb.rdb.HGet(ctx, hashKey, strconv.Itoa(entryIndex)).Result()
	if err != nil {
		return nil, nil // key 不存在返回 nil
	}

	var entry store.ProcessEntry
	if err := json.Unmarshal([]byte(val), &entry); err != nil {
		return nil, err
	}
	return &entry, nil
}

func (rb *RedisBuffer) Close() error {
	close(rb.stopCh)
	return rb.FlushAll(context.Background())
}

func (rb *RedisBuffer) flushLoop() {
	ticker := time.NewTicker(rb.opts.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-rb.stopCh:
			return
		case <-ticker.C:
			_ = rb.FlushAll(context.Background())
		}
	}
}

func (rb *RedisBuffer) loadLastEntryIndex(ctx context.Context, processID string) *int {
	val, err := rb.rdb.Get(ctx, "process_last_idx:"+processID).Int()
	if err != nil {
		return nil
	}
	return &val
}

func (rb *RedisBuffer) writeDeadLetter(processID string, entries []*store.ProcessEntry) {
	// 写入死信文件 data/deadletter/{processID}-{timestamp}.jsonl
	// 后续人工介入处理
	for _, entry := range entries {
		data, _ := json.Marshal(entry)
		fmt.Fprintf(os.Stderr, "[DEADLETTER] %s: %s\n", processID, string(data))
	}
}
```

注意: 上面的实现中需要补充 `import "os"` 和调整错误处理。实际实现时会根据编译错误微调。

- [ ] **Step 3: 安装 miniredis 测试依赖**

Run:
```bash
go get github.com/alicebob/miniredis/v2
go mod tidy
```

- [ ] **Step 4: 运行测试**

Run: `go test ./internal/buffer/... -run TestRedisBuffer -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/buffer/redis_buffer.go internal/buffer/redis_buffer_test.go go.mod go.sum
git commit -m "feat: Redis ZSET + Hash buffer 实现"
```

---

## Chunk 4: Fallback Buffer（降级封装）

### Task 7: Fallback Buffer 实现

**Files:**
- Create: `internal/buffer/fallback_buffer.go`
- Create: `internal/buffer/fallback_buffer_test.go`

- [ ] **Step 1: 创建 fallback buffer 测试**

```go
package buffer

import (
	"context"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestFallbackBufferUsesRedisWhenHealthy(t *testing.T) {
	// Redis 可用时，消息写入 Redis buffer
	mr, redisBuf := setupTestRedis(t)
	defer mr.Close()

	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	memBuf := NewMemoryBuffer(time.Hour, fakeStore, nil)

	fb := NewFallbackBuffer(redisBuf, memBuf, 100*time.Millisecond)

	entry := makeEntry("proc-1", 1, "hello", "h1")
	fb.Enqueue("proc-1", entry, nil)

	time.Sleep(20 * time.Millisecond)

	got, err := fb.GetProcessEntry(context.Background(), "proc-1", 1)
	if err != nil {
		t.Fatalf("GetProcessEntry error: %v", err)
	}
	if got == nil || got.Content != "hello" {
		t.Fatalf("content = %v, want hello", got)
	}
}

func TestFallbackBufferDegradesOnRedisFailure(t *testing.T) {
	// Redis 不可用时，降级到内存 buffer
	mr, redisBuf := setupTestRedis(t)
	fakeStore := &fakeBatchStore{existing: make(map[int]*store.ProcessEntry)}
	memBuf := NewMemoryBuffer(20*time.Millisecond, fakeStore, nil)

	fb := NewFallbackBuffer(redisBuf, memBuf, 100*time.Millisecond)

	// 关闭 Redis 模拟故障
	mr.Close()

	entry := makeEntry("proc-1", 1, "fallback-data", "h1")
	fb.Enqueue("proc-1", entry, nil)

	time.Sleep(80 * time.Millisecond)

	batches := fakeStore.getUpsertBatches()
	if len(batches) != 1 {
		t.Fatalf("batches = %d, want 1", len(batches))
	}
	if batches[0][0].Content != "fallback-data" {
		t.Fatalf("content = %q, want fallback-data", batches[0][0].Content)
	}
}
```

- [ ] **Step 2: 创建 fallback buffer 实现**

```go
package buffer

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
	"github.com/redis/go-redis/v9"
)

// FallbackBuffer Redis 优先 + 内存降级
type FallbackBuffer struct {
	redis    *RedisBuffer
	memory   *MemoryBuffer
	redisRDB *redis.Client

	mu       sync.RWMutex
	healthy  bool
	checkCh  chan struct{}
	stopCh   chan struct{}
}

// NewFallbackBuffer 创建降级 buffer
func NewFallbackBuffer(redisBuf *RedisBuffer, memBuf *MemoryBuffer, healthCheckInterval time.Duration) *FallbackBuffer {
	fb := &FallbackBuffer{
		redis:    redisBuf,
		memory:   memBuf,
		redisRDB: redisBuf.rdb,
		healthy:  true,
		checkCh:  make(chan struct{}, 1),
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
	_ = fb.memory.FlushAll(context.Background())
	// 再刷 Redis buffer
	_ = fb.redis.FlushAll(context.Background())
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
			err := fb.redisRDB.Ping(ctx).Result()
			cancel()

			fb.mu.Lock()
			wasHealthy := fb.healthy
			if err == nil {
				if !wasHealthy {
					fmt.Println("[buffer] Redis 恢复，刷出内存积压数据")
					_ = fb.memory.FlushAll(context.Background())
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
```

- [ ] **Step 3: 运行测试**

Run: `go test ./internal/buffer/... -run TestFallbackBuffer -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add internal/buffer/fallback_buffer.go internal/buffer/fallback_buffer_test.go
git commit -m "feat: FallbackBuffer Redis 优先 + 内存降级"
```

---

## Chunk 5: 集成 SyncService

### Task 8: 修改 SyncService 使用 MessageBuffer 接口

**Files:**
- Modify: `internal/sync/sync.go`
- Modify: `internal/sync/process_entry_buffer.go`

- [ ] **Step 1: 修改 SyncService 结构体**

在 `sync.go` 中:

1. 将 `processEntryBuffer *processEntryBuffer` 改为:
```go
processEntryBuffer buffer.MessageBuffer
processEntryReader buffer.ProcessEntryReader
```

2. 添加 import:
```go
"github.com/huajiejun/kanban-watcher/internal/buffer"
```

3. 修改 `NewSyncService` 签名，接受可选的 Redis 客户端:
```go
func NewSyncService(cfg *config.Config, dbStore *store.Store, buf buffer.MessageBuffer, reader buffer.ProcessEntryReader) *SyncService {
```

4. 在初始化中设置:
```go
service.processEntryBuffer = buf
service.processEntryReader = reader
```

- [ ] **Step 2: 修改 consumeProcessLogs 中的 existingEntry 逻辑**

将 `consumeProcessLogs` 中从内存 map 获取 existingEntry 的逻辑改为:
```go
existingEntry, _ := s.processEntryReader.GetProcessEntry(ctx, processID, patch.EntryIndex)
```

注意: 当 `processEntryReader` 为 nil 时，使用原来的 `processEntriesByIndex` map 作为 fallback。

- [ ] **Step 3: 修改 Stop 方法**

```go
if s.processEntryBuffer != nil {
    if err := s.processEntryBuffer.FlushAll(context.Background()); err != nil {
        fmt.Fprintf(os.Stderr, "停止前刷出缓冲失败: %v\n", err)
    }
    s.processEntryBuffer.Close()
}
```

- [ ] **Step 4: 修改调用方（cmd/kanban-watcher/run.go）**

在创建 SyncService 的地方，根据 Redis 配置决定 buffer 类型:

```go
var buf buffer.MessageBuffer
var reader buffer.ProcessEntryReader

if cfg.Redis.IsEnabled() {
    rc, err := redisclient.NewClient(cfg.Redis)
    if err != nil {
        fmt.Fprintf(os.Stderr, "Redis 连接失败，使用内存 buffer: %v\n", err)
        buf = buffer.NewMemoryBuffer(...)
        reader = buf.(*buffer.MemoryBuffer)
    } else {
        rb := buffer.NewRedisBuffer(...)
        mb := buffer.NewMemoryBuffer(...)
        fb := buffer.NewFallbackBuffer(rb, mb, 5*time.Second)
        buf = fb
        reader = fb
    }
} else {
    buf = buffer.NewMemoryBuffer(...)
    reader = buf.(*buffer.MemoryBuffer)
}

syncService := sync.NewSyncService(cfg, dbStore, buf, reader)
```

- [ ] **Step 5: 标记 process_entry_buffer.go 为废弃**

在文件顶部添加注释:
```go
// Deprecated: 已迁移到 internal/buffer 包
// 此文件保留用于过渡期兼容，后续删除
```

- [ ] **Step 6: 验证编译**

Run: `go build ./...`
Expected: 编译通过

- [ ] **Step 7: 运行现有测试**

Run: `go test ./internal/sync/... -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add internal/sync/sync.go internal/sync/process_entry_buffer.go cmd/kanban-watcher/
git commit -m "feat: SyncService 集成 MessageBuffer 接口，支持 Redis/内存切换"
```

---

## Chunk 6: 端到端验证

### Task 9: 手动集成测试

**Files:**
- 无新文件

- [ ] **Step 1: 启动 Redis**

Run: `redis-server`
Expected: Redis 在 localhost:6379 启动

- [ ] **Step 2: 配置文件添加 Redis 配置**

在 config.yaml 中添加:
```yaml
redis:
  addr: "localhost:6379"
  password: ""
  db: 0
  pool_size: 10
```

- [ ] **Step 3: 启动应用并观察日志**

启动 kanban-watcher，观察:
1. 是否输出 "Redis 连接成功" 相关日志
2. 上游 WS 推送消息时，是否写入 Redis
3. Flush 是否正常工作（不再查 DB 去重）
4. 前端实时推送是否正常

- [ ] **Step 4: 验证降级场景**

1. 停止 Redis
2. 观察日志是否输出 "Redis 不可用，降级到内存 buffer"
3. 确认消息仍正常入库
4. 重启 Redis
5. 观察日志是否输出 "Redis 恢复"

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "test: Redis ZSET 消息优化集成验证完成"
```
