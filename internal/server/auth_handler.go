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
	Success bool               `json:"success"`
	Data    *LoginResponseData `json:"data,omitempty"`
	Error   string             `json:"error,omitempty"`
}

// LoginResponseData 登录响应数据
type LoginResponseData struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
}

// HandleLogin 处理登录请求
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeJSONError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeJSONError(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	var username string

	// 方式1: API Key 登录
	if req.APIKey != "" {
		if req.APIKey != h.APIKey {
			h.writeJSONError(w, "invalid api key", http.StatusUnauthorized)
			return
		}
		username = "api-user"
	} else if req.Username != "" && req.Password != "" {
		// 方式2: 用户名密码登录
		found := false
		for _, user := range h.Users {
			if user.Username == req.Username {
				if user.PasswordHash == "" {
					// 密码未设置，拒绝登录
					h.writeJSONError(w, "password not set for user", http.StatusUnauthorized)
					return
				}
				if !auth.VerifyPassword(req.Password, user.PasswordHash) {
					h.writeJSONError(w, "invalid credentials", http.StatusUnauthorized)
					return
				}
				username = user.Username
				found = true
				break
			}
		}
		if !found {
			h.writeJSONError(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
	} else {
		h.writeJSONError(w, "missing credentials: provide username+password or api_key", http.StatusBadRequest)
		return
	}

	// 生成 Token
	token, expiresAt, err := h.JWTService.GenerateToken(username)
	if err != nil {
		h.writeJSONError(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	h.writeJSONSuccess(w, &LoginResponseData{
		Token:     token,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

// HandleVerify 验证 Token
func (h *AuthHandler) HandleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.writeJSONError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := extractBearerToken(r)
	if token == "" {
		h.writeJSONError(w, "missing authorization header", http.StatusUnauthorized)
		return
	}

	claims, err := h.JWTService.ValidateToken(token)
	if err != nil {
		h.writeJSONError(w, "invalid token", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"username":   claims.Username,
			"expires_at": claims.ExpiresAt.Time.Format(time.RFC3339),
		},
	})
}

// HandleRefresh 刷新 Token
func (h *AuthHandler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeJSONError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := extractBearerToken(r)
	if token == "" {
		h.writeJSONError(w, "missing authorization header", http.StatusUnauthorized)
		return
	}

	newToken, expiresAt, err := h.JWTService.RefreshToken(token)
	if err != nil {
		h.writeJSONError(w, "invalid token", http.StatusUnauthorized)
		return
	}

	h.writeJSONSuccess(w, &LoginResponseData{
		Token:     newToken,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

func (h *AuthHandler) writeJSONSuccess(w http.ResponseWriter, data *LoginResponseData) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&LoginResponse{
		Success: true,
		Data:    data,
	})
}

func (h *AuthHandler) writeJSONError(w http.ResponseWriter, msg string, code int) {
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
