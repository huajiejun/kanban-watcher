package buffer

import (
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func setupTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis 启动失败: %v", err)
	}
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return mr, rdb
}

func TestCursorEncodeDecode(t *testing.T) {
	original := cursor{TimestampMilli: 1743244800000, ProcessID: "proc-abc-123", EntryIndex: 42}
	encoded := encodeCursor(original)
	decoded, err := decodeCursor(encoded)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if decoded.TimestampMilli != original.TimestampMilli {
		t.Errorf("timestamp: got %d, want %d", decoded.TimestampMilli, original.TimestampMilli)
	}
	if decoded.ProcessID != original.ProcessID {
		t.Errorf("processID: got %s, want %s", decoded.ProcessID, original.ProcessID)
	}
	if decoded.EntryIndex != original.EntryIndex {
		t.Errorf("entryIndex: got %d, want %d", decoded.EntryIndex, original.EntryIndex)
	}
}

func TestDecodeEmptyCursor(t *testing.T) {
	_, err := decodeCursor("")
	if err == nil {
		t.Error("expected error for empty cursor")
	}
}

func TestRedisReaderFetchWorkspaceMessages(t *testing.T) {
	mr, rdb := setupTestRedis(t)
	defer mr.Close()
	defer rdb.Close()

	ctx := context.Background()
	processID := "test-proc-reader"
	workspaceID := "test-ws-reader"

	// 写入 workspace 索引
	rdb.ZAdd(ctx, redisWorkspaceProcessesPrefix+workspaceID, &redis.Z{
		Score:  float64(time.Now().UnixMilli()),
		Member: processID,
	})

	// 写入 5 条消息（ZSET score = entry_index, Hash 存完整数据）
	for i := 1; i <= 5; i++ {
		entry := store.ProcessEntry{
			ProcessID:      processID,
			WorkspaceID:    workspaceID,
			EntryIndex:     i,
			EntryType:      "assistant_message",
			Role:           "assistant",
			Content:        "message " + strconv.Itoa(i),
			EntryTimestamp: time.Now().Add(time.Duration(i) * time.Minute),
		}
		data, _ := json.Marshal(entry)
		idxStr := strconv.Itoa(i)
		rdb.HSet(ctx, redisHashKeyPrefix+processID, idxStr, data)
		rdb.ZAdd(ctx, redisZSETKeyPrefix+processID, &redis.Z{
			Score:  float64(i),
			Member: idxStr,
		})
	}

	reader := NewRedisReader(rdb)

	// 测试第一页（limit=3，应返回最新 3 条 + hasMore=true）
	entries, hasMore, cursor, err := reader.FetchWorkspaceMessages(ctx, workspaceID, 3, "")
	if err != nil {
		t.Fatalf("FetchWorkspaceMessages failed: %v", err)
	}
	if len(entries) != 3 {
		t.Errorf("expected 3 entries, got %d", len(entries))
	}
	if !hasMore {
		t.Error("expected hasMore=true")
	}
	if cursor == "" {
		t.Error("expected non-empty cursor")
	}

	// 测试翻页（用 cursor 取剩余）
	entries2, hasMore2, _, err := reader.FetchWorkspaceMessages(ctx, workspaceID, 10, cursor)
	if err != nil {
		t.Fatalf("FetchWorkspaceMessages page2 failed: %v", err)
	}
	if len(entries2) != 2 {
		t.Errorf("expected 2 entries on page2, got %d", len(entries2))
	}
	if hasMore2 {
		t.Error("expected hasMore=false on page2")
	}

	// 清理
	rdb.Del(ctx, redisWorkspaceProcessesPrefix+workspaceID, redisZSETKeyPrefix+processID, redisHashKeyPrefix+processID)
}

func TestRedisReaderEmptyWorkspace(t *testing.T) {
	mr, rdb := setupTestRedis(t)
	defer mr.Close()
	defer rdb.Close()

	reader := NewRedisReader(rdb)
	entries, hasMore, cursor, err := reader.FetchWorkspaceMessages(context.Background(), "nonexistent-ws", 50, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
	if hasMore {
		t.Error("expected hasMore=false")
	}
	if cursor != "" {
		t.Error("expected empty cursor")
	}
}

func TestRedisReaderNil(t *testing.T) {
	var reader *RedisReader
	entries, hasMore, cursor, err := reader.FetchWorkspaceMessages(context.Background(), "ws", 50, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
	if hasMore {
		t.Error("expected hasMore=false for nil reader")
	}
	if cursor != "" {
		t.Error("expected empty cursor for nil reader")
	}
}
