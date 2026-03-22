package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// Notifier 向企业微信发送通知（支持应用API + Webhook降级）
type Notifier struct {
	// 应用方式配置
	corpID    string
	agentID   string
	secret    string
	toUser    string
	proxyURL  string // 可选代理地址，不填则直连
	httpClient *http.Client

	// Webhook降级配置
	webhookURL string

	// accessToken 缓存
	tokenMu     sync.RWMutex
	accessToken string
	tokenExpiry  time.Time
}

// NewNotifier 创建通知器
// 优先使用应用API，失败时降级到Webhook（如果配置了Webhook）
// 若未配置任何方式，返回 nil
func NewNotifier(cfg config.WeChatConfig) *Notifier {
	hasAppConfig := cfg.CorpID != "" && cfg.AgentID != "" && cfg.Secret != ""
	hasWebhookConfig := cfg.WebhookURL != ""

	if !hasAppConfig && !hasWebhookConfig {
		return nil
	}

	return &Notifier{
		corpID:    cfg.CorpID,
		agentID:   cfg.AgentID,
		secret:    cfg.Secret,
		toUser:    cfg.ToUser,
		proxyURL:  cfg.ProxyURL,
		webhookURL: cfg.WebhookURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send 发送需要关注的工作区告警
// 优先使用应用API，失败时降级到Webhook
func (n *Notifier) Send(ctx context.Context, tw TrackedWorkspace) error {
	if n == nil {
		return nil
	}

	content := buildMarkdown(tw.Workspace, tw.ElapsedMinutes)

	// 优先尝试应用API
	if n.corpID != "" && n.agentID != "" && n.secret != "" {
		err := n.sendViaApp(ctx, content)
		if err == nil {
			return nil
		}
		// 应用失败，尝试降级
		if n.webhookURL != "" {
			err = n.sendViaWebhook(ctx, content)
			if err == nil {
				return nil
			}
		}
		return err
	}

	// 没有应用配置，使用Webhook
	return n.sendViaWebhook(ctx, content)
}

// sendViaApp 通过企业微信应用API发送
func (n *Notifier) sendViaApp(ctx context.Context, content string) error {
	token, err := n.getAccessToken(ctx)
	if err != nil {
		return err
	}

	baseURL := n.proxyURL
	if baseURL == "" {
		baseURL = "https://qyapi.weixin.qq.com"
	}
	url := fmt.Sprintf("%s/cgi-bin/message/send?access_token=%s", baseURL, token)

	msg := appMessage{
		ToUser:  n.toUser,
		MsgType: "text",
		AgentID: n.agentID,
		Text: appText{
			Content: content,
		},
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("序列化消息体: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("构建消息请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送消息: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
		MsgID   string `json:"msgid"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("解析消息响应: %s", respBody)
	}
	if result.ErrCode != 0 {
		// token 过期时重试一次
		if result.ErrCode == 40014 || result.ErrCode == 42001 {
			n.tokenMu.Lock()
			n.accessToken = ""
			n.tokenExpiry = time.Time{}
			n.tokenMu.Unlock()
			return n.sendViaApp(ctx, content)
		}
		return fmt.Errorf("应用消息发送失败: [%d] %s", result.ErrCode, result.ErrMsg)
	}

	return nil
}

// sendViaWebhook 通过企业微信机器人Webhook发送
func (n *Notifier) sendViaWebhook(ctx context.Context, content string) error {
	// Webhook支持markdown格式
	markdownContent := buildWebhookMarkdown(content)

	payload := webhookPayload{
		MsgType:  "markdown",
		Markdown: webhookMarkdown{Content: markdownContent},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("序列化Webhook消息: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("构建Webhook请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送Webhook消息: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Webhook返回HTTP %d", resp.StatusCode)
	}

	return nil
}

// getAccessToken 获取企业微信 access_token，带缓存
func (n *Notifier) getAccessToken(ctx context.Context) (string, error) {
	n.tokenMu.RLock()
	if n.accessToken != "" && time.Now().Before(n.tokenExpiry) {
		token := n.accessToken
		n.tokenMu.RUnlock()
		return token, nil
	}
	n.tokenMu.RUnlock()

	n.tokenMu.Lock()
	defer n.tokenMu.Unlock()

	// 双重检查
	if n.accessToken != "" && time.Now().Before(n.tokenExpiry) {
		return n.accessToken, nil
	}

	baseURL := n.proxyURL
	if baseURL == "" {
		baseURL = "https://qyapi.weixin.qq.com"
	}
	url := fmt.Sprintf("%s/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
		baseURL, n.corpID, n.secret)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("构建获取token请求: %w", err)
	}

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取access_token: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("解析token响应: %s", respBody)
	}
	if result.ErrCode != 0 {
		return "", fmt.Errorf("获取token失败: [%d] %s", result.ErrCode, result.ErrMsg)
	}

	n.accessToken = result.AccessToken
	// 提前5分钟过期，避免临界情况
	n.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-300) * time.Second)

	return n.accessToken, nil
}

// appMessage 企业微信应用消息请求体
type appMessage struct {
	ToUser  string   `json:"touser"`
	Toparty string   `json:"toparty"`
	ToTag   string   `json:"totag"`
	MsgType string   `json:"msgtype"`
	AgentID string   `json:"agentid"`
	Text    appText  `json:"text"`
}

type appText struct {
	Content string `json:"content"`
}

// webhookPayload 企业微信机器人Webhook请求体
type webhookPayload struct {
	MsgType  string         `json:"msgtype"`
	Markdown webhookMarkdown `json:"markdown"`
}

type webhookMarkdown struct {
	Content string `json:"content"`
}

// buildMarkdown 构建纯文本通知正文（用于应用消息）
func buildMarkdown(w api.EnrichedWorkspace, elapsedMinutes int) string {
	status := w.StatusText()
	attentionLines := buildAttentionLines(w)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Kanban 任务需要关注\n\n")
	fmt.Fprintf(&sb, "工作区: %s\n", w.DisplayName)
	fmt.Fprintf(&sb, "状态: %s\n", status)
	fmt.Fprintf(&sb, "等待时间: %d 分钟\n\n", elapsedMinutes)
	sb.WriteString(attentionLines)

	return sb.String()
}

// buildWebhookMarkdown 将纯文本内容转换为Webhook支持的Markdown格式
func buildWebhookMarkdown(text string) string {
	// Webhook的markdown支持企业微信特定的格式
	// 将普通文本转换为粗体等格式
	lines := strings.Split(text, "\n")
	var sb strings.Builder
	for _, line := range lines {
		if strings.HasPrefix(line, "工作区:") ||
			strings.HasPrefix(line, "状态:") ||
			strings.HasPrefix(line, "等待时间:") {
			// 加粗标签行
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				sb.WriteString(">**" + parts[0] + ":**" + parts[1] + "\n")
				continue
			}
		}
		sb.WriteString(line + "\n")
	}
	return sb.String()
}

// buildAttentionLines 构建详情区块
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
	fmt.Fprintf(&sb, "有未读消息: %s\n", unseenMark)
	fmt.Fprintf(&sb, "等待审批: %s\n", pendingMark)

	if w.Summary.FilesChanged != nil {
		added := 0
		removed := 0
		if w.Summary.LinesAdded != nil {
			added = *w.Summary.LinesAdded
		}
		if w.Summary.LinesRemoved != nil {
			removed = *w.Summary.LinesRemoved
		}
		fmt.Fprintf(&sb, "文件变更: %d (+%d/-%d)\n", *w.Summary.FilesChanged, added, removed)
	}

	if w.Summary.PrURL != nil {
		fmt.Fprintf(&sb, "\n查看 PR: %s\n", *w.Summary.PrURL)
	}

	return sb.String()
}