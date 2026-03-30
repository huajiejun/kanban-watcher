# Redis ZSET 消息性能优化设计

> 日期: 2026-03-29
> 状态: 设计确认 (评审修订版)

## 1. 背景与问题

当前消息处理链路:

```
上游 WebSocket → 内存 buffer (200ms) → 查 DB 去重 → 批量 UpsertProcessEntries → MySQL
```

**痛点:**

- 多个上游 WS 连接同时推送全量快照,产生大量重复消息
- 每次 flush 都需要 `ListProcessEntriesByIndexes` 查询 MySQL 做二次去重,数据库压力大
- 内存 buffer 无法跨进程共享,扩展性受限

## 2. 设计目标

1. 用 Redis ZSET + Hash 完全替代内存 buffer,实现去重 + 排序
2. 消除 flush 时查 DB 去重的开销
3. Redis 同时充当读缓存,减少 MySQL 读压力
4. Redis 不可用时自动降级到内存 buffer

## 3. 决策汇总

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Redis 角色 | 完全替代内存 buffer | ZSET 天然支持排序,Hash 存消息体 |
| Redis 部署 | 单机实例 | 单进程应用,无需集群 |
| ZSET member | `entryIndex` (score = entryIndex) | 同一 entryIndex 自动覆盖,和内存 buffer 行为一致 |
| 去重方式 | Enqueue 时对比 Hash 中已有数据的 contentHash | 精确去重,内容相同才跳过 |
| ZSET key | `process_entries:{processID}` | 每 process 独立,和当前 map 结构对应 |
| Flush 策略 | 事件驱动(阈值 50 条) + 定时兜底(500ms) | 高吞吐快速消化,低吞吐不堆积 |
| 刷后处理 | Hash 保留 24h TTL 作为读缓存 | 应对重连场景,减少 DB 读 |
| 下游推送 | 写入 Redis 后立即推送 | 保证前端实时性 |

## 4. 数据流架构

### 4.1 Redis 数据结构设计

```
┌──────────────────────────────────────────────────┐
│  Redis ZSET (排序索引)                             │
│  key:   process_entries:{processID}               │
│  score: entryIndex                                │
│  member: entryIndex (字符串)                       │
│  → ZADD 天然覆盖: 同一 entryIndex 只保留一条        │
│  TTL:   24 小时                                    │
├──────────────────────────────────────────────────┤
│  Redis Hash (消息体存储)                            │
│  key:   process_entry_data:{processID}             │
│  field: entryIndex (字符串)                         │
│  value: JSON(ProcessEntry)                         │
│  → HSET 天然覆盖: 同一 field 只保留最新值            │
│  TTL:   24 小时                                    │
└──────────────────────────────────────────────────┘
```

**为什么不用 contentHash 作为 member:**
- 如果 member = `entryIndex:contentHash`,内容变化时会产生多条 member
- 和当前内存 buffer 行为不一致(内存 map 同一 index 直接覆盖)
- 改用 entryIndex 作为 member,ZADD 自动覆盖,行为一致

### 4.2 Enqueue 流程 (替代当前内存 buffer 的 Enqueue)

```
消息到达 (processID, entry)
    │
    ▼
1. 从 Redis Hash 读取已有数据
   existing = HGET process_entry_data:{processID} {entryIndex}
    │
    ▼
2. 精确去重判断
   if existing != nil && existing.contentHash == entry.contentHash:
       跳过 (内容完全相同)
       return
    │
    ▼
3. 写入 Redis (Pipeline 原子操作)
   ZADD process_entries:{processID} {entryIndex} {entryIndex}
   HSET process_entry_data:{processID} {entryIndex} {JSON(entry)}
    │
    ▼
4. 下游实时推送 (onBroadcast 回调)
   if shouldBroadcastRealtimeEntry(existing, entry):
       PublishSessionMessagesAppended(sessionID, entry)
    │
    ▼
5. 检查是否触发立即 flush
   if ZCARD >= flush_threshold(50):
       触发异步 flush
```

**注意:** `existing` 来自 Redis Hash,不再来自内存 map。这保证了多 WS 连接场景下去重判断的准确性。

### 4.3 Flush 流程

```
Flush 触发 (ZCARD >= 50 或 定时器 500ms)
    │
    ▼
1. ZRANGE process_entries:{processID} 0 -1 (按 score 有序)
   → 得到所有 entryIndex 列表 (天然排序)
    │
    ▼
2. HMGET process_entry_data:{processID} {idx1} {idx2} ...
   → 批量取出完整消息体
    │
    ▼
3. shouldPersistProcessEntryUpdate 过滤
   → 对比签名,跳过无变化的条目
   (注意: 大部分去重已在 Enqueue 时完成,这里是最终兜底)
    │
    ▼
4. 批量 UpsertProcessEntries → MySQL
    │
    ▼
5. onFlush 回调 → 更新 SyncSubscription
    │
    ▼
6. 清理 ZSET (已 flush 的 members)
   ZREMRANGEBYRANK process_entries:{processID} 0 -1
   → ZSET 清空,不再有待 flush 的条目
    │
    ▼
7. Hash 保留不清除 → 24h TTL 自然过期
   → 作为读缓存继续服务
```

### 4.4 下游推送时机

写入 Redis 后立即推送前端,不等 flush 到 MySQL:

```
消息到达 → Enqueue (Redis ZADD + HSET)
                │
                ├── (立即) shouldBroadcast(existing from Hash, entry) → PublishSessionMessagesAppended → 前端
                │
                └── (异步 flush) 批量 UpsertProcessEntries → MySQL + onFlush(更新 SyncSubscription)
```

**回调拆分:**
- `onBroadcast` — 写入 Redis 后立即调用,负责 `PublishSessionMessagesAppended`
- `onFlush` — flush 到 MySQL 后调用,负责 `UpsertSubscription` (更新订阅进度)

这两个回调职责不同,不能合并。

## 5. 异常处理与降级

### 5.1 Redis 连接断开

```
写入 Redis 失败
    │
    ▼
1. 标记该 processID 进入 "fallback 模式"
2. 后续消息写入内存 buffer (保留现有 processEntryBuffer 逻辑)
3. 后台 goroutine 每 5s 尝试 PING Redis
    │
    Redis 恢复后:
    ├── 1. 内存 buffer FlushAll → MySQL (确保积压数据不丢失)
    ├── 2. 清除所有 processID 的 fallback 标记
    └── 3. 后续消息切回 Redis 模式
```

**关键:** 不做双写。降级期间内存 buffer 积压的数据,在恢复时通过 `FlushAll` 确保刷到 MySQL,不需要迁移到 Redis。

### 5.2 Flush 到 MySQL 失败

```
ZRANGE 取出数据 → UpsertProcessEntries 失败
    │
    ├── 数据保留在 ZSET 中 (不清除)
    ├── 下次 flush 周期重试
    └── 最多重试 3 次
    │
    3 次失败后 → 记录错误日志 + 写入死信文件
    死信文件: data/deadletter/{processID}-{timestamp}.jsonl
    格式: 每行一条 JSON(ProcessEntry)
    不需要后台重放任务,人工介入处理即可
```

## 6. 配置项

```yaml
redis:
  addr: "localhost:6379"
  password: ""
  db: 0
  pool_size: 10                # 连接池大小

buffer:
  flush_threshold: 50          # ZADD 后条目数 >= 50 立即 flush
  flush_interval: 500ms        # 全局定时器兜底间隔
  ttl: 24h                     # Redis Hash key 过期时间 (读缓存)
  retry_max: 3                 # flush 失败最大重试
```

## 7. 代码结构

### 新增文件

```
internal/
├── buffer/                    # 新包: 消息缓冲层
│   ├── buffer.go              # MessageBuffer 接口 + ProcessEntryReader 接口
│   ├── redis_buffer.go        # Redis ZSET + Hash 实现
│   ├── memory_buffer.go       # 当前 processEntryBuffer 迁移过来
│   └── fallback_buffer.go     # Redis 优先 + 内存降级
├── redis/                     # 新包: Redis 连接管理
│   └── client.go              # 单机 Redis 客户端封装
└── sync/
    ├── sync.go                # 改用 MessageBuffer 接口
    └── process_entry_buffer.go # 废弃,迁移到 buffer/memory_buffer.go
```

### 核心接口

```go
// MessageBuffer 消息缓冲层接口
type MessageBuffer interface {
    // Enqueue 将消息写入缓冲区
    // 调用前由 SyncService 负责以下逻辑:
    //   1. 通过 ProcessEntryReader.GetProcessEntry 获取已有数据
    //   2. 调用 shouldBroadcastRealtimeEntry 判断是否推送前端
    //   3. 调用 shouldPersistProcessEntryUpdate 判断是否需要写入
    // 如果不需要写入(内容相同),SyncService 跳过 Enqueue,不调用
    // 如果需要写入,调用 Enqueue 将数据写入 Redis
    // onFlush 回调在 flush 到 MySQL 成功后由 FlushProcess 内部调用
    Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int)

    // FlushProcess 将指定 process 的缓冲数据刷到 MySQL
    // 内部调用 onFlush 回调更新 SyncSubscription
    FlushProcess(ctx context.Context, processID string) error

    // FlushAll 刷出所有 process 的缓冲数据
    FlushAll(ctx context.Context) error

    // LastEntryIndex 获取指定 process 最后处理的 entry index
    LastEntryIndex(processID string) *int
}

// ProcessEntryReader 缓存读取接口 (用于 shouldBroadcast 对比)
type ProcessEntryReader interface {
    // GetProcessEntry 从缓存读取单条数据 (Redis Hash 或内存 map)
    // SyncService 在 Enqueue 前调用,获取已有数据用于:
    //   1. shouldBroadcastRealtimeEntry 判断
    //   2. shouldPersistProcessEntryUpdate 判断
    GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*store.ProcessEntry, error)
}
```

**调用方职责 (SyncService.consumeProcessLogs):**
```go
// 1. 从缓存读取已有数据
existing, _ := buffer.GetProcessEntry(ctx, processID, patch.EntryIndex)

// 2. 构建新 entry
entry := buildProcessEntry(patch, existing)

// 3. 判断是否推送前端 (立即)
if shouldBroadcastRealtimeEntry(existing, entry) {
    s.realtime.PublishSessionMessagesAppended(ctx, sessionID, []store.ProcessEntry{*entry})
}

// 4. 判断是否需要写入缓冲区
if shouldPersistProcessEntryUpdate(existing, entry) {
    buffer.Enqueue(processID, entry, lastEntryIndex)
}
```

**flush_threshold 和 flush_interval 协作机制:**
- 每条消息 Enqueue 后检查 ZCARD
- ZCARD >= flush_threshold: 立即触发当前 process 的 flush
- 如果未触发阈值,全局定时器(每 flush_interval)扫描所有活跃 process 并 flush
- flush 后 ZSET 清空,下一个周期从零开始计数

### 改动点

| 组件 | 改动 |
|------|------|
| `SyncService` | `processEntryBuffer` 字段类型改为 `MessageBuffer` 接口 |
| `NewSyncService` | 根据配置创建 `redisBuffer`(包装在 `fallbackBuffer` 中) |
| `consumeProcessLogs` | `existingEntry` 改从 Redis Hash 读取(`ProcessEntryReader`) |
| `consumeProcessLogs` | 广播推送和 buffer 写入拆分为独立步骤 |
| `FlushProcess` | 不再需要 `ListProcessEntriesByIndexes` 查 DB |

### 不改动的部分

- `store.UpsertProcessEntries` — MySQL 写入逻辑不变
- `store.ListProcessEntriesByIndexes` — 保留,历史数据查询等场景仍需要
- `realtime.PublishSessionMessagesAppended` — 下游推送逻辑不变
- `shouldBroadcastRealtimeEntry` / `shouldPersistProcessEntryUpdate` — 签名对比逻辑不变,只是数据源从内存 map 变为 Redis Hash
