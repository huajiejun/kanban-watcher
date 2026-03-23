package store

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestNewStore(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	// 设置 Ping 期望
	mock.ExpectPing()

	store := &Store{db: db}

	if store == nil {
		t.Error("Store 不应为 nil")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestClose(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}

	mock.ExpectClose()

	store := &Store{db: db}
	if err := store.Close(); err != nil {
		t.Errorf("Close 失败: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestUpsertSession(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()

	sess := &Session{
		ID:          "test-session-id",
        WorkspaceID: "test-workspace-id",
        Executor:    "claude",
        Variant:     "opus",
        Name:        "Test Session",
        CreatedAt:   time.Now(),
        UpdatedAt:   time.Now(),
    }

    // 设置期望
    mock.ExpectExec("INSERT INTO sessions").
        WithArgs(sess.ID, sess.WorkspaceID, sess.Executor, sess.Variant, sess.Name, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
        WillReturnResult(sqlmock.NewResult(1, 1))

    err = store.UpsertSession(ctx, sess)
    if err != nil {
        t.Errorf("UpsertSession 失败: %v", err)
    }

    if err := mock.ExpectationsWereMet(); err != nil {
        t.Errorf("未满足的期望: %v", err)
    }
}

func TestUpsertSession(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()

	sess := &Session{
		ID:          "test-session-id",
		WorkspaceID: "test-workspace-id",
		Executor:    "claude",
		Variant:     "opus",
		Name:        "Test Session",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	mock.ExpectExec("INSERT INTO sessions").
		WithArgs(sess.ID, sess.WorkspaceID, sess.Executor, sess.Variant, sess.Name, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = store.UpsertSession(ctx, sess)
	if err != nil {
		t.Errorf("UpsertSession 失败: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestUpsertExecutionProcess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()

	ep := &ExecutionProcess{
		ID:         "ep-1",
		SessionID:  "session-1",
		RunReason:  "codingagent",
		Status:     "running",
		StartedAt:  time.Now(),
	}

	mock.ExpectExec("INSERT INTO execution_processes").
		WithArgs(ep.ID, ep.SessionID, ep.RunReason, ep.Status, ep.StartedAt, ep.CompletedAt, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = store.UpsertExecutionProcess(ctx, ep)
	if err != nil {
		t.Errorf("UpsertExecutionProcess 失败: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestInsertMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()

	processID := "ep-1"
	msg := &SessionMessage{
		SessionID:  "session-1",
		ProcessID:  &processID,
		EntryType:  "user_message",
		Content:    "Hello, World!",
		ToolInfo:   "",
		Timestamp:  time.Now(),
	}

	mock.ExpectExec("INSERT INTO session_messages").
		WithArgs(msg.SessionID, msg.ProcessID, msg.EntryType, msg.Content, msg.ToolInfo, msg.Timestamp).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = store.InsertMessage(ctx, msg)
	if err != nil {
		t.Errorf("InsertMessage 失败: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetWorkspaceByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	workspaceID := "ws-1"
	latestSessionID := "session-1"

	rows := sqlmock.NewRows([]string{"id", "name", "branch", "archived", "pinned", "latest_session_id", "created_at", "updated_at"}).
		AddRow(workspaceID, "Test Workspace", "main", false, true, latestSessionID, time.Now(), time.Now())

	mock.ExpectQuery("SELECT id, name, branch, archived, pinned, latest_session_id, created_at, updated_at FROM workspaces").
		WithArgs(workspaceID).
		WillReturnRows(rows)

	ws, err := store.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		t.Errorf("GetWorkspaceByID 失败: %v", err)
	}

	if ws == nil {
		t.Error("工作区不应为 nil")
		return
	}

	if ws.ID != workspaceID {
		t.Errorf("期望 ID %s, 得到 %s", workspaceID, ws.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetWorkspaceByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	workspaceID := "non-existent"

	mock.ExpectQuery("SELECT id, name, branch, archived, pinned, latest_session_id, created_at, updated_at FROM workspaces").
		WithArgs(workspaceID).
		WillReturnError(sql.ErrNoRows)

	ws, err := store.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		t.Errorf("GetWorkspaceByID 失败: %v", err)
	}

	if ws != nil {
		t.Error("工作区应为 nil")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetWorkspaceBySessionID(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	sessionID := "session-1"
	workspaceID := "ws-1"
	latestSessionID := "session-1"

	rows := sqlmock.NewRows([]string{"id", "name", "branch", "archived", "pinned", "latest_session_id", "created_at", "updated_at"}).
		AddRow(workspaceID, "Test Workspace", "main", false, true, latestSessionID, time.Now(), time.Now())

	mock.ExpectQuery("SELECT w.id, w.name, w.branch, w.archived, w.pinned, w.latest_session_id, w.created_at, w.updated_at FROM workspaces w").
		WithArgs(sessionID).
		WillReturnRows(rows)

	ws, err := store.GetWorkspaceBySessionID(ctx, sessionID)
	if err != nil {
		t.Errorf("GetWorkspaceBySessionID 失败: %v", err)
	}

	if ws == nil {
		t.Error("工作区不应为 nil")
		return
	}

	if ws.ID != workspaceID {
		t.Errorf("期望 ID %s, 得到 %s", workspaceID, ws.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestMessageExists(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	sessionID := "session-1"
	content := "Hello"
	timestamp := time.Now()

	rows := sqlmock.NewRows([]string{"count"}).AddRow(1)

	mock.ExpectQuery("SELECT COUNT").
		WithArgs(sessionID, content, timestamp).
		WillReturnRows(rows)

	exists, err := store.MessageExists(ctx, sessionID, content, timestamp)
	if err != nil {
		t.Errorf("MessageExists 失败: %v", err)
	}

	if !exists {
		t.Error("消息应存在")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestMessageExists_NotExists(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	sessionID := "session-1"
	content := "Non-existent"
	timestamp := time.Now()

	rows := sqlmock.NewRows([]string{"count"}).AddRow(0)

	mock.ExpectQuery("SELECT COUNT").
		WithArgs(sessionID, content, timestamp).
		WillReturnRows(rows)

	exists, err := store.MessageExists(ctx, sessionID, content, timestamp)
	if err != nil {
		t.Errorf("MessageExists 失败: %v", err)
	}

	if exists {
		t.Error("消息不应存在")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetSessionByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	sessionID := "session-1"
	workspaceID := "ws-1"

	rows := sqlmock.NewRows([]string{"id", "workspace_id", "executor", "variant", "name", "created_at", "updated_at"}).
		AddRow(sessionID, workspaceID, "claude", "opus", "Test Session", time.Now(), time.Now())

	mock.ExpectQuery("SELECT id, workspace_id, executor, variant, name, created_at, updated_at FROM sessions").
		WithArgs(sessionID).
		WillReturnRows(rows)

	sess, err := store.GetSessionByID(ctx, sessionID)
	if err != nil {
		t.Errorf("GetSessionByID 失败: %v", err)
	}

	if sess == nil {
		t.Error("会话不应为 nil")
		return
	}

	if sess.ID != sessionID {
		t.Errorf("期望 ID %s, 得到 %s", sessionID, sess.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetActiveWorkspaces(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()

	latestSessionID := "session-1"
	rows := sqlmock.NewRows([]string{"id", "name", "branch", "archived", "pinned", "latest_session_id", "created_at", "updated_at"}).
		AddRow("ws-1", "Workspace 1", "main", false, false, latestSessionID, time.Now(), time.Now()).
		AddRow("ws-2", "Workspace 2", "feature", false, true, latestSessionID, time.Now(), time.Now())

	mock.ExpectQuery("SELECT id, name, branch, archived, pinned, latest_session_id, created_at, updated_at FROM workspaces").
		WillReturnRows(rows)

	workspaces, err := store.GetActiveWorkspaces(ctx)
	if err != nil {
		t.Errorf("GetActiveWorkspaces 失败: %v", err)
	}

	if len(workspaces) != 2 {
		t.Errorf("期望 2 个工作区, 得到 %d", len(workspaces))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}

func TestGetSessionMessages(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("创建 mock 失败: %v", err)
	}
	defer db.Close()

	store := &Store{db: db}
	ctx := context.Background()
	sessionID := "session-1"
	processID := "ep-1"

	rows := sqlmock.NewRows([]string{"id", "session_id", "process_id", "entry_type", "content", "tool_info", "timestamp", "created_at"}).
		AddRow(int64(1), sessionID, processID, "user_message", "Hello", "", time.Now(), time.Now()).
		AddRow(int64(2), sessionID, processID, "assistant_message", "Hi there!", "", time.Now(), time.Now())

	mock.ExpectQuery("SELECT id, session_id, process_id, entry_type, content, tool_info, timestamp, created_at FROM session_messages").
		WithArgs(sessionID, 50).
		WillReturnRows(rows)

	messages, err := store.GetSessionMessages(ctx, sessionID, 50, time.Time{})
	if err != nil {
		t.Errorf("GetSessionMessages 失败: %v", err)
	}

	if len(messages) != 2 {
		t.Errorf("期望 2 条消息, 得到 %d", len(messages))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("未满足的期望: %v", err)
	}
}
