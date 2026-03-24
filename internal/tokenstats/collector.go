package tokenstats

import (
	"context"
	"log"
	"path/filepath"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// Collector 定时收集 token 用量
type Collector struct {
	cfg        config.TokenStatsConfig
	baseDir    string
	db         *store.Store
	stopCh     chan struct{}
	wg         sync.WaitGroup
}

// NewCollector 创建 collector 实例
func NewCollector(cfg config.TokenStatsConfig, baseDir string, db *store.Store) *Collector {
	return &Collector{
		cfg:     cfg,
		baseDir: baseDir,
		db:      db,
		stopCh:  make(chan struct{}),
	}
}

// Start 启动定时收集
func (c *Collector) Start() {
	if !c.cfg.IsEnabled() {
		log.Println("[tokenstats] 未启用，跳过启动")
		return
	}
	interval := time.Duration(c.cfg.SyncIntervalHours) * time.Hour
	if interval <= 0 {
		interval = time.Hour
	}

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// 启动时立即执行一次
		c.collect()

		for {
			select {
			case <-ticker.C:
				c.collect()
			case <-c.stopCh:
				log.Println("[tokenstats] 收到停止信号")
				return
			}
		}
	}()
	log.Printf("[tokenstats] 已启动，间隔 %d 小时", c.cfg.SyncIntervalHours)
}

// Stop 停止收集
func (c *Collector) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

func (c *Collector) collect() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	log.Println("[tokenstats] 开始收集 token 用量...")

	// 收集所有 session 的 token 增量数据
	deltas, err := CollectTokenDeltas(c.baseDir)
	if err != nil {
		log.Printf("[tokenstats] 收集 token delta 失败: %v", err)
		return
	}
	log.Printf("[tokenstats] 收集到 %d 条 token 增量记录", len(deltas))

	// 读取 SQLite 获取 session 元数据
	sqlitePath := filepath.Join(c.baseDir, "db.v2.sqlite")
	sessionMetas, err := ReadSessionMeta(sqlitePath)
	if err != nil {
		log.Printf("[tokenstats] 读取 session 元数据失败: %v", err)
	} else {
		log.Printf("[tokenstats] 读取到 %d 条 session 元数据", len(sessionMetas))

		// 丰富 deltas 的 executor 信息
		for i := range deltas {
			if meta, ok := sessionMetas[deltas[i].SessionID]; ok {
				deltas[i].Executor = meta.Executor
				deltas[i].Timestamp = meta.CreatedAt
			}
		}
	}

	// 按 (小时, executor) 聚合
	aggregated := aggregateDeltasByHour(deltas)

	// 存入 MariaDB
	if err := SaveUsage(ctx, c.db, aggregated); err != nil {
		log.Printf("[tokenstats] 存储失败: %v", err)
		return
	}
	log.Printf("[tokenstats] 成功存储 %d 条聚合记录", len(aggregated))
}

func aggregateDeltasByHour(deltas []TokenDelta) []*AggregatedUsage {
	// 按 (hour, executor) 聚合
	type key struct {
		hour     time.Time
		executor string
	}
	agg := make(map[key]*AggregatedUsage)

	for _, d := range deltas {
		// 标准化到小时
		hour := time.Date(d.Timestamp.Year(), d.Timestamp.Month(), d.Timestamp.Day(),
			d.Timestamp.Hour(), 0, 0, 0, d.Timestamp.Location())
		k := key{hour: hour, executor: d.Executor}
		if a, ok := agg[k]; ok {
			a.InputTokens += d.InputDelta
			a.OutputTokens += d.OutputDelta
			a.TotalTokens += d.TotalDelta
			a.SessionCount++
		} else {
			agg[k] = &AggregatedUsage{
				StatHour:     k.hour,
				Executor:     d.Executor,
				InputTokens:  d.InputDelta,
				OutputTokens: d.OutputDelta,
				TotalTokens:  d.TotalDelta,
				SessionCount: 1,
			}
		}
	}

	result := make([]*AggregatedUsage, 0, len(agg))
	for _, v := range agg {
		result = append(result, v)
	}
	return result
}
