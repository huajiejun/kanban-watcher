package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// Notifier 向企业微信机器人 Webhook 发送通知消息
type Notifier struct {
	webhookURL string       // Webhook 完整地址
	httpClient *http.Client // HTTP 客户端（带超时）
}

// NewNotifier 创建通知器
// 若未配置 Webhook URL，返回 nil（后续调用不会报错，直接返回）
func NewNotifier(cfg config.WeChatConfig) *Notifier {
	if cfg.WebhookURL == "" {
		return nil
	}
	return &Notifier{
		webhookURL: cfg.WebhookURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send 发送需要关注的工作区告警
// 若 notifier 为 nil（未配置），返回 nil 不执行任何操作
func (n *Notifier) Send(ctx context.Context, tw TrackedWorkspace) error {
	if n == nil {
		return nil
	}
	content := buildMarkdown(tw.Workspace, tw.ElapsedMinutes)
	return n.post(ctx, content)
}

// wechatPayload 企业微信 Webhook 请求体结构
type wechatPayload struct {
	MsgType  string         `json:"msgtype"`  // 消息类型：markdown
	Markdown wechatMarkdown `json:"markdown"` // markdown 内容
}

type wechatMarkdown struct {
	Content string `json:"content"` // markdown 文本
}

// post 发送 POST 请求到 Webhook
func (n *Notifier) post(ctx context.Context, content string) error {
	payload := wechatPayload{
		MsgType:  "markdown",
		Markdown: wechatMarkdown{Content: content},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("序列化微信消息: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("构建微信请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送微信消息: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("微信 Webhook 返回 HTTP %d", resp.StatusCode)
	}
	return nil
}

// buildMarkdown 构建企业微信 Markdown 通知正文
//
// 格式说明：
//   - 标题：## Kanban 任务需要关注
//   - 工作区名称、状态（带颜色）、等待时间
//   - 详情区块：是否有未读消息、是否等待审批、文件变更统计
//   - PR 链接（若存在）
//
// 颜色规则（企业微信支持）：
//   - info（绿色）：running
//   - comment（灰色）：completed、未知状态
//   - warning（橙色）：failed、killed
func buildMarkdown(w api.EnrichedWorkspace, elapsedMinutes int) string {
	status := w.StatusText()
	statusColor := colorForStatus(status)
	attentionLines := buildAttentionLines(w)

	var sb strings.Builder
	fmt.Fprintf(&sb, "## Kanban 任务需要关注\n\n")
	fmt.Fprintf(&sb, "**工作区**: %s\n", w.DisplayName)
	fmt.Fprintf(&sb, "**状态**: <font color=%q>%s</font>\n", statusColor, status)
	fmt.Fprintf(&sb, "**等待时间**: %d 分钟\n\n", elapsedMinutes)
	fmt.Fprintf(&sb, "---\n")
	sb.WriteString(attentionLines)

	return sb.String()
}

// colorForStatus 将进程状态映射到企业微信 Markdown 颜色标签
func colorForStatus(status string) string {
	switch status {
	case "running":
		return "info" // 绿色
	case "completed":
		return "comment" // 灰色
	case "failed", "killed":
		return "warning" // 橙色
	default:
		return "comment" // 未知状态默认灰色
	}
}

// buildAttentionLines 构建详情区块，展示告警原因的具体信息
func buildAttentionLines(w api.EnrichedWorkspace) string {
	var sb strings.Builder

	// 复选框标记：✅ 表示是，❌ 表示否
	unseenMark := "❌"
	if w.Summary.HasUnseenTurns {
		unseenMark = "✅"
	}
	pendingMark := "❌"
	if w.Summary.HasPendingApproval {
		pendingMark = "✅"
	}
	fmt.Fprintf(&sb, "> 有未读消息: %s\n", unseenMark)
	fmt.Fprintf(&sb, "> 等待审批: %s\n", pendingMark)

	// 若存在文件变更，显示统计
	if w.Summary.FilesChanged != nil {
		added := 0
		removed := 0
		if w.Summary.LinesAdded != nil {
			added = *w.Summary.LinesAdded
		}
		if w.Summary.LinesRemoved != nil {
			removed = *w.Summary.LinesRemoved
		}
		fmt.Fprintf(&sb, "> 文件变更: %d (+%d/-%d)\n", *w.Summary.FilesChanged, added, removed)
	}

	// 若存在 PR，添加链接
	if w.Summary.PrURL != nil {
		fmt.Fprintf(&sb, "\n[查看 PR](%s)\n", *w.Summary.PrURL)
	}

	return sb.String()
}
