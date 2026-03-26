// Package api 提供代理功能，允许 HomeAssistant 通过 kanban-watcher 调用 vibe-kanban API
package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

// ProxyClient 代理客户端，用于转发 HomeAssistant 的请求到 vibe-kanban
type ProxyClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewProxyClient 创建代理客户端
func NewProxyClient(baseURL string) *ProxyClient {
	insecureTransport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	return &ProxyClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: insecureTransport,
		},
	}
}

// FollowUpRequest follow-up 接口请求体
type FollowUpRequest struct {
	Prompt          string                 `json:"prompt"`
	ExecutorConfig  map[string]interface{} `json:"executor_config,omitempty"`
	RetryProcessID  *string                `json:"retry_process_id,omitempty"`
	ForceWhenDirty  *bool                  `json:"force_when_dirty,omitempty"`
	PerformGitReset *bool                  `json:"perform_git_reset,omitempty"`
}

// FollowUpResponse follow-up 接口响应
type FollowUpResponse struct {
	Success   bool        `json:"success"`
	Data      interface{} `json:"data,omitempty"`
	ErrorData interface{} `json:"error_data,omitempty"`
	Message   *string     `json:"message,omitempty"`
}

type ProxyBusinessError struct {
	Message string
}

func (e *ProxyBusinessError) Error() string {
	return e.Message
}

type QueueRequest struct {
	Message        string                 `json:"message"`
	ExecutorConfig map[string]interface{} `json:"executor_config"`
}

type queueAPIResponse struct {
	Success bool                 `json:"success"`
	Data    *QueueStatusResponse `json:"data"`
	Message *string              `json:"message,omitempty"`
}

type QueueStatusResponse struct {
	Status  string              `json:"status"`
	Message *QueuedMessageState `json:"message,omitempty"`
}

type QueuedMessageState struct {
	SessionID string            `json:"session_id"`
	QueuedAt  string            `json:"queued_at,omitempty"`
	Data      QueuedMessageData `json:"data"`
}

type QueuedMessageData struct {
	Message        string                 `json:"message"`
	ExecutorConfig map[string]interface{} `json:"executor_config,omitempty"`
}

// SendFollowUp 发送 follow-up 消息到指定工作区的最新 session
// 流程：
//   1. 查询 summaries 获取工作区的 latest_session_id
//   2. 使用 session_id 调用 follow-up 接口
func (c *ProxyClient) SendFollowUp(ctx context.Context, workspaceID, message string) error {
	// 步骤 1：获取 session_id
	sessionID, err := c.getLatestSessionID(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("获取工作区 %s 的 session_id: %w", workspaceID, err)
	}

	if sessionID == "" {
		return fmt.Errorf("工作区 %s 没有活跃的 session", workspaceID)
	}

	// 步骤 2：调用 follow-up 接口
	return c.callFollowUpAPI(ctx, sessionID, message)
}

// SendFollowUpWithContext 使用已保存的消息上下文发送 follow-up
func (c *ProxyClient) SendFollowUpWithContext(ctx context.Context, sessionID, message string, msgCtx *store.MessageContext) error {
	executorConfig, err := decodeExecutorConfig(msgCtx.ExecutorConfigJSON)
	if err != nil {
		return fmt.Errorf("解析 executor_config: %w", err)
	}

	reqBody := FollowUpRequest{
		Prompt:         message,
		ExecutorConfig: executorConfig,
	}
	reqBody.ForceWhenDirty = msgCtx.ForceWhenDirty
	reqBody.PerformGitReset = msgCtx.PerformGitReset

	return c.postJSON(ctx, fmt.Sprintf("%s/api/sessions/%s/follow-up", c.baseURL, sessionID), reqBody)
}

// QueueMessageWithContext 使用已保存的消息上下文加入 follow-up 队列
func (c *ProxyClient) QueueMessageWithContext(ctx context.Context, sessionID, message string, msgCtx *store.MessageContext) error {
	executorConfig, err := decodeExecutorConfig(msgCtx.ExecutorConfigJSON)
	if err != nil {
		return fmt.Errorf("解析 executor_config: %w", err)
	}

	reqBody := QueueRequest{
		Message:        message,
		ExecutorConfig: executorConfig,
	}

	return c.postJSON(ctx, fmt.Sprintf("%s/api/sessions/%s/queue", c.baseURL, sessionID), reqBody)
}

// GetQueueStatus 获取 session 当前队列状态
func (c *ProxyClient) GetQueueStatus(ctx context.Context, sessionID string) (*QueueStatusResponse, error) {
	return c.getQueueStatus(ctx, fmt.Sprintf("%s/api/sessions/%s/queue", c.baseURL, sessionID))
}

// CancelQueue 取消 session 当前队列
func (c *ProxyClient) CancelQueue(ctx context.Context, sessionID string) (*QueueStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, fmt.Sprintf("%s/api/sessions/%s/queue", c.baseURL, sessionID), nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	return decodeQueueStatusResponse(resp)
}

// StopExecutionProcess 停止指定 execution process。
func (c *ProxyClient) StopExecutionProcess(ctx context.Context, processID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/execution-processes/%s/stop", c.baseURL, processID), nil)
	if err != nil {
		return fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("停止 execution process 失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result FollowUpResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("解析响应: %w", err)
	}
	if !result.Success {
		msg := ""
		if result.Message != nil {
			msg = *result.Message
		}
		return fmt.Errorf("停止 execution process 失败: %s", msg)
	}
	return nil
}

// StartDevServer 启动指定工作区的预设 dev server。
func (c *ProxyClient) StartDevServer(ctx context.Context, workspaceID string) ([]ExecutionProcessDetail, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/workspaces/%s/execution/dev-server/start", c.baseURL, workspaceID), nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("启动 dev server 失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result executionProcessesAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !result.Success {
		msg := ""
		if result.Message != nil {
			msg = *result.Message
		}
		return nil, &ProxyBusinessError{
			Message: fmt.Sprintf("启动 dev server 失败: %s", msg),
		}
	}
	return result.Data, nil
}

func (c *ProxyClient) StopDevServer(ctx context.Context, workspaceID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/workspaces/%s/execution/stop", c.baseURL, workspaceID), nil)
	if err != nil {
		return fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("停止 dev server 失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result FollowUpResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("解析响应: %w", err)
	}
	if !result.Success {
		msg := ""
		if result.Message != nil {
			msg = *result.Message
		}
		return &ProxyBusinessError{
			Message: fmt.Sprintf("停止 dev server 失败: %s", msg),
		}
	}
	return nil
}

func (c *ProxyClient) GetInfo(ctx context.Context) (*InfoAPI, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/info", c.baseURL), nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("获取系统信息失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result infoAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !result.Success || result.Data == nil {
		msg := ""
		if result.Message != nil {
			msg = *result.Message
		}
		if msg == "" {
			msg = "系统信息为空"
		}
		return nil, &ProxyBusinessError{Message: msg}
	}

	return result.Data, nil
}

func (c *ProxyClient) GetExecutionProcess(ctx context.Context, processID string) (*ExecutionProcessDetail, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/execution-processes/%s", c.baseURL, processID), nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("获取 execution process 失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result executionProcessAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !result.Success || result.Data == nil {
		msg := ""
		if result.Message != nil {
			msg = *result.Message
		}
		return nil, fmt.Errorf("获取 execution process 失败: %s", msg)
	}

	return result.Data, nil
}

// getLatestSessionID 查询 summaries 获取工作区的最新 session_id
func (c *ProxyClient) getLatestSessionID(ctx context.Context, workspaceID string) (string, error) {
	url := fmt.Sprintf("%s/api/workspaces/summaries", c.baseURL)

	body := []byte(`{"archived":false}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("构建请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Summaries []struct {
				WorkspaceID     string `json:"workspace_id"`
				LatestSessionID string `json:"latest_session_id"`
			} `json:"summaries"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("解析响应: %w", err)
	}

	for _, summary := range result.Data.Summaries {
		if summary.WorkspaceID == workspaceID {
			return summary.LatestSessionID, nil
		}
	}

	return "", fmt.Errorf("工作区 %s 未找到", workspaceID)
}

// callFollowUpAPI 调用实际的 follow-up 接口
func (c *ProxyClient) callFollowUpAPI(ctx context.Context, sessionID, message string) error {
	url := fmt.Sprintf("%s/api/sessions/%s/follow-up", c.baseURL, sessionID)

	reqBody := FollowUpRequest{
		Prompt: message,
		ExecutorConfig: map[string]interface{}{
			"executor": "CLAUDE_CODE",
			"variant":  "ZHIPU",
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("序列化请求: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("构建请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *ProxyClient) postJSON(ctx context.Context, url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("序列化请求: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("构建请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *ProxyClient) getQueueStatus(ctx context.Context, url string) (*QueueStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	return decodeQueueStatusResponse(resp)
}

func decodeQueueStatusResponse(resp *http.Response) (*QueueStatusResponse, error) {
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp queueAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("API error: %s", msg)
	}
	return apiResp.Data, nil
}

func decodeExecutorConfig(raw string) (map[string]interface{}, error) {
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, err
	}
	if len(cfg) == 0 {
		return nil, fmt.Errorf("empty executor_config")
	}
	return cfg, nil
}
