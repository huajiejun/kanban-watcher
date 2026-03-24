# 网络配置指南 - 确保 HomeAssistant 能访问 kanban-watcher

## 🔍 问题分析

你有多个网络接口：
- `127.0.0.1` - 仅本机访问（HomeAssistant 容器无法访问）
- `192.168.10.10` - 局域网 IP（推荐）
- `192.168.10.18` - 局域网 IP（备用）

## ✅ 解决方案

### 方案 1：绑定到所有接口（推荐）

修改 `main.go`，让 HTTP 服务器监听所有网卡：

```go
// 修改这一行
httpServer := server.NewServer(proxyClient, "0.0.0.0:7778", "your-api-key-here")
```

这样 kanban-watcher 会监听：
- `127.0.0.1:7778`（本机）
- `192.168.10.10:7778`（局域网）
- `192.168.10.18:7778`（局域网）

### 方案 2：HomeAssistant 配置

**如果 HA 是容器部署：**

使用 `host` 网络模式，或映射端口：

```yaml
# docker-compose.yaml
services:
  homeassistant:
    network_mode: host  # 使用宿主机网络
    # 或者使用桥接网络
    # ports:
    #   - "8123:8123"
```

**HA 的 REST 配置：**

```yaml
rest_command:
  kanban_follow_up:
    # 使用宿主机的局域网 IP，而不是 127.0.0.1
    url: "http://192.168.10.10:7778/api/workspace/{{ workspace_id }}/follow-up"
    method: POST
    headers:
      Content-Type: application/json
      X-API-Key: "your-api-key-here"
    payload: '{"message": "{{ message }}"}'
```

## 🧪 测试步骤

### 1. 测试 kanban-watcher 监听状态

```bash
# 查看是否在监听 7778 端口
lsof -i :7778

# 应该显示类似：
# kanban-wat 12345 huajiejun   12u  IPv6 0x123...      0t0  TCP *:7778 (LISTEN)
```

### 2. 测试本机访问

```bash
# 测试 127.0.0.1
curl http://127.0.0.1:7778/health

# 测试局域网 IP
curl http://192.168.10.10:7778/health
```

### 3. 测试从其他设备访问

在同一网络的其他设备（手机/另一台电脑）上：

```bash
# 替换为你的实际 IP
curl http://192.168.10.10:7778/health
```

### 4. 测试从 HomeAssistant 容器内访问

```bash
# 进入 HA 容器
docker exec -it homeassistant /bin/bash

# 在容器内测试
curl http://192.168.10.10:7778/health
```

## 🛠️ 快速修复

让我帮你修改代码，绑定到所有接口：

```go
// internal/server/server.go 中修改
func (s *Server) Start() error {
    mux := http.NewServeMux()
    mux.HandleFunc("/health", s.handleHealth)
    mux.HandleFunc("/api/workspace/", s.handleFollowUp)

    s.httpServer = &http.Server{
        Addr:    ":7778",  // 简化为只写端口，绑定所有接口
        Handler: s.corsMiddleware(s.authMiddleware(mux)),
    }
    // ...
}
```

## 🔒 安全建议

1. **防火墙规则**：限制 7778 端口仅允许局域网访问
   ```bash
   # macOS
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add kanban-watcher
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --blockapp kanban-watcher
   ```

2. **API Key**：生产环境使用强密码

3. **HTTPS**：使用反向代理（如 Nginx）启用 HTTPS

## 📋 故障排查

### Connection Refused
- kanban-watcher 未启动
- 端口绑定失败

### Connection Timeout
- 防火墙阻止
- 网络不通

### No Route to Host
- IP 地址错误
- 子网不匹配

## 🎯 推荐配置

### 开发环境（本机测试）
```yaml
url: "http://127.0.0.1:7778/api/workspace/..."
```

### 生产环境（HA 容器 + kanban-watcher 宿主机）
```yaml
url: "http://192.168.10.10:7778/api/workspace/..."  # 使用实际局域网 IP
```

### 生产环境（Docker Compose 同网络）
```yaml
# 使用容器名访问
url: "http://kanban-watcher:7778/api/workspace/..."
```

需要我帮你修改代码绑定到所有接口吗？
