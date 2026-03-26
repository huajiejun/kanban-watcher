package server

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
	"unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func setStoreDB(t *testing.T, dbStore *store.Store, db interface{}) {
	t.Helper()

	field := reflect.ValueOf(dbStore).Elem().FieldByName("db")
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(db))
}

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

func TestHandleWorkspaceMessageStartsDevServerPersistsExecutionProcess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 sqlmock 失败: %v", err)
	}
	defer db.Close()

	dbStore := &store.Store{}
	setStoreDB(t, dbStore, db)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/ws-1/execution/dev-server/start" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":[{"id":"proc-dev-1","session_id":"session-1","run_reason":"devserver","status":"running"}]}`))
	}))
	defer upstream.Close()

	mock.ExpectExec(regexp.QuoteMeta(`
		INSERT INTO kw_execution_processes (
			id, session_id, workspace_id, run_reason, status, executor,
			executor_action_type, dropped, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			workspace_id = VALUES(workspace_id),
			run_reason = VALUES(run_reason),
			status = VALUES(status),
			executor = VALUES(executor),
			executor_action_type = VALUES(executor_action_type),
			dropped = VALUES(dropped),
			created_at = COALESCE(kw_execution_processes.created_at, VALUES(created_at)),
			completed_at = VALUES(completed_at),
			synced_at = CURRENT_TIMESTAMP(3)
	`)).
		WithArgs("proc-dev-1", "session-1", "ws-1", "dev_server", "running", nil, nil, false, sqlmock.AnyArg(), nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)
	srv.SetStore(dbStore)

	req := httptest.NewRequest(http.MethodPost, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
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
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 sqlmock 失败: %v", err)
	}
	defer db.Close()

	dbStore := &store.Store{}
	setStoreDB(t, dbStore, db)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-dev-1/stop" {
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

	now := time.Now()
	rows := sqlmock.NewRows([]string{
		"id", "session_id", "workspace_id", "run_reason", "status",
		"executor", "executor_action_type", "dropped", "created_at", "completed_at", "synced_at",
	}).AddRow(
		"proc-dev-1", "session-1", "ws-1", "devserver", "running",
		nil, nil, false, now, nil, now,
	)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, session_id, workspace_id, run_reason, status,
		       executor, executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason IN ('dev_server', 'devserver')
		  AND dropped = FALSE
		  AND status = 'running'
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`)).
		WithArgs("ws-1").
		WillReturnRows(rows)

	srv := NewServer(api.NewProxyClient(upstream.URL), 0, "test-key", true, nil, nil)
	srv.SetStore(dbStore)

	req := httptest.NewRequest(http.MethodDelete, "/api/workspace/ws-1/dev-server", nil)
	rr := httptest.NewRecorder()

	srv.handleWorkspaceMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"action":"dev-server-stop"`) {
		t.Fatalf("body = %s, want action dev-server-stop", rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
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
