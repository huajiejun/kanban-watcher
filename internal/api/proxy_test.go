package api

import (
	"context"
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
