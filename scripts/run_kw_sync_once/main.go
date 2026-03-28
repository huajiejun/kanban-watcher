package main

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	cfgpkg "github.com/huajiejun/kanban-watcher/internal/config"
	storepkg "github.com/huajiejun/kanban-watcher/internal/store"
	syncpkg "github.com/huajiejun/kanban-watcher/internal/sync"
)

func main() {
	cfg := &cfgpkg.Config{
		KanbanAPIURL: "https://vk.huajiejun.cn",
		Database: cfgpkg.DatabaseConfig{
			Host:             "home.huajiejun.cn",
			Port:             3306,
			User:             "root",
			Password:         "Ywldtc@1991",
			Database:         "kanban_watcher",
			SyncIntervalSecs: 30,
			MessageTypes: []string{
				"user_message",
				"assistant_message",
				"tool_use",
				"error_message",
			},
		},
	}

	st, err := storepkg.NewStoreWithOptions(cfg.Database.DSN(), storepkg.Options{
		MaxOpenConns:    4,
		MaxIdleConns:    4,
		ConnMaxLifetime: time.Duration(cfg.Database.ConnMaxLifetimeSecs) * time.Second,
		ConnMaxIdleTime: time.Duration(cfg.Database.ConnMaxIdleTimeSecs) * time.Second,
	})
	if err != nil {
		panic(err)
	}
	defer st.Close()

	svc := syncpkg.NewSyncService(cfg, st)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := svc.Start(ctx); err != nil {
		panic(err)
	}
	fmt.Println("sync started")
	time.Sleep(20 * time.Second)
	svc.Stop()
	fmt.Println("sync stopped")

	db, err := sql.Open("mysql", cfg.Database.DSN())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	queries := []string{
		"SELECT COUNT(*) AS workspace_count FROM kw_workspaces",
		"SELECT COUNT(*) AS session_count FROM kw_sessions",
		"SELECT COUNT(*) AS process_count FROM kw_execution_processes",
		"SELECT COUNT(*) AS entry_count FROM kw_process_entries",
		"SELECT status, COUNT(*) AS cnt FROM kw_sync_subscriptions GROUP BY status ORDER BY status",
		"SELECT subscription_key, status, last_entry_index, LEFT(COALESCE(last_error, ''), 120) AS last_error FROM kw_sync_subscriptions ORDER BY updated_at DESC LIMIT 10",
	}

	for _, q := range queries {
		fmt.Println("SQL>", q)
		rows, err := db.Query(q)
		if err != nil {
			fmt.Println("ERR:", err)
			continue
		}

		cols, _ := rows.Columns()
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}

		for rows.Next() {
			if err := rows.Scan(ptrs...); err != nil {
				panic(err)
			}
			for i, c := range cols {
				switch v := vals[i].(type) {
				case []byte:
					fmt.Printf("%s=%s ", c, string(v))
				default:
					fmt.Printf("%s=%v ", c, v)
				}
			}
			fmt.Println()
		}
		rows.Close()
	}
}
