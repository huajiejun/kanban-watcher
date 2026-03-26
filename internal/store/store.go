package store

import (
	"context"
	"database/sql"
	"errors"
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
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(1 * time.Minute)
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
		`CREATE TABLE IF NOT EXISTS kw_workspaces (
			id VARCHAR(36) PRIMARY KEY,
			name VARCHAR(255) NULL,
			branch VARCHAR(255) NOT NULL,
			archived BOOLEAN NOT NULL DEFAULT FALSE,
			pinned BOOLEAN NOT NULL DEFAULT FALSE,
			latest_session_id VARCHAR(36) NULL,
			is_running BOOLEAN NOT NULL DEFAULT FALSE,
			latest_process_status VARCHAR(20) NULL,
			has_pending_approval BOOLEAN NOT NULL DEFAULT FALSE,
			has_unseen_turns BOOLEAN NOT NULL DEFAULT FALSE,
			has_running_dev_server BOOLEAN NOT NULL DEFAULT FALSE,
			frontend_port INT NULL,
			files_changed INT NOT NULL DEFAULT 0,
			lines_added INT NOT NULL DEFAULT 0,
			lines_removed INT NOT NULL DEFAULT 0,
			last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			created_at TIMESTAMP(3) NULL,
			updated_at TIMESTAMP(3) NULL,
			synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			INDEX idx_kw_workspaces_archived (archived),
			INDEX idx_kw_workspaces_updated_at (updated_at),
			INDEX idx_kw_workspaces_latest_session (latest_session_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_sessions (
			id VARCHAR(36) PRIMARY KEY,
			workspace_id VARCHAR(36) NOT NULL,
			created_at TIMESTAMP(3) NULL,
			updated_at TIMESTAMP(3) NULL,
			synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			INDEX idx_kw_sessions_workspace (workspace_id),
			CONSTRAINT fk_kw_sessions_workspace
				FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_execution_processes (
			id VARCHAR(36) PRIMARY KEY,
			session_id VARCHAR(36) NOT NULL,
			workspace_id VARCHAR(36) NOT NULL,
			run_reason VARCHAR(50) NOT NULL,
			status VARCHAR(20) NOT NULL,
			executor VARCHAR(50) NULL,
			executor_action_type VARCHAR(100) NULL,
			dropped BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMP(3) NULL,
			completed_at TIMESTAMP(3) NULL,
			synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			INDEX idx_kw_ep_session (session_id),
			INDEX idx_kw_ep_workspace (workspace_id),
			INDEX idx_kw_ep_run_reason_status (run_reason, status),
			INDEX idx_kw_ep_created_at (created_at),
			CONSTRAINT fk_kw_ep_session
				FOREIGN KEY (session_id) REFERENCES kw_sessions(id) ON DELETE CASCADE,
			CONSTRAINT fk_kw_ep_workspace
				FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_process_entries (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			process_id VARCHAR(36) NOT NULL,
			session_id VARCHAR(36) NOT NULL,
			workspace_id VARCHAR(36) NOT NULL,
			entry_index INT NOT NULL,
			entry_type VARCHAR(50) NOT NULL,
			role VARCHAR(20) NOT NULL,
			content MEDIUMTEXT NOT NULL,
			tool_name VARCHAR(100) NULL,
			action_type_json JSON NULL,
			status_json JSON NULL,
			error_type VARCHAR(50) NULL,
			entry_timestamp TIMESTAMP(3) NOT NULL,
			content_hash CHAR(64) NOT NULL,
			created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			UNIQUE KEY uk_kw_entries_process_index (process_id, entry_index),
			KEY idx_kw_entries_session_time (session_id, entry_timestamp),
			KEY idx_kw_entries_session_type_time (session_id, entry_type, entry_timestamp),
			KEY idx_kw_entries_workspace_time (workspace_id, entry_timestamp),
			KEY idx_kw_entries_type (entry_type),
			CONSTRAINT fk_kw_entries_process
				FOREIGN KEY (process_id) REFERENCES kw_execution_processes(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_sync_subscriptions (
			subscription_key VARCHAR(120) PRIMARY KEY,
			subscription_type VARCHAR(30) NOT NULL,
			target_id VARCHAR(36) NOT NULL,
			session_id VARCHAR(36) NULL,
			workspace_id VARCHAR(36) NULL,
			last_entry_index INT NULL,
			status VARCHAR(20) NOT NULL,
			last_error TEXT NULL,
			last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
			updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
				ON UPDATE CURRENT_TIMESTAMP(3),
			KEY idx_kw_sync_type_target (subscription_type, target_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_msg_contexts (
			workspace_id VARCHAR(36) PRIMARY KEY,
			session_id VARCHAR(36) NOT NULL,
			process_id VARCHAR(36) NULL,
			executor VARCHAR(50) NULL,
			variant VARCHAR(50) NULL,
			executor_config_json JSON NOT NULL,
			force_when_dirty BOOLEAN NULL,
			perform_git_reset BOOLEAN NULL,
			default_send_mode VARCHAR(20) NOT NULL DEFAULT 'send',
			source VARCHAR(30) NOT NULL,
			updated_at TIMESTAMP(3) NOT NULL,
			synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
				ON UPDATE CURRENT_TIMESTAMP(3),
			KEY idx_kw_msg_contexts_session (session_id),
			KEY idx_kw_msg_contexts_updated_at (updated_at),
			CONSTRAINT fk_kw_msg_contexts_workspace
				FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`CREATE TABLE IF NOT EXISTS kw_workspace_views (
			scope_key VARCHAR(32) PRIMARY KEY,
			open_workspace_ids_json JSON NOT NULL,
			active_workspace_id VARCHAR(36) NULL,
			dismissed_attention_ids_json JSON NOT NULL,
			version BIGINT NOT NULL DEFAULT 1,
			updated_at TIMESTAMP(3) NOT NULL,
			created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS has_pending_approval BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS has_unseen_turns BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS has_running_dev_server BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS frontend_port INT NULL`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS files_changed INT NOT NULL DEFAULT 0`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS lines_added INT NOT NULL DEFAULT 0`,
		`ALTER TABLE kw_workspaces ADD COLUMN IF NOT EXISTS lines_removed INT NOT NULL DEFAULT 0`,
		`ALTER TABLE kw_process_entries ADD INDEX IF NOT EXISTS idx_kw_entries_session_type_time (session_id, entry_type, entry_timestamp)`,
		`CREATE TABLE IF NOT EXISTS kw_token_usage_daily (
			id BIGINT AUTO_INCREMENT PRIMARY KEY,
			stat_date DATE NOT NULL,
			executor VARCHAR(50) NOT NULL,
			input_tokens BIGINT NOT NULL DEFAULT 0,
			output_tokens BIGINT NOT NULL DEFAULT 0,
			total_tokens BIGINT NOT NULL DEFAULT 0,
			session_count INT NOT NULL DEFAULT 0,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uk_token_daily_stat_executor (stat_date, executor),
			INDEX idx_token_daily_stat (stat_date),
			INDEX idx_token_daily_executor (executor)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	}

	for _, stmt := range statements {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("执行 schema: %w", err)
		}
	}
	return nil
}

// UpsertWorkspaceView 保存服务级共享布局
func (s *Store) UpsertWorkspaceView(ctx context.Context, view *WorkspaceView) error {
	query := `
		INSERT INTO kw_workspace_views (
			scope_key, open_workspace_ids_json, active_workspace_id, dismissed_attention_ids_json, version, updated_at
		) VALUES (?, ?, ?, ?, 1, ?)
		ON DUPLICATE KEY UPDATE
			open_workspace_ids_json = VALUES(open_workspace_ids_json),
			active_workspace_id = VALUES(active_workspace_id),
			dismissed_attention_ids_json = VALUES(dismissed_attention_ids_json),
			version = kw_workspace_views.version + 1,
			updated_at = VALUES(updated_at)
	`

	_, err := s.execWithRetry(
		ctx,
		query,
		view.ScopeKey,
		view.OpenWorkspaceIDsJSON,
		view.ActiveWorkspaceID,
		view.DismissedAttentionIDsJSON,
		view.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert workspace view: %w", err)
	}

	latest, err := s.GetWorkspaceView(ctx, view.ScopeKey)
	if err != nil {
		return err
	}
	if latest != nil {
		view.Version = latest.Version
		view.CreatedAt = latest.CreatedAt
	}
	return nil
}

// GetWorkspaceView 获取服务级共享布局
func (s *Store) GetWorkspaceView(ctx context.Context, scopeKey string) (*WorkspaceView, error) {
	query := `
		SELECT scope_key, open_workspace_ids_json, active_workspace_id, dismissed_attention_ids_json, version, updated_at, created_at
		FROM kw_workspace_views
		WHERE scope_key = ?
		LIMIT 1
	`

	var view WorkspaceView
	if err := s.db.QueryRowContext(ctx, query, scopeKey).Scan(
		&view.ScopeKey,
		&view.OpenWorkspaceIDsJSON,
		&view.ActiveWorkspaceID,
		&view.DismissedAttentionIDsJSON,
		&view.Version,
		&view.UpdatedAt,
		&view.CreatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get workspace view: %w", err)
	}

	return &view, nil
}

// UpsertWorkspace 插入或更新工作区
func (s *Store) UpsertWorkspace(ctx context.Context, ws *Workspace) error {
	query := `
		INSERT INTO kw_workspaces (
			id, name, branch, archived, pinned, latest_session_id, is_running,
			latest_process_status, has_pending_approval, has_unseen_turns, has_running_dev_server,
			frontend_port, files_changed, lines_added, lines_removed, last_seen_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			name = VALUES(name),
			branch = VALUES(branch),
			archived = VALUES(archived),
			pinned = VALUES(pinned),
			latest_session_id = VALUES(latest_session_id),
			is_running = VALUES(is_running),
			latest_process_status = VALUES(latest_process_status),
			has_pending_approval = VALUES(has_pending_approval),
			has_unseen_turns = VALUES(has_unseen_turns),
			has_running_dev_server = VALUES(has_running_dev_server),
			frontend_port = COALESCE(VALUES(frontend_port), kw_workspaces.frontend_port),
			files_changed = VALUES(files_changed),
			lines_added = VALUES(lines_added),
			lines_removed = VALUES(lines_removed),
			last_seen_at = VALUES(last_seen_at),
			created_at = COALESCE(kw_workspaces.created_at, VALUES(created_at)),
			updated_at = VALUES(updated_at),
			synced_at = CURRENT_TIMESTAMP(3)
	`
	_, err := s.execWithRetry(ctx, query,
		ws.ID, ws.Name, ws.Branch, ws.Archived, ws.Pinned, ws.LatestSessionID,
		ws.IsRunning, ws.LatestProcessStatus, ws.HasPendingApproval, ws.HasUnseenTurns, ws.HasRunningDevServer,
		ws.FrontendPort,
		ws.FilesChanged, ws.LinesAdded, ws.LinesRemoved, ws.LastSeenAt, ws.CreatedAt, ws.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert workspace: %w", err)
	}
	return nil
}

// UpsertSession 插入或更新会话
func (s *Store) UpsertSession(ctx context.Context, sess *Session) error {
	query := `
		INSERT INTO kw_sessions (id, workspace_id, created_at, updated_at)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			workspace_id = VALUES(workspace_id),
			created_at = COALESCE(kw_sessions.created_at, VALUES(created_at)),
			updated_at = VALUES(updated_at),
			synced_at = CURRENT_TIMESTAMP(3)
	`
	_, err := s.execWithRetry(ctx, query,
		sess.ID, sess.WorkspaceID, sess.CreatedAt, sess.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert session: %w", err)
	}
	return nil
}

// UpsertExecutionProcess 插入或更新执行进程
func (s *Store) UpsertExecutionProcess(ctx context.Context, ep *ExecutionProcess) error {
	normalizedRunReason := normalizeExecutionProcessRunReason(ep.RunReason)

	query := `
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
	`
	_, err := s.execWithRetry(ctx, query,
		ep.ID, ep.SessionID, ep.WorkspaceID, normalizedRunReason, ep.Status, ep.Executor,
		ep.ExecutorActionType, ep.Dropped, ep.CreatedAt, ep.CompletedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert execution process: %w", err)
	}
	return nil
}

// UpsertMessageContext 插入或更新工作区消息上下文
func (s *Store) UpsertMessageContext(ctx context.Context, msgCtx *MessageContext) error {
	query := `
		INSERT INTO kw_msg_contexts (
			workspace_id, session_id, process_id, executor, variant, executor_config_json,
			force_when_dirty, perform_git_reset, default_send_mode, source, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			session_id = VALUES(session_id),
			process_id = VALUES(process_id),
			executor = VALUES(executor),
			variant = VALUES(variant),
			executor_config_json = VALUES(executor_config_json),
			force_when_dirty = VALUES(force_when_dirty),
			perform_git_reset = VALUES(perform_git_reset),
			default_send_mode = VALUES(default_send_mode),
			source = VALUES(source),
			updated_at = VALUES(updated_at),
			synced_at = CURRENT_TIMESTAMP(3)
	`
	_, err := s.execWithRetry(ctx, query,
		msgCtx.WorkspaceID, msgCtx.SessionID, msgCtx.ProcessID, msgCtx.Executor, msgCtx.Variant,
		msgCtx.ExecutorConfigJSON, msgCtx.ForceWhenDirty, msgCtx.PerformGitReset,
		msgCtx.DefaultSendMode, msgCtx.Source, msgCtx.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert message context: %w", err)
	}
	return nil
}

// GetMessageContextByWorkspaceID 获取工作区消息上下文
func (s *Store) GetMessageContextByWorkspaceID(ctx context.Context, workspaceID string) (*MessageContext, error) {
	query := `
		SELECT workspace_id, session_id, process_id, executor, variant, executor_config_json,
		       force_when_dirty, perform_git_reset, default_send_mode, source, updated_at, synced_at
		FROM kw_msg_contexts
		WHERE workspace_id = ?
		LIMIT 1
	`

	var msgCtx MessageContext
	if err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(
		&msgCtx.WorkspaceID,
		&msgCtx.SessionID,
		&msgCtx.ProcessID,
		&msgCtx.Executor,
		&msgCtx.Variant,
		&msgCtx.ExecutorConfigJSON,
		&msgCtx.ForceWhenDirty,
		&msgCtx.PerformGitReset,
		&msgCtx.DefaultSendMode,
		&msgCtx.Source,
		&msgCtx.UpdatedAt,
		&msgCtx.SyncedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get message context by workspace id: %w", err)
	}

	return &msgCtx, nil
}

// GetExecutionProcessStatus 获取 execution process 当前状态
func (s *Store) GetExecutionProcessStatus(ctx context.Context, processID string) (*string, error) {
	query := `
		SELECT status
		FROM kw_execution_processes
		WHERE id = ?
		LIMIT 1
	`

	var status string
	if err := s.db.QueryRowContext(ctx, query, processID).Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get execution process status: %w", err)
	}
	return &status, nil
}

// GetLatestCodingAgentProcessByWorkspaceID 获取工作区最近的 codingagent execution process
func (s *Store) GetLatestCodingAgentProcessByWorkspaceID(ctx context.Context, workspaceID string) (*ExecutionProcess, error) {
	query := `
		SELECT id, session_id, workspace_id, run_reason, status, executor,
		       executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason = 'codingagent'
		  AND dropped = FALSE
		ORDER BY synced_at DESC, created_at DESC, id DESC
		LIMIT 1
	`

	var ep ExecutionProcess
	if err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(
		&ep.ID,
		&ep.SessionID,
		&ep.WorkspaceID,
		&ep.RunReason,
		&ep.Status,
		&ep.Executor,
		&ep.ExecutorActionType,
		&ep.Dropped,
		&ep.CreatedAt,
		&ep.CompletedAt,
		&ep.SyncedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get latest codingagent process by workspace id: %w", err)
	}

	return &ep, nil
}

// GetLatestRunningCodingAgentProcessByWorkspaceID 获取工作区最近仍在运行的 codingagent execution process
func (s *Store) GetLatestRunningCodingAgentProcessByWorkspaceID(ctx context.Context, workspaceID string) (*ExecutionProcess, error) {
	query := `
		SELECT id, session_id, workspace_id, run_reason, status, executor,
		       executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason = 'codingagent'
		  AND dropped = FALSE
		  AND status = 'running'
		ORDER BY synced_at DESC, created_at DESC, id DESC
		LIMIT 1
	`

	var ep ExecutionProcess
	if err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(
		&ep.ID,
		&ep.SessionID,
		&ep.WorkspaceID,
		&ep.RunReason,
		&ep.Status,
		&ep.Executor,
		&ep.ExecutorActionType,
		&ep.Dropped,
		&ep.CreatedAt,
		&ep.CompletedAt,
		&ep.SyncedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get latest running codingagent process by workspace id: %w", err)
	}

	return &ep, nil
}

// GetLatestRunningDevServerProcessByWorkspaceID 获取工作区最近仍在运行的 dev server execution process
func (s *Store) GetLatestRunningDevServerProcessByWorkspaceID(ctx context.Context, workspaceID string) (*ExecutionProcess, error) {
	query := `
		SELECT id, session_id, workspace_id, run_reason, status, executor,
		       executor_action_type, dropped, created_at, completed_at, synced_at
		FROM kw_execution_processes
		WHERE workspace_id = ?
		  AND run_reason IN ('dev_server', 'devserver')
		  AND dropped = FALSE
		  AND status = 'running'
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`

	var ep ExecutionProcess
	if err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(
		&ep.ID,
		&ep.SessionID,
		&ep.WorkspaceID,
		&ep.RunReason,
		&ep.Status,
		&ep.Executor,
		&ep.ExecutorActionType,
		&ep.Dropped,
		&ep.CreatedAt,
		&ep.CompletedAt,
		&ep.SyncedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get latest running dev server process by workspace id: %w", err)
	}

	return &ep, nil
}

// RefreshWorkspaceRuntimeState 根据最新 execution process 刷新工作区运行态
func (s *Store) RefreshWorkspaceRuntimeState(ctx context.Context, workspaceID string) error {
	query := `
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
	`

	var status sql.NullString
	if err := s.db.QueryRowContext(ctx, query, workspaceID).Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			_, updateErr := s.execWithRetry(ctx, `
				UPDATE kw_workspaces
				SET latest_process_status = NULL,
				    is_running = FALSE,
				    synced_at = CURRENT_TIMESTAMP(3)
				WHERE id = ?
			`, workspaceID)
			return updateErr
		}
		return fmt.Errorf("query workspace runtime state: %w", err)
	}

	var latestStatus interface{}
	isRunning := false
	if status.Valid {
		latestStatus = status.String
		isRunning = status.String == "running"
	}

	if _, err := s.execWithRetry(ctx, `
		UPDATE kw_workspaces
		SET latest_process_status = ?,
		    is_running = ?,
		    synced_at = CURRENT_TIMESTAMP(3)
		WHERE id = ?
	`, latestStatus, isRunning, workspaceID); err != nil {
		return fmt.Errorf("update workspace runtime state: %w", err)
	}

	return nil
}

// UpsertProcessEntry 插入或更新消息
func (s *Store) UpsertProcessEntry(ctx context.Context, entry *ProcessEntry) error {
	query := `
		INSERT INTO kw_process_entries (
			process_id, session_id, workspace_id, entry_index, entry_type, role, content,
			tool_name, action_type_json, status_json, error_type, entry_timestamp, content_hash
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			entry_type = VALUES(entry_type),
			role = VALUES(role),
			content = VALUES(content),
			tool_name = VALUES(tool_name),
			action_type_json = VALUES(action_type_json),
			status_json = VALUES(status_json),
			error_type = VALUES(error_type),
			entry_timestamp = VALUES(entry_timestamp),
			content_hash = VALUES(content_hash)
	`
	_, err := s.execWithRetry(ctx, query,
		entry.ProcessID, entry.SessionID, entry.WorkspaceID, entry.EntryIndex, entry.EntryType,
		entry.Role, entry.Content, entry.ToolName, entry.ActionTypeJSON, entry.StatusJSON,
		entry.ErrorType, entry.EntryTimestamp, entry.ContentHash,
	)
	if err != nil {
		return fmt.Errorf("upsert process entry: %w", err)
	}
	return nil
}

// GetProcessEntry 获取指定 process 和 entry_index 的消息
func (s *Store) GetProcessEntry(ctx context.Context, processID string, entryIndex int) (*ProcessEntry, error) {
	query := `
		SELECT id, process_id, session_id, workspace_id, entry_index, entry_type, role, content,
		       tool_name, action_type_json, status_json, error_type, entry_timestamp, content_hash, created_at
		FROM kw_process_entries
		WHERE process_id = ? AND entry_index = ?
		LIMIT 1
	`

	row := s.db.QueryRowContext(ctx, query, processID, entryIndex)
	entry, err := scanProcessEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get process entry: %w", err)
	}
	return &entry, nil
}

// GetNextLocalEntryIndex 为本地占位消息分配负数序号，避免与远端同步的非负序号冲突。
func (s *Store) GetNextLocalEntryIndex(ctx context.Context, processID string) (int, error) {
	query := `
		SELECT COALESCE(MIN(entry_index), 0)
		FROM kw_process_entries
		WHERE process_id = ?
		  AND entry_index < 0
	`

	var minIndex int
	if err := s.db.QueryRowContext(ctx, query, processID).Scan(&minIndex); err != nil {
		return 0, fmt.Errorf("get next local entry index: %w", err)
	}
	if minIndex >= 0 {
		return -1, nil
	}
	return minIndex - 1, nil
}

// MarkMissingWorkspacesArchived 将本轮未出现在上游非归档列表中的工作区标记为 archived
func (s *Store) MarkMissingWorkspacesArchived(ctx context.Context, activeWorkspaceIDs []string, seenAt time.Time) error {
	baseQuery := `
		UPDATE kw_workspaces
		SET archived = TRUE,
		    is_running = FALSE,
		    frontend_port = NULL,
		    synced_at = CURRENT_TIMESTAMP(3),
		    last_seen_at = ?
		WHERE archived = FALSE
	`

	args := []interface{}{seenAt}
	if len(activeWorkspaceIDs) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(activeWorkspaceIDs)), ",")
		baseQuery += "\n  AND id NOT IN (" + placeholders + ")\n"
		for _, id := range activeWorkspaceIDs {
			args = append(args, id)
		}
	}

	if _, err := s.execWithRetry(ctx, baseQuery, args...); err != nil {
		return fmt.Errorf("mark missing workspaces archived: %w", err)
	}
	return nil
}

// GetSessionMessages 获取会话消息，默认返回最新消息优先
func (s *Store) GetSessionMessages(ctx context.Context, sessionID string, limit int, before time.Time, types []string) ([]ProcessEntry, error) {
	var args []interface{}
	conditions := []string{"session_id = ?"}
	args = append(args, sessionID)

	if !before.IsZero() {
		conditions = append(conditions, "entry_timestamp < ?")
		args = append(args, before)
	}

	if len(types) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(types)), ",")
		conditions = append(conditions, "entry_type IN ("+placeholders+")")
		for _, typ := range types {
			args = append(args, typ)
		}
	}

	query := `
		SELECT id, process_id, session_id, workspace_id, entry_index, entry_type, role, content,
		       tool_name, action_type_json, status_json, error_type, entry_timestamp, content_hash, created_at
		FROM kw_process_entries
		WHERE ` + strings.Join(conditions, " AND ") + `
		ORDER BY entry_timestamp DESC, id DESC
		LIMIT ?
	`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query session messages: %w", err)
	}
	defer rows.Close()

	var entries []ProcessEntry
	for rows.Next() {
		entry, err := scanProcessEntry(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// GetWorkspaceByID 根据 ID 获取工作区
func (s *Store) GetWorkspaceByID(ctx context.Context, workspaceID string) (*Workspace, error) {
	query := `
		SELECT id, name, branch, archived, pinned, latest_session_id, is_running,
		       latest_process_status, has_pending_approval, has_unseen_turns, has_running_dev_server,
		       frontend_port, files_changed, lines_added, lines_removed, last_seen_at, created_at, updated_at, synced_at
		FROM kw_workspaces
		WHERE id = ?
	`
	row := s.db.QueryRowContext(ctx, query, workspaceID)
	ws, err := scanWorkspace(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	return ws, nil
}

// GetWorkspaceBySessionID 根据 session 获取工作区
func (s *Store) GetWorkspaceBySessionID(ctx context.Context, sessionID string) (*Workspace, error) {
	query := `
		SELECT w.id, w.name, w.branch, w.archived, w.pinned, w.latest_session_id, w.is_running,
		       w.latest_process_status, w.has_pending_approval, w.has_unseen_turns, w.has_running_dev_server,
		       w.frontend_port, w.files_changed, w.lines_added, w.lines_removed, w.last_seen_at, w.created_at, w.updated_at, w.synced_at
		FROM kw_workspaces w
		INNER JOIN kw_sessions s ON w.id = s.workspace_id
		WHERE s.id = ?
	`
	row := s.db.QueryRowContext(ctx, query, sessionID)
	ws, err := scanWorkspace(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace by session: %w", err)
	}
	return ws, nil
}

// GetWorkspaceFrontendPortState 获取工作区端口分配所需的最小状态
func (s *Store) GetWorkspaceFrontendPortState(ctx context.Context, workspaceID string) (*int, bool, bool, error) {
	workspace, err := s.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return nil, false, false, err
	}
	if workspace == nil {
		return nil, false, false, nil
	}
	return workspace.FrontendPort, workspace.Archived, true, nil
}

// ListAllocatedFrontendPorts 获取未归档工作区已分配的前端端口
func (s *Store) ListAllocatedFrontendPorts(ctx context.Context, excludeWorkspaceID string) ([]int, error) {
	query := `
		SELECT frontend_port
		FROM kw_workspaces
		WHERE archived = FALSE
		  AND frontend_port IS NOT NULL
	`
	args := make([]interface{}, 0, 1)
	if strings.TrimSpace(excludeWorkspaceID) != "" {
		query += "\n  AND id <> ?"
		args = append(args, excludeWorkspaceID)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list allocated frontend ports: %w", err)
	}
	defer rows.Close()

	var ports []int
	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err != nil {
			return nil, fmt.Errorf("scan allocated frontend port: %w", err)
		}
		ports = append(ports, port)
	}
	return ports, nil
}

// AssignFrontendPort 为工作区记录前端端口
func (s *Store) AssignFrontendPort(ctx context.Context, workspaceID string, port int) error {
	_, err := s.execWithRetry(ctx, `
		UPDATE kw_workspaces
		SET frontend_port = ?,
		    synced_at = CURRENT_TIMESTAMP(3)
		WHERE id = ?
	`, port, workspaceID)
	if err != nil {
		return fmt.Errorf("assign frontend port: %w", err)
	}
	return nil
}

// GetActiveWorkspaceSummaries 获取活跃工作区列表
func (s *Store) GetActiveWorkspaceSummaries(ctx context.Context) ([]ActiveWorkspaceSummary, error) {
	query := `
		SELECT
			w.id,
			w.name,
			w.branch,
			w.latest_session_id,
			COALESCE(w.latest_process_status, 'idle') AS status,
			w.has_pending_approval,
			w.has_unseen_turns,
			w.has_running_dev_server,
			running_dev.process_id AS running_dev_server_process_id,
			w.files_changed,
			w.lines_added,
			w.lines_removed,
			w.updated_at,
			COALESCE(msg.message_count, 0) AS message_count,
			msg.last_message_at,
			ep.latest_process_completed_at,
			lm.content AS last_message
		FROM kw_workspaces w
		LEFT JOIN (
			SELECT workspace_id, MIN(id) AS process_id
			FROM kw_execution_processes
			WHERE run_reason IN ('dev_server', 'devserver') AND status = 'running' AND dropped = FALSE
			GROUP BY workspace_id
		) running_dev ON running_dev.workspace_id = w.id
		LEFT JOIN (
			SELECT
				workspace_id,
				COUNT(*) AS message_count,
				MAX(entry_timestamp) AS last_message_at
			FROM kw_process_entries
			GROUP BY workspace_id
		) msg ON msg.workspace_id = w.id
		LEFT JOIN (
			SELECT
				workspace_id,
				MAX(completed_at) AS latest_process_completed_at
			FROM kw_execution_processes
			WHERE completed_at IS NOT NULL
			GROUP BY workspace_id
		) ep ON ep.workspace_id = w.id
		LEFT JOIN kw_process_entries lm ON lm.id = (
			SELECT e.id
			FROM kw_process_entries e
			WHERE e.workspace_id = w.id
			  AND e.entry_type IN ('assistant_message', 'user_message')
			ORDER BY e.entry_timestamp DESC, e.id DESC
			LIMIT 1
		)
		WHERE w.archived = FALSE
		ORDER BY COALESCE(msg.last_message_at, w.updated_at, w.last_seen_at) DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query active workspace summaries: %w", err)
	}
	defer rows.Close()

	var summaries []ActiveWorkspaceSummary
	for rows.Next() {
		var summary ActiveWorkspaceSummary
		var latestSessionID, runningDevServerProcessID sql.NullString
		var lastMessage sql.NullString
		var updatedAt, lastMessageAt, latestProcessCompletedAt sql.NullTime
		if err := rows.Scan(
			&summary.ID, &summary.Name, &summary.Branch, &latestSessionID, &summary.Status,
			&summary.HasPendingApproval, &summary.HasUnseenTurns, &summary.HasRunningDevServer, &runningDevServerProcessID,
			&summary.FilesChanged, &summary.LinesAdded, &summary.LinesRemoved,
			&updatedAt, &summary.MessageCount, &lastMessageAt, &latestProcessCompletedAt, &lastMessage,
		); err != nil {
			return nil, fmt.Errorf("scan active workspace summary: %w", err)
		}
		if latestSessionID.Valid {
			summary.LatestSessionID = &latestSessionID.String
		}
		if runningDevServerProcessID.Valid {
			summary.RunningDevServerProcessID = &runningDevServerProcessID.String
		}
		if updatedAt.Valid {
			summary.UpdatedAt = &updatedAt.Time
		}
		if lastMessageAt.Valid {
			summary.LastMessageAt = &lastMessageAt.Time
		}
		if latestProcessCompletedAt.Valid {
			summary.LatestProcessCompletedAt = &latestProcessCompletedAt.Time
		}
		if lastMessage.Valid {
			summary.LastMessage = &lastMessage.String
		}
		summaries = append(summaries, summary)
	}

	return summaries, nil
}

func normalizeExecutionProcessRunReason(runReason string) string {
	switch strings.TrimSpace(runReason) {
	case "devserver":
		return "dev_server"
	default:
		return strings.TrimSpace(runReason)
	}
}

// GetSubscription 获取订阅状态
func (s *Store) GetSubscription(ctx context.Context, key string) (*SyncSubscription, error) {
	query := `
		SELECT subscription_key, subscription_type, target_id, session_id, workspace_id,
		       last_entry_index, status, last_error, last_seen_at, updated_at
		FROM kw_sync_subscriptions
		WHERE subscription_key = ?
	`
	var sub SyncSubscription
	var sessionID, workspaceID, lastError sql.NullString
	var lastEntryIndex sql.NullInt64
	err := s.db.QueryRowContext(ctx, query, key).Scan(
		&sub.SubscriptionKey, &sub.SubscriptionType, &sub.TargetID, &sessionID, &workspaceID,
		&lastEntryIndex, &sub.Status, &lastError, &sub.LastSeenAt, &sub.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get subscription: %w", err)
	}
	if sessionID.Valid {
		sub.SessionID = &sessionID.String
	}
	if workspaceID.Valid {
		sub.WorkspaceID = &workspaceID.String
	}
	if lastEntryIndex.Valid {
		v := int(lastEntryIndex.Int64)
		sub.LastEntryIndex = &v
	}
	if lastError.Valid {
		sub.LastError = &lastError.String
	}
	return &sub, nil
}

// UpsertSubscription 插入或更新订阅状态
func (s *Store) UpsertSubscription(ctx context.Context, sub *SyncSubscription) error {
	query := `
		INSERT INTO kw_sync_subscriptions (
			subscription_key, subscription_type, target_id, session_id, workspace_id,
			last_entry_index, status, last_error, last_seen_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			session_id = VALUES(session_id),
			workspace_id = VALUES(workspace_id),
			last_entry_index = VALUES(last_entry_index),
			status = VALUES(status),
			last_error = VALUES(last_error),
			last_seen_at = VALUES(last_seen_at)
	`
	_, err := s.execWithRetry(ctx, query,
		sub.SubscriptionKey, sub.SubscriptionType, sub.TargetID, sub.SessionID, sub.WorkspaceID,
		sub.LastEntryIndex, sub.Status, sub.LastError, sub.LastSeenAt,
	)
	if err != nil {
		return fmt.Errorf("upsert subscription: %w", err)
	}
	return nil
}

// UpsertTokenUsageDaily 插入或更新按天聚合的 Token 用量
func (s *Store) UpsertTokenUsageDaily(ctx context.Context, usage *TokenUsageDaily) error {
	query := `
		INSERT INTO kw_token_usage_daily (
			stat_date, executor, input_tokens, output_tokens, total_tokens, session_count
		) VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			input_tokens = input_tokens + VALUES(input_tokens),
			output_tokens = output_tokens + VALUES(output_tokens),
			total_tokens = total_tokens + VALUES(total_tokens),
			session_count = session_count + VALUES(session_count),
			updated_at = CURRENT_TIMESTAMP
	`
	_, err := s.db.ExecContext(ctx, query,
		usage.StatDate, usage.Executor, usage.InputTokens, usage.OutputTokens,
		usage.TotalTokens, usage.SessionCount,
	)
	return err
}

// BatchUpsertTokenUsageDaily 批量插入或更新 Token 用量
func (s *Store) BatchUpsertTokenUsageDaily(ctx context.Context, usages []*TokenUsageDaily) error {
	if len(usages) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO kw_token_usage_daily (
			stat_date, executor, input_tokens, output_tokens, total_tokens, session_count
		) VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			input_tokens = input_tokens + VALUES(input_tokens),
			output_tokens = output_tokens + VALUES(output_tokens),
			total_tokens = total_tokens + VALUES(total_tokens),
			session_count = session_count + VALUES(session_count),
			updated_at = CURRENT_TIMESTAMP
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, usage := range usages {
		if _, err := stmt.ExecContext(ctx,
			usage.StatDate, usage.Executor, usage.InputTokens, usage.OutputTokens,
			usage.TotalTokens, usage.SessionCount,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func scanWorkspace(scanner interface {
	Scan(dest ...interface{}) error
}) (*Workspace, error) {
	var ws Workspace
	var latestSessionID, latestProcessStatus sql.NullString
	var frontendPort sql.NullInt64
	var createdAt, updatedAt sql.NullTime
	err := scanner.Scan(
		&ws.ID, &ws.Name, &ws.Branch, &ws.Archived, &ws.Pinned, &latestSessionID,
		&ws.IsRunning, &latestProcessStatus, &ws.HasPendingApproval, &ws.HasUnseenTurns, &ws.HasRunningDevServer,
		&frontendPort, &ws.FilesChanged, &ws.LinesAdded, &ws.LinesRemoved, &ws.LastSeenAt, &createdAt, &updatedAt, &ws.SyncedAt,
	)
	if err != nil {
		return nil, err
	}
	if latestSessionID.Valid {
		ws.LatestSessionID = &latestSessionID.String
	}
	if latestProcessStatus.Valid {
		ws.LatestProcessStatus = &latestProcessStatus.String
	}
	if frontendPort.Valid {
		port := int(frontendPort.Int64)
		ws.FrontendPort = &port
	}
	if createdAt.Valid {
		ws.CreatedAt = &createdAt.Time
	}
	if updatedAt.Valid {
		ws.UpdatedAt = &updatedAt.Time
	}
	return &ws, nil
}

func scanProcessEntry(scanner interface {
	Scan(dest ...interface{}) error
}) (ProcessEntry, error) {
	var entry ProcessEntry
	var toolName, actionTypeJSON, statusJSON, errorType sql.NullString
	err := scanner.Scan(
		&entry.ID, &entry.ProcessID, &entry.SessionID, &entry.WorkspaceID, &entry.EntryIndex,
		&entry.EntryType, &entry.Role, &entry.Content, &toolName, &actionTypeJSON, &statusJSON,
		&errorType, &entry.EntryTimestamp, &entry.ContentHash, &entry.CreatedAt,
	)
	if err != nil {
		return ProcessEntry{}, fmt.Errorf("scan process entry: %w", err)
	}
	if toolName.Valid {
		entry.ToolName = &toolName.String
	}
	if actionTypeJSON.Valid {
		entry.ActionTypeJSON = &actionTypeJSON.String
	}
	if statusJSON.Valid {
		entry.StatusJSON = &statusJSON.String
	}
	if errorType.Valid {
		entry.ErrorType = &errorType.String
	}
	return entry, nil
}

func (s *Store) execWithRetry(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	result, err := s.db.ExecContext(ctx, query, args...)
	if !shouldRetryExec(err) {
		return result, err
	}
	time.Sleep(100 * time.Millisecond)
	return s.db.ExecContext(ctx, query, args...)
}

func shouldRetryExec(err error) bool {
	if err == nil {
		return false
	}
	if err == sql.ErrConnDone {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "invalid connection") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "unexpected EOF")
}

func BuildProcessLogSubscriptionKey(processID string) string {
	return "process_log:" + processID
}
