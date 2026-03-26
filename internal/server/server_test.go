package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
