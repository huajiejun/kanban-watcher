// Package server 提供简单的 HTTP API，供 HomeAssistant 调用
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	dispatchsvc "github.com/huajiejun/kanban-watcher/internal/service"
)

// Server HTTP 服务器
type Server struct {
	proxy       *api.ProxyClient
	dispatcher  workspaceMessageDispatcher
	port        int
	apiKey      string
	httpServer  *http.Server
	extraRoutes []routeRegistration
}

type workspaceMessageDispatcher interface {
	DispatchWorkspaceMessage(context.Context, string, string, string) (*dispatchsvc.DispatchResult, error)
	GetWorkspaceQueueStatus(context.Context, string) (*dispatchsvc.QueueResult, error)
	CancelWorkspaceQueue(context.Context, string) (*dispatchsvc.QueueResult, error)
	StopWorkspaceExecution(context.Context, string) (*dispatchsvc.DispatchResult, error)
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

// SetWorkspaceMessageDispatcher 设置工作区消息分发器
func (s *Server) SetWorkspaceMessageDispatcher(dispatcher workspaceMessageDispatcher) {
	s.dispatcher = dispatcher
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

	// 工作区消息代理接口
	mux.HandleFunc("/api/workspace/", s.handleWorkspaceMessage)

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

// handleWorkspaceMessage 处理工作区消息请求
// URL 格式:
//   POST /api/workspace/{workspace_id}/message
//   POST /api/workspace/{workspace_id}/follow-up
//   GET /api/workspace/{workspace_id}/queue
//   DELETE /api/workspace/{workspace_id}/queue
//   POST /api/workspace/{workspace_id}/stop
func (s *Server) handleWorkspaceMessage(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/workspace/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || (parts[1] != "follow-up" && parts[1] != "message" && parts[1] != "queue" && parts[1] != "stop") {
		http.Error(w, "Invalid path. Expected: /api/workspace/{id}/message or /api/workspace/{id}/follow-up or /api/workspace/{id}/queue or /api/workspace/{id}/stop", http.StatusBadRequest)
		return
	}

	workspaceID := parts[0]
	actionType := parts[1]

	if actionType == "queue" {
		s.handleWorkspaceQueue(w, r, workspaceID)
		return
	}
	if actionType == "stop" {
		s.handleWorkspaceStop(w, r, workspaceID)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Message string `json:"message"`
		Mode    string `json:"mode"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}

	mode := req.Mode
	if actionType == "follow-up" {
		mode = "send"
	}

	log.Printf("[HTTP Server] 收到工作区 %s 的消息请求: mode=%s message=%s", workspaceID, mode, req.Message)

	if s.dispatcher == nil {
		http.Error(w, "消息分发器未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	result, err := s.dispatcher.DispatchWorkspaceMessage(ctx, workspaceID, req.Message, mode)
	if err != nil {
		log.Printf("[HTTP Server] 消息发送失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		} else if strings.Contains(err.Error(), "message is required") || strings.Contains(err.Error(), "unsupported mode") {
			statusCode = http.StatusBadRequest
		} else if strings.Contains(err.Error(), "缺少可用") || strings.Contains(err.Error(), "等待同步") {
			statusCode = http.StatusConflict
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	log.Printf("[HTTP Server] 工作区 %s 的消息发送成功", workspaceID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"workspace_id": result.WorkspaceID,
		"session_id":   result.SessionID,
		"action":       result.Action,
		"message":      result.Message,
	})
}

func (s *Server) handleWorkspaceStop(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.dispatcher == nil {
		http.Error(w, "消息分发器未初始化", http.StatusInternalServerError)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	result, err := s.dispatcher.StopWorkspaceExecution(ctx, workspaceID)
	if err != nil {
		log.Printf("[HTTP Server] 工作区 %s 停止执行失败: %v", workspaceID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		} else if strings.Contains(err.Error(), "当前没有运行中的执行") {
			statusCode = http.StatusConflict
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"workspace_id": result.WorkspaceID,
		"session_id":   result.SessionID,
		"action":       result.Action,
		"message":      result.Message,
	})
}

func (s *Server) handleWorkspaceQueue(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.dispatcher == nil {
		http.Error(w, "消息分发器未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var (
		result *dispatchsvc.QueueResult
		err    error
	)

	switch r.Method {
	case http.MethodGet:
		result, err = s.dispatcher.GetWorkspaceQueueStatus(ctx, workspaceID)
	case http.MethodDelete:
		result, err = s.dispatcher.CancelWorkspaceQueue(ctx, workspaceID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err != nil {
		log.Printf("[HTTP Server] 工作区 %s 队列操作失败: %v", workspaceID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		} else if strings.Contains(err.Error(), "缺少可用") || strings.Contains(err.Error(), "等待同步") {
			statusCode = http.StatusConflict
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"workspace_id": result.WorkspaceID,
		"session_id":   result.SessionID,
		"status":       result.Status,
		"message":      result.Message,
		"queued":       result.Queued,
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
