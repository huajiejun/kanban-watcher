package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
)

// Notifier 向企业微信应用发送通知消息
type Notifier struct {
	corpID    string
	agentID   string
	secret    string
	toUser    string
	proxyURL  string // 可选代理地址，不填则直连
	httpClient *http.Client

	// accessToken 缓存
	tokenMu    sync.RWMutex
	accessToken string
	tokenExpiry  time.Time
}

// NewNotifier 创建通知器
// 若未配置应用参数，返回 nil（后续调用不会报错，直接返回）
func NewNotifier(cfg config.WeChatConfig) *Notifier {
	if cfg.CorpID == "" || cfg.AgentID == "" || cfg.Secret == "" {
		return nil
	}
	return &Notifier{
		corpID:    cfg.CorpID,
		agentID:   cfg.AgentID,
		secret:    cfg.Secret,
		toUser:    cfg.ToUser,
		proxyURL:  cfg.ProxyURL,
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
	return n.postMessage(ctx, content)
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

	// 需要重新获取
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
		return "", fmt.Errorf("构建获取 token 请求: %w", err)
	}

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取 access_token: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		ErrCode   int    `json:"errcode"`
		ErrMsg    string `json:"errmsg"`
		AccessToken string `json:"access_token"`
		ExpiresIn int    `json:"expires_in"` // 有效期（秒），通常 7200
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("解析 token 响应: %w", err)
	}
	if result.ErrCode != 0 {
		return "", fmt.Errorf("获取 token 失败: [%d] %s", result.ErrCode, result.ErrMsg)
	}

	n.accessToken = result.AccessToken
	// 提前 5 分钟过期，避免临界情况
	n.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-300) * time.Second)

	return n.accessToken, nil
}

// postMessage 发送应用消息
func (n *Notifier) postMessage(ctx context.Context, content string) error {
	token, err := n.getAccessToken(ctx)
	if err != nil {
		return err
	}

	baseURL := n.proxyURL
	if baseURL == "" {
		baseURL = "https://qyapi.weixin.qq.com"
	}
	url := fmt.Sprintf("%s/cgi-bin/message/send?access_token=%s", baseURL, token)

	// 构建消息体（使用 text 类型以确保兼容性）
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

	var result struct {
		ErrCode   int    `json:"errcode"`
		ErrMsg    string `json:"errmsg"`
		MsgID     string `json:"msgid"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("解析消息响应: %w", err)
	}
	if result.ErrCode != 0 {
		// token 过期时重试一次
		if result.ErrCode == 40014 || result.ErrCode == 42001 {
			n.tokenMu.Lock()
			n.accessToken = ""
			n.tokenExpiry = time.Time{}
			n.tokenMu.Unlock()
			return n.postMessage(ctx, content)
		}
		return fmt.Errorf("发送消息失败: [%d] %s", result.ErrCode, result.ErrMsg)
	}

	return nil
}

// appMessage 企业微信应用消息请求体
type appMessage struct {
	ToUser  string   `json:"touser"`  // 成员账号，多个用 | 分隔
	Toparty string   `json:"toparty"` // 部门 ID
	ToTag   string   `json:"totag"`   // 标签 ID
	MsgType string   `json:"msgtype"` // 消息类型
	AgentID string   `json:"agentid"` // 应用 AgentID
	Text    appText  `json:"text"`    // 文本内容
}

type appText struct {
	Content string `json:"content"` // 文本内容
}

// buildMarkdown 构建企业微信纯文本通知正文
//
// 格式说明：
//   - 标题：Kanban 任务需要关注
//   - 工作区名称、状态、等待时间
//   - 详情区块：是否有未读消息、是否等待审批、文件变更统计
//   - PR 链接（若存在）
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
	fmt.Fprintf(&sb, "有未读消息: %s\n", unseenMark)
	fmt.Fprintf(&sb, "等待审批: %s\n", pendingMark)

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
		fmt.Fprintf(&sb, "文件变更: %d (+%d/-%d)\n", *w.Summary.FilesChanged, added, removed)
	}

	// 若存在 PR，添加链接
	if w.Summary.PrURL != nil {
		fmt.Fprintf(&sb, "\n查看 PR: %s\n", *w.Summary.PrURL)
	}

	return sb.String()
}