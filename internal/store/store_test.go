package store

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func newMockStore(t *testing.T) (*Store, sqlmock.Sqlmock, func()) {
	t.Helper()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}

	return &Store{db: db}, mock, func() {
		_ = db.Close()
	}
}

func TestGetSessionMessagesUsesLatestFirstQuery(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{
		"id", "process_id", "session_id", "workspace_id", "entry_index", "entry_type",
		"role", "content", "tool_name", "action_type_json", "status_json", "error_type",
		"entry_timestamp", "content_hash", "created_at",
	}).AddRow(
		2, "proc-2", "session-1", "ws-1", 2, "assistant_message", "assistant", "world",
		nil, nil, nil, nil, time.Now(), "hash-2", time.Now(),
	).AddRow(
		1, "proc-1", "session-1", "ws-1", 1, "user_message", "user", "hello",
		nil, nil, nil, nil, time.Now().Add(-time.Minute), "hash-1", time.Now(),
	)

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, process_id, session_id, workspace_id, entry_index, entry_type, role, content,
		       tool_name, action_type_json, status_json, error_type, entry_timestamp, content_hash, created_at
		FROM kw_process_entries
		WHERE session_id = ?
		ORDER BY entry_timestamp DESC, id DESC
		LIMIT ?
	`)).
		WithArgs("session-1", 2).
		WillReturnRows(rows)

	got, err := store.GetSessionMessages(context.Background(), "session-1", 2, time.Time{}, nil)
	if err != nil {
		t.Fatalf("GetSessionMessages 返回错误: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("消息数 = %d, want 2", len(got))
	}
	if got[0].ID != 2 {
		t.Fatalf("第一条消息 ID = %d, want 2", got[0].ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestUpsertProcessEntryUsesProcessIndexUniqueKey(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	entryTime := time.Now()
	entry := &ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-1",
		WorkspaceID:    "ws-1",
		EntryIndex:     5,
		EntryType:      "tool_use",
		Role:           "assistant",
		Content:        "Read file",
		ToolName:       stringPtr("Read"),
		ActionTypeJSON: stringPtr(`{"action":"file_read","path":"main.go"}`),
		StatusJSON:     stringPtr(`{"status":"success"}`),
		EntryTimestamp: entryTime,
		ContentHash:    "hash-5",
	}

	mock.ExpectExec("INSERT INTO kw_process_entries").
		WithArgs(
			entry.ProcessID, entry.SessionID, entry.WorkspaceID, entry.EntryIndex,
			entry.EntryType, entry.Role, entry.Content, entry.ToolName, entry.ActionTypeJSON,
			entry.StatusJSON, entry.ErrorType, entry.EntryTimestamp, entry.ContentHash,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	if err := store.UpsertProcessEntry(context.Background(), entry); err != nil {
		t.Fatalf("UpsertProcessEntry 返回错误: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetWorkspaceBySessionIDReturnsNilOnNotFound(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	mock.ExpectQuery("SELECT w.id, w.name, w.branch, w.archived, w.pinned, w.latest_session_id, w.is_running, w.latest_process_status, w.has_pending_approval, w.has_unseen_turns, w.has_running_dev_server, w.files_changed, w.lines_added, w.lines_removed, w.last_seen_at, w.created_at, w.updated_at, w.synced_at FROM kw_workspaces w").
		WithArgs("missing-session").
		WillReturnError(sql.ErrNoRows)

	got, err := store.GetWorkspaceBySessionID(context.Background(), "missing-session")
	if err != nil {
		t.Fatalf("GetWorkspaceBySessionID 返回错误: %v", err)
	}
	if got != nil {
		t.Fatalf("workspace = %#v, want nil", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetProcessEntryReturnsNilOnNotFound(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, process_id, session_id, workspace_id, entry_index, entry_type, role, content,
		       tool_name, action_type_json, status_json, error_type, entry_timestamp, content_hash, created_at
		FROM kw_process_entries
		WHERE process_id = ? AND entry_index = ?
		LIMIT 1
	`)).
		WithArgs("missing-proc", 33).
		WillReturnError(sql.ErrNoRows)

	got, err := store.GetProcessEntry(context.Background(), "missing-proc", 33)
	if err != nil {
		t.Fatalf("GetProcessEntry 返回错误: %v", err)
	}
	if got != nil {
		t.Fatalf("entry = %#v, want nil", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetNextLocalEntryIndexDefaultsToNegativeOne(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{"COALESCE(MIN(entry_index), 0)"}).AddRow(0)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT COALESCE(MIN(entry_index), 0)
		FROM kw_process_entries
		WHERE process_id = ?
		  AND entry_index < 0
	`)).
		WithArgs("proc-1").
		WillReturnRows(rows)

	got, err := store.GetNextLocalEntryIndex(context.Background(), "proc-1")
	if err != nil {
		t.Fatalf("GetNextLocalEntryIndex 返回错误: %v", err)
	}
	if got != -1 {
		t.Fatalf("next local entry_index = %d, want -1", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetNextLocalEntryIndexContinuesDecrementingNegativeRange(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{"COALESCE(MIN(entry_index), 0)"}).AddRow(-3)
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT COALESCE(MIN(entry_index), 0)
		FROM kw_process_entries
		WHERE process_id = ?
		  AND entry_index < 0
	`)).
		WithArgs("proc-1").
		WillReturnRows(rows)

	got, err := store.GetNextLocalEntryIndex(context.Background(), "proc-1")
	if err != nil {
		t.Fatalf("GetNextLocalEntryIndex 返回错误: %v", err)
	}
	if got != -4 {
		t.Fatalf("next local entry_index = %d, want -4", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetExecutionProcessStatusReturnsNilOnNotFound(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT status
		FROM kw_execution_processes
		WHERE id = ?
		LIMIT 1
	`)).
		WithArgs("missing-proc").
		WillReturnError(sql.ErrNoRows)

	got, err := store.GetExecutionProcessStatus(context.Background(), "missing-proc")
	if err != nil {
		t.Fatalf("GetExecutionProcessStatus 返回错误: %v", err)
	}
	if got != nil {
		t.Fatalf("status = %#v, want nil", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetLatestCodingAgentProcessByWorkspaceIDReturnsProcess(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{
		"id", "session_id", "workspace_id", "run_reason", "status", "executor",
		"executor_action_type", "dropped", "created_at", "completed_at", "synced_at",
	}).AddRow(
		"proc-1", "session-1", "ws-1", "codingagent", "running", "CLAUDE_CODE",
		"CodingAgentInitialRequest", false, time.Now(), nil, time.Now(),
	)

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, session_id, workspace_id, run_reason, status, executor,
		       executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason = 'codingagent'
		  AND dropped = FALSE
		ORDER BY synced_at DESC, created_at DESC, id DESC
		LIMIT 1
	`)).
		WithArgs("ws-1").
		WillReturnRows(rows)

	got, err := store.GetLatestCodingAgentProcessByWorkspaceID(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("GetLatestCodingAgentProcessByWorkspaceID 返回错误: %v", err)
	}
	if got == nil || got.ID != "proc-1" {
		t.Fatalf("process = %#v, want proc-1", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetLatestRunningCodingAgentProcessByWorkspaceIDReturnsRunningProcess(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{
		"id", "session_id", "workspace_id", "run_reason", "status", "executor",
		"executor_action_type", "dropped", "created_at", "completed_at", "synced_at",
	}).AddRow(
		"proc-running", "session-1", "ws-1", "codingagent", "running", "CLAUDE_CODE",
		"CodingAgentFollowUpRequest", false, time.Now(), nil, time.Now(),
	)

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, session_id, workspace_id, run_reason, status, executor,
		       executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason = 'codingagent'
		  AND dropped = FALSE
		  AND status = 'running'
		ORDER BY synced_at DESC, created_at DESC, id DESC
		LIMIT 1
	`)).
		WithArgs("ws-1").
		WillReturnRows(rows)

	got, err := store.GetLatestRunningCodingAgentProcessByWorkspaceID(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("GetLatestRunningCodingAgentProcessByWorkspaceID 返回错误: %v", err)
	}
	if got == nil || got.ID != "proc-running" {
		t.Fatalf("process = %#v, want proc-running", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestShouldRetryExec(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "invalid connection", err: sql.ErrConnDone, want: true},
		{name: "wrapped broken pipe", err: wrapErr("write: broken pipe"), want: true},
		{name: "wrapped eof", err: wrapErr("unexpected EOF"), want: true},
		{name: "syntax error", err: wrapErr("syntax error"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldRetryExec(tt.err)
			if got != tt.want {
				t.Fatalf("shouldRetryExec(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestBuildProcessLogSubscriptionKey(t *testing.T) {
	got := BuildProcessLogSubscriptionKey("proc-1")
	if got != "process_log:proc-1" {
		t.Fatalf("subscription key = %q, want process_log:proc-1", got)
	}
}

func TestMarkMissingWorkspacesArchived(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	now := time.Now()
	mock.ExpectExec(regexp.QuoteMeta(`
		UPDATE kw_workspaces
		SET archived = TRUE,
		    is_running = FALSE,
		    synced_at = CURRENT_TIMESTAMP(3),
		    last_seen_at = ?
		WHERE archived = FALSE
		  AND id NOT IN (?,?)
	`)).
		WithArgs(now, "ws-1", "ws-2").
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := store.MarkMissingWorkspacesArchived(context.Background(), []string{"ws-1", "ws-2"}, now); err != nil {
		t.Fatalf("MarkMissingWorkspacesArchived 返回错误: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestMarkMissingWorkspacesArchivedMarksAllWhenEmpty(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	now := time.Now()
	mock.ExpectExec(regexp.QuoteMeta(`
		UPDATE kw_workspaces
		SET archived = TRUE,
		    is_running = FALSE,
		    synced_at = CURRENT_TIMESTAMP(3),
		    last_seen_at = ?
		WHERE archived = FALSE
	`)).
		WithArgs(now).
		WillReturnResult(sqlmock.NewResult(0, 3))

	if err := store.MarkMissingWorkspacesArchived(context.Background(), nil, now); err != nil {
		t.Fatalf("MarkMissingWorkspacesArchived 返回错误: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestUpsertMessageContextStoresLatestSessionAndExecutorConfig(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	updatedAt := time.Now()
	ctxRow := &MessageContext{
		WorkspaceID:        "ws-1",
		SessionID:          "session-1",
		ProcessID:          stringPtr("proc-1"),
		Executor:           stringPtr("CLAUDE_CODE"),
		Variant:            stringPtr("ZHIPU"),
		ExecutorConfigJSON: `{"executor":"CLAUDE_CODE","variant":"ZHIPU"}`,
		ForceWhenDirty:     boolPtr(false),
		PerformGitReset:    boolPtr(true),
		DefaultSendMode:    "send",
		Source:             "sync",
		UpdatedAt:          updatedAt,
	}

	mock.ExpectExec("INSERT INTO kw_msg_contexts").
		WithArgs(
			ctxRow.WorkspaceID,
			ctxRow.SessionID,
			ctxRow.ProcessID,
			ctxRow.Executor,
			ctxRow.Variant,
			ctxRow.ExecutorConfigJSON,
			ctxRow.ForceWhenDirty,
			ctxRow.PerformGitReset,
			ctxRow.DefaultSendMode,
			ctxRow.Source,
			ctxRow.UpdatedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	if err := store.UpsertMessageContext(context.Background(), ctxRow); err != nil {
		t.Fatalf("UpsertMessageContext 返回错误: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestGetMessageContextByWorkspaceIDReturnsNilWhenMissing(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT workspace_id, session_id, process_id, executor, variant, executor_config_json,
		       force_when_dirty, perform_git_reset, default_send_mode, source, updated_at, synced_at
		FROM kw_msg_contexts
		WHERE workspace_id = ?
		LIMIT 1
	`)).
		WithArgs("missing-workspace").
		WillReturnError(sql.ErrNoRows)

	got, err := store.GetMessageContextByWorkspaceID(context.Background(), "missing-workspace")
	if err != nil {
		t.Fatalf("GetMessageContextByWorkspaceID 返回错误: %v", err)
	}
	if got != nil {
		t.Fatalf("message context = %#v, want nil", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func TestRefreshWorkspaceRuntimeStatePromotesRunningProcess(t *testing.T) {
	store, mock, cleanup := newMockStore(t)
	defer cleanup()

	rows := sqlmock.NewRows([]string{"status"}).AddRow("running")
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT status
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason = 'codingagent'
		  AND dropped = FALSE
		ORDER BY
		  CASE WHEN status = 'running' THEN 0 ELSE 1 END,
		  synced_at DESC,
		  created_at DESC,
		  id DESC
		LIMIT 1
	`)).
		WithArgs("ws-1").
		WillReturnRows(rows)

	mock.ExpectExec(regexp.QuoteMeta(`
		UPDATE kw_workspaces
		SET latest_process_status = ?,
		    is_running = ?,
		    synced_at = CURRENT_TIMESTAMP(3)
		WHERE id = ?
	`)).
		WithArgs("running", true, "ws-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := store.RefreshWorkspaceRuntimeState(context.Background(), "ws-1"); err != nil {
		t.Fatalf("RefreshWorkspaceRuntimeState 返回错误: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock 期望未满足: %v", err)
	}
}

func wrapErr(msg string) error {
	return &wrappedErr{msg: msg}
}

type wrappedErr struct {
	msg string
}

func (e *wrappedErr) Error() string {
	return e.msg
}
