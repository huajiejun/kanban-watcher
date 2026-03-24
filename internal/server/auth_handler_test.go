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
		JWTService: jwtService,
		APIKey:     "test-api-key",
		Users: []UserCredentials{
			{Username: "admin", PasswordHash: passwordHash},
		},
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

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("响应数据格式错误")
	}
	if data["token"] == "" {
		t.Error("期望返回 token")
	}
}

func TestHandleLogin_WithAPIKey(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
		APIKey:     "test-api-key",
		Users:      []UserCredentials{},
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
		JWTService: jwtService,
		APIKey:     "test-api-key",
		Users: []UserCredentials{
			{Username: "admin", PasswordHash: passwordHash},
		},
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

	handler := &AuthHandler{
		JWTService: jwtService,
		APIKey:     "test-api-key",
		Users:      []UserCredentials{},
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

func TestHandleLogin_MissingCredentials(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
		APIKey:     "test-api-key",
		Users:      []UserCredentials{},
	}

	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleLogin(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("期望状态码 400，得到 %d", w.Code)
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

func TestHandleVerify_MissingHeader(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/verify", nil)
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("期望状态码 401，得到 %d", w.Code)
	}
}

func TestHandleVerify_InvalidToken(t *testing.T) {
	jwtService := auth.NewJWTService("test-secret", 30)

	handler := &AuthHandler{
		JWTService: jwtService,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/verify", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()

	handler.HandleVerify(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("期望状态码 401，得到 %d", w.Code)
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

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		t.Fatal("响应数据格式错误")
	}
	if data["token"] == "" {
		t.Error("期望返回新 token")
	}
}
