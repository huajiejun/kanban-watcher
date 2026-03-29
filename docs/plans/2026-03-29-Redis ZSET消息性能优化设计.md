# Redis ZSET 消息性能优化设计

> 日期: 2026-03-29
> 状态: 设计确认

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

1. 用 Redis ZSET 完全替代内存 buffer,实现去重 + 排序
2. 消除 flush 时查 DB 去重的开销
3. Redis 同时充当读缓存,减少 MySQL 读压力
4. Redis 不可用时自动降级到内存 buffer

## 3. 决策汇总

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Redis 角色 | 完全替代内存 buffer | ZSET 天然支持去重+排序 |
| Redis 部署 | 单机实例 | 单进程应用,无需集群 |
| ZSET member | `processID:entryIndex:contentHash` | 精确去重,内容相同才跳过 |
| ZSET key | `process_entries:{processID}` | 每 process 独立,和当前 map 结构对应 |
| Flush 策略 | 事件驱动(阈值 50 条) + 定时兜底(500ms) | 高吞吐快速消化,低吞吐不堆积 |
| 刷后处理 | 保留数据 + 24h TTL | 读缓存,应对重连场景 |
| 下游推送 | 写入 Redis 后立即推送 | 保证前端实时性 |

## 4. 数据流架构

```
上游 WebSocket (多个连接同时推送)
    │
    ▼
┌──────────────────────────────────────────────────┐
│  Redis ZSET (排序 + 去重索引)                      │
│  key:   process_entries:{processID}               │
│  score: entryIndex (天然排序)                       │
│  member: processID:entryIndex:contentHash (去重)    │
│  TTL:   24 小时                                    │
├──────────────────────────────────────────────────┤
│  Redis Hash (消息体存储)                            │
│  key:   process_entry_data:{processID}             │
│  field: entryIndex                                 │
│  value: JSON(ProcessEntry)                         │
│  TTL:   24 小时                                    │
└──────────────────────────────────────────────────┘
    │
    │  Flush 触发:
    │  1. ZADD 后 ZCARD >= 50 → 立即 flush
    │  2. 全局定时器兜底(500ms) → 扫描活跃 key
    │
    ▼
┌──────────────────────────────────────────────────┐
│  Flush 逻辑                                        │
│  1. ZRANGE 取出全部成员 (按 score 有序)              │
│  2. 解析 member → 提取 entryIndex, contentHash      │
│  3. 同一 entryIndex 多条 → 只取最新 (最高 score)     │
│  4. 从 Hash 取出完整消息体                           │
│  5. 批量 UpsertProcessEntries → MySQL               │
│  6. 更新 SyncSubscription (onFlush 回调)            │
│  7. 清理已 flush 的 ZSET members + Hash fields      │
│  8. 不清空 ZSET key, 等 24h TTL 自然过期             │
└──────────────────────────────────────────────────┘
    │
    ▼
下游: realtime.PublishSessionMessagesAppended (实时推送不变)
```

### 下游推送时机

写入 Redis 后立即推送前端,不等 flush 到 MySQL:

```
消息到达 → ZADD 写入 Redis
                │
                ├── (立即) shouldBroadcast 判断 → PublishSessionMessagesAppended → 前端
                │
                └── (异步 flush) 批量 UpsertProcessEntries → MySQL
```

## 5. 异常处理与降级

### Redis 连接断开

```
写入 Redis 失败 → 降级到内存 buffer 模式
    │
    ├── 内存 buffer 继续收消息 (200ms 合并 + 查 DB 去重)
    └── 定时尝试重连 Redis
    │
    Redis 恢复后 → 切回 Redis 模式
```

### Flush 到 MySQL 失败

```
ZRANGE 取出数据 → UpsertProcessEntries 失败
    │
    ├── 数据保留在 Redis 中 (不清除)
    ├── 下次 flush 周期重试
    └── 最多重试 3 次
    │
    3 次失败后 → 记录错误日志 + 写入死信文件 (防止数据丢失)
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
  ttl: 24h                     # Redis key 过期时间
  retry_max: 3                 # flush 失败最大重试
```

## 7. 代码结构

### 新增文件

```
internal/
├── buffer/                    # 新包: 消息缓冲层
│   ├── buffer.go              # MessageBuffer 接口定义
│   ├── redis_buffer.go        # Redis ZSET 实现
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
    Enqueue(processID string, entry *store.ProcessEntry, lastEntryIndex *int)
    FlushProcess(ctx context.Context, processID string) error
    FlushAll(ctx context.Context) error
    LastEntryIndex(processID string) *int
}
```

### 改动点

| 组件 | 改动 |
|------|------|
| `SyncService` | `processEntryBuffer` 字段类型改为 `MessageBuffer` 接口 |
| `NewSyncService` | 根据配置创建 `redisBuffer` 或 `memoryBuffer` |
| `consumeProcessLogs` | `shouldBroadcastRealtimeEntry` 数据源改为 Redis Hash |
| `FlushProcess` | 不再需要 `ListProcessEntriesByIndexes` 查 DB |

### 不改动的部分

- `store.UpsertProcessEntries` — MySQL 写入逻辑不变
- `store.ListProcessEntriesByIndexes` — 保留,历史数据查询等场景仍需要
- `realtime.PublishSessionMessagesAppended` — 下游推送逻辑不变
- `shouldBroadcastRealtimeEntry` / `shouldPersistProcessEntryUpdate` — 签名对比逻辑不变,数据源变了
