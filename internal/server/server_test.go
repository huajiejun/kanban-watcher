package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestAuthMiddlewareRejectsRealtimeRouteWithoutAPIKey(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", nil, nil)
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
	srv := NewServer(nil, 0, "test-key", nil, nil)
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
	srv := NewServer(nil, 0, "test-key", nil, nil)

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
		_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
	}))
	defer upstream.Close()

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"action":"dev-server"`) {
		t.Fatalf("body = %s, want action dev-server", rr.Body.String())
	}
}

func TestHandleWorkspaceMessageRejectsInvalidMethodForDevServer(t *testing.T) {
	srv := NewServer(nil, 0, "test-key", nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusMethodNotAllowed)
	}
}
