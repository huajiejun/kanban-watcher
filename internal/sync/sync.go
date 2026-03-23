package sync

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// SyncService 同步服务
type SyncService struct {
	cfg      *config.Config
	store    *store.Store
	apiClient *api.Client
	dialer   *websocket.Dialer

	wsMutex          sync.Mutex
	sessionStreams   map[string]*websocket.Conn
	processLogStreams map[string]*websocket.Conn

	stopCh chan struct{}
	wg     sync.WaitGroup
}

// NewSyncService 创建同步服务实例
func NewSyncService(cfg *config.Config, store *store.Store) *SyncService {
	return &SyncService{
		cfg:       cfg,
		store:     store,
		apiClient: api.NewClient(cfg.KanbanAPIURL),
		dialer: &websocket.Dialer{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		sessionStreams:    make(map[string]*websocket.Conn),
		processLogStreams: make(map[string]*websocket.Conn),
		stopCh:            make(chan struct{}),
	}
}

// Start 启动同步服务
func (s *SyncService) Start(ctx context.Context) error {
	if !s.cfg.Database.IsEnabled() {
		fmt.Println("数据库同步未启用，跳过启动")
		return nil
	}
	if err := s.store.InitSchema(ctx); err != nil {
		return fmt.Errorf("初始化数据库 schema: %w", err)
	}

	if err := s.syncActiveWorkspaces(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "首轮同步失败: %v\n", err)
	}

	s.wg.Add(1)
	go s.pollActiveWorkspaces(ctx)

	fmt.Println("同步服务已启动")
	return nil
}

// Stop 停止服务
func (s *SyncService) Stop() {
	close(s.stopCh)

	s.wsMutex.Lock()
	for _, conn := range s.sessionStreams {
		_ = conn.Close()
	}
	for _, conn := range s.processLogStreams {
		_ = conn.Close()
	}
	s.wsMutex.Unlock()

	s.wg.Wait()
}

func (s *SyncService) pollActiveWorkspaces(ctx context.Context) {
	defer s.wg.Done()

	intervalSecs := s.cfg.Database.SyncIntervalSecs
	if intervalSecs <= 0 {
		intervalSecs = 30
	}

	ticker := time.NewTicker(time.Duration(intervalSecs) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-ticker.C:
			if err := s.syncActiveWorkspaces(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "同步活跃工作区失败: %v\n", err)
			}
		}
	}
}

func (s *SyncService) syncActiveWorkspaces(ctx context.Context) error {
	workspaces, err := s.apiClient.FetchAll(ctx)
	if err != nil {
		return fmt.Errorf("获取工作区列表: %w", err)
	}

	for _, ws := range workspaces {
		dbWS := &store.Workspace{
			ID:              ws.ID,
			Name:            ws.DisplayName,
			Branch:          ws.Branch,
			Archived:        ws.Archived,
			Pinned:          ws.Pinned,
			LatestSessionID: ws.Summary.LatestSessionID,
			IsRunning:       ws.StatusText() == "running",
			LastSeenAt:      time.Now(),
		}
		if ws.Summary.LatestProcessStatus != nil {
			dbWS.LatestProcessStatus = ws.Summary.LatestProcessStatus
		}
		if parsed := parseTimePtr(ws.CreatedAt); parsed != nil {
			dbWS.CreatedAt = parsed
		}
		if parsed := parseTimePtr(ws.UpdatedAt); parsed != nil {
			dbWS.UpdatedAt = parsed
		}
		if err := s.store.UpsertWorkspace(ctx, dbWS); err != nil {
			fmt.Fprintf(os.Stderr, "upsert workspace 失败 [%s]: %v\n", ws.ID, err)
			continue
		}

		if ws.Summary.LatestSessionID == nil || *ws.Summary.LatestSessionID == "" {
			continue
		}

		session := &store.Session{
			ID:          *ws.Summary.LatestSessionID,
			WorkspaceID: ws.ID,
		}
		if err := s.store.UpsertSession(ctx, session); err != nil {
			fmt.Fprintf(os.Stderr, "upsert session 失败 [%s]: %v\n", session.ID, err)
			continue
		}

		s.subscribeSessionProcesses(ctx, ws.ID, session.ID)
	}
	return nil
}

func (s *SyncService) subscribeSessionProcesses(ctx context.Context, workspaceID, sessionID string) {
	s.wsMutex.Lock()
	if _, exists := s.sessionStreams[sessionID]; exists {
		s.wsMutex.Unlock()
		return
	}
	s.wsMutex.Unlock()

	wsURL, err := buildWSURL(s.cfg.KanbanAPIURL, "/api/execution-processes/stream/session/ws", map[string]string{
		"session_id": sessionID,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "构造 session ws URL 失败 [%s]: %v\n", sessionID, err)
		return
	}

	conn, _, err := s.dialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "连接 session ws 失败 [%s]: %v\n", sessionID, err)
		return
	}

	s.wsMutex.Lock()
	s.sessionStreams[sessionID] = conn
	s.wsMutex.Unlock()

	s.wg.Add(1)
	go s.consumeSessionProcesses(ctx, workspaceID, sessionID, conn)
}

func (s *SyncService) consumeSessionProcesses(ctx context.Context, workspaceID, sessionID string, conn *websocket.Conn) {
	defer s.wg.Done()
	var lastErr error
	defer func() {
		s.wsMutex.Lock()
		delete(s.sessionStreams, sessionID)
		s.wsMutex.Unlock()
		_ = conn.Close()
		if shouldReconnectStream(lastErr) && !s.isStopping() {
			s.scheduleSessionReconnect(ctx, workspaceID, sessionID)
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		default:
			_, message, err := conn.ReadMessage()
			if err != nil {
				lastErr = err
				fmt.Fprintf(os.Stderr, "读取 session ws 失败 [%s]: %v\n", sessionID, err)
				return
			}

			processes, err := extractExecutionProcesses(message)
			if err != nil {
				continue
			}
			for _, process := range processes {
				ep := toStoreExecutionProcess(workspaceID, process)
				if err := s.store.UpsertExecutionProcess(ctx, ep); err != nil {
					fmt.Fprintf(os.Stderr, "保存 execution process 失败 [%s]: %v\n", ep.ID, err)
					continue
				}
				if ep.RunReason == "codingagent" && !ep.Dropped {
					s.subscribeProcessLogs(ctx, workspaceID, ep.SessionID, ep.ID, ep.Status)
				}
			}
		}
	}
}

func (s *SyncService) subscribeProcessLogs(ctx context.Context, workspaceID, sessionID, processID, processStatus string) {
	s.wsMutex.Lock()
	if _, exists := s.processLogStreams[processID]; exists {
		s.wsMutex.Unlock()
		return
	}
	s.wsMutex.Unlock()

	wsURL, err := buildWSURL(s.cfg.KanbanAPIURL, fmt.Sprintf("/api/execution-processes/%s/normalized-logs/ws", processID), nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "构造 process log ws URL 失败 [%s]: %v\n", processID, err)
		return
	}

	conn, _, err := s.dialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "连接 process log ws 失败 [%s]: %v\n", processID, err)
		return
	}

	s.wsMutex.Lock()
	s.processLogStreams[processID] = conn
	s.wsMutex.Unlock()

	s.wg.Add(1)
	go s.consumeProcessLogs(ctx, workspaceID, sessionID, processID, processStatus, conn)
}

func (s *SyncService) consumeProcessLogs(ctx context.Context, workspaceID, sessionID, processID, processStatus string, conn *websocket.Conn) {
	defer s.wg.Done()
	var lastErr error
	receivedEntries := false
	defer func() {
		s.wsMutex.Lock()
		delete(s.processLogStreams, processID)
		s.wsMutex.Unlock()
		_ = conn.Close()
		if shouldReconnectProcessLog(processStatus, receivedEntries, lastErr) && !s.isStopping() {
			s.scheduleProcessReconnect(ctx, workspaceID, sessionID, processID, processStatus)
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		default:
			_, message, err := conn.ReadMessage()
			if err != nil {
				lastErr = err
				if processStatus == "running" || !strings.Contains(err.Error(), "close 1006") {
					fmt.Fprintf(os.Stderr, "读取 normalized logs ws 失败 [%s]: %v\n", processID, err)
				}
				return
			}

			patches, err := extractEntryPatches(message)
			if err != nil {
				continue
			}
			if len(patches) > 0 {
				receivedEntries = true
			}
			for _, patch := range patches {
				if !store.ShouldSync(patch.Entry.EntryType.Type) {
					continue
				}

				entry, err := s.buildProcessEntry(workspaceID, sessionID, processID, patch)
				if err != nil {
					fmt.Fprintf(os.Stderr, "构建 process entry 失败 [%s]: %v\n", processID, err)
					continue
				}
				if err := s.store.UpsertProcessEntry(ctx, entry); err != nil {
					fmt.Fprintf(os.Stderr, "保存 process entry 失败 [%s:%d]: %v\n", processID, patch.EntryIndex, err)
				}
			}
		}
	}
}

func (s *SyncService) scheduleSessionReconnect(ctx context.Context, workspaceID, sessionID string) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-timer.C:
			s.subscribeSessionProcesses(ctx, workspaceID, sessionID)
		}
	}()
}

func (s *SyncService) scheduleProcessReconnect(ctx context.Context, workspaceID, sessionID, processID, processStatus string) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-timer.C:
			s.subscribeProcessLogs(ctx, workspaceID, sessionID, processID, processStatus)
		}
	}()
}

func (s *SyncService) buildProcessEntry(workspaceID, sessionID, processID string, patch entryPatch) (*store.ProcessEntry, error) {
	entryTime, err := parseEntryTimestamp(patch.Entry.Timestamp)
	if err != nil {
		entryTime = time.Now()
	}

	var actionTypeJSON, statusJSON, errorType *string
	if patch.Entry.EntryType.ActionType != nil {
		if raw, err := json.Marshal(patch.Entry.EntryType.ActionType); err == nil {
			actionTypeJSON = stringPtr(string(raw))
		}
	}
	if patch.Entry.EntryType.Status != nil {
		if raw, err := json.Marshal(patch.Entry.EntryType.Status); err == nil {
			statusJSON = stringPtr(string(raw))
		}
	}
	if patch.Entry.EntryType.ErrorType != nil && patch.Entry.EntryType.ErrorType.Type != "" {
		errorType = stringPtr(patch.Entry.EntryType.ErrorType.Type)
	}

	hash := sha256.Sum256([]byte(patch.Entry.Content))

	return &store.ProcessEntry{
		ProcessID:      processID,
		SessionID:      sessionID,
		WorkspaceID:    workspaceID,
		EntryIndex:     patch.EntryIndex,
		EntryType:      patch.Entry.EntryType.Type,
		Role:           store.ToRole(patch.Entry.EntryType.Type),
		Content:        patch.Entry.Content,
		ToolName:       patch.Entry.EntryType.ToolName,
		ActionTypeJSON: actionTypeJSON,
		StatusJSON:     statusJSON,
		ErrorType:      errorType,
		EntryTimestamp: entryTime,
		ContentHash:    hex.EncodeToString(hash[:]),
	}, nil
}

func toStoreExecutionProcess(workspaceID string, process remoteExecutionProcess) *store.ExecutionProcess {
	return &store.ExecutionProcess{
		ID:                 process.ID,
		SessionID:          process.SessionID,
		WorkspaceID:        workspaceID,
		RunReason:          process.RunReason,
		Status:             process.Status,
		Executor:           process.Executor,
		ExecutorActionType: optionalString(process.ExecutorAction.Typ.Type),
		Dropped:            process.Dropped,
		CreatedAt:          parseTimePtrValue(process.CreatedAt),
		CompletedAt:        parseTimePtrValue(process.CompletedAt),
	}
}

func buildWSURL(baseURL, path string, query map[string]string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}

	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	default:
		parsed.Scheme = "ws"
	}
	parsed.Path = path
	values := parsed.Query()
	for key, value := range query {
		values.Set(key, value)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func parseEntryTimestamp(raw string) (time.Time, error) {
	layouts := []string{time.RFC3339Nano, time.RFC3339}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("unsupported time format: %s", raw)
}

func parseTimePtr(raw string) *time.Time {
	parsed, err := parseEntryTimestamp(raw)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseTimePtrValue(raw *string) *time.Time {
	if raw == nil || *raw == "" {
		return nil
	}
	return parseTimePtr(*raw)
}

func optionalString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func stringPtr(v string) *string {
	return &v
}

func shouldReconnectStream(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if strings.Contains(msg, "close 1000") {
		return false
	}
	return strings.Contains(msg, "unexpected EOF") ||
		strings.Contains(msg, "bad handshake") ||
		strings.Contains(msg, "close 1006")
}

func shouldReconnectProcessLog(processStatus string, receivedEntries bool, err error) bool {
	if !shouldReconnectStream(err) {
		return false
	}
	return processStatus == "running"
}

func (s *SyncService) isStopping() bool {
	select {
	case <-s.stopCh:
		return true
	default:
		return false
	}
}
