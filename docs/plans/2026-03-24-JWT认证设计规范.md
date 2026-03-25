# JWT 认证与登录页设计规范

## 概述

为 kanban-watcher 添加 JWT 会话认证，支持新网页登录，同时保持现有 X-API-Key 认证供 Home Assistant 使用。

## 需求

- 单用户系统
- 支持两种登录方式：用户名+密码 / API Key 换取 JWT
- JWT Token 有效期：30天
- Home Assistant 卡片继续使用 X-API-Key

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      kanban-watcher                         │
│                                                             │
│  ┌─────────────┐    ┌─────────────────────────────────┐    │
│  │ /api/auth/* │    │ 其他 API (/api/workspaces等)     │    │
│  │ (无需认证)   │    │ (需要认证)                       │    │
│  └──────┬──────┘    └─────────────┬───────────────────┘    │
│         │                         │                         │
│         ▼                         ▼                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              认证中间件 (双模式)                      │   │
│  │  • X-API-Key Header/Query (Home Assistant)          │   │
│  │  • Authorization: Bearer Token (新网页)              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 配置结构

在 `~/.config/kanban-watcher/config.yaml` 新增：

```yaml
auth:
  jwt_secret: ""           # 为空则自动生成并持久化
  token_expire_days: 30
  users:
    - username: admin
      password_hash: ""    # bcrypt哈希，首次启动时生成
```

## API 设计

### 登录接口

**端点**: `POST /api/auth/login`

**请求体** (二选一):
```json
// 方式1: 用户名密码
{"username": "admin", "password": "your-password"}

// 方式2: API Key
{"api_key": "your-api-key"}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": "2026-04-23T00:00:00Z"
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "invalid credentials"
}
```

### 验证 Token

**端点**: `GET /api/auth/verify`

**Header**: `Authorization: Bearer <token>`

**响应**:
```json
{
  "success": true,
  "data": {
    "username": "admin",
    "expires_at": "2026-04-23T00:00:00Z"
  }
}
```

### 刷新 Token

**端点**: `POST /api/auth/refresh`

**Header**: `Authorization: Bearer <token>`

**响应**: 同登录接口

## 认证中间件逻辑

```go
func (s *Server) authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 1. 健康检查跳过
        if r.URL.Path == "/health" {
            next.ServeHTTP(w, r)
            return
        }

        // 2. 登录接口跳过
        if strings.HasPrefix(r.URL.Path, "/api/auth/") {
            next.ServeHTTP(w, r)
            return
        }

        // 3. 尝试 X-API-Key 认证
        apiKey := r.Header.Get("X-API-Key")
        if apiKey == "" {
            apiKey = r.URL.Query().Get("api_key")
        }
        if apiKey == s.apiKey {
            next.ServeHTTP(w, r)
            return
        }

        // 4. 尝试 JWT Bearer Token 认证
        authHeader := r.Header.Get("Authorization")
        if strings.HasPrefix(authHeader, "Bearer ") {
            token := strings.TrimPrefix(authHeader, "Bearer ")
            if s.jwtService.ValidateToken(token) {
                next.ServeHTTP(w, r)
                return
            }
        }

        // 5. 认证失败
        http.Error(w, `{"success":false,"error":"unauthorized"}`,
                   http.StatusUnauthorized)
    })
}
```

## 文件结构

```
internal/
├── auth/
│   ├── jwt.go         # JWT 生成/验证
│   ├── jwt_test.go    # JWT 测试
│   └── bcrypt.go      # 密码哈希工具
├── config/
│   └── config.go      # 扩展 AuthConfig 结构
└── server/
    ├── server.go      # 扩展中间件
    └── auth_handler.go # 登录/验证/刷新接口
```

## 依赖

```go
// go.mod 新增
require (
    github.com/golang-jwt/jwt/v5 v5.2.0
    golang.org/x/crypto v0.18.0  // bcrypt
)
```

## 错误处理

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| 用户名或密码错误 | 401 | invalid credentials |
| API Key 无效 | 401 | invalid api key |
| Token 过期 | 401 | token expired |
| Token 无效 | 401 | invalid token |
| 缺少认证信息 | 401 | unauthorized |

## 安全考虑

1. **密码存储**: 使用 bcrypt 哈希，cost=10
2. **JWT签名**: 使用 HS256 算法
3. **密钥管理**: jwt_secret 首次启动自动生成，持久化到配置文件
4. **HTTPS**: 生产环境必须使用 HTTPS

## 登录页前端

登录页作为独立网页实现，不在 kanban-watcher Go 服务中。

**基本流程**:
1. 用户访问登录页
2. 输入用户名/密码 或 API Key
3. 调用 `/api/auth/login` 获取 JWT Token
4. Token 存储到 localStorage
5. 跳转到主页面
6. 后续请求携带 `Authorization: Bearer <token>`

## 测试计划

1. **单元测试**:
   - JWT 生成和验证
   - 密码哈希和验证
   - 中间件逻辑

2. **集成测试**:
   - 登录接口（用户名密码）
   - 登录接口（API Key）
   - Token 验证
   - Token 刷新
   - 中间件拒绝无效请求
