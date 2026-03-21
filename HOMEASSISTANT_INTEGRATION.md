# HomeAssistant 集成指南 - 发送消息到工作区

## 🎯 功能说明

在 HomeAssistant 中点击卡片按钮，向 vibe-kanban 工作区发送 follow-up 消息。

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

### 2. 配置 HomeAssistant REST Command

在 `configuration.yaml` 中添加：

```yaml
rest_command:
  # 向指定工作区发送消息
  kanban_follow_up:
    url: "http://127.0.0.1:7778/api/workspace/{{ workspace_id }}/follow-up"
    method: POST
    headers:
      Content-Type: application/json
      X-API-Key: "your-api-key-here"
    payload: '{"message": "{{ message }}"}'
```

**注意**：将 `your-api-key-here` 替换为实际密钥（当前为硬编码，后续可配置）。

### 3. 重启 HomeAssistant

```yaml
# Developer Tools → YAML → Restart → Core Restart
```

### 4. 创建 Lovelace 卡片

在仪表板中添加 Markdown 卡片，使用模板生成按钮：

```yaml
type: markdown
content: |
  ## 💬 快速发送消息

  {% set workspaces = state_attr('sensor.kanban_watcher_kanban_watcher', 'workspaces') or [] %}

  ### 点击工作区发送消息：

  {% for ws in workspaces %}
  <a href="javascript:void(0)"
     style="display: block; background: #03a9f4; color: white; padding: 10px; margin: 8px 0; border-radius: 8px; text-decoration: none; text-align: center;"
     onclick="fetch('http://127.0.0.1:7778/api/workspace/{{ ws.id }}/follow-up', {
       method: 'POST',
       headers: {'Content-Type': 'application/json', 'X-API-Key': 'your-api-key-here'},
       body: JSON.stringify({message: '继续推进这个任务'})
     }).then(r => alert('已发送: ' + (r.ok ? '成功' : '失败')))
       .catch(e => alert('错误: ' + e))">
    📨 {{ ws.name }}
  </a>
  {% endfor %}
```

## 🔧 高级用法：使用脚本和按钮

### 创建脚本（带输入）

```yaml
# configuration.yaml
script:
  kanban_send_message:
    alias: 发送消息到 Kanban
    description: 向指定工作区发送 follow-up 消息
    fields:
      workspace_id:
        description: 工作区 ID
        example: "e7743df1-a36b-45e1-bf63-bbf1fe049308"
      message:
        description: 消息内容
        example: "这个功能需要调整"
    sequence:
      - service: rest_command.kanban_follow_up
        data:
          workspace_id: "{{ workspace_id }}"
          message: "{{ message }}"
      - service: persistent_notification.create
        data:
          title: "Kanban 消息已发送"
          message: "已向工作区发送: {{ message }}"
```

### 创建按钮卡片

```yaml
type: button
name: 发送提醒
show_icon: true
icon: mdi:send
tap_action:
  action: call-service
  service: script.kanban_send_message
  data:
    workspace_id: "e7743df1-a36b-45e1-bf63-bbf1fe049308"
    message: "继续推进这个任务"
```

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
- 确保工作区有活跃的 session（通过 summaries API 确认）

## 📝 后续改进计划

- [ ] 支持配置文件设置 API Key
- [ ] 支持 HTTPS/TLS
- [ ] 添加消息模板功能
- [ ] 支持批量发送
