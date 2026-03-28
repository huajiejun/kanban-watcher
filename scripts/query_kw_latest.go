package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}
	if !cfg.Database.IsEnabled() {
		log.Fatal("数据库未配置")
	}

	db, err := sql.Open("mysql", cfg.Database.DSN())
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("数据库 ping 失败: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	type latestEntry struct {
		ID         int64      `db:"id"`
		ProcessID  string     `db:"process_id"`
		SessionID  string     `db:"session_id"`
		EntryIndex int        `db:"entry_index"`
		EntryType  string     `db:"entry_type"`
		CreatedAt  *time.Time `db:"created_at"`
		EntryAt    *time.Time `db:"entry_timestamp"`
	}

	var entry latestEntry
	row := db.QueryRowContext(ctx, `
		SELECT id, process_id, session_id, entry_index, entry_type, created_at, entry_timestamp
		FROM kw_process_entries
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`)
	if err := row.Scan(
		&entry.ID,
		&entry.ProcessID,
		&entry.SessionID,
		&entry.EntryIndex,
		&entry.EntryType,
		&entry.CreatedAt,
		&entry.EntryAt,
	); err != nil {
		log.Fatalf("查询最新 process entry 失败: %v", err)
	}

	fmt.Printf(
		"latest_process_entry id=%d process_id=%s session_id=%s entry_index=%d entry_type=%s created_at=%s entry_timestamp=%s\n",
		entry.ID,
		entry.ProcessID,
		entry.SessionID,
		entry.EntryIndex,
		entry.EntryType,
		formatTime(entry.CreatedAt),
		formatTime(entry.EntryAt),
	)

	var latestSubUpdatedAt *time.Time
	if err := db.QueryRowContext(ctx, `
		SELECT updated_at
		FROM kw_sync_subscriptions
		ORDER BY updated_at DESC
		LIMIT 1
	`).Scan(&latestSubUpdatedAt); err != nil {
		log.Fatalf("查询最新 subscription 失败: %v", err)
	}
	fmt.Printf("latest_subscription_updated_at=%s\n", formatTime(latestSubUpdatedAt))

	var latestExecutionSyncedAt *time.Time
	if err := db.QueryRowContext(ctx, `
		SELECT synced_at
		FROM kw_execution_processes
		ORDER BY synced_at DESC
		LIMIT 1
	`).Scan(&latestExecutionSyncedAt); err != nil {
		log.Fatalf("查询最新 execution process 失败: %v", err)
	}
	fmt.Printf("latest_execution_process_synced_at=%s\n", formatTime(latestExecutionSyncedAt))
}

func formatTime(value *time.Time) string {
	if value == nil {
		return "<nil>"
	}
	return value.Format(time.RFC3339Nano)
}
