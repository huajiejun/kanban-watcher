package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// MessageResponse 消息响应结构
type MessageResponse struct {
	ID         int64                  `json:"id"`
	SessionID  string                 `json:"session_id"`
	ProcessID  string                 `json:"process_id,omitempty"`
	EntryIndex int                    `json:"entry_index"`
	EntryType  string                 `json:"entry_type"`
	Role       string                 `json:"role"`
	Content    string                 `json:"content"`
	ToolInfo   map[string]interface{} `json:"tool_info,omitempty"`
	Timestamp  string                 `json:"timestamp"`
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

type WorkspaceViewResponse struct {
	OpenWorkspaceIDs      []string `json:"open_workspace_ids"`
	ActiveWorkspaceID     string   `json:"active_workspace_id,omitempty"`
	DismissedAttentionIDs []string `json:"dismissed_attention_ids"`
	Version               int64    `json:"version,omitempty"`
	UpdatedAt             string   `json:"updated_at,omitempty"`
}

type workspaceViewRequest struct {
	OpenWorkspaceIDs      []string `json:"open_workspace_ids"`
	ActiveWorkspaceID     string   `json:"active_workspace_id"`
	DismissedAttentionIDs []string `json:"dismissed_attention_ids"`
}

// LocalWorkspaceSummary 本地数据库中的工作区摘要
type LocalWorkspaceSummary struct {
	ID                       string `json:"id"`
	Name                     string `json:"name"`
	Branch                   string `json:"branch"`
	LatestSessionID          string `json:"latest_session_id,omitempty"`
	Status                   string `json:"status"`
	HasPendingApproval       bool   `json:"has_pending_approval"`
	HasUnseenTurns           bool   `json:"has_unseen_turns"`
	HasRunningDevServer      bool   `json:"has_running_dev_server"`
	FilesChanged             int    `json:"files_changed"`
	LinesAdded               int    `json:"lines_added"`
	LinesRemoved             int    `json:"lines_removed"`
	UpdatedAt                string `json:"updated_at,omitempty"`
	MessageCount             int    `json:"message_count"`
	LastMessageAt            string `json:"last_message_at,omitempty"`
	LatestProcessCompletedAt string `json:"latest_process_completed_at,omitempty"`
	MenuSummary              string `json:"menu_summary,omitempty"`
}

// GetMessageRoutes 注册消息 API 路由
func GetMessageRoutes(dbStore *store.Store, publishers ...*RealtimePublisher) map[string]http.HandlerFunc {
	var realtimePublisher *RealtimePublisher
	if len(publishers) > 0 {
		realtimePublisher = publishers[0]
	}
	return map[string]http.HandlerFunc{
		"/api/sessions/": func(w http.ResponseWriter, r *http.Request) {
			handleSessionMessages(w, r, dbStore)
		},
		"/api/workspace-view": func(w http.ResponseWriter, r *http.Request) {
			handleWorkspaceView(w, r, dbStore, realtimePublisher)
		},
		"/api/workspaces/active": func(w http.ResponseWriter, r *http.Request) {
			handleActiveWorkspaces(w, r, dbStore)
		},
		"/api/workspaces/": func(w http.ResponseWriter, r *http.Request) {
			handleWorkspaceLatestMessages(w, r, dbStore)
		},
	}
}

func handleWorkspaceView(
	w http.ResponseWriter,
	r *http.Request,
	dbStore *store.Store,
	realtimePublisher *RealtimePublisher,
) {
	if dbStore == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		view, err := dbStore.GetWorkspaceView(r.Context(), "global")
		if err != nil {
			http.Error(w, "获取工作区布局失败", http.StatusInternalServerError)
			return
		}
		writeJSON(w, toWorkspaceViewResponse(view))
	case http.MethodPut:
		var req workspaceViewRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		openWorkspaceIDsJSON, err := json.Marshal(req.OpenWorkspaceIDs)
		if err != nil {
			http.Error(w, "序列化布局失败", http.StatusInternalServerError)
			return
		}
		dismissedAttentionIDsJSON, err := json.Marshal(req.DismissedAttentionIDs)
		if err != nil {
			http.Error(w, "序列化布局失败", http.StatusInternalServerError)
			return
		}

		view := &store.WorkspaceView{
			ScopeKey:                  "global",
			OpenWorkspaceIDsJSON:      string(openWorkspaceIDsJSON),
			DismissedAttentionIDsJSON: string(dismissedAttentionIDsJSON),
			UpdatedAt:                 time.Now(),
		}
		if req.ActiveWorkspaceID != "" {
			view.ActiveWorkspaceID = &req.ActiveWorkspaceID
		}

		if err := dbStore.UpsertWorkspaceView(r.Context(), view); err != nil {
			http.Error(w, "保存工作区布局失败", http.StatusInternalServerError)
			return
		}
		if realtimePublisher != nil {
			if err := realtimePublisher.PublishWorkspaceViewUpdated(view); err != nil {
				http.Error(w, "广播工作区布局失败", http.StatusInternalServerError)
				return
			}
		}
		writeJSON(w, toWorkspaceViewResponse(view))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func toWorkspaceViewResponse(view *store.WorkspaceView) WorkspaceViewResponse {
	if view == nil {
		return WorkspaceViewResponse{
			OpenWorkspaceIDs:      []string{},
			DismissedAttentionIDs: []string{},
		}
	}

	resp := WorkspaceViewResponse{
		OpenWorkspaceIDs:      []string{},
		DismissedAttentionIDs: []string{},
		Version:               view.Version,
	}
	_ = json.Unmarshal([]byte(view.OpenWorkspaceIDsJSON), &resp.OpenWorkspaceIDs)
	_ = json.Unmarshal([]byte(view.DismissedAttentionIDsJSON), &resp.DismissedAttentionIDs)
	if view.ActiveWorkspaceID != nil {
		resp.ActiveWorkspaceID = *view.ActiveWorkspaceID
	}
	resp.UpdatedAt = view.UpdatedAt.Format(time.RFC3339Nano)
	return resp
}

func handleActiveWorkspaces(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if dbStore == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	summaries, err := dbStore.GetActiveWorkspaceSummaries(r.Context())
	if err != nil {
		http.Error(w, "获取工作区失败", http.StatusInternalServerError)
		return
	}

	resp := ActiveWorkspaceResponse{
		Workspaces: make([]LocalWorkspaceSummary, 0, len(summaries)),
	}

	for _, summary := range summaries {
		item := LocalWorkspaceSummary{
			ID:                  summary.ID,
			Name:                summary.Name,
			Branch:              summary.Branch,
			Status:              summary.Status,
			HasPendingApproval:  summary.HasPendingApproval,
			HasUnseenTurns:      summary.HasUnseenTurns,
			HasRunningDevServer: summary.HasRunningDevServer,
			FilesChanged:        summary.FilesChanged,
			LinesAdded:          summary.LinesAdded,
			LinesRemoved:        summary.LinesRemoved,
			MessageCount:        summary.MessageCount,
			MenuSummary:         buildLocalMenuSummary(summary),
		}
		if summary.LatestSessionID != nil {
			item.LatestSessionID = *summary.LatestSessionID
		}
		if summary.UpdatedAt != nil {
			item.UpdatedAt = summary.UpdatedAt.Format(time.RFC3339)
		}
		if summary.LastMessageAt != nil {
			item.LastMessageAt = summary.LastMessageAt.Format(time.RFC3339)
		}
		if summary.LatestProcessCompletedAt != nil {
			item.LatestProcessCompletedAt = summary.LatestProcessCompletedAt.Format(time.RFC3339)
		}
		resp.Workspaces = append(resp.Workspaces, item)
	}

	writeJSON(w, resp)
}

func buildLocalMenuSummary(summary store.ActiveWorkspaceSummary) string {
	text, _ := BuildLocalMenuSummary(summary)
	return text
}

func BuildLocalMenuSummary(summary store.ActiveWorkspaceSummary) (string, string) {
	switch {
	case summary.HasPendingApproval:
		return "待审批：等待你确认下一步", "reason"
	case summary.Status == "failed":
		return "运行失败：请检查最新日志", "reason"
	}

	if summary.LastMessage != nil {
		if cleaned := cleanMenuSummary(*summary.LastMessage); cleaned != "" {
			return cleaned, "last_message"
		}
	}
	if summary.HasUnseenTurns {
		return "未读消息：请查看最新回复", "reason"
	}
	return "", "empty"
}

func handleWorkspaceLatestMessages(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if dbStore == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "latest-messages" {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	workspace, err := dbStore.GetWorkspaceByID(r.Context(), parts[0])
	if err != nil {
		http.Error(w, "获取工作区失败", http.StatusInternalServerError)
		return
	}
	if workspace == nil || workspace.LatestSessionID == nil || *workspace.LatestSessionID == "" {
		http.Error(w, "工作区没有可用 session", http.StatusNotFound)
		return
	}

	getSessionMessagesInternal(w, r, dbStore, *workspace.LatestSessionID, workspace.Name)
}

func handleSessionMessages(w http.ResponseWriter, r *http.Request, dbStore *store.Store) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if dbStore == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "messages" {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	var workspaceName string
	if ws, _ := dbStore.GetWorkspaceBySessionID(r.Context(), parts[0]); ws != nil {
		workspaceName = ws.Name
	}

	getSessionMessagesInternal(w, r, dbStore, parts[0], workspaceName)
}

func getSessionMessagesInternal(w http.ResponseWriter, r *http.Request, dbStore *store.Store, sessionID, workspaceName string) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			if parsed > 200 {
				parsed = 200
			}
			limit = parsed
		}
	}

	var before time.Time
	if raw := r.URL.Query().Get("before"); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			before = parsed
		}
	}

	types := parseTypesFilter(r.URL.Query().Get("types"))
	entries, err := dbStore.GetSessionMessages(r.Context(), sessionID, limit, before, types)
	if err != nil {
		http.Error(w, "获取消息失败", http.StatusInternalServerError)
		return
	}

	hasMore := len(entries) == limit
	reverseMessages(entries)

	resp := SessionMessagesResponse{
		SessionID:     sessionID,
		WorkspaceName: workspaceName,
		Messages:      make([]MessageResponse, 0, len(entries)),
		HasMore:       hasMore,
	}

	for _, entry := range entries {
		item := MessageResponse{
			ID:         entry.ID,
			SessionID:  entry.SessionID,
			ProcessID:  entry.ProcessID,
			EntryIndex: entry.EntryIndex,
			EntryType:  entry.EntryType,
			Role:       entry.Role,
			Content:    entry.Content,
			Timestamp:  entry.EntryTimestamp.Format(time.RFC3339Nano),
		}
		if info := buildToolInfo(entry); len(info) > 0 {
			item.ToolInfo = info
		}
		resp.Messages = append(resp.Messages, item)
	}

	writeJSON(w, resp)
}

func buildToolInfo(entry store.ProcessEntry) map[string]interface{} {
	info := map[string]interface{}{}
	if entry.ToolName != nil && *entry.ToolName != "" {
		info["tool_name"] = *entry.ToolName
	}
	if entry.ActionTypeJSON != nil && *entry.ActionTypeJSON != "" {
		var action interface{}
		if json.Unmarshal([]byte(*entry.ActionTypeJSON), &action) == nil {
			info["action_type"] = action
		}
	}
	if entry.StatusJSON != nil && *entry.StatusJSON != "" {
		var status interface{}
		if json.Unmarshal([]byte(*entry.StatusJSON), &status) == nil {
			info["status"] = status
		}
	}
	if len(info) == 0 {
		return nil
	}
	return info
}

func parseTypesFilter(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func reverseMessages(entries []store.ProcessEntry) {
	for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
		entries[i], entries[j] = entries[j], entries[i]
	}
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
