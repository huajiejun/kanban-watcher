package server

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestAuthMiddlewareRejectsRealtimeRouteWithoutAPIKey(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", true, nil, nil)
	nextCalled := false

	handler := srv.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/realtime/ws", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatal("未携带 api_key 仍然进入了下游 handler")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddlewareAllowsRealtimeRouteWithAPIKeyQuery(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", true, nil, nil)
	nextCalled := false

	handler := srv.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/realtime/ws?api_key=test-key", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if !nextCalled {
		t.Fatal("携带 query api_key 后未进入下游 handler")
	}
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
	}
}

func TestCorsMiddlewareAllowsPutPreflightForWorkspaceView(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", true, nil, nil)

	handler := srv.corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/workspace-view", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if !strings.Contains(rr.Header().Get("Access-Control-Allow-Methods"), "PUT") {
		t.Fatalf("Access-Control-Allow-Methods = %q, want include PUT", rr.Header().Get("Access-Control-Allow-Methods"))
	}
}

func TestHandleWorkspaceMessageStartsDevServer(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":[{"id":"proc-dev-1","session_id":"session-1","workspace_id":"ws-1","run_reason":"dev_server","status":"running"}]}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"action":"dev-server"`) {
		t.Fatalf("body = %s, want action dev-server", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"execution_processes":[{"id":"proc-dev-1"`) {
		t.Fatalf("body = %s, want execution_processes", rr.Body.String())
	}
}

func TestHandleWorkspaceMessageRejectsInvalidMethodForDevServer(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusMethodNotAllowed)
	}
}

func TestHandleWorkspaceMessageMapsNoScriptConfiguredToConflict(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":false,"message":"No dev server script configured for any repository in this workspace"}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusConflict, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "No dev server script configured") {
		t.Fatalf("body = %s, want no-script message", rr.Body.String())
	}
}

func TestHandleWorkspaceMessageStopsDevServer(t *testing.T) {
	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		if r.URL.Path != "/api/workspaces/ws-1/execution/stop" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodDelete, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusConflict, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "缺少运行中的 dev server process_id") {
		t.Fatalf("body = %s, want missing process id error", rr.Body.String())
	}
	if upstreamCalled {
		t.Fatal("未提供 process_id 时仍然调用了上游 workspace stop")
	}
}

func TestHandleWorkspaceMessageStopsDevServerByExecutionProcessWhenProcessIDProvided(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-dev-1/stop" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":null}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodDelete, "/api/workspace/ws-1/dev-server?process_id=proc-dev-1", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"action":"dev-server-stop"`) {
		t.Fatalf("body = %s, want action dev-server-stop", rr.Body.String())
	}
}

func TestHandleWorkspaceMessageStopsDevServerLogsWorkspaceID(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-dev-1/stop" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"message":"已停止"}`))
	}))
	defer upstream.Close()

	var logBuffer bytes.Buffer
	previousWriter := log.Writer()
	previousFlags := log.Flags()
	log.SetOutput(&logBuffer)
	log.SetFlags(0)
	defer log.SetOutput(previousWriter)
	defer log.SetFlags(previousFlags)

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodDelete, "/api/workspace/ws-1/dev-server?process_id=proc-dev-1", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}

	logOutput := logBuffer.String()
	if !strings.Contains(logOutput, "收到停止 dev server 请求") {
		t.Fatalf("log = %q, want stop request message", logOutput)
	}
	if !strings.Contains(logOutput, "workspace_id=ws-1") {
		t.Fatalf("log = %q, want workspace_id", logOutput)
	}
	if !strings.Contains(logOutput, "process_id=proc-dev-1") {
		t.Fatalf("log = %q, want process_id", logOutput)
	}
}

func TestHandleInfoProxiesVibeInfo(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/info" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"config":{"preview_proxy_port":53480}}}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/info", nil)
	rr := httptest.NewRecorder()

	srv.handleInfo(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"preview_proxy_port":53480`) {
		t.Fatalf("body = %s, want preview_proxy_port", rr.Body.String())
	}
}

func TestHandleExecutionProcessProxiesDetail(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-dev-1" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"proc-dev-1","session_id":"session-1","workspace_id":"ws-1","run_reason":"dev_server","status":"running"}}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/execution-processes/proc-dev-1", nil)
	rr := httptest.NewRecorder()

	srv.handleExecutionProcess(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"id":"proc-dev-1"`) {
		t.Fatalf("body = %s, want process id", rr.Body.String())
	}
}
