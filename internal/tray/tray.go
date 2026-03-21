package tray

import (
	"context"
	"fmt"
	"sync"

	"github.com/getlantern/systray"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

// App 管理 macOS 菜单栏图标和菜单
//
// 线程安全说明：
//   - systray 库的方法可以在任意 goroutine 调用（内部已做线程安全处理）
//   - 但 systray.Run 必须在主 goroutine 调用（macOS Cocoa 要求）
//   - 本结构体的 mu 用于保护 menuItems 等字段的并发访问
type App struct {
	mu         sync.Mutex
	menuItems  []*systray.MenuItem // 动态工作区菜单项（可复用）
	statusItem *systray.MenuItem   // 顶部状态标题项
	quitItem   *systray.MenuItem   // 退出菜单项
}

// New 创建新的 App 实例
func New() *App {
	return &App{}
}

// OnReady 在 systray 图标准备好时被调用（在主 goroutine）
// 初始化菜单结构：状态标题 + 分隔线 + 动态工作区 + 退出
func (a *App) OnReady() {
	systray.SetTemplateIcon(iconNormal, iconNormal)
	systray.SetTooltip("Kanban Watcher — 正在监控工作区")

	a.mu.Lock()
	a.statusItem = systray.AddMenuItem("Kanban Watcher", "工作区状态")
	a.statusItem.Disable() // 标题项不可点击
	systray.AddSeparator()
	a.quitItem = systray.AddMenuItem("退出", "退出 Kanban Watcher")
	a.mu.Unlock()

	// 在单独 goroutine 处理点击事件
	go a.handleClicks()
}

// OnExit 返回清理函数，在退出时调用
// 取消应用上下文，使所有 goroutine 优雅退出
func (a *App) OnExit(cancel context.CancelFunc) func() {
	return func() {
		cancel()
	}
}

// UpdateWorkspaces 刷新菜单栏显示
// 根据工作区列表更新图标、标题和动态菜单项
func (a *App) UpdateWorkspaces(workspaces []api.EnrichedWorkspace) {
	// 统计需要关注的工作区数量
	attentionCount := 0
	for _, w := range workspaces {
		if w.NeedsAttention() {
			attentionCount++
		}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// 根据状态切换图标和提示文字
	if attentionCount > 0 {
		systray.SetTemplateIcon(iconAlert, iconAlert)
		systray.SetTooltip(fmt.Sprintf("Kanban Watcher — %d 个任务需要关注", attentionCount))
	} else {
		systray.SetTemplateIcon(iconNormal, iconNormal)
		systray.SetTooltip("Kanban Watcher — 所有任务正常")
	}

	// 更新状态标题
	if a.statusItem != nil {
		if attentionCount > 0 {
			a.statusItem.SetTitle(fmt.Sprintf("Kanban (%d 需关注 / 共 %d)", attentionCount, len(workspaces)))
		} else {
			a.statusItem.SetTitle(fmt.Sprintf("Kanban (%d 个工作区)", len(workspaces)))
		}
	}

	// 隐藏旧的动态菜单项（systray 不支持删除，只能隐藏复用）
	for _, item := range a.menuItems {
		item.Hide()
	}

	// 复用或创建新的菜单项显示工作区
	for i, w := range workspaces {
		title := fmt.Sprintf("%s %s", statusEmoji(w), w.DisplayName)
		tooltip := fmt.Sprintf("状态: %s", w.StatusText())

		if i < len(a.menuItems) {
			// 复用已有菜单项
			a.menuItems[i].SetTitle(title)
			a.menuItems[i].SetTooltip(tooltip)
			a.menuItems[i].Show()
		} else {
			// 创建新菜单项（复选框样式，但禁用交互）
			item := systray.AddMenuItemCheckbox(title, tooltip, false)
			item.Disable() // 当前仅作展示，不支持点击
			a.menuItems = append(a.menuItems, item)
		}
	}
}

// handleClicks 在单独 goroutine 中处理菜单点击事件
func (a *App) handleClicks() {
	for {
		a.mu.Lock()
		quit := a.quitItem
		a.mu.Unlock()

		if quit == nil {
			return
		}

		select {
		case <-quit.ClickedCh:
			systray.Quit()
			return
		}
	}
}

// statusEmoji 返回工作区状态对应的表情符号
// 优先级：⏳ 待审批 > 🔔 未读消息 > 状态图标
func statusEmoji(w api.EnrichedWorkspace) string {
	if w.Summary.HasPendingApproval {
		return "⏳"
	}
	if w.Summary.HasUnseenTurns {
		return "🔔"
	}
	switch w.StatusText() {
	case "running":
		return "▶"
	case "completed":
		return "✓"
	case "failed", "killed":
		return "✗"
	default:
		return "·"
	}
}
