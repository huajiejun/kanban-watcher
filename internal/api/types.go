package api

// summariesAPIResponse /api/workspaces/summaries 接口的响应信封
type summariesAPIResponse struct {
	Success bool                      `json:"success"`
	Data    *WorkspaceSummaryResponse `json:"data"`
	Message *string                   `json:"message"`
}

// workspacesAPIResponse /api/workspaces 接口的响应信封
// 注意：与 summaries 不同，此接口的 data 直接是数组 []Workspace
type workspacesAPIResponse struct {
	Success bool        `json:"success"`
	Data    []Workspace `json:"data"` // 直接是数组，不是对象
	Message *string     `json:"message"`
}

type executionProcessAPIResponse struct {
	Success bool                    `json:"success"`
	Data    *ExecutionProcessDetail `json:"data"`
	Message *string                 `json:"message"`
}

type executionProcessesAPIResponse struct {
	Success bool                     `json:"success"`
	Data    []ExecutionProcessDetail `json:"data"`
	Message *string                  `json:"message"`
}

type infoAPIResponse struct {
	Success bool     `json:"success"`
	Data    *InfoAPI `json:"data"`
	Message *string  `json:"message"`
}

type InfoAPI struct {
	Config *InfoConfig `json:"config"`
}

type InfoConfig struct {
	PreviewProxyPort *int `json:"preview_proxy_port"`
}

// WorkspaceSummary 工作区状态汇总信息（从 POST /api/workspaces/summaries 获取）
// 包含最新的构建状态、PR信息、是否有未读消息或待审批项等关键字段
type WorkspaceSummary struct {
	WorkspaceID              string  `json:"workspace_id"`                // 工作区唯一标识
	LatestSessionID          *string `json:"latest_session_id"`           // 最新会话ID（可能为空）
	HasPendingApproval       bool    `json:"has_pending_approval"`        // 是否有待审批的构建
	FilesChanged             *int    `json:"files_changed"`               // 变更文件数（最近一次构建）
	LinesAdded               *int    `json:"lines_added"`                 // 新增行数
	LinesRemoved             *int    `json:"lines_removed"`               // 删除行数
	LatestProcessCompletedAt *string `json:"latest_process_completed_at"` // 最新构建完成时间（ISO8601，运行中为null）
	LatestProcessStatus      *string `json:"latest_process_status"`       // 最新构建状态：running/completed/failed/killed
	HasRunningDevServer      bool    `json:"has_running_dev_server"`      // 是否有正在运行的 dev server
	HasUnseenTurns           bool    `json:"has_unseen_turns"`            // 是否有未读的消息/轮次
	PrStatus                 *string `json:"pr_status"`                   // PR 状态：open/closed/merged
	PrNumber                 *int64  `json:"pr_number"`                   // PR 编号
	PrURL                    *string `json:"pr_url"`                      // PR 链接地址
	MenuSummary              *string `json:"menu_summary,omitempty"`      // 远端可选返回的菜单摘要候选
	MenuSummaryBy            *string `json:"menu_summary_by,omitempty"`   // 菜单摘要来源
}

// WorkspaceSummaryResponse summaries 接口的 Data 字段结构
type WorkspaceSummaryResponse struct {
	Summaries []WorkspaceSummary `json:"summaries"`
}

// Workspace 工作区基本信息（从 GET /api/workspaces 获取）
// 注意：summaries 接口不返回工作区名称，必须通过 workspace_id 关联此表获取
type Workspace struct {
	ID          string  `json:"id"`                     // 工作区唯一标识
	Name        *string `json:"name"`                   // 工作区显示名称（用户自定义，可能为空）
	Branch      string  `json:"branch"`                 // Git 分支名（Name为空时用作显示）
	Archived    bool    `json:"archived"`               // 是否已归档
	Pinned      bool    `json:"pinned"`                 // 是否置顶
	CreatedAt   string  `json:"created_at"`             // 创建时间
	UpdatedAt   string  `json:"updated_at"`             // 最后更新时间
	LastMessage *string `json:"last_message,omitempty"` // 远端可选返回的最近消息
}

// WorkspacesResponse workspaces 接口的 Data 字段结构
type WorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
}

type ExecutionProcessDetail struct {
	ID             string `json:"id"`
	SessionID      string `json:"session_id"`
	WorkspaceID    string `json:"workspace_id"`
	RunReason      string `json:"run_reason"`
	Status         string `json:"status"`
	ExecutorAction struct {
		Typ struct {
			Type           string                 `json:"type"`
			ExecutorConfig map[string]interface{} `json:"executor_config"`
		} `json:"typ"`
	} `json:"executor_action"`
}

// EnrichedWorkspace 关联后的完整工作区信息
// 将 Workspace（身份）与 WorkspaceSummary（状态）合并，便于统一处理
type EnrichedWorkspace struct {
	Workspace                      // 嵌入基本信息
	Summary       WorkspaceSummary // 状态汇总
	DisplayName   string           // 显示名称：优先使用 Name，否则使用 Branch
	MenuSummary   string           // 菜单栏摘要候选
	MenuSummaryBy string           // 菜单栏摘要来源：reason/last_message/empty
}

// NeedsAttention 判断该工作区是否需要用户关注
// 条件：有未读消息（has_unseen_turns）或有待审批构建（has_pending_approval）
func (e EnrichedWorkspace) NeedsAttention() bool {
	return e.Summary.HasUnseenTurns || e.Summary.HasPendingApproval
}

// StatusText 返回可读的状态文本
// 若 LatestProcessStatus 为 nil 则返回 "unknown"
func (e EnrichedWorkspace) StatusText() string {
	if e.Summary.LatestProcessStatus == nil {
		return "unknown"
	}
	return *e.Summary.LatestProcessStatus
}
