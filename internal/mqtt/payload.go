package mqtt

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
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

// haDiscoveryPayload HA MQTT Discovery 配置消息结构
// 用于向 Home Assistant 注册传感器实体
type haDiscoveryPayload struct {
	Name                string   `json:"name"`                  // 显示名称
	UniqueID            string   `json:"unique_id"`             // 全局唯一标识
	StateTopic          string   `json:"state_topic"`           // 状态值 Topic
	JSONAttributesTopic string   `json:"json_attributes_topic"` // 属性 JSON Topic
	UnitOfMeasurement   string   `json:"unit_of_measurement"`   // 单位（显示用）
	Icon                string   `json:"icon"`                  // MDI 图标
	Device              haDevice `json:"device"`                // 设备信息
}

type haDevice struct {
	Identifiers  []string `json:"identifiers"` // 设备标识符
	Name         string   `json:"name"`        // 设备名称
	Manufacturer string   `json:"manufacturer"` // 制造商
}

// WorkspaceItem 单个工作区的属性字段
// 作为 attributes payload 中 workspaces 数组的元素
type WorkspaceItem struct {
	ID                 string `json:"id"`                   // 工作区 ID
	Name               string `json:"name"`                 // 显示名称
	Status             string `json:"status"`               // 状态：running/completed/failed
	HasUnseenTurns     bool   `json:"has_unseen_turns"`     // 是否有未读消息
	HasPendingApproval bool   `json:"has_pending_approval"` // 是否有待审批
	FilesChanged       *int   `json:"files_changed,omitempty"` // 变更文件数（可选）
	LinesAdded         *int   `json:"lines_added,omitempty"`   // 新增行数（可选）
	LinesRemoved       *int   `json:"lines_removed,omitempty"` // 删除行数（可选）
	CompletedAt        string `json:"completed_at,omitempty"`  // 完成时间（可选）
	RelativeTime       string `json:"relative_time"`           // 相对时间（如：5分钟前，进行中）
	PrStatus           string `json:"pr_status,omitempty"`     // PR 状态（可选）
	PrURL              string `json:"pr_url,omitempty"`        // PR 链接（可选）
	NeedsAttention     bool   `json:"needs_attention"`         // 是否需要关注
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

		// 计算相对时间
		relativeTime := calculateRelativeTime(now, w.Summary.LatestProcessCompletedAt, w.StatusText())

		items = append(items, WorkspaceItem{
			ID:                 w.ID,
			Name:               w.DisplayName,
			Status:             w.StatusText(),
			HasUnseenTurns:     w.Summary.HasUnseenTurns,
			HasPendingApproval: w.Summary.HasPendingApproval,
			FilesChanged:       w.Summary.FilesChanged,
			LinesAdded:         w.Summary.LinesAdded,
			LinesRemoved:       w.Summary.LinesRemoved,
			CompletedAt:        completedAt,
			RelativeTime:       relativeTime,
			PrStatus:           prStatus,
			PrURL:              prURL,
			NeedsAttention:     w.NeedsAttention(),
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
