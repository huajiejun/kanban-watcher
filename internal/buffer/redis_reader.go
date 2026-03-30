package buffer

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// Cursor 三段式分页游标
type Cursor struct {
	TimestampMilli int64  `json:"ts"`
	ProcessID      string `json:"pid"`
	EntryIndex     int    `json:"ei"`
}

func encodeCursor(c Cursor) string {
	data, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(data)
}

// DecodeCursor 解码分页游标
func DecodeCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, fmt.Errorf("empty cursor")
	}
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor: %w", err)
	}
	var c Cursor
	if err := json.Unmarshal(data, &c); err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor json: %w", err)
	}
	return c, nil
}

// RedisReader Redis 优先消息查询
type RedisReader struct {
	rdb *redis.Client
}

// NewRedisReader 创建 Redis 查询器
func NewRedisReader(rdb *redis.Client) *RedisReader {
	return &RedisReader{rdb: rdb}
}

// FetchWorkspaceMessages 从 Redis 查询工作区消息
// ZSET score 是 entry_index（非 timestamp），所以采用全量读取 + 内存过滤 + 排序
// 返回消息列表、是否有更多数据、下一页 cursor、错误
func (rr *RedisReader) FetchWorkspaceMessages(ctx context.Context, workspaceID string, limit int, beforeCursor string) ([]store.ProcessEntry, bool, string, error) {
	if rr == nil || rr.rdb == nil {
		return nil, false, "", nil
	}

	wsZsetKey := redisWorkspaceProcessesPrefix + workspaceID

	// 解析 cursor 获取阈值
	var cursorTS int64
	var cursorPID string
	var cursorEI int
	if beforeCursor != "" {
		c, err := DecodeCursor(beforeCursor)
		if err == nil {
			cursorTS = c.TimestampMilli
			cursorPID = c.ProcessID
			cursorEI = c.EntryIndex
		}
	}

	// 1. 获取 processID 列表
	processIDs, err := rr.rdb.ZRevRange(ctx, wsZsetKey, 0, -1).Result()
	if err != nil {
		return nil, false, "", fmt.Errorf("ZREVRANGE workspace_processes: %w", err)
	}
	if len(processIDs) == 0 {
		return nil, false, "", nil
	}

	// 2. 逐个 process 从 Hash 读取全部消息
	// 注意：ZSET (process_entries) 是写入缓冲区，flush 到 MySQL 后会被清除
	// 所以必须从 Hash (process_entry_data) 读取，Hash 保留 TTL 自然过期
	var allEntries []store.ProcessEntry
	for _, processID := range processIDs {
		hashKey := redisHashKeyPrefix + processID

		entries, err := rr.rdb.HGetAll(ctx, hashKey).Result()
		if err != nil || len(entries) == 0 {
			continue
		}

		for idxStr, data := range entries {
			var entry store.ProcessEntry
			if err := json.Unmarshal([]byte(data), &entry); err != nil {
				continue
			}
			if idx, err := strconv.Atoi(idxStr); err == nil {
				entry.EntryIndex = idx
			}
			allEntries = append(allEntries, entry)
		}
	}

	// 3. 按 entry_timestamp 倒序排列
	sort.Slice(allEntries, func(i, j int) bool {
		if allEntries[i].EntryTimestamp.Equal(allEntries[j].EntryTimestamp) {
			if allEntries[i].ProcessID == allEntries[j].ProcessID {
				return allEntries[i].EntryIndex > allEntries[j].EntryIndex
			}
			return allEntries[i].ProcessID > allEntries[j].ProcessID
		}
		return allEntries[i].EntryTimestamp.After(allEntries[j].EntryTimestamp)
	})

	// 4. cursor 过滤：只保留严格在 cursor 之前的消息
	if cursorTS > 0 {
		filtered := make([]store.ProcessEntry, 0, len(allEntries))
		for _, e := range allEntries {
			eTS := e.EntryTimestamp.UnixMilli()
			if eTS < cursorTS {
				filtered = append(filtered, e)
			} else if eTS == cursorTS {
				// 同一 timestamp 时，按 processID + entryIndex 进一步区分
				if e.ProcessID < cursorPID {
					filtered = append(filtered, e)
				} else if e.ProcessID == cursorPID && e.EntryIndex < cursorEI {
					filtered = append(filtered, e)
				}
			}
		}
		allEntries = filtered
	}

	// 5. 截取 limit + 1 判断 has_more
	hasMore := len(allEntries) > limit
	if hasMore {
		allEntries = allEntries[:limit]
	}

	// 6. 生成 cursor
	var nextCursor string
	if len(allEntries) > 0 {
		last := allEntries[len(allEntries)-1]
		nextCursor = encodeCursor(Cursor{
			TimestampMilli: last.EntryTimestamp.UnixMilli(),
			ProcessID:      last.ProcessID,
			EntryIndex:     last.EntryIndex,
		})
	}

	return allEntries, hasMore, nextCursor, nil
}

// WriteBackEntries 将 MySQL 查到的消息写回 Redis（cache-aside 回填）
// 用于 Redis 无数据时从 MySQL 兜底查询后的缓存回填
func (rr *RedisReader) WriteBackEntries(ctx context.Context, entries []store.ProcessEntry) error {
	if rr == nil || rr.rdb == nil || len(entries) == 0 {
		return nil
	}

	// 按 processID 分组，减少 pipeline 次数
	byProcess := make(map[string][]store.ProcessEntry)
	var workspaceID string
	processScores := make(map[string]float64) // processID -> 最大 timestamp

	for _, entry := range entries {
		byProcess[entry.ProcessID] = append(byProcess[entry.ProcessID], entry)
		if workspaceID == "" && entry.WorkspaceID != "" {
			workspaceID = entry.WorkspaceID
		}
		ts := float64(entry.EntryTimestamp.UnixMilli())
		if existing, ok := processScores[entry.ProcessID]; !ok || ts > existing {
			processScores[entry.ProcessID] = ts
		}
	}

	// 写入 Hash：process_entry_data:{processID}
	for processID, processEntries := range byProcess {
		hashKey := redisHashKeyPrefix + processID
		pipe := rr.rdb.Pipeline()
		for _, entry := range processEntries {
			data, _ := json.Marshal(entry)
			idxStr := strconv.Itoa(entry.EntryIndex)
			pipe.HSet(ctx, hashKey, idxStr, data)
		}
		pipe.Expire(ctx, hashKey, 24*time.Hour)
		if _, err := pipe.Exec(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Redis WriteBackEntries Hash 写入失败 [%s]: %v\n", processID, err)
		}
	}

	// 更新 workspace_processes ZSET 索引
	if workspaceID != "" && len(processScores) > 0 {
		wsZsetKey := redisWorkspaceProcessesPrefix + workspaceID
		pipe := rr.rdb.Pipeline()
		for pid, score := range processScores {
			pipe.ZAdd(ctx, wsZsetKey, &redis.Z{Score: score, Member: pid})
		}
		pipe.Expire(ctx, wsZsetKey, 7*24*time.Hour)
		if _, err := pipe.Exec(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Redis WriteBackEntries ZSET 写入失败 [%s]: %v\n", workspaceID, err)
		}
	}

	return nil
}
