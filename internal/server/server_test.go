package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
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
