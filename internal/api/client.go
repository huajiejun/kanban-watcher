package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client fetches data from the vibe-kanban local API.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new API client for the given base URL.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// FetchSummaries calls POST /api/workspaces/summaries with {"archived": false}.
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

// FetchWorkspaces calls GET /api/workspaces to retrieve workspace identity info.
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
	return apiResp.Data.Workspaces, nil
}

// FetchAll fetches both workspaces and summaries, joining them by workspace_id.
// Only non-archived workspaces are included.
func (c *Client) FetchAll(ctx context.Context) ([]EnrichedWorkspace, error) {
	workspaces, err := c.FetchWorkspaces(ctx)
	if err != nil {
		return nil, err
	}

	summaries, err := c.FetchSummaries(ctx)
	if err != nil {
		return nil, err
	}

	// Index summaries by workspace_id for O(1) lookup
	summaryMap := make(map[string]WorkspaceSummary, len(summaries))
	for _, s := range summaries {
		summaryMap[s.WorkspaceID] = s
	}

	result := make([]EnrichedWorkspace, 0, len(workspaces))
	for _, ws := range workspaces {
		if ws.Archived {
			continue
		}
		summary, ok := summaryMap[ws.ID]
		if !ok {
			summary = WorkspaceSummary{WorkspaceID: ws.ID}
		}
		result = append(result, EnrichedWorkspace{
			Workspace:   ws,
			Summary:     summary,
			DisplayName: displayName(ws),
		})
	}
	return result, nil
}

// displayName returns the workspace's display name: Name if set, else Branch.
func displayName(ws Workspace) string {
	if ws.Name != nil && *ws.Name != "" {
		return *ws.Name
	}
	return ws.Branch
}
