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

// Notifier sends messages to an enterprise WeChat bot webhook.
type Notifier struct {
	webhookURL string
	httpClient *http.Client
}

// NewNotifier creates a Notifier. Returns nil if no webhook URL is configured.
func NewNotifier(cfg config.WeChatConfig) *Notifier {
	if cfg.WebhookURL == "" {
		return nil
	}
	return &Notifier{
		webhookURL: cfg.WebhookURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send sends a markdown alert for a workspace that needs attention.
// Returns nil (no-op) if the notifier was not configured.
func (n *Notifier) Send(ctx context.Context, tw TrackedWorkspace) error {
	if n == nil {
		return nil
	}
	content := buildMarkdown(tw.Workspace, tw.ElapsedMinutes)
	return n.post(ctx, content)
}

// wechatPayload is the JSON body for the WeChat webhook.
type wechatPayload struct {
	MsgType  string          `json:"msgtype"`
	Markdown wechatMarkdown  `json:"markdown"`
}

type wechatMarkdown struct {
	Content string `json:"content"`
}

func (n *Notifier) post(ctx context.Context, content string) error {
	payload := wechatPayload{
		MsgType:  "markdown",
		Markdown: wechatMarkdown{Content: content},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal wechat payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build wechat request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send wechat message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("wechat webhook returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// buildMarkdown constructs the WeChat markdown notification message.
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

// colorForStatus maps process status to WeChat markdown color tags.
func colorForStatus(status string) string {
	switch status {
	case "running":
		return "info"
	case "completed":
		return "comment"
	case "failed", "killed":
		return "warning"
	default:
		return "comment"
	}
}

// buildAttentionLines constructs the blockquote lines summarising the alert reason.
func buildAttentionLines(w api.EnrichedWorkspace) string {
	var sb strings.Builder

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

	if w.Summary.PrURL != nil {
		fmt.Fprintf(&sb, "\n[查看 PR](%s)\n", *w.Summary.PrURL)
	}

	return sb.String()
}
