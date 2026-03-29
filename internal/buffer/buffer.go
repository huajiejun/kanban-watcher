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
