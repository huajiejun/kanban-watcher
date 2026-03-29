package buffer

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// batchStore 批量存储接口
type batchStore interface {
	ListProcessEntriesByIndexes(ctx context.Context, processID string, entryIndexes []int) (map[int]*store.ProcessEntry, error)
	UpsertProcessEntries(ctx context.Context, entries []*store.ProcessEntry) error
}

// MemoryBuffer 内存缓冲区实现
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

// NewMemoryBuffer 创建内存缓冲区
func NewMemoryBuffer(interval time.Duration, store batchStore, onFlush FlushCallback) *MemoryBuffer {
	return &MemoryBuffer{
		interval:  interval,
		store:     store,
		onFlush:   onFlush,
		processes: make(map[string]*memoryBufferState),
	}
}

// Enqueue 将消息写入缓冲区
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
			value := *lastEntryIndex
			state.lastEntryIndex = &value
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

// FlushProcess 将指定 process 的缓冲数据持久化
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
	for entryIndex, entry := range state.pending {
		entryCopy := *entry
		pendingEntries = append(pendingEntries, &entryCopy)
		entryIndexes = append(entryIndexes, entryIndex)
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
		if !shouldPersistProcessEntryUpdate(existingEntries[entry.EntryIndex], entry) {
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

// FlushAll 刷出所有 process 的缓冲数据
func (b *MemoryBuffer) FlushAll(ctx context.Context) error {
	if b == nil {
		return nil
	}

	b.mu.Lock()
	processIDs := make([]string, 0, len(b.processes))
	for processID := range b.processes {
		processIDs = append(processIDs, processID)
	}
	b.mu.Unlock()

	for _, processID := range processIDs {
		if err := b.FlushProcess(ctx, processID); err != nil {
			return err
		}
	}
	return nil
}

// LastEntryIndex 获取指定 process 最后处理的 entry index
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

// GetProcessEntry 从缓存读取单条数据
func (b *MemoryBuffer) GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error) {
	if b == nil || processID == "" {
		return nil, nil
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	state := b.processes[processID]
	if state == nil {
		return nil, nil
	}

	entry := state.pending[entryIndex]
	if entry == nil {
		return nil, nil
	}

	entryCopy := *entry
	return &entryCopy, nil
}

// Close 关闭缓冲区，释放资源
func (b *MemoryBuffer) Close() error {
	if b == nil {
		return nil
	}

	return b.FlushAll(context.Background())
}

// resetProcessState 重置 process 状态（用于错误恢复）
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

// shouldPersistProcessEntryUpdate 判断是否需要持久化更新
func shouldPersistProcessEntryUpdate(existing, newEntry *store.ProcessEntry) bool {
	if existing == nil {
		return true
	}
	return existing.ContentHash != newEntry.ContentHash
}

// advanceEntryIndex 推进 entry index
func advanceEntryIndex(current *int, persistedIndexes []int) *int {
	if len(persistedIndexes) == 0 {
		return cloneIntPtr(current)
	}
	sort.Ints(persistedIndexes)
	if current == nil {
		value := persistedIndexes[len(persistedIndexes)-1]
		return &value
	}

	next := *current
	seen := make(map[int]struct{}, len(persistedIndexes))
	for _, persistedIndex := range persistedIndexes {
		seen[persistedIndex] = struct{}{}
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

// cloneIntPtr 克隆 int 指针
func cloneIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
