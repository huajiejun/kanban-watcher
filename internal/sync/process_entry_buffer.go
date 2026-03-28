package sync

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type processEntryBatchStore interface {
	ListProcessEntriesByIndexes(context.Context, string, []int) (map[int]*store.ProcessEntry, error)
	UpsertProcessEntries(context.Context, []*store.ProcessEntry) error
}

type processEntryBuffer struct {
	interval time.Duration
	store    processEntryBatchStore
	onFlush  func(context.Context, *store.ProcessEntry, *int) error

	mu        sync.Mutex
	processes map[string]*processEntryBufferState
}

type processEntryBufferState struct {
	lastEntryIndex *int
	pending        map[int]*store.ProcessEntry
	timer          *time.Timer
	flushing       bool
}

func newProcessEntryBuffer(
	interval time.Duration,
	store processEntryBatchStore,
	onFlush func(context.Context, *store.ProcessEntry, *int) error,
) *processEntryBuffer {
	return &processEntryBuffer{
		interval:  interval,
		store:     store,
		onFlush:   onFlush,
		processes: make(map[string]*processEntryBufferState),
	}
}

func (b *processEntryBuffer) Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int) {
	if b == nil || processID == "" || entry == nil {
		return
	}

	b.mu.Lock()
	state := b.processes[processID]
	if state == nil {
		state = &processEntryBufferState{
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

func (b *processEntryBuffer) FlushProcess(ctx context.Context, processID string) error {
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
		lastEntryIndex = advanceProcessEntryIndex(lastEntryIndex, persistedIndexes)
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

func (b *processEntryBuffer) FlushAll(ctx context.Context) error {
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

func (b *processEntryBuffer) LastEntryIndex(processID string) *int {
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

func (b *processEntryBuffer) resetProcessState(processID string, pendingEntries []*store.ProcessEntry, lastEntryIndex *int) {
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

func advanceProcessEntryIndex(current *int, persistedIndexes []int) *int {
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

func cloneIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
