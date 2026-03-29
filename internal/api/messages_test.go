package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
	"unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/huajiejun/kanban-watcher/internal/realtime"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestReverseMessagesInPlace(t *testing.T) {
	messages := []store.ProcessEntry{
		{ID: 3, EntryType: "assistant_message", EntryTimestamp: time.Now()},
		{ID: 2, EntryType: "tool_use", EntryTimestamp: time.Now().Add(-time.Second)},
		{ID: 1, EntryType: "user_message", EntryTimestamp: time.Now().Add(-2 * time.Second)},
	}

	reverseMessages(messages)

	if messages[0].ID != 1 || messages[1].ID != 2 || messages[2].ID != 3 {
		t.Fatalf("reverse 后顺序错误: %#v", messages)
	}
}

func TestParseTypesFilter(t *testing.T) {
	got := parseTypesFilter("user_message,assistant_message,tool_use")
	if len(got) != 3 {
		t.Fatalf("types 数量 = %d, want 3", len(got))
	}
	if got[0] != "user_message" || got[2] != "tool_use" {
		t.Fatalf("types = %#v", got)
	}
}

func TestResolveSessionMessageTypesUsesPreviewDefaultsForWorkspaceLatestMessages(t *testing.T) {
	got := resolveSessionMessageTypes("", true)
	want := []string{"assistant_message", "user_message", "error_message"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("types = %#v, want %#v", got, want)
	}
}

func TestResolveSessionMessageTypesKeepsAllTypesForSessionMessagesWhenFilterMissing(t *testing.T) {
	got := resolveSessionMessageTypes("", false)
	if got != nil {
		t.Fatalf("types = %#v, want nil", got)
	}
}

func TestResolveSessionMessageTypesPreservesExplicitFilter(t *testing.T) {
	got := resolveSessionMessageTypes("assistant_message,tool_use", true)
	want := []string{"assistant_message", "tool_use"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("types = %#v, want %#v", got, want)
	}
}

func TestMessageResponseJSONWithToolInfo(t *testing.T) {
	resp := MessageResponse{
		ID:        1,
		SessionID: "session-1",
		ProcessID: "proc-1",
		EntryType: "tool_use",
		Role:      "assistant",
		Content:   "Read file",
		ToolInfo: map[string]interface{}{
			"tool_name":   "Read",
			"action_type": map[string]interface{}{"action": "file_read"},
			"status":      map[string]interface{}{"status": "success"},
		},
		Timestamp: "2026-03-23T10:00:00Z",
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal 失败: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal 失败: %v", err)
	}

	toolInfo, ok := decoded["tool_info"].(map[string]interface{})
	if !ok {
		t.Fatalf("tool_info 类型错误: %#v", decoded["tool_info"])
	}
	if toolInfo["tool_name"] != "Read" {
		t.Fatalf("tool_name = %#v, want Read", toolInfo["tool_name"])
	}
}

func TestActiveWorkspaceResponseJSONIncludesAttentionFields(t *testing.T) {
	resp := ActiveWorkspaceResponse{
		Workspaces: []LocalWorkspaceSummary{
			{
				ID:                 "ws-1",
				Name:               "Attention Workspace",
				Branch:             "main",
				Status:             "completed",
				HasUnseenTurns:     true,
				HasPendingApproval: true,
				FilesChanged:       5,
				LinesAdded:         12,
				LinesRemoved:       3,
				MenuSummary:        "待审批：等待你确认下一步",
			},
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal 失败: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal 失败: %v", err)
	}

	workspaces, ok := decoded["workspaces"].([]interface{})
	if !ok || len(workspaces) != 1 {
		t.Fatalf("workspaces 类型错误: %#v", decoded["workspaces"])
	}

	item, ok := workspaces[0].(map[string]interface{})
	if !ok {
		t.Fatalf("workspace item 类型错误: %#v", workspaces[0])
	}
	if item["has_unseen_turns"] != true {
		t.Fatalf("has_unseen_turns = %#v, want true", item["has_unseen_turns"])
	}
	if item["has_pending_approval"] != true {
		t.Fatalf("has_pending_approval = %#v, want true", item["has_pending_approval"])
	}
	if item["files_changed"] != float64(5) {
		t.Fatalf("files_changed = %#v, want 5", item["files_changed"])
	}
	if item["menu_summary"] != "待审批：等待你确认下一步" {
		t.Fatalf("menu_summary = %#v, want 待审批：等待你确认下一步", item["menu_summary"])
	}
}

func TestFetchExecutionProcessReturnsExecutorConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/execution-processes/proc-1" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"id":           "proc-1",
				"session_id":   "session-1",
				"workspace_id": "ws-1",
				"run_reason":   "codingagent",
				"status":       "running",
				"executor_action": map[string]interface{}{
					"typ": map[string]interface{}{
						"type": "CodingAgentInitialRequest",
						"executor_config": map[string]interface{}{
							"executor": "CLAUDE_CODE",
							"variant":  "ZHIPU",
							"model_id": "glm-4.5",
						},
					},
				},
			},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL)
	process, err := client.FetchExecutionProcess(context.Background(), "proc-1")
	if err != nil {
		t.Fatalf("FetchExecutionProcess 返回错误: %v", err)
	}
	if process == nil {
		t.Fatal("process = nil, want value")
	}
	if got := process.ExecutorAction.Typ.ExecutorConfig["executor"]; got != "CLAUDE_CODE" {
		t.Fatalf("executor = %#v, want CLAUDE_CODE", got)
	}
}

func TestBuildLocalMenuSummaryFallsBackToLastMessage(t *testing.T) {
	lastMessage := "### 结论\n\n```go\nfmt.Println(\"ignore\")\n```\n请先看最后一条用户回复。"

	got := buildLocalMenuSummary(store.ActiveWorkspaceSummary{
		Status:      "completed",
		LastMessage: &lastMessage,
	})

	if got != "结论 请先看最后一条用户回复。" {
		t.Fatalf("menu summary = %q", got)
	}
}

func TestBuildLocalMenuSummaryPrefersLastMessageOverUnreadReason(t *testing.T) {
	lastMessage := "这里是未读时应展示的最后一条摘要"

	got := buildLocalMenuSummary(store.ActiveWorkspaceSummary{
		Status:         "completed",
		HasUnseenTurns: true,
		LastMessage:    &lastMessage,
	})

	if got != lastMessage {
		t.Fatalf("menu summary = %q, want %q", got, lastMessage)
	}
}

func TestBuildWorkspaceBrowserURLSupportsTemplatePlaceholders(t *testing.T) {
	got := buildWorkspaceBrowserURL(LocalWorkspaceSummary{
		ID:     "ws-1",
		Name:   "我的工作区",
		Branch: "feature/test",
	}, "https://relay.example/{workspace_id}?name={workspace_name}&branch={branch}")

	want := "https://relay.example/ws-1?name=我的工作区&branch=feature/test"
	if got != want {
		t.Fatalf("browser url = %q, want %q", got, want)
	}
}

func setStoreDB(t *testing.T, dbStore *store.Store, db interface{}) {
	t.Helper()

	field := reflect.ValueOf(dbStore).Elem().FieldByName("db")
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(db))
}

func TestGetWorkspaceViewRouteReturnsPersistedLayout(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 sqlmock 失败: %v", err)
	}
	defer db.Close()

	dbStore := &store.Store{}
	setStoreDB(t, dbStore, db)

	rows := sqlmock.NewRows([]string{
		"scope_key", "open_workspace_ids_json", "active_workspace_id", "dismissed_attention_ids_json", "version", "updated_at", "created_at",
	}).AddRow("global", `["ws-1","ws-2"]`, "ws-2", `["ws-3"]`, 7, time.Now(), time.Now())

	mock.ExpectQuery("SELECT scope_key, open_workspace_ids_json, active_workspace_id, dismissed_attention_ids_json, version, updated_at, created_at FROM kw_workspace_views").
		WithArgs("global").
		WillReturnRows(rows)

	routes := GetMessageRoutes(dbStore, "", nil)
	handler := routes["/api/workspace-view"]
	if handler == nil {
		t.Fatal("workspace view 路由未注册")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/workspace-view", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"open_workspace_ids":["ws-1","ws-2"]`) {
		t.Fatalf("响应未包含 open_workspace_ids: %s", recorder.Body.String())
	}
}

func TestPutWorkspaceViewPersistsLayoutAndBroadcastsRealtimeEvent(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 sqlmock 失败: %v", err)
	}
	defer db.Close()

	dbStore := &store.Store{}
	setStoreDB(t, dbStore, db)

	hub := realtime.NewHub()
	publisher := NewRealtimePublisher(dbStore, hub, nil)

	mock.ExpectExec("INSERT INTO kw_workspace_views").
		WithArgs("global", `["ws-1"]`, "ws-1", `["ws-attention"]`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("SELECT scope_key, open_workspace_ids_json, active_workspace_id, dismissed_attention_ids_json, version, updated_at, created_at FROM kw_workspace_views").
		WithArgs("global").
		WillReturnRows(sqlmock.NewRows([]string{
			"scope_key", "open_workspace_ids_json", "active_workspace_id", "dismissed_attention_ids_json", "version", "updated_at", "created_at",
		}).AddRow("global", `["ws-1"]`, "ws-1", `["ws-attention"]`, 1, time.Now(), time.Now()))

	routes := GetMessageRoutes(dbStore, "", publisher)
	handler := routes["/api/workspace-view"]
	if handler == nil {
		t.Fatal("workspace view 路由未注册")
	}

	req := httptest.NewRequest(
		http.MethodPut,
		"/api/workspace-view",
		strings.NewReader(`{"open_workspace_ids":["ws-1"],"active_workspace_id":"ws-1","dismissed_attention_ids":["ws-attention"]}`),
	)
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"dismissed_attention_ids":["ws-attention"]`) {
		t.Fatalf("响应未包含 dismissed_attention_ids: %s", recorder.Body.String())
	}
}

func TestActiveWorkspacesRouteIncludesBrowserURLWhenTemplateConfigured(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 sqlmock 失败: %v", err)
	}
	defer db.Close()

	dbStore := &store.Store{}
	setStoreDB(t, dbStore, db)

	rows := sqlmock.NewRows([]string{
		"id", "name", "branch", "latest_session_id", "status",
		"has_pending_approval", "has_unseen_turns", "has_running_dev_server", "running_dev_server_process_id",
		"files_changed", "lines_added", "lines_removed", "updated_at",
		"message_count", "last_message_at", "latest_process_completed_at", "last_message",
	}).AddRow(
		"ws-1", "工作区一", "feature/browser", "session-1", "completed",
		false, false, true, "proc-dev-1",
		1, 2, 3, time.Now(),
		0, nil, nil, nil,
	)

	mock.ExpectQuery("SELECT").
		WillReturnRows(rows)

	routes := GetMessageRoutes(dbStore, "https://relay.example/{workspace_id}?branch={branch}")
	handler := routes["/api/workspaces/active"]
	if handler == nil {
		t.Fatal("active workspaces 路由未注册")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/active", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"browser_url":"https://relay.example/ws-1?branch=feature/browser"`) {
		t.Fatalf("响应未包含 browser_url: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"running_dev_server_process_id":"proc-dev-1"`) {
		t.Fatalf("响应未包含 running_dev_server_process_id: %s", recorder.Body.String())
	}
}
