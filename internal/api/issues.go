package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// --- 请求/响应类型 ---

// RemoteIssue 对应 vibe-kanban 的 Issue 结构
type RemoteIssue struct {
	ID                 string          `json:"id"`
	ProjectID          string          `json:"project_id"`
	IssueNumber        int             `json:"issue_number"`
	SimpleID           string          `json:"simple_id"`
	StatusID           string          `json:"status_id"`
	Title              string          `json:"title"`
	Description        *string         `json:"description"`
	Priority           *string         `json:"priority"`
	StartDate          *string         `json:"start_date"`
	TargetDate         *string         `json:"target_date"`
	CompletedAt        *string         `json:"completed_at"`
	SortOrder          float64         `json:"sort_order"`
	ParentIssueID      *string         `json:"parent_issue_id"`
	ParentIssueSortOrder *float64      `json:"parent_issue_sort_order"`
	ExtensionMetadata  json.RawMessage `json:"extension_metadata"`
	CreatorUserID      *string         `json:"creator_user_id"`
	CreatedAt          string          `json:"created_at"`
	UpdatedAt          string          `json:"updated_at"`
}

// RemoteProjectStatus 对应 vibe-kanban 的 ProjectStatus 结构
type RemoteProjectStatus struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	SortOrder int    `json:"sort_order"`
	Hidden    bool   `json:"hidden"`
	CreatedAt string `json:"created_at"`
}

// CreateIssuePayload 创建任务的请求体
type CreateIssuePayload struct {
	ID                  *string         `json:"id,omitempty"`
	ProjectID           string          `json:"project_id"`
	StatusID            string          `json:"status_id"`
	Title               string          `json:"title"`
	Description         *string         `json:"description,omitempty"`
	Priority            *string         `json:"priority,omitempty"`
	StartDate           *string         `json:"start_date,omitempty"`
	TargetDate          *string         `json:"target_date,omitempty"`
	CompletedAt         *string         `json:"completed_at,omitempty"`
	SortOrder           float64         `json:"sort_order"`
	ParentIssueID       *string         `json:"parent_issue_id,omitempty"`
	ParentIssueSortOrder *float64       `json:"parent_issue_sort_order,omitempty"`
	ExtensionMetadata   json.RawMessage `json:"extension_metadata"`
}

// UpdateIssuePayload 更新任务的请求体
// 使用指针字段区分"未传"和"传了 null/零值"
type UpdateIssuePayload struct {
	StatusID            *string         `json:"status_id,omitempty"`
	Title               *string         `json:"title,omitempty"`
	Description         *string         `json:"description,omitempty"`
	Priority            *string         `json:"priority,omitempty"`
	StartDate           *string         `json:"start_date,omitempty"`
	TargetDate          *string         `json:"target_date,omitempty"`
	CompletedAt         *string         `json:"completed_at,omitempty"`
	SortOrder           *float64        `json:"sort_order,omitempty"`
	ParentIssueID       *string         `json:"parent_issue_id,omitempty"`
	ParentIssueSortOrder *float64       `json:"parent_issue_sort_order,omitempty"`
	ExtensionMetadata   json.RawMessage `json:"extension_metadata,omitempty"`
}

// --- API 响应信封 ---

type listIssuesAPIResponse struct {
	Success bool                   `json:"success"`
	Data    *ListIssuesAPIResponse `json:"data"`
	Message *string                `json:"message"`
}

type ListIssuesAPIResponse struct {
	Issues []RemoteIssue `json:"issues"`
}

type getIssueAPIResponse struct {
	Success bool          `json:"success"`
	Data    *RemoteIssue  `json:"data"`
	Message *string       `json:"message"`
}

type mutationIssueAPIResponse struct {
	Success bool               `json:"success"`
	Data    *MutationIssueData `json:"data"`
	Message *string            `json:"message"`
}

type MutationIssueData struct {
	Data RemoteIssue `json:"data"`
	Txid int64       `json:"txid"`
}

type deleteIssueAPIResponse struct {
	Success bool     `json:"success"`
	Message *string  `json:"message"`
}

type listProjectStatusesAPIResponse struct {
	Success bool                          `json:"success"`
	Data    *ListProjectStatusesAPIResponse `json:"data"`
	Message *string                       `json:"message"`
}

type ListProjectStatusesAPIResponse struct {
	ProjectStatuses []RemoteProjectStatus `json:"project_statuses"`
}

// --- ProxyClient 方法 ---

// ListIssues 查询任务列表
func (c *ProxyClient) ListIssues(ctx context.Context, projectID string) ([]RemoteIssue, error) {
	url := fmt.Sprintf("%s/api/remote/issues?project_id=%s", c.baseURL, projectID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("查询任务列表失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var apiResp listIssuesAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("查询任务列表失败: %s", msg)
	}

	return apiResp.Data.Issues, nil
}

// GetIssue 获取单个任务详情
func (c *ProxyClient) GetIssue(ctx context.Context, issueID string) (*RemoteIssue, error) {
	url := fmt.Sprintf("%s/api/remote/issues/%s", c.baseURL, issueID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("获取任务详情失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var apiResp getIssueAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("获取任务详情失败: %s", msg)
	}

	return apiResp.Data, nil
}

// CreateIssue 创建任务
func (c *ProxyClient) CreateIssue(ctx context.Context, payload CreateIssuePayload) (*RemoteIssue, error) {
	url := fmt.Sprintf("%s/api/remote/issues", c.baseURL)

	return c.doMutationIssue(ctx, url, http.MethodPost, payload)
}

// UpdateIssue 更新任务
func (c *ProxyClient) UpdateIssue(ctx context.Context, issueID string, payload UpdateIssuePayload) (*RemoteIssue, error) {
	url := fmt.Sprintf("%s/api/remote/issues/%s", c.baseURL, issueID)

	return c.doMutationIssue(ctx, url, http.MethodPatch, payload)
}

// DeleteIssue 删除任务
func (c *ProxyClient) DeleteIssue(ctx context.Context, issueID string) error {
	url := fmt.Sprintf("%s/api/remote/issues/%s", c.baseURL, issueID)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("删除任务失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var apiResp deleteIssueAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return fmt.Errorf("删除任务失败: %s", msg)
	}

	return nil
}

// ListProjectStatuses 查询项目状态列表
func (c *ProxyClient) ListProjectStatuses(ctx context.Context, projectID string) ([]RemoteProjectStatus, error) {
	url := fmt.Sprintf("%s/api/remote/project-statuses?project_id=%s", c.baseURL, projectID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("查询项目状态失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var apiResp listProjectStatusesAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("查询项目状态失败: %s", msg)
	}

	return apiResp.Data.ProjectStatuses, nil
}

// doMutationIssue 执行创建/更新任务的通用逻辑
func (c *ProxyClient) doMutationIssue(ctx context.Context, url, method string, payload interface{}) (*RemoteIssue, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("序列化请求: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("构建请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("请求失败: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var apiResp mutationIssueAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析响应: %w", err)
	}
	if !apiResp.Success || apiResp.Data == nil {
		msg := ""
		if apiResp.Message != nil {
			msg = *apiResp.Message
		}
		return nil, fmt.Errorf("操作失败: %s", msg)
	}

	return &apiResp.Data.Data, nil
}
