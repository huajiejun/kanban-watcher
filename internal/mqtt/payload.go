package mqtt

import (
	"encoding/json"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
)

// MQTT Topic 常量（Home Assistant MQTT Discovery 协议）
//
// Home Assistant 通过 Discovery 机制自动识别设备：
//   - 发送配置到 homeassistant/.../config（retained，QoS 1）
//   - 状态发送到 .../state（纯字符串，如 "5"）
//   - 完整 JSON 数据发送到 .../attributes
const (
	TopicDiscovery  = "homeassistant/sensor/kanban_watcher/summary/config"
	TopicState      = "homeassistant/sensor/kanban_watcher/summary/state"
	TopicAttributes = "homeassistant/sensor/kanban_watcher/summary/attributes"
)

const maxSessionStateLength = 255

const (
	maxSessionAttributesLength   = 4096
	maxSessionLastMessageLength  = 500
	maxSessionMessageTextLength  = 240
	maxSessionToolSummaryLength  = 160
)

// haDiscoveryPayload HA MQTT Discovery 配置消息结构
// 用于向 Home Assistant 注册传感器实体
type haDiscoveryPayload struct {
	Name                string   `json:"name"`                  // 显示名称
	UniqueID            string   `json:"unique_id"`             // 全局唯一标识
	StateTopic          string   `json:"state_topic"`           // 状态值 Topic
	JSONAttributesTopic string   `json:"json_attributes_topic"` // 属性 JSON Topic
	UnitOfMeasurement   string   `json:"unit_of_measurement,omitempty"` // 单位（显示用）
	Icon                string   `json:"icon"`                  // MDI 图标
	Device              haDevice `json:"device"`                // 设备信息
}

type haDevice struct {
	Identifiers  []string `json:"identifiers"`  // 设备标识符
	Name         string   `json:"name"`         // 设备名称
	Manufacturer string   `json:"manufacturer"` // 制造商
}

type sessionAttributesPayload struct {
	SessionID       string                           `json:"session_id"`
	WorkspaceID     string                           `json:"workspace_id"`
	WorkspaceName   string                           `json:"workspace_name"`
	MessageCount    int                              `json:"message_count"`
	ToolCallCount   int                              `json:"tool_call_count"`
	UpdatedAt       string                           `json:"updated_at"`
	LastRole        string                           `json:"last_role,omitempty"`
	LastMessage     string                           `json:"last_message,omitempty"`
	RecentMessages  []sessionlog.ConversationMessage `json:"recent_messages"`
	RecentToolCalls []sessionlog.ToolCallSummary     `json:"recent_tool_calls"`
	Truncated       bool                             `json:"truncated,omitempty"`
}

// WorkspaceItem 单个工作区的属性字段
// 作为 attributes payload 中 workspaces 数组的元素
type WorkspaceItem struct {
	ID                  string `json:"id"`                      // 工作区 ID
	Name                string `json:"name"`                    // 显示名称
	Status              string `json:"status"`                  // 状态：running/completed/failed
	LatestSessionID     string `json:"latest_session_id,omitempty"` // 最新会话 ID（可选）
	HasUnseenTurns      bool   `json:"has_unseen_turns"`        // 是否有未读消息
	HasPendingApproval  bool   `json:"has_pending_approval"`    // 是否有待审批
	HasRunningDevServer bool   `json:"has_running_dev_server"`  // 是否有正在运行的 dev server
	FilesChanged        *int   `json:"files_changed,omitempty"` // 变更文件数（可选）
	LinesAdded          *int   `json:"lines_added,omitempty"`   // 新增行数（可选）
	LinesRemoved        *int   `json:"lines_removed,omitempty"` // 删除行数（可选）
	CompletedAt         string `json:"completed_at,omitempty"`  // 完成时间（可选）
	RelativeTime        string `json:"relative_time"`           // 相对时间（如：5分钟前，进行中）
	PrStatus            string `json:"pr_status,omitempty"`     // PR 状态（可选）
	PrURL               string `json:"pr_url,omitempty"`        // PR 链接（可选）
	NeedsAttention      bool   `json:"needs_attention"`         // 是否需要关注
}

// AttributesPayload 发送到 attributes Topic 的完整 JSON 结构
type AttributesPayload struct {
	Count          int             `json:"count"`           // 工作区总数
	AttentionCount int             `json:"attention_count"` // 需要关注的工作区数
	UpdatedAt      string          `json:"updated_at"`      // 数据更新时间（ISO8601）
	Workspaces     []WorkspaceItem `json:"workspaces"`      // 工作区详情数组
}

// BuildDiscoveryJSON 构建 HA MQTT Discovery 配置 JSON（retained 保留）
// Home Assistant 订阅此 topic 后自动创建 sensor 实体
func BuildDiscoveryJSON() ([]byte, error) {
	payload := haDiscoveryPayload{
		Name:                "Kanban Watcher",
		UniqueID:            "kanban_watcher_summary",
		StateTopic:          TopicState,
		JSONAttributesTopic: TopicAttributes,
		UnitOfMeasurement:   "workspaces",
		Icon:                "mdi:layers-outline",
		Device: haDevice{
			Identifiers:  []string{"kanban_watcher"},
			Name:         "Kanban Watcher",
			Manufacturer: "vibe-kanban",
		},
	}
	return json.Marshal(payload)
}

// BuildStateValue 构建状态值字符串（工作区总数）
// Home Assistant 显示为传感器的当前值
func BuildStateValue(workspaces []api.EnrichedWorkspace) string {
	return fmt.Sprintf("%d", len(workspaces))
}

// BuildAttributesJSON 构建属性 JSON，包含完整工作区数据
// Home Assistant 可在 UI 卡片中展示这些详细信息
func BuildAttributesJSON(workspaces []api.EnrichedWorkspace) ([]byte, error) {
	attentionCount := 0
	items := make([]WorkspaceItem, 0, len(workspaces))
	now := time.Now()

	for _, w := range workspaces {
		if w.NeedsAttention() {
			attentionCount++
		}

		// 将可选指针字段转换为值（空指针转为空字符串/0）
		completedAt := ""
		if w.Summary.LatestProcessCompletedAt != nil {
			completedAt = *w.Summary.LatestProcessCompletedAt
		}
		prStatus := ""
		if w.Summary.PrStatus != nil {
			prStatus = *w.Summary.PrStatus
		}
		prURL := ""
		if w.Summary.PrURL != nil {
			prURL = *w.Summary.PrURL
		}
		latestSessionID := ""
		if w.Summary.LatestSessionID != nil {
			latestSessionID = *w.Summary.LatestSessionID
		}

		// 计算相对时间
		relativeTime := calculateRelativeTime(now, w.Summary.LatestProcessCompletedAt, w.StatusText())

		items = append(items, WorkspaceItem{
			ID:                  w.ID,
			Name:                w.DisplayName,
			Status:              w.StatusText(),
			LatestSessionID:     latestSessionID,
			HasUnseenTurns:      w.Summary.HasUnseenTurns,
			HasPendingApproval:  w.Summary.HasPendingApproval,
			HasRunningDevServer: w.Summary.HasRunningDevServer,
			FilesChanged:        w.Summary.FilesChanged,
			LinesAdded:          w.Summary.LinesAdded,
			LinesRemoved:        w.Summary.LinesRemoved,
			CompletedAt:         completedAt,
			RelativeTime:        relativeTime,
			PrStatus:            prStatus,
			PrURL:               prURL,
			NeedsAttention:      w.NeedsAttention(),
		})
	}

	attrs := AttributesPayload{
		Count:          len(workspaces),
		AttentionCount: attentionCount,
		UpdatedAt:      now.UTC().Format(time.RFC3339),
		Workspaces:     items,
	}
	return json.Marshal(attrs)
}

func BuildSessionDiscoveryTopic(sessionID string) string {
	return fmt.Sprintf("homeassistant/sensor/kanban_watcher/session_%s/config", sessionID)
}

func BuildSessionStateTopic(sessionID string) string {
	return fmt.Sprintf("homeassistant/sensor/kanban_watcher/session_%s/state", sessionID)
}

func BuildSessionAttributesTopic(sessionID string) string {
	return fmt.Sprintf("homeassistant/sensor/kanban_watcher/session_%s/attributes", sessionID)
}

func BuildSessionDiscoveryJSON(snapshot sessionlog.SessionConversationSnapshot) ([]byte, error) {
	payload := haDiscoveryPayload{
		Name:                fmt.Sprintf("Kanban Session %s", snapshot.SessionID[:8]),
		UniqueID:            "kanban_watcher_session_" + snapshot.SessionID,
		StateTopic:          BuildSessionStateTopic(snapshot.SessionID),
		JSONAttributesTopic: BuildSessionAttributesTopic(snapshot.SessionID),
		Icon:                "mdi:message-text-outline",
		Device: haDevice{
			Identifiers:  []string{"kanban_watcher"},
			Name:         "Kanban Watcher",
			Manufacturer: "vibe-kanban",
		},
	}
	return json.Marshal(payload)
}

func BuildSessionStateValue(snapshot sessionlog.SessionConversationSnapshot) string {
	state := snapshot.LastMessage
	if state == "" {
		state = snapshot.LastRole
	}
	if state == "" {
		state = snapshot.SessionID
	}
	if len(state) <= maxSessionStateLength {
		return state
	}
	return state[:maxSessionStateLength-3] + "..."
}

func BuildSessionAttributesJSON(snapshot sessionlog.SessionConversationSnapshot) ([]byte, error) {
	payload := sessionAttributesPayload{
		SessionID:       snapshot.SessionID,
		WorkspaceID:     snapshot.WorkspaceID,
		WorkspaceName:   snapshot.WorkspaceName,
		MessageCount:    snapshot.MessageCount,
		ToolCallCount:   snapshot.ToolCallCount,
		UpdatedAt:       snapshot.UpdatedAt.UTC().Format(time.RFC3339),
		LastRole:        snapshot.LastRole,
		LastMessage:     snapshot.LastMessage,
		RecentMessages:  snapshot.RecentMessages,
		RecentToolCalls: snapshot.RecentToolCalls,
	}

	payload = limitSessionAttributesPayload(payload)
	return json.Marshal(payload)
}

func limitSessionAttributesPayload(payload sessionAttributesPayload) sessionAttributesPayload {
	limited := payload
	truncated := false

	lastMessage := truncateUTF8(payload.LastMessage, maxSessionLastMessageLength)
	if lastMessage != payload.LastMessage {
		truncated = true
	}
	limited.LastMessage = lastMessage

	limited.RecentMessages = make([]sessionlog.ConversationMessage, 0, len(payload.RecentMessages))
	for _, message := range payload.RecentMessages {
		trimmed := message
		trimmed.Content = truncateUTF8(trimmed.Content, maxSessionMessageTextLength)
		if trimmed.Content != message.Content {
			truncated = true
		}
		limited.RecentMessages = append(limited.RecentMessages, trimmed)
	}

	limited.RecentToolCalls = make([]sessionlog.ToolCallSummary, 0, len(payload.RecentToolCalls))
	for _, toolCall := range payload.RecentToolCalls {
		trimmed := toolCall
		trimmed.InputSummary = truncateUTF8(trimmed.InputSummary, maxSessionToolSummaryLength)
		trimmed.ResultSummary = truncateUTF8(trimmed.ResultSummary, maxSessionToolSummaryLength)
		if trimmed.InputSummary != toolCall.InputSummary || trimmed.ResultSummary != toolCall.ResultSummary {
			truncated = true
		}
		limited.RecentToolCalls = append(limited.RecentToolCalls, trimmed)
	}

	for len(mustMarshalSessionPayload(limited)) > maxSessionAttributesLength && len(limited.RecentMessages) > 0 {
		limited.RecentMessages = limited.RecentMessages[1:]
		truncated = true
	}

	for len(mustMarshalSessionPayload(limited)) > maxSessionAttributesLength && len(limited.RecentToolCalls) > 0 {
		limited.RecentToolCalls = limited.RecentToolCalls[1:]
		truncated = true
	}

	for _, maxLen := range []int{240, 160, 96} {
		if len(mustMarshalSessionPayload(limited)) <= maxSessionAttributesLength {
			break
		}
		next := truncateUTF8(limited.LastMessage, maxLen)
		if next != limited.LastMessage {
			limited.LastMessage = next
			truncated = true
		}
	}

	if truncated {
		limited.Truncated = true
	}
	return limited
}

func mustMarshalSessionPayload(payload sessionAttributesPayload) []byte {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return data
}

func truncateUTF8(value string, maxLen int) string {
	if maxLen <= 0 || value == "" {
		return ""
	}
	if utf8.RuneCountInString(value) <= maxLen {
		return value
	}
	runes := []rune(value)
	if maxLen <= 3 {
		return string(runes[:maxLen])
	}
	return string(runes[:maxLen-3]) + "..."
}

// calculateRelativeTime 计算相对时间（如：5分钟前，进行中）
// now: 当前时间
// completedAt: 完成时间（nil 表示进行中）
// status: 任务状态
func calculateRelativeTime(now time.Time, completedAt *string, status string) string {
	// 如果任务还在运行，显示状态
	if status == "running" {
		return "进行中"
	}
	if status == "failed" {
		return "失败"
	}
	if status == "killed" {
		return "已终止"
	}

	// 如果没有完成时间，返回未知
	if completedAt == nil || *completedAt == "" {
		return "未知"
	}

	// 解析完成时间
	t, err := time.Parse(time.RFC3339Nano, *completedAt)
	if err != nil {
		// 尝试解析不带纳秒的格式
		t, err = time.Parse(time.RFC3339, *completedAt)
		if err != nil {
			return "未知"
		}
	}

	// 计算时间差
	diff := now.Sub(t)

	// 小于1分钟
	if diff < time.Minute {
		return "刚刚"
	}

	// 小于1小时
	if diff < time.Hour {
		minutes := int(diff.Minutes())
		return fmt.Sprintf("%d分钟前", minutes)
	}

	// 小于24小时
	if diff < 24*time.Hour {
		hours := int(diff.Hours())
		return fmt.Sprintf("%d小时前", hours)
	}

	// 大于24小时
	days := int(diff.Hours() / 24)
	return fmt.Sprintf("%d天前", days)
}
