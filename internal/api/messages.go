package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// MessageResponse 消息响应结构
type MessageResponse struct {
	ID         int64  `json:"id"`
	SessionID  string `json:"session_id"`
	ProcessID  string `json:"process_id,omitempty"`
	EntryType  string `json:"entry_type"`
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolInfo   string `json:"tool_info,omitempty"`
	Timestamp  string `json:"timestamp"`
}

// SessionMessagesResponse 会话消息响应
type SessionMessagesResponse struct {
	SessionID     string            `json:"session_id"`
	WorkspaceName string            `json:"workspace_name,omitempty"`
	Messages      []MessageResponse `json:"messages"`
	HasMore       bool              `json:"has_more"`
}

// ActiveWorkspaceResponse 活跃工作区响应
type ActiveWorkspaceResponse struct {
	Workspaces []LocalWorkspaceSummary `json:"workspaces"`
}

// LocalWorkspaceSummary 本地数据库中的工作区摘要
type LocalWorkspaceSummary struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Branch          string `json:"branch"`
	LatestSessionID string `json:"latest_session_id,omitempty"`
	Status          string `json:"status"`
	UpdatedAt       string `json:"updated_at"`
	MessageCount    int    `json:"message_count"`
}

// GetMessageRoutes 注册消息 API 路由
// 返回路由模式和处理函数的列表，供 server 注册
func GetMessageRoutes(dbStore *store.Store) map[string]http.HandlerFunc {
	return map[string]http.HandlerFunc{
		"/api/sessions/": func(w http.ResponseWriter, r *http.Request) {
			handleSessionMessages(w, r, dbStore)
		},
		"/api/workspaces/active": func(w http.ResponseWriter, r *http.Request) {
			handleActiveWorkspaces(w, r, dbStore)
		},
		"/api/workspaces/": func(w http.ResponseWriter, r *http.Request) {
			handleWorkspaceLatestMessages(w, r, dbStore)
		},
	}
}

// handleActiveWorkspaces 获取活跃工作区列表
func handleActiveWorkspaces(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()

	workspaces, err := dbStore.GetActiveWorkspaces(ctx)
	if err != nil {
		http.Error(w, "获取工作区失败", http.StatusInternalServerError)
		return
	}

	response := ActiveWorkspaceResponse{
		Workspaces: make([]LocalWorkspaceSummary, len(workspaces)),
	}

	for i := range workspaces {
		// 获取每个工作区的消息数量
		count, _ := getMessageCount(ctx, dbStore, workspaces[i].ID)

		latestSessionID := ""
		if workspaces[i].LatestSessionID != nil {
			latestSessionID = *workspaces[i].LatestSessionID
		}

		response.Workspaces[i] = LocalWorkspaceSummary{
			ID:              workspaces[i].ID,
			Name:            workspaces[i].Name,
			Branch:          workspaces[i].Branch,
			LatestSessionID: latestSessionID,
			Status:          "active",
			UpdatedAt:       workspaces[i].UpdatedAt.Format(time.RFC3339),
			MessageCount:    count,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleWorkspaceLatestMessages 获取工作区最新消息
func handleWorkspaceLatestMessages(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析 URL: /api/workspaces/{workspace_id}/latest-messages
	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "latest-messages" {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	workspaceID := parts[0]

	ctx := r.Context()

	// 获取工作区信息
	workspace, err := dbStore.GetWorkspaceByID(ctx, workspaceID)
	if err != nil || workspace == nil {
		http.Error(w, "工作区不存在", http.StatusNotFound)
		return
	}

	// 获取最新 session
	if workspace.LatestSessionID == nil || *workspace.LatestSessionID == "" {
		http.Error(w, "工作区没有活跃的 session", http.StatusNotFound)
		return
	}

	getSessionMessagesInternal(w, r, dbStore, *workspace.LatestSessionID, workspace.Name)
}

// handleSessionMessages 获取会话消息
func handleSessionMessages(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析 URL: /api/sessions/{session_id}/messages
	path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "messages" {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	sessionID := parts[0]

	ctx := r.Context()

	// 可选：获取 workspace 名称
	var workspaceName string
	if ws, _ := dbStore.GetWorkspaceBySessionID(ctx, sessionID); ws != nil {
		workspaceName = ws.Name
	}

	getSessionMessagesInternal(w, r, dbStore, sessionID, workspaceName)
}

// getSessionMessagesInternal 获取会话消息的内部实现
func getSessionMessagesInternal(w http.ResponseWriter, r *http.Request, dbStore *store.Store, sessionID, workspaceName string) {
	ctx := r.Context()

	// 解析查询参数
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	var before time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := time.Parse(time.RFC3339, b); err == nil {
			before = parsed
		}
	}

	// 获取消息
	messages, err := dbStore.GetSessionMessages(ctx, sessionID, limit, before)
	if err != nil {
		http.Error(w, "获取消息失败", http.StatusInternalServerError)
		return
	}

	// 转换为响应格式
	response := SessionMessagesResponse{
		SessionID:     sessionID,
		WorkspaceName: workspaceName,
		Messages:      make([]MessageResponse, len(messages)),
		HasMore:       len(messages) == limit,
	}

	for i := range messages {
		response.Messages[i] = MessageResponse{
			ID:         messages[i].ID,
			SessionID:  messages[i].SessionID,
			EntryType:  messages[i].EntryType,
			Role:       store.ToRole(messages[i].EntryType),
			Content:    messages[i].Content,
			Timestamp:  messages[i].Timestamp.Format(time.RFC3339),
		}
		if messages[i].ProcessID != nil {
			response.Messages[i].ProcessID = *messages[i].ProcessID
		}
		if messages[i].ToolInfo != "" {
			response.Messages[i].ToolInfo = messages[i].ToolInfo
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getMessageCount 获取工作区的消息数量
func getMessageCount(ctx context.Context, dbStore *store.Store, workspaceID string) (int, error) {
	// 这里需要实现获取工作区消息数量的逻辑
	// 由于 store 没有这个方法，暂时返回 0
	return 0, nil
}
