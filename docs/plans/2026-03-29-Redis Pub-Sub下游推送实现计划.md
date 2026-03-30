# Redis Pub/Sub 下游推送实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将实时推送从同步直推改为 Redis Pub/Sub 广播，支持多实例部署。

**Architecture:** 在 `RealtimePublisher` 内部封装可选的 Redis Pub/Sub 发布路径。新增 `RealtimeSubscriber` goroutine 订阅 Redis channel 并转发到 Hub。Redis 不可用时自动降级为直推 Hub。不改变 `realtimePublisher` 接口签名。

**Tech Stack:** go-redis/v8 Pub/Sub, miniredis/v2 测试

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `internal/api/realtime.go` | 修改 | 添加 rdb 字段，Publish 走 Redis channel |
| `internal/api/realtime_subscriber.go` | 新建 | 订阅 Redis Pub/Sub → Hub 广播 |
| `internal/api/realtime_pubsub_test.go` | 新建 | Pub/Sub 集成测试 |
| `cmd/kanban-watcher/run.go` | 修改 | initBuffer 暴露 rdb，注入 subscriber |

## Channel 命名

| 事件 | Channel | Payload |
|---|---|---|
| session 消息 | `push:session:{sessionID}` | JSON `[MessagePayload]` |
| workspace 快照 | `push:workspace_snapshot` | JSON `[WorkspacePayload]` |
| workspace 视图 | `push:workspace_view` | JSON `WorkspaceViewPayload` |

## Pub/Sub 消息格式

所有 channel 使用统一的信封格式：

```go
type pubsubEnvelope struct {
    SessionID string                 `json:"session_id,omitempty"`
    Messages  []realtime.MessagePayload `json:"messages,omitempty"`
    Workspaces []realtime.WorkspacePayload `json:"workspaces,omitempty"`
    WorkspaceView *realtime.WorkspaceViewPayload `json:"workspace_view,omitempty"`
}
```

---

## Chunk 1: RealtimeSubscriber 订阅器

### Task 1: 创建 RealtimeSubscriber

**Files:**
- Create: `internal/api/realtime_subscriber.go`

- [ ] **Step 1: 写 subscriber 结构和构造函数**

```go
package api

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "strings"
    "sync"

    "github.com/go-redis/redis/v8"
    "github.com/huajiejun/kanban-watcher/internal/realtime"
)

// RealtimeSubscriber 订阅 Redis Pub/Sub 并转发到 Hub
type RealtimeSubscriber struct {
    rdb    *redis.Client
    hub    *realtime.Hub
    stopCh chan struct{}
    wg     sync.WaitGroup
}

func NewRealtimeSubscriber(rdb *redis.Client, hub *realtime.Hub) *RealtimeSubscriber {
    return &RealtimeSubscriber{
        rdb:    rdb,
        hub:    hub,
        stopCh: make(chan struct{}),
    }
}
```

- [ ] **Step 2: 写 Start 方法**

使用单个 `PSubscribe` 订阅所有 `push:*` 模式，在 handler 中按 channel 名分发。

```go
const (
    pubsubPattern         = "push:*"
    pubsubSessionPrefix   = "push:session:"
    pubsubWorkspaceSnapshot = "push:workspace_snapshot"
    pubsubWorkspaceView     = "push:workspace_view"
)

func (s *RealtimeSubscriber) Start(ctx context.Context) {
    s.wg.Add(1)
    go func() {
        defer s.wg.Done()
        log.Printf("[Pub/Sub] 订阅器已启动")
        defer log.Printf("[Pub/Sub] 订阅器已停止")

        pubsub := s.rdb.PSubscribe(ctx, pubsubPattern)
        defer pubsub.Close()

        ch := pubsub.Channel()

        for {
            select {
            case <-s.stopCh:
                return
            case <-ctx.Done():
                return
            case msg, ok := <-ch:
                if !ok {
                    return
                }
                s.handleMessage(msg)
            }
        }
    }()
}

func (s *RealtimeSubscriber) handleMessage(msg *redis.Message) {
    switch {
    case strings.HasPrefix(msg.Channel, pubsubSessionPrefix):
        s.handleSessionMessage(msg)
    case msg.Channel == pubsubWorkspaceSnapshot:
        s.handleWorkspaceSnapshotMessage(msg)
    case msg.Channel == pubsubWorkspaceView:
        s.handleWorkspaceViewMessage(msg)
    }
}
```

- [ ] **Step 3: 写消息处理方法**

```go
func (s *RealtimeSubscriber) handleSessionMessage(msg *redis.Message) {
    // 从 channel 名提取 sessionID: push:session:abc123 → abc123
    sessionID := strings.TrimPrefix(msg.Channel, pubsubSessionPrefix)

    var messages []realtime.MessagePayload
    if err := json.Unmarshal([]byte(msg.Payload), &messages); err != nil {
        log.Printf("[Pub/Sub] 反序列化 session 消息失败 [%s]: %v", sessionID, err)
        return
    }
    if len(messages) == 0 {
        return
    }
    s.hub.BroadcastSessionMessagesAppended(sessionID, messages)
}

func (s *RealtimeSubscriber) handleWorkspaceSnapshotMessage(msg *redis.Message) {
    var workspaces []realtime.WorkspacePayload
    if err := json.Unmarshal([]byte(msg.Payload), &workspaces); err != nil {
        log.Printf("[Pub/Sub] 反序列化 workspace_snapshot 失败: %v", err)
        return
    }
    s.hub.BroadcastWorkspaceSnapshot(workspaces)
}

func (s *RealtimeSubscriber) handleWorkspaceViewMessage(msg *redis.Message) {
    var view realtime.WorkspaceViewPayload
    if err := json.Unmarshal([]byte(msg.Payload), &view); err != nil {
        log.Printf("[Pub/Sub] 反序列化 workspace_view 失败: %v", err)
        return
    }
    s.hub.BroadcastWorkspaceViewUpdated(view)
}
```
```

- [ ] **Step 4: 写 Stop 方法**

```go
func (s *RealtimeSubscriber) Stop() {
    close(s.stopCh)
    s.wg.Wait()
}
```

- [ ] **Step 5: 编译验证**

Run: `go build ./internal/api/...`
Expected: 编译通过

- [ ] **Step 6: Commit**

```bash
git add internal/api/realtime_subscriber.go
git commit -m "feat: 添加 Redis Pub/Sub 订阅器 RealtimeSubscriber"
```

---

## Chunk 2: RealtimePublisher 集成 Pub/Sub 发布

### Task 2: 修改 RealtimePublisher 支持双路径发布

**Files:**
- Modify: `internal/api/realtime.go`

- [ ] **Step 1: 添加 rdb 字段和修改构造函数**

在 `RealtimePublisher` 结构体中添加 `rdb *redis.Client` 字段：

```go
type RealtimePublisher struct {
    store *store.Store
    hub   *realtime.Hub
    rdb   *redis.Client  // nil = 直推模式

    mu                     sync.Mutex
    sessionMessageThrottle time.Duration
    throttledMessages      map[string]*throttledSessionMessage
}
```

修改 `NewRealtimePublisher` 签名：

```go
func NewRealtimePublisher(dbStore *store.Store, hub *realtime.Hub, rdb *redis.Client) *RealtimePublisher {
    return &RealtimePublisher{
        store:                  dbStore,
        hub:                    hub,
        rdb:                    rdb,
        sessionMessageThrottle: 500 * time.Millisecond,
        throttledMessages:      make(map[string]*throttledSessionMessage),
    }
}
```

- [ ] **Step 2: 修改 publishSessionMessage 中的发送逻辑**

将原来直接调 Hub 的地方改为判断 rdb：

在 `publishSessionMessage` 方法中，将所有 `p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})` 替换为 `p.broadcastSessionMessage(sessionID, message)`。

新增辅助方法（注意：Redis 发布失败时降级到直推 Hub，确保消息不丢失）：

```go
func (p *RealtimePublisher) broadcastSessionMessage(sessionID string, message realtime.MessagePayload) {
    if p.rdb != nil {
        payload, err := json.Marshal([]realtime.MessagePayload{message})
        if err != nil {
            log.Printf("[Pub/Sub] 序列化 session 消息失败: %v", err)
            // 降级到直推
            p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
            return
        }
        channel := fmt.Sprintf("push:session:%s", sessionID)
        if err := p.rdb.Publish(context.Background(), channel, payload).Err(); err != nil {
            log.Printf("[Pub/Sub] 发布 session 消息失败 [%s]，降级到直推: %v", sessionID, err)
            // 降级到直推
            p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
        }
        return
    }
    p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
}
```

- [ ] **Step 3: 修改 flushThrottledSessionMessage**

同样将 `p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{*message})` 替换为 `p.broadcastSessionMessage(sessionID, *message)`。

- [ ] **Step 4: 修改 PublishWorkspaceSnapshot**

在 `PublishWorkspaceSnapshot` 末尾，将 `p.hub.BroadcastWorkspaceSnapshot(workspaces)` 替换为（Redis 失败时降级到直推）：

```go
if p.rdb != nil {
    jsonData, err := json.Marshal(workspaces)
    if err != nil {
        return fmt.Errorf("序列化 workspace 快照: %w", err)
    }
    if err := p.rdb.Publish(ctx, pubsubWorkspaceSnapshot, jsonData).Err(); err != nil {
        log.Printf("[Pub/Sub] 发布 workspace_snapshot 失败，降级到直推: %v", err)
        p.hub.BroadcastWorkspaceSnapshot(workspaces)
    }
    return nil
}
p.hub.BroadcastWorkspaceSnapshot(workspaces)
return nil
```

- [ ] **Step 5: 修改 PublishWorkspaceViewUpdated**

同理，将直推改为判断 rdb。注意避免变量遮蔽，使用 `jsonData` 命名序列化结果，发布失败时降级直推：

```go
// payload 变量是 realtime.WorkspaceViewPayload 类型
if p.rdb != nil {
    jsonData, err := json.Marshal(payload)
    if err != nil {
        return fmt.Errorf("序列化 workspace view: %w", err)
    }
    if err := p.rdb.Publish(context.Background(), pubsubWorkspaceView, jsonData).Err(); err != nil {
        log.Printf("[Pub/Sub] 发布 workspace_view 失败，降级到直推: %v", err)
        p.hub.BroadcastWorkspaceViewUpdated(payload)
    }
    return nil
}
p.hub.BroadcastWorkspaceViewUpdated(payload)
return nil
```

- [ ] **Step 6: 修复现有测试中的 NewRealtimePublisher 调用**

`realtime_test.go` 中所有 `NewRealtimePublisher(nil, hub)` 改为 `NewRealtimePublisher(nil, hub, nil)`。

- [ ] **Step 7: 编译 + 运行测试**

Run: `go build ./... && go test ./internal/api/... -v -count=1`
Expected: 编译通过，现有测试全部 PASS

- [ ] **Step 8: Commit**

```bash
git add internal/api/realtime.go internal/api/realtime_test.go
git commit -m "feat: RealtimePublisher 支持 Redis Pub/Sub 发布路径"
```

---

## Chunk 3: run.go 注入修改

### Task 3: initBuffer 暴露 rdb，启动 subscriber

**Files:**
- Modify: `cmd/kanban-watcher/run.go`

- [ ] **Step 1: 修改 initBuffer 返回 rdb**

将 `initBuffer` 返回值增加 `*redis.Client`：

```go
func initBuffer(cfg *config.Config, dbStore *store.Store) (buffer.MessageBuffer, buffer.ProcessEntryReader, func(), *redis.Client) {
```

在 Redis 分支中返回 `rdb.RDB()`，在内存分支返回 nil：

```go
// Redis 分支
return fb, fb, func() { rdb.Close() }, rdb.RDB()

// 内存分支
return memBuf, memBuf, func() {}, nil
```

- [ ] **Step 2: 修改 runDaemon 和 runHeadless 中的调用**

两处都需要修改：

```go
msgBuf, entryReader, bufferCleanup, rdbClient := initBuffer(cfg, dbStore)
syncService.SetBuffer(msgBuf, entryReader)
defer bufferCleanup()
```

- [ ] **Step 3: 在 realtime 初始化处注入 rdb 和 subscriber**

在 `runDaemon` 和 `runHeadless` 中的 realtime 初始化块：

```go
if features.enableRealtime {
    realtimeHub := realtime.NewHub()
    realtimePublisher = api.NewRealtimePublisher(dbStore, realtimeHub, rdbClient)

    if rdbClient != nil {
        subscriber := api.NewRealtimeSubscriber(rdbClient, realtimeHub)
        go subscriber.Start(context.Background())
        defer subscriber.Stop()
    }

    syncService.SetRealtimePublisher(realtimePublisher)
}
```

- [ ] **Step 4: 编译验证**

Run: `go build ./...`
Expected: 编译通过

- [ ] **Step 5: 运行全部测试**

Run: `go test ./internal/api/... ./internal/sync/... ./internal/buffer/... -count=1`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add cmd/kanban-watcher/run.go
git commit -m "feat: run.go 注入 Redis Pub/Sub subscriber"
```

---

## Chunk 4: Pub/Sub 集成测试

### Task 4: 使用 miniredis 测试端到端 Pub/Sub

**Files:**
- Create: `internal/api/realtime_pubsub_test.go`

- [ ] **Step 1: 写 TestPublisherSendsToRedisChannel**

验证 Publisher 通过 PUBLISH 发送正确的 channel 和 payload：

```go
func TestPublisherSendsToRedisChannel(t *testing.T) {
    mr, err := miniredis.Run()
    if err != nil {
        t.Fatalf("miniredis 启动失败: %v", err)
    }
    defer mr.Close()

    rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
    defer rdb.Close()

    hub := realtime.NewHub()
    publisher := NewRealtimePublisher(nil, hub, rdb)

    // 订阅 push:session:test-session
    sub := rdb.Subscribe(context.Background(), "push:session:test-session")
    defer sub.Close()

    entry := store.ProcessEntry{
        ProcessID: "proc-1", SessionID: "test-session",
        EntryIndex: 1, EntryType: "assistant_message",
        Role: "assistant", Content: "hello",
        EntryTimestamp: time.Now(),
    }
    err = publisher.PublishSessionMessagesAppended(context.Background(), "test-session", []store.ProcessEntry{entry})
    if err != nil {
        t.Fatalf("PublishSessionMessagesAppended error: %v", err)
    }

    msg, err := sub.ReceiveMessage(context.Background())
    if err != nil {
        t.Fatalf("ReceiveMessage error: %v", err)
    }
    if msg.Channel != "push:session:test-session" {
        t.Fatalf("channel = %q, want push:session:test-session", msg.Channel)
    }

    var messages []realtime.MessagePayload
    if err := json.Unmarshal([]byte(msg.Payload), &messages); err != nil {
        t.Fatalf("unmarshal error: %v", err)
    }
    if len(messages) != 1 || messages[0].Content != "hello" {
        t.Fatalf("messages = %v, want [{Content:hello}]", messages)
    }
}
```

- [ ] **Step 2: 写 TestSubscriberReceivesAndBroadcasts**

验证 Subscriber 收到 Redis 消息后转发到 Hub：

```go
func TestSubscriberReceivesAndBroadcasts(t *testing.T) {
    mr, err := miniredis.Run()
    // ... setup miniredis, hub, subscriber, ws client ...

    subscriber := NewRealtimeSubscriber(rdb, hub)
    go subscriber.Start(context.Background())
    defer subscriber.Stop()

    // 通过 Redis PUBLISH 发消息
    messages := []realtime.MessagePayload{
        {SessionID: "s1", Content: "test", EntryIndex: 1},
    }
    payload, _ := json.Marshal(messages)
    rdb.Publish(context.Background(), "push:session:s1", payload)

    // 等待 WS 客户端收到事件
    // 验证 event.Type == "session_messages_appended"
    // 验证 event.Messages[0].Content == "test"
}
```

- [ ] **Step 3: 写 TestPublisherFallbackWithoutRedis**

验证 rdb=nil 时直推 Hub：

```go
func TestPublisherFallbackWithoutRedis(t *testing.T) {
    hub := realtime.NewHub()
    // rdb = nil
    publisher := NewRealtimePublisher(nil, hub, nil)
    // ... setup ws client ...
    // PublishSessionMessagesAppended
    // 验证 WS 客户端直接收到消息
}
```

- [ ] **Step 4: 运行测试**

Run: `go test ./internal/api/... -v -run TestPub -count=1`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add internal/api/realtime_pubsub_test.go
git commit -m "test: 添加 Redis Pub/Sub 集成测试"
```

---

## 验证清单

- [ ] `go build ./...` 编译通过
- [ ] `go test ./internal/api/... ./internal/sync/... ./internal/buffer/... -count=1` 全部通过
- [ ] 启动服务后日志出现 `[Pub/Sub]` 前缀
- [ ] 前端 WS 连接正常接收实时消息
