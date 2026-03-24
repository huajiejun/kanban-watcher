# HomeAssistant 集成指南 - 卡片直连本地持久化数据

## 🎯 功能说明

当前卡片已经支持直接请求 `kanban-watcher` 本地 HTTP API：

- 卡片加载时读取 `/api/workspaces/active`
- 点击工作区时读取 `/api/workspaces/{workspace_id}/latest-messages`
- 发送 follow-up 时调用 `/api/workspace/{workspace_id}/follow-up`

## 🏗️ 架构流程

```
HomeAssistant  →  kanban-watcher:7778  →  vibe-kanban:7777
   (点击按钮)       (代理服务器)           (实际处理)
```

## 📋 前置要求

1. kanban-watcher 最新版本（已集成 HTTP 服务器）
2. HomeAssistant 能访问 kanban-watcher 所在机器

## ⚙️ 配置步骤

### 1. 启动 kanban-watcher

```bash
./kanban-watcher
```

启动后会监听端口 7778（HTTP API）。

### 2. 配置 Lovelace 卡片

推荐直接使用自定义卡片配置，不再依赖 `sensor` 属性里携带完整历史消息：

```yaml
type: custom:kanban-watcher-card
entity: sensor.kanban_watcher_kanban_watcher
base_url: https://watcher.huajiejun.cn
api_key: your-api-key-here
messages_limit: 50
```

说明：

- `entity` 目前仍保留，方便兼容现有卡片配置和本地预览
- `base_url` 指向运行 `kanban-watcher` HTTP API 的地址
- `api_key` 需要和 `kanban-watcher` 当前配置一致
- `messages_limit` 控制弹窗首次加载的消息数量

### 3. 重启 HomeAssistant

```yaml
# Developer Tools → YAML → Restart → Core Restart
```

### 4. 配置前确认

请确保 Home Assistant 可以访问 `base_url` 对应地址；如果 HA 跑在别的机器或容器内，`127.0.0.1` 往往不可用，需要改成宿主机可访问地址。

## 🔍 测试 API

使用 curl 测试：

```bash
curl -X POST "http://127.0.0.1:7778/api/workspace/e7743df1-a36b-45e1-bf63-bbf1fe049308/follow-up" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"message": "测试消息"}'
```

## ⚠️ 安全注意事项

1. **API Key**：当前为硬编码，生产环境建议改为配置文件设置
2. **网络访问**：端口 7778 默认绑定所有接口，建议添加防火墙规则限制访问
3. **HTTPS**：生产环境建议使用反向代理（如 Nginx）启用 HTTPS

## 🐛 故障排查

### 无法连接到 7778
- 检查 kanban-watcher 是否已启动
- 检查防火墙是否放行 7778 端口
- 在 kanban-watcher 机器上测试：`curl http://127.0.0.1:7778/health`

### 401 Unauthorized
- 检查 HomeAssistant 配置中的 `X-API-Key` 是否正确
- 当前密钥：`your-api-key-here`

### 404 Not Found
- 检查工作区 ID 是否正确
- 确保该工作区已同步到本地数据库，且有 `latest_session_id`

## 📝 后续改进计划

- [ ] 支持配置文件设置 API Key
- [ ] 支持 HTTPS/TLS
- [ ] 添加消息模板功能
- [ ] 支持批量发送
