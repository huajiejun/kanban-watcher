package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestProxyClientUsesInsecureTLSForFollowUp(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sessions/session-1/follow-up" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	err := client.SendFollowUpWithContext(context.Background(), "session-1", "继续处理", testProxyMessageContext())
	if err != nil {
		t.Fatalf("SendFollowUpWithContext 返回错误: %v", err)
	}
}

func TestProxyClientUsesInsecureTLSForQueue(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sessions/session-1/queue" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	err := client.QueueMessageWithContext(context.Background(), "session-1", "稍后补测试", testProxyMessageContext())
	if err != nil {
		t.Fatalf("QueueMessageWithContext 返回错误: %v", err)
	}
}

func TestProxyClientFetchQueueStatus(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sessions/session-1/queue" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"status": "queued",
				"message": map[string]interface{}{
					"session_id": "session-1",
					"queued_at":  "2026-03-24T10:00:00Z",
					"data": map[string]interface{}{
						"message": "运行完成后继续",
						"executor_config": map[string]interface{}{
							"executor": "CLAUDE_CODE",
							"variant":  "ZHIPU",
						},
					},
				},
			},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	status, err := client.GetQueueStatus(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("GetQueueStatus 返回错误: %v", err)
	}
	if status == nil || status.Status != "queued" {
		t.Fatalf("status = %#v, want queued", status)
	}
	if status.Message == nil || status.Message.Data.Message != "运行完成后继续" {
		t.Fatalf("queued message = %#v, want 运行完成后继续", status.Message)
	}
}

func TestProxyClientCancelQueue(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sessions/session-1/queue" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodDelete {
			t.Fatalf("method = %s, want DELETE", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"status": "empty",
			},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	status, err := client.CancelQueue(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("CancelQueue 返回错误: %v", err)
	}
	if status == nil || status.Status != "empty" {
		t.Fatalf("status = %#v, want empty", status)
	}
}

func testProxyMessageContext() *store.MessageContext {
	return &store.MessageContext{
		WorkspaceID:        "ws-1",
		SessionID:          "session-1",
		ExecutorConfigJSON: `{"executor":"CLAUDE_CODE","variant":"ZHIPU"}`,
		DefaultSendMode:    "send",
		Source:             "test",
		UpdatedAt:          time.Now(),
	}
}
