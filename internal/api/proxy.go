// Package api 提供代理功能，允许 HomeAssistant 通过 kanban-watcher 调用 vibe-kanban API
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ProxyClient 代理客户端，用于转发 HomeAssistant 的请求到 vibe-kanban
type ProxyClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewProxyClient 创建代理客户端
func NewProxyClient(baseURL string) *ProxyClient {
	return &ProxyClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FollowUpRequest follow-up 接口请求体
type FollowUpRequest struct {
	Prompt            string                 `json:"prompt"`
	ExecutorConfig    map[string]interface{} `json:"executor_config,omitempty"`
	RetryProcessID    *string                `json:"retry_process_id,omitempty"`
	ForceWhenDirty    *bool                  `json:"force_when_dirty,omitempty"`
	PerformGitReset   *bool                  `json:"perform_git_reset,omitempty"`
}

// FollowUpResponse follow-up 接口响应
type FollowUpResponse struct {
	Success    bool        `json:"success"`
	Data       interface{} `json:"data,omitempty"`
	ErrorData  interface{} `json:"error_data,omitempty"`
	Message    *string     `json:"message,omitempty"`
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
