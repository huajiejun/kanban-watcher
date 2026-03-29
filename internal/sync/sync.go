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
	cfg       *config.Config
	store     *store.Store
	apiClient *api.Client
	dialer    *websocket.Dialer
	realtime  realtimePublisher

	processEntryBuffer *processEntryBuffer
	workspaceStateThrottle *workspaceStateThrottle

	wsMutex           sync.Mutex
	workspaceStream   *websocket.Conn
	sessionStreams    map[string]*websocket.Conn
	processLogStreams map[string]*websocket.Conn
	historicalLogSem  chan struct{}

	stopCh chan struct{}
	wg     sync.WaitGroup
}

const workspaceSummaryRefreshInterval = 15 * time.Second
const processEntryBufferFlushInterval = 200 * time.Millisecond

// NewSyncService 创建同步服务实例
func NewSyncService(cfg *config.Config, dbStore *store.Store) *SyncService {
	service := &SyncService{
		cfg:       cfg,
		store:     dbStore,
		apiClient: api.NewClient(cfg.KanbanAPIURL),
		dialer: &websocket.Dialer{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		sessionStreams:    make(map[string]*websocket.Conn),
		processLogStreams: make(map[string]*websocket.Conn),
		historicalLogSem:  make(chan struct{}, 2),
		stopCh:            make(chan struct{}),
	}
	service.processEntryBuffer = newProcessEntryBuffer(
		processEntryBufferFlushInterval,
		dbStore,
		func(ctx context.Context, entry *store.ProcessEntry, lastEntryIndex *int) error {
			if entry == nil {
				return nil
			}
			return dbStore.UpsertSubscription(ctx, &store.SyncSubscription{
				SubscriptionKey:  store.BuildProcessLogSubscriptionKey(entry.ProcessID),
				SubscriptionType: "process_log_stream",
				TargetID:         entry.ProcessID,
				SessionID:        stringPtr(entry.SessionID),
				WorkspaceID:      stringPtr(entry.WorkspaceID),
				LastEntryIndex:   lastEntryIndex,
				Status:           "active",
				LastSeenAt:       time.Now(),
			})
		},
	)
	service.workspaceStateThrottle = newWorkspaceStateThrottle(workspaceStateRefreshThrottle)
	return service
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
	if s.processEntryBuffer != nil {
		if err := s.processEntryBuffer.FlushAll(context.Background()); err != nil {
			fmt.Fprintf(os.Stderr, "停止前刷出 process entry 缓冲失败: %v\n", err)
		}
	}
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
			ID:                  ws.ID,
			Name:                ws.DisplayName,
			Branch:              ws.Branch,
			Archived:            ws.Archived,
			Pinned:              ws.Pinned,
			LatestSessionID:     ws.Summary.LatestSessionID,
			IsRunning:           ws.StatusText() == "running",
			HasPendingApproval:  ws.Summary.HasPendingApproval,
			HasUnseenTurns:      ws.Summary.HasUnseenTurns,
			HasRunningDevServer: ws.Summary.HasRunningDevServer,
			LastSeenAt:          seenAt,
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

	// 补充同步 issue_id（非阻塞，不影响主同步）
	s.syncWorkspaceIssueIDs(ctx)

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
	s.tracef("connect session ws workspace=%s session=%s url=%s", workspaceID, sessionID, wsURL)

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
				if shouldLogSessionStreamError(err, s.isStopping()) {
					fmt.Fprintf(os.Stderr, "读取 session ws 失败 [%s]: %v\n", sessionID, err)
				} else {
					s.tracef("session ws closed workspace=%s session=%s err=%v", workspaceID, sessionID, err)
				}
				return
			}
			s.tracef("session ws message workspace=%s session=%s raw=%s", workspaceID, sessionID, traceRawMessage(message))

			processes, err := extractExecutionProcesses(message)
			if err != nil {
				s.tracef("session ws decode failed workspace=%s session=%s err=%v", workspaceID, sessionID, err)
				continue
			}
			s.tracef("session ws decoded workspace=%s session=%s process_count=%d", workspaceID, sessionID, len(processes))
			for _, process := range processes {
				s.tracef(
					"session ws process workspace=%s session=%s process=%s status=%s run_reason=%s dropped=%t created_at=%v completed_at=%v",
					workspaceID,
					sessionID,
					process.ID,
					process.Status,
					process.RunReason,
					process.Dropped,
					process.CreatedAt,
					process.CompletedAt,
				)
				ep := toStoreExecutionProcess(workspaceID, process)
				if err := s.store.UpsertExecutionProcess(ctx, ep); err != nil {
					fmt.Fprintf(os.Stderr, "保存 execution process 失败 [%s]: %v\n", ep.ID, err)
					continue
				}
				if promptEntry, err := processPromptEntryFromProcess(workspaceID, process, time.Now()); err != nil {
					fmt.Fprintf(os.Stderr, "提取用户消息失败 [%s]: %v\n", ep.ID, err)
				} else if promptEntry != nil {
					if err := s.store.UpsertProcessEntry(ctx, promptEntry); err != nil {
						fmt.Fprintf(os.Stderr, "保存用户消息失败 [%s]: %v\n", ep.ID, err)
					}
				}
				if msgCtx, err := messageContextFromProcess(workspaceID, process, time.Now()); err != nil {
					fmt.Fprintf(os.Stderr, "提取消息上下文失败 [%s]: %v\n", ep.ID, err)
				} else if msgCtx != nil {
					if err := s.store.UpsertMessageContext(ctx, msgCtx); err != nil {
						fmt.Fprintf(os.Stderr, "保存消息上下文失败 [%s]: %v\n", ep.ID, err)
					}
				}
				s.refreshWorkspaceRuntimeStateIfDue(ctx, workspaceID, ep.Status)
				if shouldSubscribeProcessLogs(ep.RunReason, ep.Dropped, ep.Status) {
					s.subscribeProcessLogs(ctx, workspaceID, ep.SessionID, ep.ID, ep.Status, ep.CreatedAt)
				}
			}
		}
	}
}

func (s *SyncService) subscribeProcessLogs(
	ctx context.Context,
	workspaceID,
	sessionID,
	processID,
	processStatus string,
	processCreatedAt *time.Time,
) {
	subKey := store.BuildProcessLogSubscriptionKey(processID)
	sub, err := s.store.GetSubscription(ctx, subKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取订阅状态失败 [%s]: %v\n", processID, err)
	} else if sub != nil && shouldSkipHistoricalProcess(processStatus, sub) {
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
	s.tracef(
		"connect process log ws workspace=%s session=%s process=%s status=%s url=%s last_entry_index=%v",
		workspaceID,
		sessionID,
		processID,
		processStatus,
		wsURL,
		lastEntryIndex,
	)

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
	go s.consumeProcessLogs(ctx, workspaceID, sessionID, processID, processStatus, processCreatedAt, lastEntryIndex, historicalSlotAcquired, conn)
}

func (s *SyncService) consumeProcessLogs(
	ctx context.Context,
	workspaceID,
	sessionID,
	processID,
	processStatus string,
	processCreatedAt *time.Time,
	lastEntryIndex *int,
	historicalSlotAcquired bool,
	conn *websocket.Conn,
) {
	defer s.wg.Done()
	var lastErr error
	receivedEntries := false
	entryStateByIndex := map[int]store.NormalizedEntry{}
	processEntriesByIndex := map[int]*store.ProcessEntry{}
	defer func() {
		if s.processEntryBuffer != nil {
			if err := s.processEntryBuffer.FlushProcess(ctx, processID); err != nil {
				fmt.Fprintf(os.Stderr, "刷出 process entry 缓冲失败 [%s]: %v\n", processID, err)
			}
		}
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
			s.tracef("process log ws message workspace=%s session=%s process=%s raw=%s", workspaceID, sessionID, processID, traceRawMessage(message))

			patches, err := extractEntryPatches(message)
			if err != nil {
				s.tracef("process log decode failed workspace=%s session=%s process=%s err=%v", workspaceID, sessionID, processID, err)
				continue
			}
			s.tracef("process log decoded workspace=%s session=%s process=%s patch_count=%d", workspaceID, sessionID, processID, len(patches))
			if len(patches) > 0 {
				receivedEntries = true
			}
			for _, patch := range patches {
				s.tracef("process log patch workspace=%s session=%s process=%s %s", workspaceID, sessionID, processID, tracePatchSummary(patch))
				effectiveLastEntryIndex := lastEntryIndex
				if s.processEntryBuffer != nil {
					if bufferedLastEntryIndex := s.processEntryBuffer.LastEntryIndex(processID); bufferedLastEntryIndex != nil &&
						(effectiveLastEntryIndex == nil || *bufferedLastEntryIndex > *effectiveLastEntryIndex) {
						effectiveLastEntryIndex = bufferedLastEntryIndex
					}
				}
				if shouldSkipEntryByIndex(effectiveLastEntryIndex, patch.EntryIndex) {
					s.tracef("process log skip by last_entry_index workspace=%s session=%s process=%s idx=%d last_entry_index=%v", workspaceID, sessionID, processID, patch.EntryIndex, effectiveLastEntryIndex)
					continue
				}
				mergedEntry, ok := mergeEntryPatch(entryStateByIndex[patch.EntryIndex], patch)
				if !ok {
					s.tracef("process log merge incomplete workspace=%s session=%s process=%s idx=%d", workspaceID, sessionID, processID, patch.EntryIndex)
					continue
				}
				if !store.ShouldSync(mergedEntry.EntryType.Type) {
					s.tracef("process log skip unsynced type workspace=%s session=%s process=%s idx=%d type=%s", workspaceID, sessionID, processID, patch.EntryIndex, mergedEntry.EntryType.Type)
					continue
				}
				entryStateByIndex[patch.EntryIndex] = mergedEntry
				patch.Entry = mergedEntry
				s.tracef("process log merged workspace=%s session=%s process=%s %s", workspaceID, sessionID, processID, tracePatchSummary(patch))

				existingEntry := processEntriesByIndex[patch.EntryIndex]
				entry, err := s.buildProcessEntry(workspaceID, sessionID, processID, patch, existingEntry, processCreatedAt)
				if err != nil {
					fmt.Fprintf(os.Stderr, "构建 process entry 失败 [%s]: %v\n", processID, err)
					continue
				}
				shouldPersist := shouldPersistProcessEntryUpdate(existingEntry, entry)
				shouldBroadcast := shouldBroadcastRealtimeEntry(existingEntry, entry)
				s.tracef(
					"process log decision workspace=%s session=%s process=%s idx=%d persist=%t broadcast=%t existing=%s next=%s raw_ts=%q",
					workspaceID,
					sessionID,
					processID,
					patch.EntryIndex,
					shouldPersist,
					shouldBroadcast,
					traceProcessEntrySummary(existingEntry),
					traceProcessEntrySummary(entry),
					patch.Entry.Timestamp,
				)
				if !shouldPersist {
					continue
				}
				processEntriesByIndex[patch.EntryIndex] = entry
				if s.processEntryBuffer != nil {
					s.processEntryBuffer.Enqueue(processID, entry, lastEntryIndex)
				}
				s.tracef("process log buffered workspace=%s session=%s process=%s idx=%d summary=%s", workspaceID, sessionID, processID, patch.EntryIndex, traceProcessEntrySummary(entry))
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
			processRecord, err := s.store.GetExecutionProcess(ctx, processID)
			if err != nil {
				fmt.Fprintf(os.Stderr, "读取 execution process 详情失败 [%s]: %v\n", processID, err)
				return
			}
			if !shouldReconnectRunningProcessByLatestStatus(latestStatus) {
				return
			}
			var processCreatedAt *time.Time
			if processRecord != nil {
				processCreatedAt = processRecord.CreatedAt
			}
			s.subscribeProcessLogs(ctx, workspaceID, sessionID, processID, *latestStatus, processCreatedAt)
		}
	}()
}

func (s *SyncService) buildProcessEntry(
	workspaceID,
	sessionID,
	processID string,
	patch entryPatch,
	existing *store.ProcessEntry,
	processCreatedAt *time.Time,
) (*store.ProcessEntry, error) {
	timestampSource := store.ProcessEntryTimestampSourceEntry
	entryTime, err := parseEntryTimestamp(patch.Entry.Timestamp)
	if err != nil {
		if existing != nil {
			entryTime = existing.EntryTimestamp
			timestampSource = store.ProcessEntryTimestampSourceExisting
		} else if processCreatedAt != nil {
			entryTime = *processCreatedAt
			timestampSource = store.ProcessEntryTimestampSourceProcessCreatedAt
			s.tracef(
				"entry timestamp fallback workspace=%s session=%s process=%s idx=%d raw=%q fallback=%s",
				workspaceID,
				sessionID,
				processID,
				patch.EntryIndex,
				patch.Entry.Timestamp,
				entryTime.Format(time.RFC3339Nano),
			)
		} else {
			return nil, fmt.Errorf(
				"entry_timestamp 解析失败且缺少兜底时间 [%s:%d] raw=%q: %w",
				processID,
				patch.EntryIndex,
				patch.Entry.Timestamp,
				err,
			)
		}
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
		ProcessID:       processID,
		SessionID:       sessionID,
		WorkspaceID:     workspaceID,
		EntryIndex:      patch.EntryIndex,
		EntryType:       patch.Entry.EntryType.Type,
		Role:            store.ToRole(patch.Entry.EntryType.Type),
		Content:         patch.Entry.Content,
		ToolName:        patch.Entry.EntryType.ToolName,
		ActionTypeJSON:  actionTypeJSON,
		StatusJSON:      statusJSON,
		ErrorType:       errorType,
		EntryTimestamp:  entryTime,
		ContentHash:     hex.EncodeToString(hash[:]),
		TimestampSource: timestampSource,
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

func processPromptEntryFromProcess(workspaceID string, process remoteExecutionProcess, now time.Time) (*store.ProcessEntry, error) {
	if process.RunReason != "codingagent" {
		return nil, nil
	}

	actionType := process.ExecutorAction.Typ.Type
	switch actionType {
	case "CodingAgentInitialRequest", "CodingAgentFollowUpRequest", "ReviewRequest":
	default:
		return nil, nil
	}

	prompt := strings.TrimSpace(process.ExecutorAction.Typ.Prompt)
	if prompt == "" {
		return nil, nil
	}

	entryTimestamp := now
	if parsed := parseTimePtrValue(process.CreatedAt); parsed != nil {
		entryTimestamp = *parsed
	}
	hash := sha256.Sum256([]byte(prompt))

	return &store.ProcessEntry{
		ProcessID:      process.ID,
		SessionID:      process.SessionID,
		WorkspaceID:    workspaceID,
		EntryIndex:     -1,
		EntryType:      "user_message",
		Role:           "user",
		Content:        prompt,
		EntryTimestamp: entryTimestamp,
		ContentHash:    hex.EncodeToString(hash[:]),
	}, nil
}

func messageContextFromProcess(workspaceID string, process remoteExecutionProcess, now time.Time) (*store.MessageContext, error) {
	if process.RunReason != "codingagent" {
		return nil, nil
	}
	if len(process.ExecutorAction.Typ.ExecutorConfig) == 0 {
		return nil, nil
	}

	encoded, err := json.Marshal(process.ExecutorAction.Typ.ExecutorConfig)
	if err != nil {
		return nil, fmt.Errorf("marshal executor config: %w", err)
	}

	msgCtx := &store.MessageContext{
		WorkspaceID:        workspaceID,
		SessionID:          process.SessionID,
		ProcessID:          optionalString(process.ID),
		ExecutorConfigJSON: string(encoded),
		DefaultSendMode:    "send",
		Source:             "sync",
		UpdatedAt:          now,
	}

	if executor, ok := process.ExecutorAction.Typ.ExecutorConfig["executor"].(string); ok && executor != "" {
		msgCtx.Executor = optionalString(executor)
	}
	if variant, ok := process.ExecutorAction.Typ.ExecutorConfig["variant"].(string); ok && variant != "" {
		msgCtx.Variant = optionalString(variant)
	}
	if forceWhenDirty, ok := process.ExecutorAction.Typ.ExecutorConfig["force_when_dirty"].(bool); ok {
		msgCtx.ForceWhenDirty = boolPtr(forceWhenDirty)
	}
	if performGitReset, ok := process.ExecutorAction.Typ.ExecutorConfig["perform_git_reset"].(bool); ok {
		msgCtx.PerformGitReset = boolPtr(performGitReset)
	}

	return msgCtx, nil
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

func boolPtr(v bool) *bool {
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

func shouldSubscribeProcessLogs(runReason string, dropped bool, processStatus string) bool {
	return runReason == "codingagent" && !dropped && processStatus == "running"
}

func shouldSkipHistoricalProcess(processStatus string, sub *store.SyncSubscription) bool {
	if processStatus == "running" {
		return false
	}
	if sub == nil {
		return false
	}
	if sub.LastEntryIndex != nil {
		return true
	}
	return sub.Status == "completed"
}

func shouldSkipEntryByIndex(lastEntryIndex *int, entryIndex int) bool {
	return lastEntryIndex != nil && entryIndex < *lastEntryIndex
}

func shouldBroadcastRealtimeEntry(existing, next *store.ProcessEntry) bool {
	if next == nil {
		return false
	}
	if next.TimestampSource == store.ProcessEntryTimestampSourceProcessCreatedAt {
		return false
	}
	if next.EntryType == "tool_use" {
		nextStatus, nextHasStatus := toolUseRealtimeStatus(next.StatusJSON)
		if nextHasStatus && nextStatus == "running" {
			return false
		}
		if existing != nil {
			existingStatus, existingHasStatus := toolUseRealtimeStatus(existing.StatusJSON)
			if nextStatus == existingStatus && nextHasStatus == existingHasStatus {
				return false
			}
		}
	}
	if existing == nil {
		return true
	}
	return realtimeEntrySignature(existing) != realtimeEntrySignature(next)
}

func toolUseRealtimeStatus(raw *string) (string, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "", false
	}

	var status struct {
		Status string `json:"status"`
		State  string `json:"state"`
	}
	if err := json.Unmarshal([]byte(*raw), &status); err != nil {
		return "", false
	}

	value := strings.TrimSpace(status.Status)
	if value == "" {
		value = strings.TrimSpace(status.State)
	}
	if value == "" {
		return "", false
	}
	return strings.ToLower(value), true
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
	return processEntryUpdateSignature(existing) != processEntryUpdateSignature(next)
}

func processEntryUpdateSignature(entry *store.ProcessEntry) string {
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

func shouldLogSessionStreamError(err error, stopping bool) bool {
	if isClosedConnectionOnStop(err, stopping) {
		return false
	}
	if err == nil {
		return false
	}
	msg := err.Error()
	return !strings.Contains(msg, "close 1006") || !strings.Contains(msg, "unexpected EOF")
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

// syncWorkspaceIssueIDs 为 issue_id 为空的工作区补充同步 issue_id
// 通过上游远程代理 GET /api/remote/workspaces/by-local-id/{id} 获取
// 每轮最多处理 10 个，避免阻塞主同步
func (s *SyncService) syncWorkspaceIssueIDs(ctx context.Context) {
	ids, err := s.store.ListWorkspaceIDsWithNullIssueID(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "查询空 issue_id 工作区失败: %v\n", err)
		return
	}
	if len(ids) == 0 {
		return
	}

	const maxPerCycle = 10
	if len(ids) > maxPerCycle {
		ids = ids[:maxPerCycle]
	}

	for _, id := range ids {
		if s.isStopping() {
			return
		}
		issueID, err := s.apiClient.FetchWorkspaceIssueID(ctx, id)
		if err != nil {
			s.tracef("sync issue_id 失败 workspace=%s err=%v", id, err)
			continue
		}
		if err := s.store.UpdateWorkspaceIssueID(ctx, id, issueID); err != nil {
			s.tracef("更新 issue_id 失败 workspace=%s err=%v", id, err)
		}
	}
}
