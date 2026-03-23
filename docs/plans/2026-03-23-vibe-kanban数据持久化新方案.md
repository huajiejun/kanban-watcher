# Kanban-Watcher 对接 vibe-kanban 数据持久化新方案

> 文档日期：2026-03-23
> 适用项目：`kanban-watcher`
> 目标：将 `vibe-kanban` 的会话与消息数据可靠同步到本地 MariaDB，供 Home Assistant 快速查询

## 1. 背景与目标

当前 `kanban-watcher` 主要依赖远端 `vibe-kanban` 接口和本地日志抽取。对于 Home Assistant 卡片场景，这种方式有两个问题：

1. 第三方服务网络波动会直接影响卡片打开速度。
2. 现有同步实现错误地将 `session` 级 WebSocket 当作消息流使用，和 `vibe-kanban` 服务端真实行为不一致。

本方案目标：

1. HA 卡片打开时，历史消息默认在本地数据库中查询，首屏加载目标 `< 100ms`
2. 仅同步 `run_reason = codingagent` 的对话消息
3. 支持实时增量同步
4. 支持 watcher 重启后的自动恢复
5. 设计上与 `vibe-kanban` 源码中的真实数据流一致，避免“猜接口”

非目标：

1. 不同步 `devserver` 日志
2. 不同步所有原始日志文件
3. 不在第一期实现跨实例分布式同步

## 2. 基于源码确认的真实数据流

结合 `vibe-kanban` 源码，真实链路应分三层：

1. 工作区流：`/api/workspaces/streams/ws?archived=false`
   - 返回工作区 JSON Patch 流
   - 用于实时发现工作区、更新 `latest_session_id`

2. Session 进程流：`/api/execution-processes/stream/session/ws?session_id={session_id}`
   - 返回该 session 下所有 execution process 的 JSON Patch 流
   - 初始消息中带当前 session 的全部 process 快照
   - 增量消息中带 process 新增、更新、删除

3. Process 消息流：`/api/execution-processes/{process_id}/normalized-logs/ws`
   - 返回某个 process 的 normalized conversation entries
   - 前端历史消息和实时消息都依赖这个流
   - 这是唯一正确的消息来源

结论：

1. `stream/session/ws` 不是消息流，不能直接解析为 `NormalizedEntry`
2. 应先拿到 `process_id`，再按 `process_id` 订阅 `normalized-logs/ws`
3. 主驱动应优先使用工作区 WebSocket 流，而不是 30 秒轮询 summaries

## 3. 总体架构

```text
vibe-kanban
  ├─ /api/workspaces/streams/ws?archived=false
  ├─ /api/execution-processes/stream/session/ws?session_id=...
  └─ /api/execution-processes/{process_id}/normalized-logs/ws
               │
               ▼
kanban-watcher
  ├─ WorkspaceStreamManager
  ├─ SessionProcessManager
  ├─ ProcessLogManager
  ├─ SyncStateStore
  ├─ MariaDB
  └─ HTTP API :7778
               │
               ▼
Home Assistant
  ├─ 读取本地消息 API
  └─ 可选实时推送
```

核心原则：

1. 主数据源是 WebSocket 流，不是被动轮询
2. 数据组织主键按 `workspace -> session -> process -> entry`
3. 去重优先依赖数据库唯一键，不依赖应用层弱比较
4. 查询接口以“最新消息优先”设计，服务 HA 首屏场景

## 4. 数据模型设计

根据真实数据流，建议使用以下 5 张核心表。

### 4.1 工作区表 `kw_workspaces`

```sql
CREATE TABLE kw_workspaces (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NULL,
    branch VARCHAR(255) NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    latest_session_id VARCHAR(36) NULL,
    is_running BOOLEAN NOT NULL DEFAULT FALSE,
    latest_process_status VARCHAR(20) NULL,
    last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at TIMESTAMP(3) NULL,
    updated_at TIMESTAMP(3) NULL,
    synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_kw_workspaces_archived (archived),
    INDEX idx_kw_workspaces_updated_at (updated_at),
    INDEX idx_kw_workspaces_latest_session (latest_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. `name` 和 `branch` 应来自工作区流或工作区查询接口，不再使用 `workspace_id[:8]`
2. `latest_session_id` 仅用于快速跳转

### 4.2 会话表 `kw_sessions`

```sql
CREATE TABLE kw_sessions (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(3) NULL,
    updated_at TIMESTAMP(3) NULL,
    synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_kw_sessions_workspace (workspace_id),
    CONSTRAINT fk_kw_sessions_workspace
        FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. 第一阶段不强求补齐所有 session 扩展字段
2. 至少要保证 workspace 和 session 关联完整

### 4.3 执行进程表 `kw_execution_processes`

```sql
CREATE TABLE kw_execution_processes (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    workspace_id VARCHAR(36) NOT NULL,
    run_reason VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    executor VARCHAR(50) NULL,
    executor_action_type VARCHAR(100) NULL,
    dropped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(3) NULL,
    completed_at TIMESTAMP(3) NULL,
    synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_kw_ep_session (session_id),
    INDEX idx_kw_ep_workspace (workspace_id),
    INDEX idx_kw_ep_run_reason_status (run_reason, status),
    INDEX idx_kw_ep_created_at (created_at),
    CONSTRAINT fk_kw_ep_session
        FOREIGN KEY (session_id) REFERENCES kw_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_kw_ep_workspace
        FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. 业务过滤以这张表为准
2. 只对 `run_reason = 'codingagent'` 的 process 建立消息流订阅

### 4.4 消息表 `kw_process_entries`

```sql
CREATE TABLE kw_process_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    process_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    workspace_id VARCHAR(36) NOT NULL,
    entry_index INT NOT NULL,
    entry_type VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    tool_name VARCHAR(100) NULL,
    action_type_json JSON NULL,
    status_json JSON NULL,
    error_type VARCHAR(50) NULL,
    entry_timestamp TIMESTAMP(3) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_kw_entries_process_index (process_id, entry_index),
    KEY idx_kw_entries_session_time (session_id, entry_timestamp),
    KEY idx_kw_entries_workspace_time (workspace_id, entry_timestamp),
    KEY idx_kw_entries_type (entry_type),
    CONSTRAINT fk_kw_entries_process
        FOREIGN KEY (process_id) REFERENCES kw_execution_processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. `entry_index` 是主去重键，来自 patch 路径 `/entries/{index}`
2. `content_hash` 作为辅助校验，不作为唯一键主逻辑
3. `role` 建议在应用层写入，不依赖 generated column，便于兼容和迁移

### 4.5 同步状态表 `kw_sync_subscriptions`

```sql
CREATE TABLE kw_sync_subscriptions (
    subscription_key VARCHAR(120) PRIMARY KEY,
    subscription_type VARCHAR(30) NOT NULL,
    target_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36) NULL,
    workspace_id VARCHAR(36) NULL,
    last_entry_index INT NULL,
    status VARCHAR(20) NOT NULL,
    last_error TEXT NULL,
    last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_kw_sync_type_target (subscription_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. 该表用于重启恢复与运维排障
2. `subscription_type` 可取：`workspace_stream`、`session_process_stream`、`process_log_stream`

## 5. 消息类型与过滤规则

### 5.1 同步范围

只同步以下 `entry_type`：

1. `user_message`
2. `assistant_message`
3. `tool_use`
4. `error_message`

第一期忽略：

1. `thinking`
2. `loading`
3. `token_usage_info`
4. `next_action`
5. `user_feedback`
6. 其他仅 UI 使用的派生项

### 5.2 role 映射

```text
user_message      -> user
assistant_message -> assistant
tool_use          -> assistant
error_message     -> system
其他               -> system
```

### 5.3 process 过滤规则

仅建立以下 process 的消息订阅：

```text
run_reason = codingagent
AND dropped = false
```

是否同步已完成 process：

1. 是
2. 因为历史消息也来自已完成 process

## 6. 同步流程设计

### 6.1 启动流程

服务启动后按以下顺序执行：

1. 初始化数据库 schema
2. 加载本地 `kw_sync_subscriptions`
3. 建立工作区流订阅
4. 从工作区快照中拿到活跃 workspace 与 `latest_session_id`
5. 为每个有效 session 建立 session process 流
6. 从 process 快照中筛选 `codingagent` process
7. 为每个 `codingagent` process 建立 normalized logs 流

要求：

1. 启动时必须立即同步，不等待 ticker
2. WebSocket 是主同步机制
3. summaries 轮询仅作为兜底校验，不作为主链路

### 6.2 工作区流处理

输入：`/api/workspaces/streams/ws?archived=false`

处理逻辑：

1. 解析 JSON Patch
2. 应用到内存中的 workspace snapshot
3. 对变更后的 workspace 执行 upsert
4. 若 `latest_session_id` 变化，启动或切换 session process 订阅

异常策略：

1. WebSocket 异常断开时按指数退避重连
2. 重连成功后重新接收全量快照

### 6.3 Session Process 流处理

输入：`/api/execution-processes/stream/session/ws?session_id={session_id}`

处理逻辑：

1. 解析 execution processes 的 JSON Patch
2. 将 process 快照写入 `kw_execution_processes`
3. 对 `run_reason = codingagent` 的 process 建立或恢复日志订阅
4. 对被删除或 dropped 的 process，停止实时监听，但保留历史数据

特别说明：

1. `stream/session/ws` 只负责 process 元数据，不写消息表
2. 不允许把该流直接反序列化为 `NormalizedEntry`

### 6.4 Process 日志流处理

输入：`/api/execution-processes/{process_id}/normalized-logs/ws`

处理逻辑：

1. 读取 JSON 消息
2. 提取 `JsonPatch`
3. 从 patch 路径 `/entries/{index}` 提取 `entry_index`
4. 从 patch value 中提取 `NormalizedEntry`
5. 按消息类型过滤
6. 映射后写入 `kw_process_entries`

日志流既承担历史补齐，也承担实时追更：

1. 新连接时，服务端先发送已有 entries 的 patch
2. 连接建立后，继续收到实时 patch

这意味着第一期不需要额外实现“历史消息 HTTP 回补接口”，只要正确消费该日志流即可。

### 6.5 去重策略

主策略：

1. 使用 `UNIQUE(process_id, entry_index)` 保证幂等

辅助策略：

1. 记录 `content_hash = sha256(content)`
2. 对重复 patch 或 replace patch 做日志记录

不要使用以下错误方案：

1. `len(content)` 作为 hash
2. 仅依赖 `session_id + timestamp + content`

### 6.6 重连与恢复

工作区流、session 流、process 流都采用一致策略：

1. 首次失败：1s 后重连
2. 后续指数退避：2s、4s、8s、15s，上限 15s
3. 每次重连都接受服务端全量快照
4. 数据库唯一键负责消除重复写入

`kw_sync_subscriptions` 记录：

1. 当前订阅状态
2. 最后接收到的 `entry_index`
3. 最近错误文本

## 7. 查询 API 设计

HTTP 服务继续使用 `7778` 端口。

### 7.1 获取 session 最近消息

```http
GET /api/sessions/{session_id}/messages
```

Query 参数：

1. `limit`，默认 `50`，最大 `200`
2. `before`，按 `entry_timestamp` 分页
3. `types`，可选，逗号分隔

查询策略：

1. SQL 层先按 `entry_timestamp DESC, id DESC LIMIT ?`
2. 应用层再 reverse 成正序返回

原因：

1. 首页要最近消息，不是最早消息

响应示例：

```json
{
  "session_id": "uuid",
  "workspace_name": "frp同步方案",
  "messages": [
    {
      "id": 101,
      "process_id": "process-1",
      "entry_type": "user_message",
      "role": "user",
      "content": "帮我实现这个功能",
      "timestamp": "2026-03-23T10:00:00.000Z"
    }
  ],
  "has_more": true
}
```

### 7.2 获取工作区最新 session 消息

```http
GET /api/workspaces/{workspace_id}/latest-messages
```

处理逻辑：

1. 查 `kw_workspaces.latest_session_id`
2. 复用 session 消息查询逻辑

### 7.3 获取活跃工作区列表

```http
GET /api/workspaces/active
```

返回字段建议：

1. `id`
2. `name`
3. `branch`
4. `latest_session_id`
5. `status`
6. `updated_at`
7. `message_count`
8. `last_message_at`

说明：

1. `message_count` 不允许再返回固定 `0`
2. `status` 应基于本地 `kw_execution_processes` 聚合得出

### 7.4 认证

当前硬编码 API Key 不可上线，改为配置化：

```yaml
http_api:
  port: 7778
  api_key: "xxx"
```

要求：

1. 不再在代码中写死 `"your-api-key-here"`
2. 健康检查可免鉴权，其余接口必须鉴权

## 8. 配置设计

建议新增配置：

```yaml
database:
  host: home.huajiejun.cn
  port: 3306
  user: kanban_watcher
  password: xxx
  database: kanban_watcher

sync:
  workspace_stream_enabled: true
  summaries_poll_fallback_interval: 60s
  reconnect_max_interval: 15s
  message_types:
    - user_message
    - assistant_message
    - tool_use
    - error_message

http_api:
  port: 7778
  api_key: xxx

tls:
  insecure_skip_verify: false
```

补充要求：

1. 不要使用数据库 `root`
2. TLS 是否跳过证书校验必须显式配置，不允许默认关闭校验

## 9. 代码改造方案

### 9.1 新增或重构模块

建议新增以下文件：

1. `internal/store/schema.go`
2. `internal/store/workspace_repo.go`
3. `internal/store/process_repo.go`
4. `internal/store/entry_repo.go`
5. `internal/store/subscription_repo.go`
6. `internal/sync/workspace_stream.go`
7. `internal/sync/session_process_stream.go`
8. `internal/sync/process_log_stream.go`
9. `internal/sync/patch_parser.go`
10. `internal/api/message_handlers.go`

### 9.2 现有问题直接修复

必须修复：

1. 移除把 `stream/session/ws` 当消息流解析的逻辑
2. 修复默认消息查询为“取最近 N 条”
3. 修复 `message_count` 永远为 0 的问题
4. 去掉工作区名称 `workspace_id[:8]` 的临时占位
5. 去掉硬编码数据库密码和 API Key

### 9.3 分阶段实施

#### Phase 1：修正同步模型

目标：

1. 正确连通三级流
2. 正确落库 workspace、session、process、entry

交付：

1. 新 schema
2. 新同步服务
3. 基础集成测试

#### Phase 2：修正查询 API

目标：

1. 提供 HA 首屏可用的本地消息查询
2. 提供工作区汇总查询

交付：

1. `/api/sessions/{id}/messages`
2. `/api/workspaces/{id}/latest-messages`
3. `/api/workspaces/active`

#### Phase 3：增强稳定性

目标：

1. 增加重连、状态观测、错误日志
2. 加入 fallback summaries 校验轮询

交付：

1. 订阅状态追踪
2. 管理后台日志
3. 故障恢复测试

## 10. 测试与验证方案

### 10.1 单元测试

覆盖以下内容：

1. patch 路径解析 `/entries/{index}`
2. `NormalizedEntry` 到数据库模型映射
3. role 映射
4. entry type 过滤
5. 去重幂等逻辑

### 10.2 集成测试

需要模拟：

1. workspace 流初始快照 + 增量 patch
2. session process 流初始快照 + 新 process 增量
3. normalized logs 流历史补齐 + 实时追加
4. 重连后重复推送同一批 patch

验证点：

1. 数据不重复
2. `codingagent` 之外的 process 不落消息
3. 查询 API 返回的是最新消息

### 10.3 手工验证

1. 启动 `kanban-watcher`
2. 打开一个正在运行的 `codingagent` workspace
3. 检查 `kw_execution_processes` 是否出现对应 process
4. 检查 `kw_process_entries` 是否持续增长
5. 关闭 watcher 再重启
6. 检查是否能继续增量同步且不重复
7. 用 `curl` 访问 `/api/sessions/{id}/messages`
8. 在 HA 中打开卡片验证首屏加载时间

### 10.4 验收标准

满足以下条件才算完成：

1. 活跃 workspace 打开后 1 秒内数据库中可见 process 元数据
2. `codingagent` 的 user、assistant、tool、error 消息正确持久化
3. watcher 重启后同一 process 不产生重复消息
4. `/api/sessions/{id}/messages` 默认返回最近消息
5. HA 卡片首屏读取本地 API 平均耗时 `< 100ms`

## 11. 风险与应对

### 风险 1：日志流消息量大

应对：

1. 首期只同步 4 类 entry_type
2. 对 `content` 超长消息保留原文，但控制 API 默认返回条数

### 风险 2：WebSocket 签名或认证机制变化

应对：

1. 复用与前端一致的本地 API 接入方式
2. 将连接错误记录到 `kw_sync_subscriptions.last_error`

### 风险 3：数据库写入压力上升

应对：

1. 使用批量 upsert 优化
2. 合理建立索引
3. 限制默认消息查询窗口

### 风险 4：服务端 patch 可能有 replace/remove

应对：

1. 必须解析 patch path 与 op
2. 不能只假设永远是 add

## 12. 最终结论

本方案的关键不是“加一个数据库”本身，而是把 `kanban-watcher` 的同步模型改成与 `vibe-kanban` 实际实现一致的三级流模型：

1. `workspaces stream`
2. `session execution processes stream`
3. `process normalized logs stream`

只有这样，才能同时满足以下三件事：

1. 只同步 `codingagent`
2. 保证历史和实时消息一致
3. 为 Home Assistant 提供稳定、快速、可恢复的本地读取能力

后续执行时，应优先完成 Phase 1 的同步模型改造，再进入 API 和 HA 接入层。
