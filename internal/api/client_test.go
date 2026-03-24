package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchAllBuildsMenuSummaryFromWorkspaceAndSummary(t *testing.T) {
	lastMessage := "这里是最近一条消息"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/workspaces":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"data": []map[string]interface{}{
					{
						"id":           "ws-1",
						"branch":       "main",
						"archived":     false,
						"pinned":       false,
						"created_at":   "2026-03-24T10:00:00Z",
						"updated_at":   "2026-03-24T10:00:00Z",
						"last_message": lastMessage,
					},
				},
			})
		case "/api/workspaces/summaries":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"data": map[string]interface{}{
					"summaries": []map[string]interface{}{
						{
							"workspace_id":           "ws-1",
							"has_pending_approval":   false,
							"has_unseen_turns":       false,
							"has_running_dev_server": false,
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	workspaces, err := client.FetchAll(context.Background())
	if err != nil {
		t.Fatalf("FetchAll 返回错误: %v", err)
	}
	if len(workspaces) != 1 {
		t.Fatalf("len(workspaces) = %d, want 1", len(workspaces))
	}
	if workspaces[0].MenuSummary != lastMessage {
		t.Fatalf("menu summary = %q, want %q", workspaces[0].MenuSummary, lastMessage)
	}
	if workspaces[0].MenuSummaryBy != "last_message" {
		t.Fatalf("menu summary by = %q, want last_message", workspaces[0].MenuSummaryBy)
	}
}

func TestFetchAllPrefersReasonSummary(t *testing.T) {
	lastMessage := "这里是最近一条消息"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/workspaces":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"data": []map[string]interface{}{
					{
						"id":           "ws-1",
						"branch":       "main",
						"archived":     false,
						"pinned":       false,
						"created_at":   "2026-03-24T10:00:00Z",
						"updated_at":   "2026-03-24T10:00:00Z",
						"last_message": lastMessage,
					},
				},
			})
		case "/api/workspaces/summaries":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"data": map[string]interface{}{
					"summaries": []map[string]interface{}{
						{
							"workspace_id":         "ws-1",
							"has_pending_approval": true,
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	workspaces, err := client.FetchAll(context.Background())
	if err != nil {
		t.Fatalf("FetchAll 返回错误: %v", err)
	}
	if got := workspaces[0].MenuSummary; got != "待审批：等待你确认下一步" {
		t.Fatalf("menu summary = %q", got)
	}
	if got := workspaces[0].MenuSummaryBy; got != "reason" {
		t.Fatalf("menu summary by = %q, want reason", got)
	}
}
