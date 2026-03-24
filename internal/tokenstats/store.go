package tokenstats

import (
	"context"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// AggregatedUsage 聚合后的 token 用量
type AggregatedUsage struct {
	StatHour     time.Time
	Executor     string
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
	SessionCount int
}

// SaveUsage 将聚合后的 token 用量存入 MariaDB
func SaveUsage(ctx context.Context, db *store.Store, usages []*AggregatedUsage) error {
	if len(usages) == 0 {
		return nil
	}

	dbUsages := make([]*store.TokenUsageHourly, 0, len(usages))
	for _, u := range usages {
		dbUsages = append(dbUsages, &store.TokenUsageHourly{
			StatHour:     u.StatHour,
			Executor:     u.Executor,
			InputTokens:  u.InputTokens,
			OutputTokens: u.OutputTokens,
			TotalTokens:  u.TotalTokens,
			SessionCount: u.SessionCount,
		})
	}
	return db.BatchUpsertTokenUsageHourly(ctx, dbUsages)
}