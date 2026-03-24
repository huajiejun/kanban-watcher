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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type realtimePublisher interface {
	PublishWorkspaceSnapshot(context.Context) error
	PublishSessionMessagesAppended(context.Context, string, []store.ProcessEntry) error
}

// SyncService 同步服务
type SyncService struct {
	cfg      *config.Config
	store    *store.Store
	apiClient *api.Client
	dialer   *websocket.Dialer
	realtime realtimePublisher

	wsMutex          sync.Mutex
	workspaceStream  *websocket.Conn
	sessionStreams   map[string]*websocket.Conn
	processLogStreams map[string]*websocket.Conn
	historicalLogSem chan struct{}

	stopCh chan struct{}
	wg     sync.WaitGroup
}

const workspaceSummaryRefreshInterval = 15 * time.Second

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
		historicalLogSem:  make(chan struct{}, 2),
		stopCh:            make(chan struct{}),
	}
}

func (s *SyncService) SetRealtimePublisher(publisher realtimePublisher) {
	s.realtime = publisher
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

	s.subscribeWorkspacesStream(ctx)

	s.wg.Add(1)
	go s.pollActiveWorkspaces(ctx)

	fmt.Println("同步服务已启动")
	return nil
}

// Stop 停止服务
func (s *SyncService) Stop() {
	close(s.stopCh)

	s.wsMutex.Lock()
	if s.workspaceStream != nil {
		_ = s.workspaceStream.Close()
	}
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

	ticker := time.NewTicker(s.workspaceRefreshInterval())
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

func (s *SyncService) workspaceRefreshInterval() time.Duration {
	intervalSecs := s.cfg.Database.SyncIntervalSecs
	if intervalSecs <= 0 {
		return workspaceSummaryRefreshInterval
	}

	interval := time.Duration(intervalSecs) * time.Second
	if interval > workspaceSummaryRefreshInterval {
		return workspaceSummaryRefreshInterval
	}
	return interval
}

func (s *SyncService) syncActiveWorkspaces(ctx context.Context) error {
	workspaces, err := s.apiClient.FetchAll(ctx)
	if err != nil {
		return fmt.Errorf("获取工作区列表: %w", err)
	}
	seenAt := time.Now()
	activeWorkspaceIDs := make([]string, 0, len(workspaces))

	for _, ws := range workspaces {
		activeWorkspaceIDs = append(activeWorkspaceIDs, ws.ID)
		dbWS := &store.Workspace{
			ID:              ws.ID,
			Name:            ws.DisplayName,
			Branch:          ws.Branch,
			Archived:        ws.Archived,
			Pinned:          ws.Pinned,
			LatestSessionID: ws.Summary.LatestSessionID,
			IsRunning:       ws.StatusText() == "running",
			HasPendingApproval: ws.Summary.HasPendingApproval,
			HasUnseenTurns:     ws.Summary.HasUnseenTurns,
			HasRunningDevServer: ws.Summary.HasRunningDevServer,
			LastSeenAt:      seenAt,
		}
		if ws.Summary.FilesChanged != nil {
			dbWS.FilesChanged = *ws.Summary.FilesChanged
		}
		if ws.Summary.LinesAdded != nil {
			dbWS.LinesAdded = *ws.Summary.LinesAdded
		}
		if ws.Summary.LinesRemoved != nil {
			dbWS.LinesRemoved = *ws.Summary.LinesRemoved
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

	if err := s.store.MarkMissingWorkspacesArchived(ctx, activeWorkspaceIDs, seenAt); err != nil {
		return fmt.Errorf("归档缺失工作区失败: %w", err)
	}
	if s.realtime != nil {
		if err := s.realtime.PublishWorkspaceSnapshot(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "推送工作区快照失败: %v\n", err)
		}
	}
	return nil
}

func (s *SyncService) subscribeWorkspacesStream(ctx context.Context) {
	s.wsMutex.Lock()
	if s.workspaceStream != nil {
		s.wsMutex.Unlock()
		return
	}
	s.wsMutex.Unlock()

	wsURL, err := buildWSURL(s.cfg.KanbanAPIURL, "/api/workspaces/streams/ws", map[string]string{
		"archived": "false",
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "构造 workspace ws URL 失败: %v\n", err)
		return
	}

	conn, _, err := s.dialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "连接 workspace ws 失败: %v\n", err)
		return
	}

	s.wsMutex.Lock()
	s.workspaceStream = conn
	s.wsMutex.Unlock()

	s.wg.Add(1)
	go s.consumeWorkspacesStream(ctx, conn)
}

func (s *SyncService) consumeWorkspacesStream(ctx context.Context, conn *websocket.Conn) {
	defer s.wg.Done()
	var lastErr error
	defer func() {
		s.wsMutex.Lock()
		if s.workspaceStream == conn {
			s.workspaceStream = nil
		}
		s.wsMutex.Unlock()
		_ = conn.Close()
		if shouldReconnectStream(lastErr) && !s.isStopping() {
			s.scheduleWorkspacesReconnect(ctx)
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
				if !isClosedConnectionOnStop(err, s.isStopping()) {
					fmt.Fprintf(os.Stderr, "读取 workspace ws 失败: %v\n", err)
				}
				return
			}

			workspaces, err := extractWorkspacePatches(message)
			if err != nil {
				continue
			}
			if len(workspaces) == 0 {
				continue
			}
			if err := s.syncActiveWorkspaces(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "workspace ws 触发同步失败: %v\n", err)
			}
		}
	}
}

func (s *SyncService) scheduleWorkspacesReconnect(ctx context.Context) {
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
			s.subscribeWorkspacesStream(ctx)
		}
	}()
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
				if !isClosedConnectionOnStop(err, s.isStopping()) {
					fmt.Fprintf(os.Stderr, "读取 session ws 失败 [%s]: %v\n", sessionID, err)
				}
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
				if err := s.store.RefreshWorkspaceRuntimeState(ctx, workspaceID); err != nil {
					fmt.Fprintf(os.Stderr, "刷新 workspace 运行态失败 [%s]: %v\n", workspaceID, err)
				} else if s.realtime != nil {
					if err := s.realtime.PublishWorkspaceSnapshot(ctx); err != nil {
						fmt.Fprintf(os.Stderr, "推送工作区快照失败 [%s]: %v\n", workspaceID, err)
					}
				}
				if ep.RunReason == "codingagent" && !ep.Dropped {
					s.subscribeProcessLogs(ctx, workspaceID, ep.SessionID, ep.ID, ep.Status)
				}
			}
		}
	}
}

func (s *SyncService) subscribeProcessLogs(ctx context.Context, workspaceID, sessionID, processID, processStatus string) {
	subKey := store.BuildProcessLogSubscriptionKey(processID)
	sub, err := s.store.GetSubscription(ctx, subKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取订阅状态失败 [%s]: %v\n", processID, err)
	} else if sub != nil && shouldSkipHistoricalProcess(processStatus, sub.Status) {
		return
	}
	var lastEntryIndex *int
	if sub != nil {
		lastEntryIndex = sub.LastEntryIndex
	}

	s.wsMutex.Lock()
	if _, exists := s.processLogStreams[processID]; exists {
		s.wsMutex.Unlock()
		return
	}
	s.wsMutex.Unlock()

	historicalSlotAcquired := false
	if processStatus != "running" {
		if !s.acquireHistoricalLogSlot(ctx) {
			return
		}
		historicalSlotAcquired = true
	}

	wsURL, err := buildWSURL(s.cfg.KanbanAPIURL, fmt.Sprintf("/api/execution-processes/%s/normalized-logs/ws", processID), nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "构造 process log ws URL 失败 [%s]: %v\n", processID, err)
		return
	}

	conn, _, err := s.dialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "连接 process log ws 失败 [%s]: %v\n", processID, err)
		_ = s.upsertProcessSubscription(ctx, processID, sessionID, workspaceID, processStatus, nil, "connect_error", err.Error())
		if historicalSlotAcquired {
			s.releaseHistoricalLogSlot()
		}
		return
	}

	_ = s.upsertProcessSubscription(ctx, processID, sessionID, workspaceID, processStatus, nil, "active", "")

	s.wsMutex.Lock()
	s.processLogStreams[processID] = conn
	s.wsMutex.Unlock()

	s.wg.Add(1)
	go s.consumeProcessLogs(ctx, workspaceID, sessionID, processID, processStatus, lastEntryIndex, historicalSlotAcquired, conn)
}

func (s *SyncService) consumeProcessLogs(ctx context.Context, workspaceID, sessionID, processID, processStatus string, lastEntryIndex *int, historicalSlotAcquired bool, conn *websocket.Conn) {
	defer s.wg.Done()
	var lastErr error
	receivedEntries := false
	entryStateByIndex := map[int]store.NormalizedEntry{}
	defer func() {
		if historicalSlotAcquired {
			s.releaseHistoricalLogSlot()
		}
		s.wsMutex.Lock()
		delete(s.processLogStreams, processID)
		s.wsMutex.Unlock()
		_ = conn.Close()
		finalStatus, lastErrText := resolveProcessSubscriptionStatus(processStatus, receivedEntries, s.isStopping(), lastErr)
		_ = s.upsertProcessSubscription(ctx, processID, sessionID, workspaceID, processStatus, nil, finalStatus, lastErrText)
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
				if !isClosedConnectionOnStop(err, s.isStopping()) && (processStatus == "running" || !strings.Contains(err.Error(), "close 1006")) {
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
				if shouldSkipEntryByIndex(lastEntryIndex, patch.EntryIndex) {
					continue
				}
				mergedEntry, ok := mergeEntryPatch(entryStateByIndex[patch.EntryIndex], patch)
				if !ok {
					continue
				}
				if !store.ShouldSync(mergedEntry.EntryType.Type) {
					continue
				}
				entryStateByIndex[patch.EntryIndex] = mergedEntry
				patch.Entry = mergedEntry

				entry, err := s.buildProcessEntry(workspaceID, sessionID, processID, patch)
				if err != nil {
					fmt.Fprintf(os.Stderr, "构建 process entry 失败 [%s]: %v\n", processID, err)
					continue
				}
				existingEntry, err := s.store.GetProcessEntry(ctx, processID, patch.EntryIndex)
				if err != nil {
					fmt.Fprintf(os.Stderr, "读取已有 process entry 失败 [%s:%d]: %v\n", processID, patch.EntryIndex, err)
					continue
				}
				if !shouldPersistProcessEntryUpdate(existingEntry, entry) {
					continue
				}
				shouldBroadcast := shouldBroadcastRealtimeEntry(existingEntry, entry)
				if err := s.store.UpsertProcessEntry(ctx, entry); err != nil {
					fmt.Fprintf(os.Stderr, "保存 process entry 失败 [%s:%d]: %v\n", processID, patch.EntryIndex, err)
					_ = s.upsertProcessSubscription(ctx, processID, sessionID, workspaceID, processStatus, &patch.EntryIndex, "error", err.Error())
					continue
				}
				idx := patch.EntryIndex
				_ = s.upsertProcessSubscription(ctx, processID, sessionID, workspaceID, processStatus, &idx, "active", "")
				lastEntryIndex = &idx
				if shouldBroadcast && s.realtime != nil {
					if err := s.realtime.PublishSessionMessagesAppended(ctx, sessionID, []store.ProcessEntry{*entry}); err != nil {
						fmt.Fprintf(os.Stderr, "推送实时消息失败 [%s:%d]: %v\n", processID, patch.EntryIndex, err)
					}
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
			latestStatus, err := s.store.GetExecutionProcessStatus(ctx, processID)
			if err != nil {
				fmt.Fprintf(os.Stderr, "读取 execution process 状态失败 [%s]: %v\n", processID, err)
				return
			}
			if !shouldReconnectRunningProcessByLatestStatus(latestStatus) {
				return
			}
			s.subscribeProcessLogs(ctx, workspaceID, sessionID, processID, *latestStatus)
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

func shouldReconnectRunningProcessByLatestStatus(status *string) bool {
	return status != nil && *status == "running"
}

func shouldSkipHistoricalProcess(processStatus, subscriptionStatus string) bool {
	if processStatus == "running" {
		return false
	}
	return subscriptionStatus == "completed"
}

func shouldSkipEntryByIndex(lastEntryIndex *int, entryIndex int) bool {
	return lastEntryIndex != nil && entryIndex < *lastEntryIndex
}

func shouldBroadcastRealtimeEntry(existing, next *store.ProcessEntry) bool {
	if next == nil {
		return false
	}
	if existing == nil {
		return true
	}
	return realtimeEntrySignature(existing) != realtimeEntrySignature(next)
}

func realtimeEntrySignature(entry *store.ProcessEntry) string {
	if entry == nil {
		return ""
	}

	parts := []string{
		entry.ProcessID,
		strconv.Itoa(entry.EntryIndex),
		entry.EntryType,
		entry.Role,
		entry.ContentHash,
		derefString(entry.ToolName),
		derefString(entry.ActionTypeJSON),
		derefString(entry.StatusJSON),
		derefString(entry.ErrorType),
	}
	return strings.Join(parts, "::")
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func shouldPersistProcessEntryUpdate(existing, next *store.ProcessEntry) bool {
	if next == nil {
		return false
	}
	if existing == nil {
		return true
	}
	return !next.EntryTimestamp.Before(existing.EntryTimestamp)
}

func resolveProcessSubscriptionStatus(processStatus string, receivedEntries bool, stopping bool, err error) (string, string) {
	if isClosedConnectionOnStop(err, stopping) {
		return "stopped", ""
	}
	if err != nil {
		if processStatus != "running" && strings.Contains(err.Error(), "close 1006") {
			if receivedEntries {
				return "completed_with_entries", ""
			}
			return "completed_empty", ""
		}
		return "error", err.Error()
	}
	if processStatus != "running" {
		if receivedEntries {
			return "completed_with_entries", ""
		}
		return "completed_empty", ""
	}
	return "active", ""
}

func isClosedConnectionOnStop(err error, stopping bool) bool {
	return stopping && err != nil && strings.Contains(err.Error(), "use of closed network connection")
}

func (s *SyncService) upsertProcessSubscription(ctx context.Context, processID, sessionID, workspaceID, processStatus string, lastEntryIndex *int, status, lastErr string) error {
	sub := &store.SyncSubscription{
		SubscriptionKey:  store.BuildProcessLogSubscriptionKey(processID),
		SubscriptionType: "process_log_stream",
		TargetID:         processID,
		SessionID:        stringPtr(sessionID),
		WorkspaceID:      stringPtr(workspaceID),
		LastEntryIndex:   lastEntryIndex,
		Status:           status,
		LastSeenAt:       time.Now(),
	}
	if lastErr != "" {
		sub.LastError = stringPtr(lastErr)
	}
	_ = processStatus
	return s.store.UpsertSubscription(ctx, sub)
}

func (s *SyncService) acquireHistoricalLogSlot(ctx context.Context) bool {
	select {
	case s.historicalLogSem <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	case <-s.stopCh:
		return false
	}
}

func (s *SyncService) releaseHistoricalLogSlot() {
	select {
	case <-s.historicalLogSem:
	default:
	}
}

func (s *SyncService) isStopping() bool {
	select {
	case <-s.stopCh:
		return true
	default:
		return false
	}
}
