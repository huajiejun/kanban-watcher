package main

import (
	"context"
	"fmt"
	"log"
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

	fmt.Println("\n开始收集 token 用量...")

	// 收集所有 session 的 token 数据
	sessions, err := tokenstats.CollectSessionTokens(cfg.ConversationSync.BaseDir)
	if err != nil {
		log.Fatalf("收集 session token 失败: %v", err)
	}
	fmt.Printf("收集到 %d 条 session token 记录\n", len(sessions))

	// 打印详情
	for i, s := range sessions {
		if i < 10 {
			fmt.Printf("  Session[%d]: ID=%s, Executor=%s, Input=%d, Output=%d, Total=%d\n",
				i, s.SessionID, s.Executor,
				s.TokenInfo.TotalUsage.InputTokens,
				s.TokenInfo.TotalUsage.OutputTokens,
				s.TokenInfo.TotalUsage.TotalTokens)
		}
	}
	if len(sessions) > 10 {
		fmt.Printf("  ... 还有 %d 条记录\n", len(sessions)-10)
	}

	// 按小时聚合 (模拟 collector 的逻辑)
	aggregated := aggregateByHour(sessions)
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

// aggregateByHour 按 (小时, executor) 聚合
func aggregateByHour(sessions []tokenstats.SessionToken) []*tokenstats.AggregatedUsage {
	type key struct {
		hour     time.Time
		executor string
	}
	agg := make(map[key]*tokenstats.AggregatedUsage)

	for _, s := range sessions {
		// 标准化到小时
		hour := time.Date(s.LastSeenAt.Year(), s.LastSeenAt.Month(), s.LastSeenAt.Day(),
			s.LastSeenAt.Hour(), 0, 0, 0, s.LastSeenAt.Location())
		k := key{hour: hour, executor: s.Executor}
		if a, ok := agg[k]; ok {
			a.InputTokens += s.TokenInfo.TotalUsage.InputTokens
			a.OutputTokens += s.TokenInfo.TotalUsage.OutputTokens
			a.TotalTokens += s.TokenInfo.TotalUsage.TotalTokens
			a.SessionCount++
		} else {
			agg[k] = &tokenstats.AggregatedUsage{
				StatHour:     k.hour,
				Executor:     k.executor,
				InputTokens:  s.TokenInfo.TotalUsage.InputTokens,
				OutputTokens: s.TokenInfo.TotalUsage.OutputTokens,
				TotalTokens:  s.TokenInfo.TotalUsage.TotalTokens,
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
