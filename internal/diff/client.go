package diff

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/websocket"
)

// Client 差异流客户端
type Client struct {
	baseURL    string
	httpClient *http.Client
	wsConfig   *websocket.Config

	mu        sync.RWMutex
	streams   map[string]*Stream // workspace_id -> Stream
	onDiff    func(workspaceID string, diff *WorkspaceDiff)
	onError   func(workspaceID string, err error)
	onReady   func(workspaceID string)
}

// Stream 差异流
type Stream struct {
	WorkspaceID string
	conn        *websocket.Conn
	diff        *WorkspaceDiff
	mu          sync.RWMutex
	done        chan struct{}
}

// ClientOption 客户端选项
type ClientOption func(*Client)

// WithOnDiff 设置差异回调
func WithOnDiff(handler func(workspaceID string, diff *WorkspaceDiff)) ClientOption {
	return func(c *Client) {
		c.onDiff = handler
	}
}

// WithOnError 设置错误回调
func WithOnError(handler func(workspaceID string, err error)) ClientOption {
	return func(c *Client) {
		c.onError = handler
	}
}

// WithOnReady 设置就绪回调
func WithOnReady(handler func(workspaceID string)) ClientOption {
	return func(c *Client) {
		c.onReady = handler
	}
}

// NewClient 创建客户端
func NewClient(baseURL string, opts ...ClientOption) *Client {
	// 解析 HTTP 和 WebSocket URL
	wsURL := strings.Replace(baseURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)

	// 创建跳过 SSL 验证的配置（用于自签名证书）
	wsConfig, _ := websocket.NewConfig(wsURL, wsURL)
	wsConfig.TlsConfig = &tls.Config{InsecureSkipVerify: true}

	c := &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
		wsConfig: wsConfig,
		streams:  make(map[string]*Stream),
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// Subscribe 订阅工作区差异流
func (c *Client) Subscribe(ctx context.Context, workspaceID, token string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.streams[workspaceID]; exists {
		return nil // 已订阅
	}

	// 构建 WebSocket URL
	wsURL := fmt.Sprintf("%s/api/workspaces/%s/git/diff/ws", c.wsConfig.Location.String(), workspaceID)

	// 解析并配置
	config, err := websocket.NewConfig(wsURL, wsURL)
	if err != nil {
		return fmt.Errorf("创建 WebSocket 配置失败: %w", err)
	}
	config.TlsConfig = c.wsConfig.TlsConfig

	// 设置 Authorization header
	config.Header = make(http.Header)
	config.Header.Set("Authorization", "Bearer "+token)

	// 连接 WebSocket
	conn, err := websocket.DialConfig(config)
	if err != nil {
		return fmt.Errorf("连接差异流失败: %w", err)
	}

	stream := &Stream{
		WorkspaceID: workspaceID,
		conn:        conn,
		diff: &WorkspaceDiff{
			WorkspaceID: workspaceID,
			Diffs:       make(map[string]Diff),
			UpdatedAt:   time.Now(),
		},
		done: make(chan struct{}),
	}

	c.streams[workspaceID] = stream

	go c.handleStream(ctx, stream)

	return nil
}

// handleStream 处理差异流消息
func (c *Client) handleStream(ctx context.Context, stream *Stream) {
	defer func() {
		stream.conn.Close()
		c.mu.Lock()
		delete(c.streams, stream.WorkspaceID)
		c.mu.Unlock()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-stream.done:
			return
		default:
			// 设置读取超时
			stream.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

			var msg LogMessage
			err := websocket.JSON.Receive(stream.conn, &msg)
			if err != nil {
				if strings.Contains(err.Error(), "i/o timeout") {
					// 超时是正常的，继续等待
					continue
				}
				if c.onError != nil {
					c.onError(stream.WorkspaceID, err)
				}
				return
			}

			c.processMessage(stream, &msg)
		}
	}
}

// processMessage 处理消息
func (c *Client) processMessage(stream *Stream, msg *LogMessage) {
	// 处理 Ready 消息
	if msg.Ready {
		if c.onReady != nil {
			c.onReady(stream.WorkspaceID)
		}
		return
	}

	// 处理 json_patch 消息
	if msg.Type != "json_patch" || msg.Patch == nil {
		return
	}

	patch := msg.Patch
	// 路径格式: "/diffs/path/to/file"
	filePath := strings.TrimPrefix(patch.Path, "/diffs/")
	if filePath == patch.Path {
		return // 不是 diffs 路径
	}

	stream.mu.Lock()
	defer stream.mu.Unlock()

	switch patch.Op {
	case "add":
		if patch.Value != nil {
			stream.diff.Diffs[filePath] = *patch.Value
			stream.diff.UpdatedAt = time.Now()
		}
	case "remove":
		delete(stream.diff.Diffs, filePath)
		stream.diff.UpdatedAt = time.Now()
	}

	// 重新计算统计
	stream.diff.Stats = calculateStats(stream.diff.Diffs)

	// 触发回调
	if c.onDiff != nil {
		// 复制一份数据用于回调
		diffCopy := *stream.diff
		c.onDiff(stream.WorkspaceID, &diffCopy)
	}
}

// Unsubscribe 取消订阅
func (c *Client) Unsubscribe(workspaceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if stream, exists := c.streams[workspaceID]; exists {
		close(stream.done)
	}
}

// GetDiff 获取当前差异
func (c *Client) GetDiff(workspaceID string) *WorkspaceDiff {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if stream, exists := c.streams[workspaceID]; exists {
		stream.mu.RLock()
		defer stream.mu.RUnlock()
		// 返回副本
		diffCopy := *stream.diff
		return &diffCopy
	}
	return nil
}

// GetSubscribed 获取所有已订阅的工作区 ID
func (c *Client) GetSubscribed() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	ids := make([]string, 0, len(c.streams))
	for id := range c.streams {
		ids = append(ids, id)
	}
	return ids
}

// FetchBranchStatus 获取分支状态
func (c *Client) FetchBranchStatus(ctx context.Context, workspaceID, token string) ([]RepoBranchStatus, error) {
	u, _ := url.Parse(c.baseURL)
	u.Path = fmt.Sprintf("/api/workspaces/%s/git/status", workspaceID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var apiResp struct {
		Success bool               `json:"success"`
		Data    []RepoBranchStatus `json:"data"`
		Message *string            `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	if !apiResp.Success {
		msg := "unknown error"
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("API 错误: %s", msg)
	}

	return apiResp.Data, nil
}

// Close 关闭所有连接
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, stream := range c.streams {
		close(stream.done)
		stream.conn.Close()
	}
	c.streams = make(map[string]*Stream)
}

// calculateStats 计算差异统计
func calculateStats(diffs map[string]Diff) DiffStats {
	stats := DiffStats{}
	for _, d := range diffs {
		stats.FilesChanged++
		if d.Additions != nil {
			stats.LinesAdded += *d.Additions
		}
		if d.Deletions != nil {
			stats.LinesRemoved += *d.Deletions
		}
	}
	return stats
}
