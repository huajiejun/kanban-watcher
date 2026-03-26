package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestProxyClientStopExecutionProcess(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-1/stop" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    []map[string]interface{}{},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	if err := client.StopExecutionProcess(context.Background(), "proc-1"); err != nil {
		t.Fatalf("StopExecutionProcess 返回错误: %v", err)
	}
}

func TestProxyClientStartDevServer(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    []map[string]interface{}{},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	if _, err := client.StartDevServer(context.Background(), "ws-1"); err != nil {
		t.Fatalf("StartDevServer 返回错误: %v", err)
	}
}

func TestProxyClientStartDevServerReturnsBusinessErrorWhenScriptMissing(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "No dev server script configured for any repository in this workspace",
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	_, err := client.StartDevServer(context.Background(), "ws-1")
	if err == nil {
		t.Fatal("StartDevServer 返回 nil，期望业务错误")
	}

	var businessErr *ProxyBusinessError
	if !errors.As(err, &businessErr) {
		t.Fatalf("err = %T, want *ProxyBusinessError", err)
	}
}

func TestProxyClientStopDevServer(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/stop" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    map[string]interface{}{},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	if err := client.StopDevServer(context.Background(), "ws-1"); err != nil {
		t.Fatalf("StopDevServer 返回错误: %v", err)
	}
}

func TestProxyClientStopDevServerLogsUpstreamRequestAndResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/stop" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "已停止",
		})
	}))
	defer server.Close()

	var logBuffer bytes.Buffer
	previousWriter := log.Writer()
	previousFlags := log.Flags()
	log.SetOutput(&logBuffer)
	log.SetFlags(0)
	defer log.SetOutput(previousWriter)
	defer log.SetFlags(previousFlags)

	client := NewProxyClient(server.URL)
	if err := client.StopDevServer(context.Background(), "ws-1"); err != nil {
		t.Fatalf("StopDevServer 返回错误: %v", err)
	}

	logOutput := logBuffer.String()
	if !strings.Contains(logOutput, "workspace_id=ws-1") {
		t.Fatalf("log = %q, want workspace_id", logOutput)
	}
	if !strings.Contains(logOutput, "/api/workspaces/ws-1/execution/stop") {
		t.Fatalf("log = %q, want upstream path", logOutput)
	}
	if !strings.Contains(logOutput, "已停止") {
		t.Fatalf("log = %q, want upstream response message", logOutput)
	}
}

func TestProxyClientGetInfo(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/info" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"config": map[string]interface{}{
					"preview_proxy_port": 53480,
				},
			},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	info, err := client.GetInfo(context.Background())
	if err != nil {
		t.Fatalf("GetInfo 返回错误: %v", err)
	}
	if info == nil || info.Config == nil || info.Config.PreviewProxyPort == nil || *info.Config.PreviewProxyPort != 53480 {
		t.Fatalf("info = %#v, want preview_proxy_port 53480", info)
	}
}

func TestProxyClientStartDevServerReturnsExecutionProcesses(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": []map[string]interface{}{
				{
					"id":           "proc-dev-1",
					"session_id":   "session-1",
					"workspace_id": "ws-1",
					"run_reason":   "dev_server",
					"status":       "running",
				},
			},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	processes, err := client.StartDevServer(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("StartDevServer 返回错误: %v", err)
	}
	if len(processes) != 1 || processes[0].ID != "proc-dev-1" {
		t.Fatalf("processes = %#v, want proc-dev-1", processes)
	}
}

func TestProxyClientGetExecutionProcess(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-dev-1" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"id":           "proc-dev-1",
				"session_id":   "session-1",
				"workspace_id": "ws-1",
				"run_reason":   "dev_server",
				"status":       "running",
			},
		})
	}))
	defer server.Close()

	client := NewProxyClient(server.URL)
	process, err := client.GetExecutionProcess(context.Background(), "proc-dev-1")
	if err != nil {
		t.Fatalf("GetExecutionProcess 返回错误: %v", err)
	}
	if process == nil || process.ID != "proc-dev-1" || process.Status != "running" {
		t.Fatalf("process = %#v, want running proc-dev-1", process)
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
