// Package server 提供简单的 HTTP API，供 HomeAssistant 调用
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	gorillaws "github.com/gorilla/websocket"
	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/auth"
	dispatchsvc "github.com/huajiejun/kanban-watcher/internal/service"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

const defaultWorktreeBasePath = "/Users/huajiejun/github/vibe-kanban/.vibe-kanban-workspaces"

// Server HTTP 服务器
type Server struct {
	proxy         *api.ProxyClient
	apiClient     *api.Client // 上游 API 客户端，用于按需同步 issue_id
	dispatcher    workspaceMessageDispatcher
	port          int
	apiKey        string
	authEnabled   bool
	jwtService    *auth.JWTService
	authHandler   *AuthHandler
	httpServer    *http.Server
	extraRoutes   []routeRegistration
	staticFS      fs.FS
	store         *store.Store
	portAllocator frontendPortAllocator
	runtimeInfo   RuntimeInfo
	projectID     string
}

type RuntimeInfo struct {
	Role            string
	RealtimeEnabled bool
	RealtimeBaseURL string
}

type workspaceMessageDispatcher interface {
	DispatchWorkspaceMessage(context.Context, string, string, string) (*dispatchsvc.DispatchResult, error)
	GetWorkspaceQueueStatus(context.Context, string) (*dispatchsvc.QueueResult, error)
	CancelWorkspaceQueue(context.Context, string) (*dispatchsvc.QueueResult, error)
	StopWorkspaceExecution(context.Context, string) (*dispatchsvc.DispatchResult, error)
}

type frontendPortAllocator interface {
	Allocate(context.Context, string) (int, int, error)
}

// routeRegistration 路由注册信息
type routeRegistration struct {
	pattern string
	handler http.HandlerFunc
}

// NewServer 创建 HTTP 服务器
// apiKey 用于简单的安全验证，HA 请求需要携带这个 key
// authEnabled 是否启用认证
// jwtService 用于 JWT 认证，可选
// staticFS 静态文件系统，用于提供登录页面等
func NewServer(proxy *api.ProxyClient, port int, apiKey string, authEnabled bool, jwtService *auth.JWTService, staticFS fs.FS) *Server {
	return &Server{
		proxy:       proxy,
		port:        port,
		apiKey:      apiKey,
		authEnabled: authEnabled,
		jwtService:  jwtService,
		staticFS:    staticFS,
	}
}

// SetWorkspaceMessageDispatcher 设置工作区消息分发器
func (s *Server) SetWorkspaceMessageDispatcher(dispatcher workspaceMessageDispatcher) {
	s.dispatcher = dispatcher
}

func (s *Server) SetStore(dbStore *store.Store) {
	s.store = dbStore
}

func (s *Server) SetFrontendPortAllocator(allocator frontendPortAllocator) {
	s.portAllocator = allocator
}

func (s *Server) SetRuntimeInfo(info RuntimeInfo) {
	s.runtimeInfo = info
}

// SetProjectID 设置关联的 vibe-kanban 项目 ID（用于 Issue API）
func (s *Server) SetProjectID(id string) {
	s.projectID = id
}

// SetAuthHandler 设置认证处理器
func (s *Server) SetAuthHandler(handler *AuthHandler) {
	s.authHandler = handler
}

// SetAPIClient 设置上游 API 客户端
func (s *Server) SetAPIClient(client *api.Client) {
	s.apiClient = client
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

	// 认证接口
	if s.authHandler != nil {
		mux.HandleFunc("/api/auth/login", s.authHandler.HandleLogin)
		mux.HandleFunc("/api/auth/verify", s.authHandler.HandleVerify)
		mux.HandleFunc("/api/auth/refresh", s.authHandler.HandleRefresh)
	}

	// 登录页面（不需要认证）
	mux.HandleFunc("/login", s.handleLoginPage)

	// 静态文件服务（登录页面资源）
	if s.staticFS != nil {
		mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(s.staticFS))))
	}

	// 工作区消息代理接口
	mux.HandleFunc("/api/workspace/", s.handleWorkspaceMessage)
	mux.HandleFunc("/api/info", s.handleInfo)
	mux.HandleFunc("/api/execution-processes/", s.handleExecutionProcess)
	// 工作区已读状态代理接口
	mux.HandleFunc("/api/workspaces/", s.handleWorkspaces)

	// Issue 任务管理代理接口
	mux.HandleFunc("/api/issues/", s.handleIssues)
	mux.HandleFunc("/api/project-statuses", s.handleProjectStatuses)

	// Issue 关联工作区代理接口
	mux.HandleFunc("/api/issue-workspaces/", s.handleIssueWorkspaces)

	// 组织和项目代理接口
	mux.HandleFunc("/api/organizations", s.handleOrganizations)
	mux.HandleFunc("/api/projects", s.handleProjects)

	// 仓库列表代理接口
	mux.HandleFunc("/api/repos", s.handleRepos)

	// Agent 配置代理接口
	mux.HandleFunc("/api/agents/discovery", s.handleAgentDiscovery)
	mux.HandleFunc("/api/agents/preset-options", s.handleAgentPresetOptions)

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

// handleLoginPage 返回登录页面
func (s *Server) handleLoginPage(w http.ResponseWriter, r *http.Request) {
	// 如果已经登录，重定向到主页
	if s.jwtService != nil {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			if _, err := s.jwtService.ValidateToken(token); err == nil {
				http.Redirect(w, r, "/", http.StatusFound)
				return
			}
		}
		// 检查 cookie 中的 token
		if cookie, err := r.Cookie("auth_token"); err == nil {
			if _, err := s.jwtService.ValidateToken(cookie.Value); err == nil {
				http.Redirect(w, r, "/", http.StatusFound)
				return
			}
		}
	}

	// 尝试从嵌入的静态文件系统读取登录页面
	if s.staticFS != nil {
		content, err := fs.ReadFile(s.staticFS, "login.html")
		if err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(content)
			return
		}
	}

	// 如果没有静态文件系统，返回简单的登录页面
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, `<!DOCTYPE html><html><head><title>Login</title></head><body><h1>Login page not available</h1></body></html>`)
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
//   POST /api/workspace/{workspace_id}/dev-server
//   POST /api/workspace/{workspace_id}/frontend-port
//   GET /api/workspace/{workspace_id}/file-browser-path
//   DELETE /api/workspace/{workspace_id}/dev-server
func (s *Server) handleWorkspaceMessage(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/workspace/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || (parts[1] != "follow-up" && parts[1] != "message" && parts[1] != "queue" && parts[1] != "stop" && parts[1] != "dev-server" && parts[1] != "frontend-port" && parts[1] != "file-browser-path") {
		http.Error(w, "Invalid path. Expected: /api/workspace/{id}/message or /api/workspace/{id}/follow-up or /api/workspace/{id}/queue or /api/workspace/{id}/stop or /api/workspace/{id}/dev-server or /api/workspace/{id}/frontend-port or /api/workspace/{id}/file-browser-path", http.StatusBadRequest)
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
	if actionType == "dev-server" {
		s.handleWorkspaceDevServer(w, r, workspaceID)
		return
	}
	if actionType == "frontend-port" {
		s.handleWorkspaceFrontendPort(w, r, workspaceID)
		return
	}
	if actionType == "file-browser-path" {
		s.handleWorkspaceFileBrowserPath(w, r, workspaceID)
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

func (s *Server) handleWorkspaceFrontendPort(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !shouldAllocateFrontendPort(r) {
		s.handleWorkspaceFrontendPortLookup(w, r, workspaceID)
		return
	}

	allocator := s.portAllocator
	if allocator == nil {
		if s.store == nil {
			http.Error(w, "数据库未初始化", http.StatusInternalServerError)
			return
		}
		allocator = dispatchsvc.NewFrontendPortAllocator(s.store, isFrontendPortAvailable)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	frontendPort, backendPort, err := allocator.Allocate(ctx, workspaceID)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if errors.Is(err, dispatchsvc.ErrWorkspaceArchived) ||
			errors.Is(err, dispatchsvc.ErrFrontendPortPoolExhausted) ||
			errors.Is(err, dispatchsvc.ErrWorkspaceNotFound) ||
			strings.Contains(err.Error(), "端口池") ||
			strings.Contains(err.Error(), "已归档") ||
			strings.Contains(err.Error(), "not found") {
			statusCode = http.StatusConflict
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"workspace_id":  workspaceID,
			"frontend_port": frontendPort,
			"backend_port":  backendPort,
		},
	})
}

func (s *Server) handleWorkspaceFrontendPortLookup(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.store == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resolvedWorkspaceID, exists, err := s.store.ResolveWorkspaceID(ctx, workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, dispatchsvc.ErrWorkspaceNotFound.Error(), http.StatusConflict)
		return
	}

	frontendPort, archived, exists, err := s.store.GetWorkspaceFrontendPortState(ctx, resolvedWorkspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, dispatchsvc.ErrWorkspaceNotFound.Error(), http.StatusConflict)
		return
	}
	if archived {
		http.Error(w, dispatchsvc.ErrWorkspaceArchived.Error(), http.StatusConflict)
		return
	}
	if frontendPort == nil {
		http.Error(w, "workspace frontend port not assigned", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"workspace_id":  resolvedWorkspaceID,
			"frontend_port": *frontendPort,
			"backend_port":  *frontendPort + 10000,
		},
	})
}

func shouldAllocateFrontendPort(r *http.Request) bool {
	value := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("allocate")))
	return value == "1" || value == "true" || value == "yes"
}

func (s *Server) handleWorkspaceFileBrowserPath(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.store == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resolvedWorkspaceID, exists, err := s.store.ResolveWorkspaceID(ctx, workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, dispatchsvc.ErrWorkspaceNotFound.Error(), http.StatusConflict)
		return
	}

	workspace, err := s.store.GetWorkspaceByID(ctx, resolvedWorkspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if workspace == nil {
		http.Error(w, dispatchsvc.ErrWorkspaceNotFound.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"workspace_id": resolvedWorkspaceID,
			"path":         buildWorkspaceFileBrowserPath(workspace.Branch, resolvedWorkspaceID),
		},
	})
}

func isFrontendPortAvailable(port int) bool {
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = listener.Close()
	return true
}

func buildWorkspaceFileBrowserPath(branch string, workspaceID string) string {
	branchSlug := strings.TrimSpace(strings.TrimPrefix(branch, "vibe/"))
	if branchSlug == "" {
		branchSlug = workspaceID
	}
	return filepath.Join(defaultWorktreeBasePath, branchSlug, "kanban-watcher")
}

func (s *Server) handleWorkspaceDevServer(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method == http.MethodDelete {
		s.handleWorkspaceDevServerStop(w, r, workspaceID)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	processes, err := s.proxy.StartDevServer(ctx, workspaceID)
	if err != nil {
		log.Printf("[HTTP Server] 工作区 %s 启动 dev server 失败: %v", workspaceID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		} else {
			var businessErr *api.ProxyBusinessError
			if errors.As(err, &businessErr) {
				statusCode = http.StatusConflict
			}
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	for _, process := range processes {
		if err := s.persistDevServerProcess(ctx, workspaceID, process); err != nil {
			log.Printf("[HTTP Server] 工作区 %s 持久化 dev server process 失败: %v", workspaceID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":             true,
		"workspace_id":        workspaceID,
		"action":              "dev-server",
		"message":             "已触发 dev server 启动",
		"execution_processes": processes,
	})
}

func (s *Server) persistDevServerProcess(ctx context.Context, workspaceID string, process api.ExecutionProcessDetail) error {
	if s.store == nil || strings.TrimSpace(process.ID) == "" {
		return nil
	}

	runReason := process.RunReason
	if strings.TrimSpace(runReason) == "" {
		runReason = "dev_server"
	}
	status := strings.TrimSpace(process.Status)
	if status == "" {
		status = "running"
	}

	return s.store.UpsertExecutionProcess(ctx, &store.ExecutionProcess{
		ID:          process.ID,
		SessionID:   process.SessionID,
		WorkspaceID: workspaceID,
		RunReason:   runReason,
		Status:      status,
		Dropped:     false,
	})
}

func (s *Server) handleWorkspaceDevServerStop(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	processID := strings.TrimSpace(r.URL.Query().Get("process_id"))
	log.Printf("[HTTP Server] 收到停止 dev server 请求: method=%s path=%s workspace_id=%s process_id=%s", r.Method, r.URL.Path, workspaceID, processID)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if processID == "" {
		if s.store != nil {
			latestRunningProcess, err := s.store.GetLatestRunningDevServerProcessByWorkspaceID(ctx, workspaceID)
			if err != nil {
				log.Printf("[HTTP Server] 工作区 %s 查询运行中的 dev server process 失败: %v", workspaceID, err)
				http.Error(w, "查询运行中的 dev server process 失败", http.StatusInternalServerError)
				return
			}
			if latestRunningProcess != nil {
				processID = strings.TrimSpace(latestRunningProcess.ID)
				log.Printf("[HTTP Server] 工作区 %s 未显式提供 process_id，改用数据库中最近 running 的 dev server process: process_id=%s", workspaceID, processID)
			}
		}
		if processID == "" {
			err := "缺少运行中的 dev server process_id，且数据库中未找到可停止的 running dev server process"
			log.Printf("[HTTP Server] 工作区 %s 停止 dev server 失败: %s", workspaceID, err)
			http.Error(w, err, http.StatusConflict)
			return
		}
	}

	log.Printf("[HTTP Server] 工作区 %s 优先按 execution process 停止 dev server: process_id=%s", workspaceID, processID)

	process, err := s.proxy.GetExecutionProcess(ctx, processID)
	if err != nil {
		log.Printf("[HTTP Server] 工作区 %s 获取 dev server process 详情失败: %v", workspaceID, err)
		http.Error(w, "获取 dev server process 详情失败", http.StatusBadGateway)
		return
	}
	if process != nil {
		if err := s.persistDevServerProcess(ctx, workspaceID, *process); err != nil {
			log.Printf("[HTTP Server] 工作区 %s 同步 dev server process 状态失败: %v", workspaceID, err)
		}
		status := strings.TrimSpace(process.Status)
		if status != "running" {
			err := fmt.Sprintf("当前 dev server 进程状态为 %s，已拒绝继续停止；请刷新状态", status)
			log.Printf("[HTTP Server] 工作区 %s 停止 dev server 失败: %s", workspaceID, err)
			http.Error(w, err, http.StatusConflict)
			return
		}
	}

	err = s.proxy.StopExecutionProcess(ctx, processID)
	if err != nil {
		log.Printf("[HTTP Server] 工作区 %s 停止 dev server 失败: %v", workspaceID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		} else {
			var businessErr *api.ProxyBusinessError
			if errors.As(err, &businessErr) {
				statusCode = http.StatusConflict
			}
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	log.Printf("[HTTP Server] 工作区 %s 停止 dev server 已代理成功", workspaceID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"workspace_id": workspaceID,
		"action":       "dev-server-stop",
		"message":      "已停止 dev server",
	})
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	info, err := s.proxy.GetInfo(ctx)
	if err != nil {
		log.Printf("[HTTP Server] 获取系统信息失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"config": info.Config,
			"runtime": map[string]interface{}{
				"role": s.runtimeInfo.Role,
			},
			"realtime": map[string]interface{}{
				"enabled":  s.runtimeInfo.RealtimeEnabled,
				"base_url": s.runtimeInfo.RealtimeBaseURL,
			},
		},
	})
}

func (s *Server) HandleRealtimeUnavailable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	http.Error(w, "realtime disabled for worker role", http.StatusServiceUnavailable)
}

func (s *Server) handleExecutionProcess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	processID := strings.TrimPrefix(r.URL.Path, "/api/execution-processes/")
	if strings.TrimSpace(processID) == "" || strings.Contains(processID, "/") {
		http.Error(w, "Invalid path. Expected: /api/execution-processes/{id}", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	process, err := s.proxy.GetExecutionProcess(ctx, processID)
	if err != nil {
		log.Printf("[HTTP Server] 获取 execution process %s 失败: %v", processID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    process,
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

// authMiddleware API Key 和 JWT 双模式验证
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 0. 如果认证被禁用，直接放行
		if !s.authEnabled {
			next.ServeHTTP(w, r)
			return
		}

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

		// 3. 登录页面和静态资源不需要认证
		if r.URL.Path == "/login" || strings.HasPrefix(r.URL.Path, "/static/") {
			next.ServeHTTP(w, r)
			return
		}

		// 4. 尝试 X-API-Key 认证
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			apiKey = r.URL.Query().Get("api_key")
		}
		if apiKey != "" && apiKey == s.apiKey {
			next.ServeHTTP(w, r)
			return
		}

		// 5. 尝试 JWT Bearer Token 认证（Header）
		if s.jwtService != nil {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token := strings.TrimPrefix(authHeader, "Bearer ")
				if _, err := s.jwtService.ValidateToken(token); err == nil {
					next.ServeHTTP(w, r)
					return
				}
			}

			// 6. 尝试从 Cookie 中获取 JWT Token（用于浏览器页面访问）
			if cookie, err := r.Cookie("auth_token"); err == nil {
				if _, err := s.jwtService.ValidateToken(cookie.Value); err == nil {
					next.ServeHTTP(w, r)
					return
				}
			}
		}

		// 7. 认证失败
		// 对于 API 请求返回 JSON，对于页面请求重定向到登录页
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   "unauthorized",
			})
		} else {
			// 页面请求，重定向到登录页
			http.Redirect(w, r, "/login", http.StatusFound)
		}
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

// handleWorkspaces 处理 /api/workspaces/ 相关请求
// POST /api/workspaces/start - 创建并启动工作区
// PUT /api/workspaces/{id}/seen - 标记工作区为已读
// GET /api/workspaces/{id}/latest-messages - 获取工作区最新消息
// GET/POST /api/workspaces/{id}/todos - 待办事项列表
// PUT/DELETE /api/workspaces/{id}/todos/{todo_id} - 单个待办事项
func (s *Server) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
	parts := strings.SplitN(path, "/", 3)

	// POST /api/workspaces/start - 创建并启动工作区
	if path == "start" && r.Method == http.MethodPost {
		s.handleCreateAndStartWorkspace(w, r)
		return
	}

	// PUT /api/workspaces/{id}/seen
	if len(parts) == 2 && parts[1] == "seen" && r.Method == http.MethodPut {
		s.handleWorkspaceSeen(w, r, parts[0])
		return
	}

	// GET /api/workspaces/{id}/latest-messages
	if len(parts) == 2 && parts[1] == "latest-messages" && r.Method == http.MethodGet {
		api.HandleWorkspaceLatestMessages(w, r, s.store)
		return
	}

	// 待办事项路由
	if len(parts) >= 2 && parts[1] == "todos" {
		api.HandleWorkspaceTodos(w, r, s.store, parts[0], parts)
		return
	}

	// WebSocket 代理: /api/workspaces/{id}/git/diff/ws
	if len(parts) == 3 && parts[1] == "git" && parts[2] == "diff/ws" {
		s.handleGitDiffWsProxy(w, r, parts[0])
		return
	}

	http.Error(w, "Invalid path", http.StatusBadRequest)
}

// handleWorkspaceSeen 标记工作区为已读（代理到 vibe-kanban）
func (s *Server) handleWorkspaceSeen(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := s.proxy.MarkWorkspaceSeen(ctx, workspaceID); err != nil {
		log.Printf("[HTTP Server] 工作区 %s 标记已读失败: %v", workspaceID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	log.Printf("[HTTP Server] 工作区 %s 已标记为已读", workspaceID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"workspace_id": workspaceID,
	})
}

// handleCreateAndStartWorkspace 处理 POST /api/workspaces/start - 创建并启动工作区
func (s *Server) handleCreateAndStartWorkspace(w http.ResponseWriter, r *http.Request) {
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	// 解析请求体
	var req api.CreateAndStartWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("解析请求体失败: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[HTTP Server] 创建工作区请求: name=%s, linked_issue=%v", req.Name, req.LinkedIssue)

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	result, err := s.proxy.CreateAndStartWorkspace(ctx, &req)
	if err != nil {
		log.Printf("[HTTP Server] 创建工作区失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// handleIssues 处理 /api/issues/ 相关请求
//   GET  /api/issues/              - 查询任务列表
//   POST /api/issues/              - 创建任务
//   GET  /api/issues/{id}          - 获取单个任务
//   PATCH /api/issues/{id}         - 更新任务
//   DELETE /api/issues/{id}        - 删除任务
func (s *Server) handleIssues(w http.ResponseWriter, r *http.Request) {
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/issues/")
	path = strings.TrimSuffix(path, "/")

	// 空路径 → 列表或创建
	if path == "" {
		switch r.Method {
		case http.MethodGet:
			s.handleListIssues(w, r)
		case http.MethodPost:
			s.handleCreateIssue(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	// 非空路径 → 单个任务 CRUD
	issueID := path
	switch r.Method {
	case http.MethodGet:
		s.handleGetIssue(w, r, issueID)
	case http.MethodPatch:
		s.handleUpdateIssue(w, r, issueID)
	case http.MethodDelete:
		s.handleDeleteIssue(w, r, issueID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleListIssues(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		projectID = s.projectID
	}
	if projectID == "" {
		http.Error(w, "缺少 project_id 参数", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	issues, err := s.proxy.ListIssues(ctx, projectID)
	if err != nil {
		log.Printf("[HTTP Server] 查询任务列表失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    issues,
	})
}

func (s *Server) handleCreateIssue(w http.ResponseWriter, r *http.Request) {
	var payload api.CreateIssuePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	// 如果请求体未指定 project_id，使用配置的默认值
	if payload.ProjectID == "" {
		payload.ProjectID = s.projectID
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	issue, err := s.proxy.CreateIssue(ctx, payload)
	if err != nil {
		log.Printf("[HTTP Server] 创建任务失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    issue,
	})
}

func (s *Server) handleGetIssue(w http.ResponseWriter, r *http.Request, issueID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	issue, err := s.proxy.GetIssue(ctx, issueID)
	if err != nil {
		log.Printf("[HTTP Server] 获取任务 %s 失败: %v", issueID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    issue,
	})
}

func (s *Server) handleUpdateIssue(w http.ResponseWriter, r *http.Request, issueID string) {
	var payload api.UpdateIssuePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	issue, err := s.proxy.UpdateIssue(ctx, issueID, payload)
	if err != nil {
		log.Printf("[HTTP Server] 更新任务 %s 失败: %v", issueID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    issue,
	})
}

func (s *Server) handleDeleteIssue(w http.ResponseWriter, r *http.Request, issueID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	err := s.proxy.DeleteIssue(ctx, issueID)
	if err != nil {
		log.Printf("[HTTP Server] 删除任务 %s 失败: %v", issueID, err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// handleIssueWorkspaces 处理 /api/issue-workspaces/{id} 请求
// GET /api/issue-workspaces/{id} - 查询指定 Issue 关联的工作区列表
func (s *Server) handleIssueWorkspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 提取 issue ID
	path := strings.TrimPrefix(r.URL.Path, "/api/issue-workspaces/")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		http.Error(w, "Missing issue ID", http.StatusBadRequest)
		return
	}
	issueID := path

	// 优先从本地数据库查询
	if s.store != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		workspaces, err := s.store.ListWorkspacesByIssueID(ctx, issueID)
		if err != nil {
			log.Printf("[HTTP Server] 本地查询工作区失败: %v", err)
		} else if len(workspaces) > 0 {
			s.writeIssueWorkspaces(w, workspaces)
			return
		}

		// 本地数据库为空时，按需同步 issue_id（worker 模式下同步服务未启动）
		if s.apiClient != nil {
			s.syncIssueIDsIfNeeded(ctx)
			// 同步后重试查询
			workspaces, err = s.store.ListWorkspacesByIssueID(ctx, issueID)
			if err == nil && len(workspaces) > 0 {
				s.writeIssueWorkspaces(w, workspaces)
				return
			}
		}
	}

	// 降级：数据库不可用时返回空结果
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"workspaces": []api.RemoteWorkspace{},
	})
}

// writeIssueWorkspaces 将本地工作区列表转换为前端格式并写入响应
func (s *Server) writeIssueWorkspaces(w http.ResponseWriter, workspaces []*store.Workspace) {
	result := make([]api.RemoteWorkspace, 0, len(workspaces))
	for _, ws := range workspaces {
		name := ws.Name
		if name == "" {
			name = ws.Branch
		}
		result = append(result, api.RemoteWorkspace{
			ID:           ws.ID,
			Name:         &name,
			IssueID:      ws.IssueID,
			Archived:     ws.Archived,
			FilesChanged: ptrInt(ws.FilesChanged),
			LinesAdded:   ptrInt(ws.LinesAdded),
			LinesRemoved: ptrInt(ws.LinesRemoved),
			CreatedAt:    formatTimePtr(ws.CreatedAt),
			UpdatedAt:    formatTimePtr(ws.UpdatedAt),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"workspaces": result,
	})
}

// syncIssueIDsIfNeeded 按需同步 issue_id（仅同步空 issue_id 的工作区）
// 使用 sync.Once 确保整个进程生命周期内只同步一次
var syncIssueIDsOnce sync.Once

func (s *Server) syncIssueIDsIfNeeded(ctx context.Context) {
	syncIssueIDsOnce.Do(func() {
		ids, err := s.store.ListWorkspaceIDsWithNullIssueID(ctx)
		if err != nil || len(ids) == 0 {
			return
		}
		const maxSync = 20
		if len(ids) > maxSync {
			ids = ids[:maxSync]
		}
		for _, id := range ids {
			issueID, err := s.apiClient.FetchWorkspaceIssueID(ctx, id)
			if err != nil {
				log.Printf("[HTTP Server] 同步 issue_id 失败 workspace=%s err=%v", id, err)
				continue
			}
			if err := s.store.UpdateWorkspaceIssueID(ctx, id, issueID); err != nil {
				log.Printf("[HTTP Server] 更新 issue_id 失败 workspace=%s err=%v", id, err)
			}
		}
	})
}

// handleProjectStatuses 处理 GET /api/project-statuses
func (s *Server) handleProjectStatuses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		projectID = s.projectID
	}
	if projectID == "" {
		http.Error(w, "缺少 project_id 参数", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	statuses, err := s.proxy.ListProjectStatuses(ctx, projectID)
	if err != nil {
		log.Printf("[HTTP Server] 查询项目状态失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    statuses,
	})
}

// handleOrganizations 处理 GET /api/organizations
func (s *Server) handleOrganizations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	orgs, err := s.proxy.ListOrganizations(ctx)
	if err != nil {
		log.Printf("[HTTP Server] 查询组织列表失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    orgs,
	})
}

// handleProjects 处理 GET /api/projects
func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	orgID := r.URL.Query().Get("organization_id")
	if orgID == "" {
		http.Error(w, "缺少 organization_id 参数", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	projects, err := s.proxy.ListProjects(ctx, orgID)
	if err != nil {
		log.Printf("[HTTP Server] 查询项目列表失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    projects,
	})
}

// handleRepos 处理 GET /api/repos
func (s *Server) handleRepos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	repos, err := s.proxy.ListRepos(ctx)
	if err != nil {
		log.Printf("[HTTP Server] 查询仓库列表失败: %v", err)
		statusCode := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, err.Error(), statusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(repos)
}

func ptrInt(v int) *int {
	return &v
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

// handleGitDiffWsProxy 将前端 WebSocket 连接代理到主后端的 git diff 流
func (s *Server) handleGitDiffWsProxy(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if s.proxy == nil {
		http.Error(w, "代理客户端未初始化", http.StatusInternalServerError)
		return
	}

	backendURL := strings.Replace(s.proxy.BaseURL(), "http://", "ws://", 1)
	backendURL = strings.Replace(backendURL, "https://", "wss://", 1)
	targetURL := fmt.Sprintf("%s/api/workspaces/%s/git/diff/ws", backendURL, workspaceID)

	log.Printf("[WS Proxy] 代理 git diff ws: workspace=%s target=%s", workspaceID, targetURL)

	// 升级前端 WebSocket 连接
	upgrader := gorillaws.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS Proxy] 升级前端连接失败: %v", err)
		return
	}
	defer clientConn.Close()

	// 连接后端 WebSocket
	backendConn, _, err := gorillaws.DefaultDialer.Dial(targetURL, nil)
	if err != nil {
		log.Printf("[WS Proxy] 连接后端失败: %v", err)
		clientConn.WriteMessage(gorillaws.CloseMessage, gorillaws.FormatCloseMessage(
			gorillaws.CloseInternalServerErr, "backend connection failed"))
		return
	}
	defer backendConn.Close()

	log.Printf("[WS Proxy] 连接建立: workspace=%s", workspaceID)

	// 双向转发
	errCh := make(chan error, 2)

	// 前端 -> 后端
	go func() {
		for {
			msgType, msg, err := clientConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := backendConn.WriteMessage(msgType, msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	// 后端 -> 前端
	go func() {
		for {
			msgType, msg, err := backendConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	// 等待任一方向断开
	<-errCh
	log.Printf("[WS Proxy] 连接关闭: workspace=%s", workspaceID)
}

// AgentDiscoveryResponse Agent 发现响应
 type AgentDiscoveryResponse struct {
 	Success bool              `json:"success"`
 	Data    AgentDiscoveryData `json:"data"`
 }

 type AgentDiscoveryData struct {
 	Models  []AgentModel `json:"models"`
 	Presets []string      `json:"presets"`
 }

 type AgentModel struct {
 	ID       string `json:"id"`
 	Name     string `json:"name"`
 	Provider string `json:"provider"`
 }

 // AgentPresetOptionsResponse 预设选项响应
 type AgentPresetOptionsResponse struct {
 	Success bool                `json:"success"`
 	Data    AgentPresetOptions  `json:"data"`
 }

 type AgentPresetOptions struct {
 	ModelID          string  `json:"model_id,omitempty"`
 	PermissionPolicy string  `json:"permission_policy,omitempty"`
 	Variant          *string `json:"variant,omitempty"`
 }

 // handleAgentDiscovery 处理 /api/agents/discovery 请求
 func (s *Server) handleAgentDiscovery(w http.ResponseWriter, r *http.Request) {
 	if r.Method != http.MethodGet {
 		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
 		return
 	}

 	executor := r.URL.Query().Get("executor")
 	if executor == "" {
 		http.Error(w, "Missing executor parameter", http.StatusBadRequest)
 		return
 	}

 	log.Printf("[AgentDiscovery] 获取 Agent 配置: executor=%s", executor)

 	// 根据 Agent 类型返回对应的配置
 	// 这里硬编码配置，实际可以从配置文件或数据库中获取
 	var data AgentDiscoveryData

 	switch executor {
 	case "CLAUDE_CODE":
 		data = AgentDiscoveryData{
 			Presets: []string{"DEFAULT", "PLAN", "ROUTER", "zhipu", "minimax"},
 			Models: []AgentModel{
 				{ID: "anthropic/claude-sonnet-4", Name: "Claude Sonnet 4", Provider: "anthropic"},
 				{ID: "anthropic/claude-opus-4", Name: "Claude Opus 4", Provider: "anthropic"},
 				{ID: "zhipu/glm-4-plus", Name: "GLM-4 Plus", Provider: "zhipu"},
 				{ID: "zhipu/glm-4-flash", Name: "GLM-4 Flash", Provider: "zhipu"},
 				{ID: "minimax/minimax-text-01", Name: "MiniMax Text", Provider: "minimax"},
 			},
 		}
 	case "CODEX":
 		data = AgentDiscoveryData{
 			Presets: []string{"DEFAULT", "PLAN"},
 			Models: []AgentModel{
 				{ID: "openai/gpt-4o", Name: "GPT-4o", Provider: "openai"},
 				{ID: "openai/gpt-4o-mini", Name: "GPT-4o Mini", Provider: "openai"},
 			},
 		}
 	case "GEMINI":
 		data = AgentDiscoveryData{
 			Presets: []string{"DEFAULT"},
 			Models: []AgentModel{
 				{ID: "google/gemini-1.5-pro", Name: "Gemini 1.5 Pro", Provider: "google"},
 				{ID: "google/gemini-1.5-flash", Name: "Gemini 1.5 Flash", Provider: "google"},
 			},
 		}
 	case "QWEN_CODE":
 		data = AgentDiscoveryData{
 			Presets: []string{"DEFAULT"},
 			Models: []AgentModel{
 				{ID: "aliyun/qwen-2.5-72b", Name: "Qwen 2.5 72B", Provider: "aliyun"},
 				{ID: "aliyun/qwen-2.5-32b", Name: "Qwen 2.5 32B", Provider: "aliyun"},
 				{ID: "zhipu/glm-4-plus", Name: "GLM-4 Plus", Provider: "zhipu"},
 				{ID: "minimax/minimax-text-01", Name: "MiniMax Text", Provider: "minimax"},
 			},
 		}
 	default:
 		// 其他 Agent 使用默认配置
 		data = AgentDiscoveryData{
 			Presets: []string{"DEFAULT"},
 			Models: []AgentModel{
 				{ID: "anthropic/claude-sonnet-4", Name: "Claude Sonnet 4", Provider: "anthropic"},
 				{ID: "zhipu/glm-4-plus", Name: "GLM-4 Plus", Provider: "zhipu"},
 				{ID: "minimax/minimax-text-01", Name: "MiniMax Text", Provider: "minimax"},
 			},
 		}
 	}

 	response := AgentDiscoveryResponse{
 		Success: true,
 		Data:    data,
 	}

 	w.Header().Set("Content-Type", "application/json")
 	json.NewEncoder(w).Encode(response)
 }

 // handleAgentPresetOptions 处理 /api/agents/preset-options 请求
 func (s *Server) handleAgentPresetOptions(w http.ResponseWriter, r *http.Request) {
 	if r.Method != http.MethodGet {
 		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
 		return
 	}

 	executor := r.URL.Query().Get("executor")
 	variant := r.URL.Query().Get("variant")

 	if executor == "" {
 		http.Error(w, "Missing executor parameter", http.StatusBadRequest)
 		return
 	}

 	log.Printf("[AgentPresetOptions] 获取预设配置: executor=%s, variant=%s", executor, variant)

 	// 根据预设返回对应的配置
 	options := AgentPresetOptions{}

 	switch variant {
 	case "PLAN":
 		options.ModelID = "anthropic/claude-opus-4"
 		options.PermissionPolicy = "plan"
 	case "ROUTER":
 		options.ModelID = "anthropic/claude-sonnet-4"
 		options.PermissionPolicy = "auto"
 	case "zhipu":
 		options.ModelID = "zhipu/glm-4-plus"
 		options.PermissionPolicy = "auto"
 	defaultVariant := "DEFAULT"
 	options.Variant = &defaultVariant
 	case "minimax":
 		options.ModelID = "minimax/minimax-text-01"
 		options.PermissionPolicy = "auto"
 	defaultVariant := "DEFAULT"
 	options.Variant = &defaultVariant
 	default:
 		// DEFAULT
 		options.ModelID = "anthropic/claude-sonnet-4"
 		options.PermissionPolicy = "auto"
 	}

 	// 特定 Agent 的覆盖
 	if executor == "QWEN_CODE" {
 		options.ModelID = "aliyun/qwen-2.5-72b"
 	}

 	response := AgentPresetOptionsResponse{
 		Success: true,
 		Data:    options,
 	}

 	w.Header().Set("Content-Type", "application/json")
 	json.NewEncoder(w).Encode(response)
 }
