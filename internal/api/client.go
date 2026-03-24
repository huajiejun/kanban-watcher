package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client 用于访问 vibe-kanban 本地 API 的 HTTP 客户端
type Client struct {
	baseURL    string       // API 基础地址，如 http://127.0.0.1:7777
	httpClient *http.Client // 带超时的 HTTP 客户端
}

// NewClient 创建指定基础地址的新 API 客户端
func NewClient(baseURL string) *Client {
	// 创建跳过 SSL 验证的 HTTP 客户端（用于自签名证书）
	insecureTransport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout:   10 * time.Second, // 10 秒超时，避免长时间阻塞
			Transport: insecureTransport,
		},
	}
}

// FetchSummaries 调用 POST /api/workspaces/summaries 获取所有工作区状态
// 请求体固定为 {"archived":false}，即只查询未归档工作区
func (c *Client) FetchSummaries(ctx context.Context) ([]WorkspaceSummary, error) {
	body := []byte(`{"archived":false}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/api/workspaces/summaries", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build summaries request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch summaries http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch summaries: HTTP %d", resp.StatusCode)
	}

	var apiResp summariesAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode summaries response: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("fetch summaries: API error: %s", msg)
	}
	return apiResp.Data.Summaries, nil
}

// FetchWorkspaces 调用 GET /api/workspaces 获取工作区基本信息列表
// 用于获取工作区的显示名称（Name/Branch）
func (c *Client) FetchWorkspaces(ctx context.Context) ([]Workspace, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/api/workspaces", nil)
	if err != nil {
		return nil, fmt.Errorf("build workspaces request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch workspaces http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch workspaces: HTTP %d", resp.StatusCode)
	}

	var apiResp workspacesAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode workspaces response: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("fetch workspaces: API error: %s", msg)
	}
	return apiResp.Data, nil
}

// FetchAll 同时获取 workspaces 和 summaries，按 workspace_id 关联合并
// 过滤掉已归档（Archived=true）的工作区
func (c *Client) FetchAll(ctx context.Context) ([]EnrichedWorkspace, error) {
	// 先获取工作区基本信息（用于获取显示名称）
	workspaces, err := c.FetchWorkspaces(ctx)
	if err != nil {
		return nil, err
	}

	// 再获取状态汇总信息
	summaries, err := c.FetchSummaries(ctx)
	if err != nil {
		return nil, err
	}

	// 建立 workspace_id → summary 的索引，O(1) 快速查找
	summaryMap := make(map[string]WorkspaceSummary, len(summaries))
	for _, s := range summaries {
		summaryMap[s.WorkspaceID] = s
	}

	// 关联两个数据源，构建 EnrichedWorkspace
	result := make([]EnrichedWorkspace, 0, len(workspaces))
	for _, ws := range workspaces {
		if ws.Archived {
			continue // 跳过已归档工作区
		}
		summary, ok := summaryMap[ws.ID]
		if !ok {
			// 该工作区没有对应的 summary 记录，使用空 summary
			summary = WorkspaceSummary{WorkspaceID: ws.ID}
		}
		menuSummary, menuSummaryBy := buildMenuSummary(ws, summary)
		result = append(result, EnrichedWorkspace{
			Workspace:     ws,
			Summary:       summary,
			DisplayName:   displayName(ws),
			MenuSummary:   menuSummary,
			MenuSummaryBy: menuSummaryBy,
		})
	}
	return result, nil
}

// FetchExecutionProcess 获取 execution process 详情
func (c *Client) FetchExecutionProcess(ctx context.Context, processID string) (*ExecutionProcessDetail, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/api/execution-processes/"+processID, nil)
	if err != nil {
		return nil, fmt.Errorf("build execution process request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch execution process http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch execution process: HTTP %d", resp.StatusCode)
	}

	var apiResp executionProcessAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode execution process response: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("fetch execution process: API error: %s", msg)
	}
	return apiResp.Data, nil
}

// displayName 返回工作区的显示名称
// 优先级：Name（非空时）> Branch
func displayName(ws Workspace) string {
	if ws.Name != nil && *ws.Name != "" {
		return *ws.Name
	}
	return ws.Branch
}
