package buffer

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// cursor 三段式分页游标
type cursor struct {
	TimestampMilli int64  `json:"ts"`
	ProcessID      string `json:"pid"`
	EntryIndex     int    `json:"ei"`
}

func encodeCursor(c cursor) string {
	data, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeCursor(s string) (cursor, error) {
	if s == "" {
		return cursor{}, fmt.Errorf("empty cursor")
	}
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return cursor{}, fmt.Errorf("invalid cursor: %w", err)
	}
	var c cursor
	if err := json.Unmarshal(data, &c); err != nil {
		return cursor{}, fmt.Errorf("invalid cursor json: %w", err)
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
		c, err := decodeCursor(beforeCursor)
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

	// 2. 逐个 process 读取全部消息
	var allEntries []store.ProcessEntry
	for _, processID := range processIDs {
		zsetKey := redisZSETKeyPrefix + processID
		hashKey := redisHashKeyPrefix + processID

		members, err := rr.rdb.ZRevRange(ctx, zsetKey, 0, -1).Result()
		if err != nil || len(members) == 0 {
			continue
		}

		vals, err := rr.rdb.HMGet(ctx, hashKey, members...).Result()
		if err != nil {
			continue
		}

		for i, val := range vals {
			if val == nil {
				continue
			}
			s, ok := val.(string)
			if !ok {
				continue
			}
			var entry store.ProcessEntry
			if err := json.Unmarshal([]byte(s), &entry); err != nil {
				continue
			}
			if i < len(members) {
				if idx, err := strconv.Atoi(members[i]); err == nil {
					entry.EntryIndex = idx
				}
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
		nextCursor = encodeCursor(cursor{
			TimestampMilli: last.EntryTimestamp.UnixMilli(),
			ProcessID:      last.ProcessID,
			EntryIndex:     last.EntryIndex,
		})
	}

	return allEntries, hasMore, nextCursor, nil
}
