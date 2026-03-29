package buffer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

const (
	redisZSETKeyPrefix   = "process_entries:"
	redisHashKeyPrefix   = "process_entry_data:"
	redisLastIndexPrefix = "process_last_idx:"
)

// luaFlushAndRemove 原子读取 ZSET + HMGET Hash + ZREM
// KEYS[1] = zset key, KEYS[2] = hash key
// 返回: [members数组, data数组]
var luaFlushAndRemove = redis.NewScript(`
local zsetKey = KEYS[1]
local hashKey = KEYS[2]
local members = redis.call('ZRANGE', zsetKey, 0, -1)
if #members == 0 then
    return { {}, {} }
end
local data = redis.call('HMGET', hashKey, unpack(members))
redis.call('ZREM', zsetKey, unpack(members))
return { members, data }
`)

// RedisBufferOptions Redis buffer 配置
type RedisBufferOptions struct {
	FlushThreshold int           // ZCARD >= 此值立即 flush
	FlushInterval  time.Duration // 定时器兜底间隔
	TTL            time.Duration // Hash key 过期时间
	RetryMax       int           // flush 失败最大重试
}

// RedisBuffer Redis ZSET + Hash 实现
type RedisBuffer struct {
	opts    RedisBufferOptions
	rdb     *redis.Client
	store   batchStore
	onFlush FlushCallback

	mu       sync.Mutex
	active   map[string]bool // 活跃的 processID 集合
	flushMu  sync.Mutex      // 防止同一 process 并发 flush
	retryCnt map[string]int  // flush 重试计数
	stopCh   chan struct{}
}

// NewRedisBuffer 创建 Redis buffer
func NewRedisBuffer(opts RedisBufferOptions, rdb *redis.Client, store batchStore, onFlush FlushCallback) *RedisBuffer {
	if opts.FlushThreshold <= 0 {
		opts.FlushThreshold = 50
	}
	if opts.FlushInterval <= 0 {
		opts.FlushInterval = 500 * time.Millisecond
	}
	if opts.TTL <= 0 {
		opts.TTL = 24 * time.Hour
	}
	if opts.RetryMax <= 0 {
		opts.RetryMax = 3
	}

	rb := &RedisBuffer{
		opts:     opts,
		rdb:      rdb,
		store:    store,
		onFlush:  onFlush,
		active:   make(map[string]bool),
		retryCnt: make(map[string]int),
		stopCh:   make(chan struct{}),
	}

	go rb.flushLoop()

	return rb
}

// Enqueue 将消息写入缓冲区
func (rb *RedisBuffer) Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int) {
	if rb == nil || processID == "" || entry == nil {
		return
	}

	ctx := context.Background()
	idxStr := strconv.Itoa(entry.EntryIndex)
	hashKey := redisHashKeyPrefix + processID
	zsetKey := redisZSETKeyPrefix + processID

	// Pipeline: ZADD + HSET + EXPIRE
	pipe := rb.rdb.Pipeline()
	pipe.ZAdd(ctx, zsetKey, &redis.Z{
		Score:  float64(entry.EntryIndex),
		Member: idxStr,
	})
	data, _ := json.Marshal(entry)
	pipe.HSet(ctx, hashKey, idxStr, data)
	pipe.Expire(ctx, zsetKey, rb.opts.TTL)
	pipe.Expire(ctx, hashKey, rb.opts.TTL)
	if _, err := pipe.Exec(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Redis Enqueue 失败 [%s:%d]: %v\n", processID, entry.EntryIndex, err)
		return
	}

	// 记录活跃 process
	rb.mu.Lock()
	rb.active[processID] = true
	shouldFlush := false
	card, _ := rb.rdb.ZCard(ctx, zsetKey).Result()
	if card >= int64(rb.opts.FlushThreshold) {
		shouldFlush = true
	}
	rb.mu.Unlock()

	// 记录 lastEntryIndex
	if lastEntryIndex != nil {
		rb.rdb.Set(ctx, redisLastIndexPrefix+processID, *lastEntryIndex, rb.opts.TTL)
	}

	if shouldFlush {
		go func() {
			_ = rb.FlushProcess(context.Background(), processID)
		}()
	}
}

// FlushProcess 将指定 process 的缓冲数据持久化
func (rb *RedisBuffer) FlushProcess(ctx context.Context, processID string) error {
	if rb == nil || processID == "" {
		return nil
	}

	// 防止并发 flush
	rb.flushMu.Lock()
	defer rb.flushMu.Unlock()

	zsetKey := redisZSETKeyPrefix + processID
	hashKey := redisHashKeyPrefix + processID

	// 1. Lua 原子操作：ZRANGE + HMGET + ZREM（读即删除，其他实例不会再读到相同数据）
	res, err := luaFlushAndRemove.Run(ctx, rb.rdb, []string{zsetKey, hashKey}).Result()
	if err != nil {
		return fmt.Errorf("Lua flush %s: %w", processID, err)
	}

	// 解析 Lua 返回的嵌套数组: [[members...], [data...]]
	resultSlice, ok := res.([]interface{})
	if !ok || len(resultSlice) < 2 {
		return nil
	}
	membersIf, _ := resultSlice[0].([]interface{})
	valuesIf, _ := resultSlice[1].([]interface{})
	if len(membersIf) == 0 {
		return nil
	}

	// 2. 反序列化
	toPersist := make([]*store.ProcessEntry, 0, len(valuesIf))
	for _, val := range valuesIf {
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
		toPersist = append(toPersist, &entry)
	}

	if len(toPersist) == 0 {
		return nil
	}

	// 3. 批量写 MySQL
	if rb.store != nil {
		if err := rb.store.UpsertProcessEntries(ctx, toPersist); err != nil {
			rb.mu.Lock()
			rb.retryCnt[processID]++
			cnt := rb.retryCnt[processID]
			rb.mu.Unlock()

			if cnt >= rb.opts.RetryMax {
				fmt.Fprintf(os.Stderr, "Redis buffer flush 重试 %d 次后放弃 [%s]\n", cnt, processID)
				rb.writeDeadLetter(processID, toPersist)
				rb.mu.Lock()
				delete(rb.retryCnt, processID)
				rb.mu.Unlock()
			}
			return fmt.Errorf("UpsertProcessEntries %s: %w", processID, err)
		}
	}

	// 重置重试计数
	rb.mu.Lock()
	delete(rb.retryCnt, processID)
	rb.mu.Unlock()

	// 4. onFlush 回调
	if rb.onFlush != nil {
		lastIdx := rb.loadLastEntryIndex(ctx, processID)
		latestEntry := toPersist[len(toPersist)-1]
		if err := rb.onFlush(ctx, latestEntry, lastIdx); err != nil {
			fmt.Fprintf(os.Stderr, "onFlush 回调失败 [%s]: %v\n", processID, err)
		}
	}

	// ZSET 已由 Lua 原子清理，Hash 保留 24h TTL 自然过期
	return nil
}

// FlushAll 刷出所有 process 的缓冲数据
func (rb *RedisBuffer) FlushAll(ctx context.Context) error {
	if rb == nil {
		return nil
	}

	rb.mu.Lock()
	processIDs := make([]string, 0, len(rb.active))
	for id := range rb.active {
		processIDs = append(processIDs, id)
	}
	rb.mu.Unlock()

	for _, id := range processIDs {
		if err := rb.FlushProcess(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

// LastEntryIndex 获取指定 process 最后处理的 entry index
func (rb *RedisBuffer) LastEntryIndex(processID string) *int {
	if rb == nil {
		return nil
	}
	return rb.loadLastEntryIndex(context.Background(), processID)
}

// GetProcessEntry 从 Redis Hash 读取（实现 ProcessEntryReader）
func (rb *RedisBuffer) GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error) {
	if rb == nil {
		return nil, nil
	}

	hashKey := redisHashKeyPrefix + processID
	val, err := rb.rdb.HGet(ctx, hashKey, strconv.Itoa(entryIndex)).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // key 不存在返回 nil
		}
		return nil, err
	}

	var entry store.ProcessEntry
	if err := json.Unmarshal([]byte(val), &entry); err != nil {
		return nil, err
	}
	return &entry, nil
}

// Close 关闭缓冲区，释放资源
func (rb *RedisBuffer) Close() error {
	close(rb.stopCh)
	return rb.FlushAll(context.Background())
}

// flushLoop 定时器兜底 flush
func (rb *RedisBuffer) flushLoop() {
	ticker := time.NewTicker(rb.opts.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-rb.stopCh:
			return
		case <-ticker.C:
			_ = rb.FlushAll(context.Background())
		}
	}
}

// loadLastEntryIndex 从 Redis 读取 lastEntryIndex
func (rb *RedisBuffer) loadLastEntryIndex(ctx context.Context, processID string) *int {
	val, err := rb.rdb.Get(ctx, redisLastIndexPrefix+processID).Int()
	if err != nil {
		return nil
	}
	return &val
}

// writeDeadLetter 写入死信文件
func (rb *RedisBuffer) writeDeadLetter(processID string, entries []*store.ProcessEntry) {
	// 写入死信文件 data/deadletter/{processID}-{timestamp}.jsonl
	// 后续人工介入处理
	timestamp := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("data/deadletter/%s-%s.jsonl", processID, timestamp)

	// 确保目录存在
	if err := os.MkdirAll("data/deadletter", 0755); err != nil {
		fmt.Fprintf(os.Stderr, "创建死信目录失败: %v\n", err)
		return
	}

	file, err := os.Create(filename)
	if err != nil {
		fmt.Fprintf(os.Stderr, "创建死信文件失败 [%s]: %v\n", filename, err)
		return
	}
	defer file.Close()

	for _, entry := range entries {
		data, _ := json.Marshal(entry)
		if _, err := file.WriteString(string(data) + "\n"); err != nil {
			fmt.Fprintf(os.Stderr, "写入死信文件失败 [%s]: %v\n", filename, err)
		}
	}

	fmt.Fprintf(os.Stderr, "[DEADLETTER] 写入 %d 条消息到 %s\n", len(entries), filename)
}
