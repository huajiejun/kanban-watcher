# JWT 认证实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 kanban-watcher 添加 JWT 会话认证，支持用户名密码/API Key 登录，同时保持现有 X-API-Key 认证

**Architecture:** 新增 auth 包处理 JWT 和密码哈希，扩展 config 包支持认证配置，修改 server 中间件支持双模式认证

**Tech Stack:** Go 1.17, golang-jwt/jwt/v5, golang.org/x/crypto/bcrypt

---

## Chunk 1: 配置扩展与依赖

### 文件结构

```
internal/
├── auth/                    # 新建目录
│   ├── jwt.go              # JWT 服务
│   ├── jwt_test.go         # JWT 测试
│   └── bcrypt.go           # 密码哈希
├── config/
│   └── config.go           # 修改: 添加 AuthConfig
└── server/
    ├── server.go           # 修改: 扩展中间件
    └── auth_handler.go     # 新建: 认证接口
```

### Task 1: 添加依赖

**Files:**
- Modify: `go.mod`

- [ ] **Step 1: 添加 JWT 和 bcrypt 依赖**

```bash
cd /Users/huajiejun/github/kanban-watcher
go get github.com/golang-jwt/jwt/v5@v5.2.0
go get golang.org/x/crypto@v0.18.0
```

- [ ] **Step 2: 验证依赖安装**

Run: `go mod tidy`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add go.mod go.sum
git commit -m "chore: 添加 JWT 和 bcrypt 依赖"
```

### Task 2: 扩展配置结构

**Files:**
- Modify: `internal/config/config.go`
- Test: `internal/config/config_test.go`

- [ ] **Step 1: 写失败的测试**

在 `internal/config/config_test.go` 添加：

```go
func TestAuthConfigDefaults(t *testing.T) {
	cfg := defaultConfig()

	// 验证默认认证配置
	if cfg.Auth.TokenExpireDays != 30 {
		t.Errorf("期望 TokenExpireDays=30, 得到 %d", cfg.Auth.TokenExpireDays)
	}
	if len(cfg.Auth.Users) != 1 {
		t.Errorf("期望默认 1 个用户, 得到 %d", len(cfg.Auth.Users))
	}
	if cfg.Auth.Users[0].Username != "admin" {
		t.Errorf("期望默认用户名为 admin, 得到 %s", cfg.Auth.Users[0].Username)
	}
}

func TestAuthConfigValidation(t *testing.T) {
	cfg := &Config{
		Auth: AuthConfig{
			TokenExpireDays: 0,
			Users:           []UserConfig{},
		},
	}
	applyDefaults(cfg)

	if cfg.Auth.TokenExpireDays != 30 {
		t.Errorf("期望 TokenExpireDays 默认为 30, 得到 %d", cfg.Auth.TokenExpireDays)
	}
	if len(cfg.Auth.Users) != 1 || cfg.Auth.Users[0].Username != "admin" {
		t.Errorf("期望默认创建 admin 用户")
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/config/... -v -run TestAuthConfig`
Expected: FAIL - undefined: AuthConfig

- [ ] **Step 3: 添加配置结构**

在 `internal/config/config.go` 的 `Config` 结构体前添加：

```go
// AuthConfig JWT 认证配置
type AuthConfig struct {
	JWTSecret       string        `yaml:"jwt_secret"`        // JWT 签名密钥，为空则自动生成
	TokenExpireDays int           `yaml:"token_expire_days"` // Token 有效期（天）
	Users           []UserConfig  `yaml:"users"`             // 用户列表
}

// UserConfig 用户配置
type UserConfig struct {
	Username     string `yaml:"username"`      // 用户名
	PasswordHash string `yaml:"password_hash"` // bcrypt 密码哈希
}
```

修改 `Config` 结构体，添加：

```go
type Config struct {
	// ... 现有字段 ...
	Auth             AuthConfig  `yaml:"auth"`              // JWT 认证配置
}
```

- [ ] **Step 4: 更新 defaultConfig**

在 `defaultConfig()` 中添加：

```go
Auth: AuthConfig{
	TokenExpireDays: 30,
	Users: []UserConfig{
		{Username: "admin", PasswordHash: ""},
	},
},
```

- [ ] **Step 5: 更新 applyDefaults**

在 `applyDefaults()` 中添加：

```go
// 认证配置默认值
if cfg.Auth.TokenExpireDays <= 0 {
	cfg.Auth.TokenExpireDays = 30
}
if len(cfg.Auth.Users) == 0 {
	cfg.Auth.Users = []UserConfig{
		{Username: "admin", PasswordHash: ""},
	}
}
```

- [ ] **Step 6: 运行测试验证通过**

Run: `go test ./internal/config/... -v -run TestAuthConfig`
Expected: PASS

- [ ] **Step 7: 运行所有配置测试**

Run: `go test ./internal/config/... -v`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add internal/config/config.go internal/config/config_test.go
git commit -m "feat(config): 添加 JWT 认证配置结构"
```

---

## Chunk 2: JWT 服务实现

### Task 3: JWT 服务

**Files:**
- Create: `internal/auth/jwt.go`
- Create: `internal/auth/jwt_test.go`

- [ ] **Step 1: 写失败的测试**

创建 `internal/auth/jwt_test.go`：

```go
package auth

import (
	"testing"
	"time"
)

func TestGenerateAndValidateToken(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	token, expiresAt, err := service.GenerateToken("admin")
	if err != nil {
		t.Fatalf("生成 token 失败: %v", err)
	}

	if token == "" {
		t.Error("token 不应为空")
	}

	// 验证过期时间约为 30 天
	expectedExpiry := time.Now().Add(30 * 24 * time.Hour)
	diff := expiresAt.Sub(expectedExpiry)
	if diff < -time.Hour || diff > time.Hour {
		t.Errorf("过期时间不正确，期望约 %v，得到 %v", expectedExpiry, expiresAt)
	}
}

func TestValidateToken_Valid(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	token, _, err := service.GenerateToken("admin")
	if err != nil {
		t.Fatalf("生成 token 失败: %v", err)
	}

	claims, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("验证 token 失败: %v", err)
	}

	if claims.Username != "admin" {
		t.Errorf("期望用户名 admin，得到 %s", claims.Username)
	}
}

func TestValidateToken_InvalidSignature(t *testing.T) {
	service := NewJWTService("test-secret", 30)
	wrongService := NewJWTService("wrong-secret", 30)

	token, _, _ := service.GenerateToken("admin")
	_, err := wrongService.ValidateToken(token)

	if err == nil {
		t.Error("期望验证失败，但成功了")
	}
}

func TestValidateToken_InvalidFormat(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	_, err := service.ValidateToken("invalid-token")
	if err == nil {
		t.Error("期望验证失败，但成功了")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	service := NewJWTService("test-secret", -1) // 负数表示已过期

	token, _, _ := service.GenerateToken("admin")
	time.Sleep(100 * time.Millisecond) // 等待过期

	_, err := service.ValidateToken(token)
	if err == nil {
		t.Error("期望 token 过期错误")
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/auth/... -v`
Expected: FAIL - package auth 不存在

- [ ] **Step 3: 创建 JWT 服务**

创建 `internal/auth/jwt.go`：

```go
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims JWT 声明
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// JWTService JWT 服务
type JWTService struct {
	secret          []byte
	tokenExpireDays int
}

// NewJWTService 创建 JWT 服务
func NewJWTService(secret string, tokenExpireDays int) *JWTService {
	return &JWTService{
		secret:          []byte(secret),
		tokenExpireDays: tokenExpireDays,
	}
}

// GenerateToken 生成 JWT Token
func (s *JWTService) GenerateToken(username string) (token string, expiresAt time.Time, err error) {
	expiresAt = time.Now().AddDate(0, 0, s.tokenExpireDays)

	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "kanban-watcher",
		},
	}

	tokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err = tokenObj.SignedString(s.secret)
	return
}

// ValidateToken 验证 JWT Token
func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// RefreshToken 刷新 Token（返回新 token）
func (s *JWTService) RefreshToken(tokenString string) (token string, expiresAt time.Time, err error) {
	claims, err := s.ValidateToken(tokenString)
	if err != nil {
		return "", time.Time{}, err
	}
	return s.GenerateToken(claims.Username)
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `go test ./internal/auth/... -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add internal/auth/
git commit -m "feat(auth): 实现 JWT 服务"
```

### Task 4: 密码哈希工具

**Files:**
- Create: `internal/auth/bcrypt.go`

- [ ] **Step 1: 写失败的测试**

在 `internal/auth/jwt_test.go` 末尾添加（或创建新文件）：

```go
func TestHashAndVerifyPassword(t *testing.T) {
	password := "my-secret-password"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("哈希密码失败: %v", err)
	}

	if hash == "" {
		t.Error("哈希不应为空")
	}

	if hash == password {
		t.Error("哈希不应等于原始密码")
	}
}

func TestVerifyPassword_Correct(t *testing.T) {
	password := "my-secret-password"
	hash, _ := HashPassword(password)

	if !VerifyPassword(password, hash) {
		t.Error("期望密码验证成功")
	}
}

func TestVerifyPassword_Incorrect(t *testing.T) {
	password := "my-secret-password"
	hash, _ := HashPassword(password)

	if VerifyPassword("wrong-password", hash) {
		t.Error("期望密码验证失败")
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/auth/... -v -run TestHash`
Expected: FAIL - undefined: HashPassword

- [ ] **Step 3: 实现密码哈希**

创建 `internal/auth/bcrypt.go`：

```go
package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 10

// HashPassword 使用 bcrypt 哈希密码
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(bytes), err
}

// VerifyPassword 验证密码
func VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `go test ./internal/auth/... -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add internal/auth/bcrypt.go internal/auth/jwt_test.go
git commit -m "feat(auth): 实现密码哈希工具"
```

---

## Chunk 3: 认证接口与中间件

### Task 5: 认证接口处理器

**Files:**
- Create: `internal/server/auth_handler.go`

- [ ] **Step 1: 写失败的测试**

创建 `internal/server/auth_handler_test.go`：

```go
package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/auth"
)

func TestHandleLogin_WithPassword(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)
	passwordHash, _ := auth.HashPassword("test-password")

	handler := &AuthHandler{
		JWTService:  jwtService,
		APIKey:      "test-api-key",
		Users:       []UserCredentials{{Username: "admin", PasswordHash: passwordHash}},
	}

	// 测试用户名密码登录
	body := `{"username": "admin", "password": "test-password"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleLogin(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d，body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	data := resp["data"].(map[string]interface{})
	if data["token"] == "" {
		t.Error("期望返回 token")
	}
}

func TestHandleLogin_WithAPIKey(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)
	passwordHash, _ := auth.HashPassword("test-password")

	handler := &AuthHandler{
		JWTService:  jwtService,
		APIKey:      "test-api-key",
		Users:       []UserCredentials{{Username: "admin", PasswordHash: passwordHash}},
	}

	body := `{"api_key": "test-api-key"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleLogin(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d", w.Code)
	}
}

func TestHandleLogin_InvalidPassword(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)
	passwordHash, _ := auth.HashPassword("test-password")

	handler := &AuthHandler{
		JWTService:  jwtService,
		APIKey:      "test-api-key",
		Users:       []UserCredentials{{Username: "admin", PasswordHash: passwordHash}},
	}

	body := `{"username": "admin", "password": "wrong-password"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleLogin(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("期望状态码 401，得到 %d", w.Code)
	}
}

func TestHandleLogin_InvalidAPIKey(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)
	passwordHash, _ := auth.HashPassword("test-password")

	handler := &AuthHandler{
		JWTService:  jwtService,
		APIKey:      "test-api-key",
		Users:       []UserCredentials{{Username: "admin", PasswordHash: passwordHash}},
	}

	body := `{"api_key": "wrong-api-key"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleLogin(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("期望状态码 401，得到 %d", w.Code)
	}
}

func TestHandleVerify(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
	}

	token, _, _ := jwtService.GenerateToken("admin")

	req := httptest.NewRequest(http.MethodGet, "/api/auth/verify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d", w.Code)
	}
}

func TestHandleRefresh(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
	}

	token, _, _ := jwtService.GenerateToken("admin")

	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	handler.HandleRefresh(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	data := resp["data"].(map[string]interface{})
	if data["token"] == "" {
		t.Error("期望返回新 token")
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/server/... -v -run TestHandle`
Expected: FAIL - undefined: AuthHandler

- [ ] **Step 3: 实现认证处理器**

创建 `internal/server/auth_handler.go`：

```go
package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/auth"
)

// UserCredentials 用户凭证
type UserCredentials struct {
	Username     string
	PasswordHash string
}

// AuthHandler 认证处理器
type AuthHandler struct {
	JWTService *auth.JWTService
	APIKey     string
	Users      []UserCredentials
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	APIKey   string `json:"api_key"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Success   bool                 `json:"success"`
	Data      *LoginResponseData   `json:"data,omitempty"`
	Error     string               `json:"error,omitempty"`
}

// LoginResponseData 登录响应数据
type LoginResponseData struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
}

// HandleLogin 处理登录请求
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	var username string

	// 方式1: API Key 登录
	if req.APIKey != "" {
		if req.APIKey != h.APIKey {
			h.writeError(w, "invalid api key", http.StatusUnauthorized)
			return
		}
		username = "api-user"
	} else if req.Username != "" && req.Password != "" {
		// 方式2: 用户名密码登录
		found := false
		for _, user := range h.Users {
			if user.Username == req.Username {
				if !auth.VerifyPassword(req.Password, user.PasswordHash) {
					h.writeError(w, "invalid credentials", http.StatusUnauthorized)
					return
				}
				username = user.Username
				found = true
				break
			}
		}
		if !found {
			h.writeError(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
	} else {
		h.writeError(w, "missing credentials", http.StatusBadRequest)
		return
	}

	// 生成 Token
	token, expiresAt, err := h.JWTService.GenerateToken(username)
	if err != nil {
		h.writeError(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	h.writeSuccess(w, &LoginResponseData{
		Token:     token,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

// HandleVerify 验证 Token
func (h *AuthHandler) HandleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.writeError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := extractBearerToken(r)
	if token == "" {
		h.writeError(w, "missing authorization header", http.StatusUnauthorized)
		return
	}

	claims, err := h.JWTService.ValidateToken(token)
	if err != nil {
		h.writeError(w, "invalid token", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"username":   claims.Username,
			"expires_at": claims.ExpiresAt.Format(time.RFC3339),
		},
	})
}

// HandleRefresh 刷新 Token
func (h *AuthHandler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := extractBearerToken(r)
	if token == "" {
		h.writeError(w, "missing authorization header", http.StatusUnauthorized)
		return
	}

	newToken, expiresAt, err := h.JWTService.RefreshToken(token)
	if err != nil {
		h.writeError(w, "invalid token", http.StatusUnauthorized)
		return
	}

	h.writeSuccess(w, &LoginResponseData{
		Token:     newToken,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

func (h *AuthHandler) writeSuccess(w http.ResponseWriter, data *LoginResponseData) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&LoginResponse{
		Success: true,
		Data:    data,
	})
}

func (h *AuthHandler) writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(&LoginResponse{
		Success: false,
		Error:   msg,
	})
}

// extractBearerToken 从 Authorization header 提取 Bearer token
func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(authHeader, "Bearer ")
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `go test ./internal/server/... -v -run TestHandle`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add internal/server/auth_handler.go internal/server/auth_handler_test.go
git commit -m "feat(server): 实现认证接口处理器"
```

### Task 6: 扩展认证中间件

**Files:**
- Modify: `internal/server/server.go`
- Modify: `internal/server/server_test.go`

- [ ] **Step 1: 写失败的测试**

在 `internal/server/server_test.go` 添加：

```go
func TestAuthMiddleware_WithJWT(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)
	token, _, _ := jwtService.GenerateToken("admin")

	server := &Server{
		apiKey:     "test-api-key",
		jwtService: jwtService,
	}

	// 创建测试 handler
	handler := server.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	}))

	// 使用 JWT Token
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d", w.Code)
	}
}

func TestAuthMiddleware_WithAPIKey(t *testing.T) {
	server := &Server{
		apiKey: "test-api-key",
	}

	handler := server.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// 使用 API Key
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("X-API-Key", "test-api-key")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望状态码 200，得到 %d", w.Code)
	}
}

func TestAuthMiddleware_SkipAuthRoutes(t *testing.T) {
	server := &Server{
		apiKey: "test-api-key",
	}

	handler := server.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// /api/auth/login 不需要认证
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("期望 /api/auth/login 不需要认证，得到 %d", w.Code)
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./internal/server/... -v -run TestAuthMiddleware`
Expected: FAIL - Server 没有 jwtService 字段

- [ ] **Step 3: 修改 Server 结构体**

在 `internal/server/server.go` 的 `Server` 结构体添加：

```go
import (
	// ... 现有 imports ...
	"github.com/huajiejun/kanban-watcher/internal/auth"
)

type Server struct {
	proxy       *api.ProxyClient
	dispatcher  workspaceMessageDispatcher
	port        int
	apiKey      string
	jwtService  *auth.JWTService  // 新增
	httpServer  *http.Server
	extraRoutes []routeRegistration
}
```

- [ ] **Step 4: 修改 NewServer**

```go
// NewServer 创建 HTTP 服务器
func NewServer(proxy *api.ProxyClient, port int, apiKey string, jwtService *auth.JWTService) *Server {
	return &Server{
		proxy:      proxy,
		port:       port,
		apiKey:     apiKey,
		jwtService: jwtService,
	}
}
```

- [ ] **Step 5: 修改 authMiddleware**

```go
// authMiddleware API Key 和 JWT 双模式验证
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. 健康检查接口不需要认证
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// 2. 认证接口不需要认证
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
		if s.jwtService != nil {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token := strings.TrimPrefix(authHeader, "Bearer ")
				if _, err := s.jwtService.ValidateToken(token); err == nil {
					next.ServeHTTP(w, r)
					return
				}
			}
		}

		// 5. 认证失败
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "unauthorized",
		})
	})
}
```

- [ ] **Step 6: 更新 CORS 中间件**

在 `corsMiddleware` 中添加 Authorization header：

```go
w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization")
```

- [ ] **Step 7: 运行测试验证通过**

Run: `go test ./internal/server/... -v`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add internal/server/server.go internal/server/server_test.go
git commit -m "feat(server): 扩展认证中间件支持 JWT"
```

---

## Chunk 4: 集成与初始化

### Task 7: 注册认证路由

**Files:**
- Modify: `internal/server/server.go`

- [ ] **Step 1: 添加 SetAuthHandler 方法**

在 `Server` 添加：

```go
// SetAuthHandler 设置认证处理器
func (s *Server) SetAuthHandler(handler *AuthHandler) {
	s.authHandler = handler
}
```

修改 `Server` 结构体：

```go
type Server struct {
	// ... 现有字段 ...
	authHandler *AuthHandler  // 新增
}
```

- [ ] **Step 2: 在 Start 中注册认证路由**

在 `Start()` 方法的 `mux.HandleFunc` 调用之后添加：

```go
// 认证接口
if s.authHandler != nil {
	mux.HandleFunc("/api/auth/login", s.authHandler.HandleLogin)
	mux.HandleFunc("/api/auth/verify", s.authHandler.HandleVerify)
	mux.HandleFunc("/api/auth/refresh", s.authHandler.HandleRefresh)
}
```

- [ ] **Step 3: 运行测试**

Run: `go test ./internal/server/... -v`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add internal/server/server.go
git commit -m "feat(server): 注册认证路由"
```

### Task 8: 主程序集成

**Files:**
- Modify: `cmd/kanban-watcher/run.go`

- [ ] **Step 1: 查看现有 run.go**

Run: `cat cmd/kanban-watcher/run.go | head -50`

- [ ] **Step 2: 添加 JWT 服务初始化**

在 `run.go` 中添加导入：

```go
import (
	// ... 现有 imports ...
	"github.com/huajiejun/kanban-watcher/internal/auth"
)
```

在服务器创建前添加：

```go
// 初始化 JWT 服务
jwtSecret := cfg.Auth.JWTSecret
if jwtSecret == "" {
	// 自动生成密钥
	jwtSecret = generateRandomSecret()
	// TODO: 持久化到配置文件
}
jwtService := auth.NewJWTService(jwtSecret, cfg.Auth.TokenExpireDays)

// 创建服务器
server := api.NewServer(proxyClient, cfg.HTTPAPI.Port, cfg.HTTPAPI.APIKey, jwtService)

// 设置认证处理器
authHandler := &server.AuthHandler{
	JWTService: jwtService,
	APIKey:     cfg.HTTPAPI.APIKey,
	Users:      convertUsers(cfg.Auth.Users),
}
server.SetAuthHandler(authHandler)
```

- [ ] **Step 3: 添加辅助函数**

```go
// generateRandomSecret 生成随机密钥
func generateRandomSecret() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.StdEncoding.EncodeToString(b)
}

// convertUsers 转换用户配置
func convertUsers(users []config.UserConfig) []server.UserCredentials {
	result := make([]server.UserCredentials, len(users))
	for i, u := range users {
		result[i] = server.UserCredentials{
			Username:     u.Username,
			PasswordHash: u.PasswordHash,
		}
	}
	return result
}
```

- [ ] **Step 4: 运行测试**

Run: `go test ./cmd/kanban-watcher/... -v`
Expected: PASS

- [ ] **Step 5: 构建验证**

Run: `go build ./cmd/kanban-watcher`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add cmd/kanban-watcher/run.go
git commit -m "feat: 集成 JWT 认证到主程序"
```

### Task 9: 最终验证

- [ ] **Step 1: 运行所有测试**

Run: `go test ./... -v`
Expected: PASS

- [ ] **Step 2: 构建程序**

Run: `go build ./cmd/kanban-watcher`
Expected: 无错误

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 完成 JWT 认证功能实现"
```

---

## 测试清单

### 单元测试
- [x] JWT 生成和验证
- [x] 密码哈希和验证
- [x] 认证中间件逻辑
- [x] 登录接口（用户名密码）
- [x] 登录接口（API Key）
- [x] Token 验证接口
- [x] Token 刷新接口

### 集成测试
- [ ] 启动服务后测试登录流程
- [ ] 使用 Token 访问受保护 API
- [ ] Home Assistant 使用 X-API-Key 仍可访问

## 部署注意事项

1. **首次启动**: 如果 `jwt_secret` 为空，程序会自动生成随机密钥
2. **密码设置**: 首次使用需要手动设置 `password_hash`，或通过工具生成
3. **HTTPS**: 生产环境务必使用 HTTPS
