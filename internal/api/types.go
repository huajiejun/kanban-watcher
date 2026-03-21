package api

// summariesAPIResponse is the JSON envelope for the summaries endpoint.
type summariesAPIResponse struct {
	Success bool                       `json:"success"`
	Data    *WorkspaceSummaryResponse  `json:"data"`
	Message *string                    `json:"message"`
}

// workspacesAPIResponse is the JSON envelope for the workspaces list endpoint.
type workspacesAPIResponse struct {
	Success bool                `json:"success"`
	Data    *WorkspacesResponse `json:"data"`
	Message *string             `json:"message"`
}

// WorkspaceSummary mirrors WorkspaceSummary from the backend.
// Retrieved via POST /api/workspaces/summaries.
type WorkspaceSummary struct {
	WorkspaceID              string  `json:"workspace_id"`
	LatestSessionID          *string `json:"latest_session_id"`
	HasPendingApproval       bool    `json:"has_pending_approval"`
	FilesChanged             *int    `json:"files_changed"`
	LinesAdded               *int    `json:"lines_added"`
	LinesRemoved             *int    `json:"lines_removed"`
	LatestProcessCompletedAt *string `json:"latest_process_completed_at"`
	LatestProcessStatus      *string `json:"latest_process_status"`
	HasRunningDevServer      bool    `json:"has_running_dev_server"`
	HasUnseenTurns           bool    `json:"has_unseen_turns"`
	PrStatus                 *string `json:"pr_status"`
	PrNumber                 *int64  `json:"pr_number"`
	PrURL                    *string `json:"pr_url"`
}

// WorkspaceSummaryResponse is the Data field for the summaries endpoint.
type WorkspaceSummaryResponse struct {
	Summaries []WorkspaceSummary `json:"summaries"`
}

// Workspace mirrors the Workspace entity from the backend.
// Retrieved via GET /api/workspaces.
type Workspace struct {
	ID        string  `json:"id"`
	Name      *string `json:"name"`
	Branch    string  `json:"branch"`
	Archived  bool    `json:"archived"`
	Pinned    bool    `json:"pinned"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

// WorkspacesResponse is the Data field for the workspaces list endpoint.
type WorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
}

// EnrichedWorkspace combines workspace identity info with its summary data.
type EnrichedWorkspace struct {
	Workspace
	Summary     WorkspaceSummary
	DisplayName string // workspace.Name if non-empty, else workspace.Branch
}

// NeedsAttention returns true if the workspace requires user action.
func (e EnrichedWorkspace) NeedsAttention() bool {
	return e.Summary.HasUnseenTurns || e.Summary.HasPendingApproval
}

// StatusText returns a human-readable status string.
func (e EnrichedWorkspace) StatusText() string {
	if e.Summary.LatestProcessStatus == nil {
		return "unknown"
	}
	return *e.Summary.LatestProcessStatus
}
