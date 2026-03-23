package sync

import (
	"bytes"
	"context"
	"crypto/tls"
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
	// 创建跳过 SSL 验证的 HTTP 客户端（用于自签名证书）
	insecureTransport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	return &SyncService{
		cfg:     cfg,
		store:   store,
		client:  &http.Client{Timeout: 30 * time.Second, Transport: insecureTransport},
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
	// 获取活跃工作区列表 - 使用 POST 请求
	url := fmt.Sprintf("%s/api/workspaces/summaries", s.cfg.KanbanAPIURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(`{"archived":false}`)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "构建请求失败: %v\n", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "获取工作区列表失败: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "获取工作区列表返回状态码: %d\n", resp.StatusCode)
		return
	}

	// 解析 API 响应结构 - API 返回的是 WorkspaceSummary 列表
	var apiResp struct {
		Success bool `json:"success"`
		Data    struct {
			Summaries []api.WorkspaceSummary `json:"summaries"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		fmt.Fprintf(os.Stderr, "解析工作区列表失败: %v\n", err)
		return
	}

	if !apiResp.Success {
		fmt.Fprintf(os.Stderr, "API 返回失败\n")
		return
	}

	summaries := apiResp.Data.Summaries
	fmt.Printf("获取到 %d 个活跃工作区\n", len(summaries))

	// 处理每个工作区
	for _, summary := range summaries {
		s.syncWorkspaceSummary(ctx, summary)
	}
}

// syncWorkspaceSummary 同步单个工作区摘要
func (s *SyncService) syncWorkspaceSummary(ctx context.Context, summary api.WorkspaceSummary) {
	// 获取最新的 session ID
	sessionID := summary.LatestSessionID
	if sessionID == nil || *sessionID == "" {
		return
	}

	// 保存工作区到数据库（只保存基本信息）
	if err := s.upsertWorkspaceFromSummary(ctx, summary); err != nil {
		fmt.Fprintf(os.Stderr, "保存工作区 %s 失败: %v\n", summary.WorkspaceID, err)
		return
	}

	fmt.Printf("同步工作区 %s, session: %s\n", summary.WorkspaceID, *sessionID)

	// 订阅 session 的消息
	s.subscribeSession(ctx, summary.WorkspaceID, *sessionID)
}

// upsertWorkspaceFromSummary 从 WorkspaceSummary 保存工作区信息
func (s *SyncService) upsertWorkspaceFromSummary(ctx context.Context, summary api.WorkspaceSummary) error {
	now := time.Now()
	dbWS := &store.Workspace{
		ID:              summary.WorkspaceID,
		Name:            summary.WorkspaceID[:8], // 使用 ID 前 8 位作为临时名称
		Branch:          "unknown",               // 暂时未知
		Archived:        false,
		Pinned:          false,
		LatestSessionID: summary.LatestSessionID,
		CreatedAt:       now,
		UpdatedAt:       now,
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

	// 创建跳过 SSL 验证的 WebSocket Dialer
	dialer := &websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	conn, _, err := dialer.Dial(wsURL, nil)
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
