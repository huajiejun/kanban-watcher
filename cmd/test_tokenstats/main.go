package main

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
	"github.com/huajiejun/kanban-watcher/internal/tokenstats"
)

func main() {
	// 加载配置
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	fmt.Println("=== Token Stats Manual Test ===")
	fmt.Printf("TokenStats Enabled: %v\n", cfg.TokenStats.IsEnabled())
	fmt.Printf("BaseDir: %s\n", cfg.ConversationSync.BaseDir)
	fmt.Printf("SyncIntervalHours: %d\n", cfg.TokenStats.SyncIntervalHours)

	if !cfg.Database.IsEnabled() {
		log.Fatal("数据库未配置")
	}

	// 连接数据库
	db, err := store.NewStore(cfg.Database.DSN())
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	defer db.Close()

	// 初始化 schema
	if err := db.InitSchema(context.Background()); err != nil {
		log.Fatalf("数据库表初始化失败: %v", err)
	}
	fmt.Println("数据库连接成功")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	fmt.Println("\n开始收集 token 增量...")

	// 收集所有 session 的 token 增量数据
	deltas, err := tokenstats.CollectTokenDeltas(cfg.ConversationSync.BaseDir)
	if err != nil {
		log.Fatalf("收集 token delta 失败: %v", err)
	}
	fmt.Printf("收集到 %d 条 token 增量记录\n", len(deltas))

	// 读取 SQLite 获取 session 元数据
	sqlitePath := filepath.Join(cfg.ConversationSync.BaseDir, "db.v2.sqlite")
	sessionMetas, err := tokenstats.ReadSessionMeta(sqlitePath)
	if err != nil {
		log.Printf("读取 session 元数据失败: %v", err)
	} else {
		fmt.Printf("读取到 %d 条 session 元数据\n", len(sessionMetas))

		// 丰富 deltas 的 executor 信息（保留文件修改时间作为时间戳）
		enrichedCount := 0
		for i := range deltas {
			if meta, ok := sessionMetas[deltas[i].SessionID]; ok {
				deltas[i].Executor = meta.Executor
				enrichedCount++
			}
		}
		fmt.Printf("丰富了 %d 条记录的 executor\n", enrichedCount)
	}

	// 打印详情
	for i, d := range deltas {
		if i < 10 {
			fmt.Printf("  Delta[%d]: Session=%s, Executor=%s, Input=%d, Output=%d, Total=%d, Time=%s\n",
				i, d.SessionID, d.Executor, d.InputDelta, d.OutputDelta, d.TotalDelta,
				d.Timestamp.Format("2006-01-02 15:04:05"))
		}
	}
	if len(deltas) > 10 {
		fmt.Printf("  ... 还有 %d 条记录\n", len(deltas)-10)
	}

	// 按小时聚合
	aggregated := aggregateDeltasByHour(deltas)
	fmt.Printf("聚合后 %d 条记录\n", len(aggregated))

	for _, a := range aggregated {
		fmt.Printf("  Hour=%s, Executor=%s, Input=%d, Output=%d, Total=%d, Sessions=%d\n",
			a.StatHour.Format("2006-01-02 15:04"), a.Executor,
			a.InputTokens, a.OutputTokens, a.TotalTokens, a.SessionCount)
	}

	// 存入数据库
	if len(aggregated) > 0 {
		if err := tokenstats.SaveUsage(ctx, db, aggregated); err != nil {
			log.Fatalf("存储失败: %v", err)
		}
		fmt.Println("存储成功!")
	} else {
		fmt.Println("没有数据需要存储")
	}
}

// aggregateDeltasByHour 按 (小时, executor) 聚合 token 增量
func aggregateDeltasByHour(deltas []tokenstats.TokenDelta) []*tokenstats.AggregatedUsage {
	type key struct {
		hour     time.Time
		executor string
	}
	agg := make(map[key]*tokenstats.AggregatedUsage)

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
			agg[k] = &tokenstats.AggregatedUsage{
				StatHour:     k.hour,
				Executor:     d.Executor,
				InputTokens:  d.InputDelta,
				OutputTokens: d.OutputDelta,
				TotalTokens:  d.TotalDelta,
				SessionCount: 1,
			}
		}
	}

	result := make([]*tokenstats.AggregatedUsage, 0, len(agg))
	for _, v := range agg {
		result = append(result, v)
	}
	return result
}
