package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

// SyncService 同步服务
type SyncService struct {
	cfg       *config.Config
	store    *store.Store
	client   *http.Client
	wsConns   map[string]*websocket.Conn // session_id -> conn
	wsMutex   sync.RWMutex
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

// NewSyncService 创建同步服务实例
func NewSyncService(cfg *config.Config, store *store.Store) *SyncService {
	return &SyncService{
		cfg:     cfg,
		store:   store,
		client:  &http.Client{Timeout: 30 * time.Second},
		wsConns: make(map[string]*websocket.Conn),
		stopCh:  make(chan struct{}),
	}
}

// Start 启动同步服务
func (s *SyncService) Start(ctx context.Context) error {
	if !s.cfg.Database.IsEnabled() {
		fmt.Println("数据库同步未启用，跳过启动")
		return nil
	}

	// 初始化数据库表结构
	if err := s.store.InitSchema(ctx); err != nil {
		return fmt.Errorf("初始化数据库 schema: %w", err)
	}

	// 启动工作区轮询
	s.wg.Add(1)
	go s.pollWorkspaces(ctx)

	fmt.Println("同步服务已启动")
	return nil
}

// Stop 停止同步服务
func (s *SyncService) Stop() {
	close(s.stopCh)
	s.wg.Wait()

	// 关闭所有 WebSocket 连接
	s.wsMutex.Lock()
	for _, conn := range s.wsConns {
		conn.Close()
	}
	s.wsMutex.Unlock()
}

// pollWorkspaces 轮询活跃的工作区
func (s *SyncService) pollWorkspaces(ctx context.Context) {
	defer s.wg.Done()

	syncInterval := s.cfg.Database.SyncIntervalSecs
	if syncInterval <= 0 {
		syncInterval = 30
	}
	interval := time.Duration(syncInterval) * time.Second

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.syncActiveWorkspaces(ctx)
		}
	}
}

// syncActiveWorkspaces 同步活跃的工作区
func (s *SyncService) syncActiveWorkspaces(ctx context.Context) {
	// 获取活跃工作区列表
	url := fmt.Sprintf("%s/api/workspaces/summaries?archived=false", s.cfg.KanbanAPIURL)

	resp, err := s.client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "获取工作区列表失败: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "获取工作区列表返回状态码: %d\n", resp.StatusCode)
		return
	}

	var workspaces []api.EnrichedWorkspace
	if err := json.NewDecoder(resp.Body).Decode(&workspaces); err != nil {
		fmt.Fprintf(os.Stderr, "解析工作区列表失败: %v\n", err)
		return
	}

	fmt.Printf("获取到 %d 个活跃工作区\n", len(workspaces))

	// 处理每个工作区
	for _, ws := range workspaces {
		s.syncWorkspace(ctx, ws)
	}
}

// syncWorkspace 同步单个工作区
func (s *SyncService) syncWorkspace(ctx context.Context, ws api.EnrichedWorkspace) {
	// 保存工作区到数据库
	if err := s.upsertWorkspace(ctx, ws); err != nil {
		fmt.Fprintf(os.Stderr, "保存工作区 %s 失败: %v\n", ws.ID, err)
		return
	}

	// 获取最新的 session ID
	sessionID := ws.Summary.LatestSessionID
	if sessionID == nil || *sessionID == "" {
		return
	}

	// 订阅 session 的消息
	s.subscribeSession(ctx, ws.ID, *sessionID)
}

// upsertWorkspace 保存或更新工作区
func (s *SyncService) upsertWorkspace(ctx context.Context, ws api.EnrichedWorkspace) error {
	createdAt, _ := time.Parse(time.RFC3339, ws.Workspace.CreatedAt)
	updatedAt, _ := time.Parse(time.RFC3339, ws.Workspace.UpdatedAt)

	dbWS := &store.Workspace{
		ID:              ws.Workspace.ID,
		Name:            ws.DisplayName,
		Branch:          ws.Workspace.Branch,
		Archived:        ws.Workspace.Archived,
		Pinned:          ws.Workspace.Pinned,
		LatestSessionID: ws.Summary.LatestSessionID,
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}
	return s.store.UpsertWorkspace(ctx, dbWS)
}

// subscribeSession 订阅 session 的 WebSocket 消息
func (s *SyncService) subscribeSession(ctx context.Context, workspaceID, sessionID string) {
	s.wsMutex.RLock()
	_, exists := s.wsConns[sessionID]
	s.wsMutex.RUnlock()

	if exists {
		return // 已经订阅
	}

	// 构建 WebSocket URL
	wsURL := fmt.Sprintf("wss://%s/api/execution-processes/stream/session/ws?session_id=%s",
		extractHost(s.cfg.KanbanAPIURL), sessionID)

	fmt.Printf("订阅 session: %s\n", wsURL)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "WebSocket 连接失败 [%s]: %v\n", sessionID, err)
		return
	}

	s.wsMutex.Lock()
	s.wsConns[sessionID] = conn
	s.wsMutex.Unlock()

	s.wg.Add(1)
	go s.handleSessionMessages(ctx, workspaceID, sessionID, conn)
}

// handleSessionMessages 处理 session 的 WebSocket 消息
func (s *SyncService) handleSessionMessages(ctx context.Context, workspaceID, sessionID string, conn *websocket.Conn) {
	defer s.wg.Done()
	defer func() {
		s.wsMutex.Lock()
		delete(s.wsConns, sessionID)
		s.wsMutex.Unlock()
		conn.Close()
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
				fmt.Fprintf(os.Stderr, "读取 WebSocket 消息失败 [%s]: %v\n", sessionID, err)
				return
			}

			s.processMessage(ctx, workspaceID, sessionID, message)
		}
	}
}

// processMessage 处理单条消息
func (s *SyncService) processMessage(ctx context.Context, workspaceID, sessionID string, message []byte) {
	var entry store.NormalizedEntry
	if err := json.Unmarshal(message, &entry); err != nil {
		return // 忽略无法解析的消息
	}

	// 检查是否需要同步该消息类型
	entryType := entry.EntryType.Type
	if !store.ShouldSync(entryType) {
		return
	}

	// 解析时间戳
	timestamp, err := time.Parse(time.RFC3339, entry.Timestamp)
	if err != nil {
		timestamp = time.Now()
	}

	// 构建 tool_info JSON
	toolInfo := ""
	if entryType == "tool_use" {
		info := map[string]interface{}{
			"tool_name":   entry.EntryType.ToolName,
			"action_type": entry.EntryType.ActionType,
			"status":       entry.EntryType.Status,
		}
		if data, err := json.Marshal(info); err == nil {
			toolInfo = string(data)
		}
	}

	// 检查消息是否已存在
	contentHash := fmt.Sprintf("%x", len(entry.Content))
	if exists, _ := s.store.MessageExists(ctx, sessionID, contentHash, timestamp); exists {
		return // 消息已存在，跳过
	}

	// 保存消息
	msg := &store.SessionMessage{
		SessionID: sessionID,
		EntryType:  entryType,
		Content:    entry.Content,
		ToolInfo:   toolInfo,
		Timestamp:  timestamp,
	}

	if err := s.store.InsertMessage(ctx, msg); err != nil {
		fmt.Fprintf(os.Stderr, "保存消息失败 [%s]: %v\n", sessionID, err)
	}
}

// extractHost 从 URL 中提取主机地址
func extractHost(apiURL string) string {
	// 移除 http:// 或 https:// 前缀
	host := apiURL
	if len(host) > 8 && host[:8] == "https://" {
		host = host[8:]
	} else if len(host) > 7 && host[:7] == "http://" {
		host = host[7:]
	}
	return host
}
