package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// Store 数据库存储层
type Store struct {
	db *sql.DB
}

// NewStore 创建数据库存储实例
func NewStore(dsn string) (*Store, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("连接数据库: %w", err)
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("数据库连接测试失败: %w", err)
	}

	return &Store{db: db}, nil
}

// Close 关闭数据库连接
func (s *Store) Close() error {
	return s.db.Close()
}

// InitSchema 初始化数据库表结构
func (s *Store) InitSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (
			id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255),
			branch VARCHAR(255),
			archived BOOLEAN DEFAULT FALSE,
			pinned BOOLEAN DEFAULT FALSE,
			latest_session_id VARCHAR(36),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_archived (archived),
			INDEX idx_updated (updated_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS sessions (
			id VARCHAR(36) PRIMARY KEY,
			workspace_id VARCHAR(36) NOT NULL,
			executor VARCHAR(50),
			variant VARCHAR(50),
			name VARCHAR(255),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_workspace (workspace_id),
			FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS execution_processes (
			id VARCHAR(36) PRIMARY KEY,
			session_id VARCHAR(36) NOT NULL,
			run_reason VARCHAR(50) DEFAULT 'codingagent',
			status VARCHAR(20),
			started_at TIMESTAMP,
			completed_at TIMESTAMP NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_session (session_id),
			INDEX idx_status (status),
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

		`CREATE TABLE IF NOT EXISTS session_messages (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			session_id VARCHAR(36) NOT NULL,
			process_id VARCHAR(36) NULL,
			entry_type VARCHAR(50) NOT NULL,
			content TEXT NOT NULL,
			tool_info JSON NULL,
			timestamp TIMESTAMP(3) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_session_time (session_id, timestamp),
			INDEX idx_process (process_id),
			INDEX idx_entry_type (entry_type),
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	}

	for _, stmt := range statements {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		_, err := s.db.ExecContext(ctx, stmt)
		if err != nil {
			return fmt.Errorf("执行 schema: %w", err)
		}
	}
	return nil
}

// UpsertWorkspace 插入或更新工作区
func (s *Store) UpsertWorkspace(ctx context.Context, ws *Workspace) error {
	query := `
		INSERT INTO workspaces (id, name, branch, archived, pinned, latest_session_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			name = VALUES(name),
			branch = VALUES(branch),
			archived = VALUES(archived),
			pinned = VALUES(pinned),
			latest_session_id = COALESCE(VALUES(latest_session_id), latest_session_id),
			updated_at = VALUES(updated_at),
			synced_at = CURRENT_TIMESTAMP
	`
	_, err := s.db.ExecContext(ctx, query,
		ws.ID, ws.Name, ws.Branch, ws.Archived, ws.Pinned, ws.LatestSessionID,
		ws.CreatedAt, ws.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert workspace: %w", err)
	}
	return nil
}

// UpsertSession 插入或更新会话
func (s *Store) UpsertSession(ctx context.Context, sess *Session) error {
	query := `
		INSERT INTO sessions (id, workspace_id, executor, variant, name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			executor = VALUES(executor),
			variant = VALUES(variant),
			name = VALUES(name),
			updated_at = VALUES(updated_at),
			synced_at = CURRENT_TIMESTAMP
	`
	_, err := s.db.ExecContext(ctx, query,
		sess.ID, sess.WorkspaceID, sess.Executor, sess.Variant, sess.Name,
		sess.CreatedAt, sess.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert session: %w", err)
	}
	return nil
}

// UpsertExecutionProcess 插入或更新执行进程
func (s *Store) UpsertExecutionProcess(ctx context.Context, ep *ExecutionProcess) error {
	query := `
		INSERT INTO execution_processes (id, session_id, run_reason, status, started_at, completed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			run_reason = VALUES(run_reason),
			status = VALUES(status),
			started_at = VALUES(started_at),
			completed_at = VALUES(completed_at),
			synced_at = CURRENT_TIMESTAMP
	`
	_, err := s.db.ExecContext(ctx, query,
		ep.ID, ep.SessionID, ep.RunReason, ep.Status, ep.StartedAt, ep.CompletedAt, ep.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert execution process: %w", err)
	}
	return nil
}

// InsertMessage 插入消息
func (s *Store) InsertMessage(ctx context.Context, msg *SessionMessage) error {
	query := `
		INSERT INTO session_messages (session_id, process_id, entry_type, content, tool_info, timestamp)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	_, err := s.db.ExecContext(ctx, query,
		msg.SessionID, msg.ProcessID, msg.EntryType, msg.Content, msg.ToolInfo, msg.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}
	return nil
}

// GetSessionMessages 获取会话消息
func (s *Store) GetSessionMessages(ctx context.Context, sessionID string, limit int, before time.Time) ([]SessionMessage, error) {
	var query string
	var args []interface{}

	if before.IsZero() {
		query = `
			SELECT id, session_id, process_id, entry_type, content, tool_info, timestamp, created_at
			FROM session_messages
			WHERE session_id = ?
			ORDER BY timestamp ASC
			LIMIT ?
		`
		args = []interface{}{sessionID, limit}
	} else {
		query = `
			SELECT id, session_id, process_id, entry_type, content, tool_info, timestamp, created_at
			FROM session_messages
			WHERE session_id = ? AND timestamp < ?
			ORDER BY timestamp ASC
			LIMIT ?
		`
		args = []interface{}{sessionID, before, limit}
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []SessionMessage
	for rows.Next() {
		var msg SessionMessage
		var processID, toolInfo sql.NullString
		if err := rows.Scan(&msg.ID, &msg.SessionID, &processID, &msg.EntryType, &msg.Content, &toolInfo, &msg.Timestamp, &msg.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		if processID.Valid {
			msg.ProcessID = &processID.String
		}
		if toolInfo.Valid {
			msg.ToolInfo = toolInfo.String
		}
		messages = append(messages, msg)
	}
	return messages, nil
}

// GetActiveWorkspaces 获取活跃的工作区
func (s *Store) GetActiveWorkspaces(ctx context.Context) ([]Workspace, error) {
	query := `
		SELECT id, name, branch, archived, pinned, latest_session_id, created_at, updated_at
		FROM workspaces
		WHERE archived = FALSE
		ORDER BY updated_at DESC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query workspaces: %w", err)
	}
	defer rows.Close()

	var workspaces []Workspace
	for rows.Next() {
		var ws Workspace
		var latestSessionID sql.NullString
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Branch, &ws.Archived, &ws.Pinned, &latestSessionID, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		if latestSessionID.Valid {
			ws.LatestSessionID = &latestSessionID.String
		}
		workspaces = append(workspaces, ws)
	}
	return workspaces, nil
}

// MessageExists 检查消息是否已存在
func (s *Store) MessageExists(ctx context.Context, sessionID, content string, timestamp time.Time) (bool, error) {
	query := `SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND content = ? AND timestamp = ?`
	var count int
	err := s.db.QueryRowContext(ctx, query, sessionID, content, timestamp).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check message exists: %w", err)
	}
	return count > 0, nil
}

// GetSessionByID 根据 ID 获取会话
func (s *Store) GetSessionByID(ctx context.Context, sessionID string) (*Session, error) {
	query := `
		SELECT id, workspace_id, executor, variant, name, created_at, updated_at
		FROM sessions
		WHERE id = ?
	`
	var sess Session
	err := s.db.QueryRowContext(ctx, query, sessionID).Scan(
		&sess.ID, &sess.WorkspaceID, &sess.Executor, &sess.Variant, &sess.Name, &sess.CreatedAt, &sess.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	return &sess, nil
}

// GetWorkspaceByID 根据 ID 获取工作区
func (s *Store) GetWorkspaceByID(ctx context.Context, workspaceID string) (*Workspace, error) {
	query := `
		SELECT id, name, branch, archived, pinned, latest_session_id, created_at, updated_at
		FROM workspaces
		WHERE id = ?
	`
	var ws Workspace
	var latestSessionID sql.NullString
	err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(
		&ws.ID, &ws.Name, &ws.Branch, &ws.Archived, &ws.Pinned, &latestSessionID, &ws.CreatedAt, &ws.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	if latestSessionID.Valid {
		ws.LatestSessionID = &latestSessionID.String
	}
	return &ws, nil
}

// GetWorkspaceBySessionID 根据 session ID 获取工作区
func (s *Store) GetWorkspaceBySessionID(ctx context.Context, sessionID string) (*Workspace, error) {
	query := `
		SELECT w.id, w.name, w.branch, w.archived, w.pinned, w.latest_session_id, w.created_at, w.updated_at
		FROM workspaces w
		INNER JOIN sessions s ON w.id = s.workspace_id
		WHERE s.id = ?
	`
	var ws Workspace
	var latestSessionID sql.NullString
	err := s.db.QueryRowContext(ctx, query, sessionID).Scan(
		&ws.ID, &ws.Name, &ws.Branch, &ws.Archived, &ws.Pinned, &latestSessionID, &ws.CreatedAt, &ws.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace by session: %w", err)
	}
	if latestSessionID.Valid {
		ws.LatestSessionID = &latestSessionID.String
	}
	return &ws, nil
}
