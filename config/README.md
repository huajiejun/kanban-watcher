# FRP + Nginx 前后端共享代理部署指南

## 架构说明

```
外网请求
    ↓
FRP 公网服务器:2453
    ↓
FRP 内网客户端
    ↓
共享 Nginx (127.0.0.1:2453)
    ├─ /6020/...      → 127.0.0.1:6020
    └─ /6020/api/...  → 127.0.0.1:16020
```

## 访问方式

| 外网 URL | 内网服务 |
|---------|---------|
| `http://domain:2453/6020/` | `127.0.0.1:6020/` |
| `http://domain:2453/6020/api/info` | `127.0.0.1:16020/api/info` |
| `ws://domain:2453/6020/api/realtime/ws` | `127.0.0.1:16020/api/realtime/ws` |

## 部署步骤

### 1. 安装 Nginx（macOS）

```bash
# 使用 Homebrew 安装
brew install nginx

# 启动 nginx
brew services start nginx
```

### 2. 配置 Nginx

```bash
# 复制配置文件到 nginx 配置目录
sudo cp config/nginx-dynamic-proxy.conf /opt/homebrew/etc/nginx/servers/

# 测试配置
nginx -t

# 重载配置
nginx -s reload
```

### 3. 安装 FRP

```bash
# macOS
brew install frpc

# 或手动下载
# https://github.com/fatedier/frp/releases
```

### 4. 配置 FRP

```bash
# 编辑配置文件
mkdir -p ~/.frp
cp config/frpc.ini ~/.frp/frpc.ini

# 修改配置中的服务器地址和 token
vim ~/.frp/frpc.ini
```

### 5. 启动 FRP 客户端

```bash
# 前台运行（测试）
frpc -c ~/.frp/frpc.ini

# 后台运行
nohup frpc -c ~/.frp/frpc.ini > /var/log/frpc.log 2>&1 &
```

### 6. 验证

```bash
# 本地测试 nginx
curl http://127.0.0.1:2453/health
# 应返回: OK

# 测试前端代理（假设 6020 端口有服务）
curl http://127.0.0.1:2453/6020/

# 测试后端 API 代理（假设 16020 端口有服务）
curl http://127.0.0.1:2453/6020/api/info
```

## 常用命令

```bash
# Nginx
nginx -t                 # 测试配置
nginx -s reload          # 重载配置
nginx -s stop            # 停止
brew services restart nginx  # 重启

# FRP
frpc -c ~/.frp/frpc.ini  # 启动客户端
pkill frpc               # 停止客户端

# 查看日志
tail -f /opt/homebrew/var/log/nginx/dynamic-proxy.access.log
tail -f /opt/homebrew/var/log/nginx/dynamic-proxy.error.log
```

## 注意事项

1. **共享实例**：只需要一个 Nginx 实例，不需要每个工作区单独启动一套

2. **端口映射**：
   - 默认后端端口按 `1 + 前端端口` 推导，例如 `6020 -> 16020`
   - 保留 `7779 -> 7778` 的兼容映射

3. **WebSocket**：`/api/realtime/ws` 等升级请求已支持

4. **安全性**：
   - 建议在 frp 配置中启用 TLS 加密
   - 可在 nginx 中添加 IP 白名单或基本认证

5. **性能**：
   - nginx 默认支持高并发
   - 如需更高性能可调整 worker_processes

## 扩展配置

### 添加 HTTP 基本认证

```nginx
# 在 server 块中添加
auth_basic "Restricted";
auth_basic_user_file /opt/homebrew/etc/nginx/.htpasswd;

# 生成密码文件
htpasswd -c /opt/homebrew/etc/nginx/.htpasswd admin
```

### 添加 IP 白名单

```nginx
# 在 server 块中添加
allow 10.0.0.0/8;
allow 192.168.0.0/16;
deny all;
```
