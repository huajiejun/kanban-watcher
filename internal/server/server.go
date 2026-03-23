// Package server 提供简单的 HTTP API，供 HomeAssistant 调用
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

// Server HTTP 服务器
type Server struct {
	proxy       *api.ProxyClient
	port        int
	apiKey      string
	httpServer  *http.Server
	extraRoutes []routeRegistration
}

// routeRegistration 路由注册信息
type routeRegistration struct {
	pattern string
	handler http.HandlerFunc
}

// NewServer 创建 HTTP 服务器
// apiKey 用于简单的安全验证，HA 请求需要携带这个 key
func NewServer(proxy *api.ProxyClient, port int, apiKey string) *Server {
	return &Server{
		proxy:  proxy,
		port:   port,
		apiKey: apiKey,
	}
}

// RegisterRoute 注册额外的路由
func (s *Server) RegisterRoute(pattern string, handler http.HandlerFunc) {
	s.extraRoutes = append(s.extraRoutes, routeRegistration{
		pattern: pattern,
		handler: handler,
	})
}

// Start 启动 HTTP 服务器（非阻塞，在 goroutine 中运行）
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// 健康检查
	mux.HandleFunc("/health", s.handleHealth)

	// Follow-up 代理接口
	mux.HandleFunc("/api/workspace/", s.handleFollowUp)

	// 注册额外的路由
	for _, route := range s.extraRoutes {
		mux.HandleFunc(route.pattern, route.handler)
	}

	s.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.port),
		Handler: s.corsMiddleware(s.authMiddleware(mux)),
	}

	// 在 goroutine 中启动
	go func() {
		log.Printf("[HTTP Server] 启动在端口 %d", s.port)
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[HTTP Server] 错误: %v", err)
		}
	}()

	return nil
}

// Stop 优雅停止服务器
func (s *Server) Stop(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// handleHealth 健康检查
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}

// handleFollowUp 处理 follow-up 请求
// URL 格式: POST /api/workspace/{workspace_id}/follow-up
func (s *Server) handleFollowUp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析 URL 路径，提取 workspace_id
	// 格式: /api/workspace/{id}/follow-up
	path := strings.TrimPrefix(r.URL.Path, "/api/workspace/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "follow-up" {
		http.Error(w, "Invalid path. Expected: /api/workspace/{id}/follow-up", http.StatusBadRequest)
		return
	}

	workspaceID := parts[0]

	// 解析请求体
	var req struct {
		Message string `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}

	log.Printf("[HTTP Server] 收到工作区 %s 的 follow-up 请求: %s", workspaceID, req.Message)

	// 调用代理
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := s.proxy.SendFollowUp(ctx, workspaceID, req.Message); err != nil {
		log.Printf("[HTTP Server] follow-up 失败: %v", err)
		http.Error(w, fmt.Sprintf("Failed to send follow-up: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[HTTP Server] 工作区 %s 的 follow-up 发送成功", workspaceID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"message": "Follow-up sent successfully",
	})
}

// authMiddleware API Key 验证
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 健康检查接口不需要认证
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// 从 Header 或 Query 参数获取 API Key
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			apiKey = r.URL.Query().Get("api_key")
		}

		if apiKey != s.apiKey {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// corsMiddleware 跨域支持（允许 HomeAssistant 访问）
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
