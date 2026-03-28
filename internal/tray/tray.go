package tray

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

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
	mu            sync.Mutex
	menuItems     []*workspaceMenuItems // 动态工作区菜单项（可复用）
	statusItem    *systray.MenuItem     // 顶部状态标题项
	quitItem      *systray.MenuItem     // 退出菜单项
	instanceCount  int                  // 运行中的实例数量
}

type workspaceMenuItems struct {
	title   *systray.MenuItem
	summary *systray.MenuItem
}

// New 创建新的 App 实例
func New() *App {
	return &App{}
}

// OnReady 在 systray 图标准备好时被调用（在主 goroutine）
// 初始化菜单结构：状态标题 + 分隔线 + 动态工作区 + 退出
func (a *App) OnReady() {
	// 初始使用蓝点图标显示实例数量（0个点）
	systray.SetIcon(getInstanceIcon(0))
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

// UpdateInstanceCount 更新运行中的实例数量并刷新图标
// 菜单栏图标会显示对应数量的蓝点（类似红绿灯风格）
func (a *App) UpdateInstanceCount(count int) {
	a.mu.Lock()
	a.instanceCount = count
	systray.SetIcon(getInstanceIcon(count))
	a.mu.Unlock()
}

// StartInstanceMonitor 启动实例数量监控
// 会定期扫描本地文件系统获取运行中的实例数量并更新图标
func (a *App) StartInstanceMonitor(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				count := fetchRunningInstanceCount()
				a.UpdateInstanceCount(count)
			}
		}
	}()
}

// fetchRunningInstanceCount 从本地文件系统扫描运行中的实例数量
// 通过检查 /tmp/kanban-dev/ 目录下的配置文件和端口占用情况来统计
func fetchRunningInstanceCount() int {
	pidDir := "/tmp/kanban-dev"

	// 遍历所有 .env 文件
	count := 0
	entries, err := os.ReadDir(pidDir)
	if err != nil {
		return 0
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "workspace-") || !strings.HasSuffix(name, ".env") {
			continue
		}

		// 读取配置文件获取后端端口
		envFile := pidDir + "/" + name
		data, err := os.ReadFile(envFile)
		if err != nil {
			continue
		}

		// 解析 BACKEND_PORT
		var backendPort int
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "BACKEND_PORT=") {
				backendPort, _ = strconv.Atoi(strings.TrimPrefix(line, "BACKEND_PORT="))
				break
			}
		}

		if backendPort == 0 {
			continue
		}

		// 检查端口是否被占用
		if isPortInUse(backendPort) {
			count++
		}
	}

	return count
}

// isPortInUse 检查端口是否被占用
func isPortInUse(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
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

	// 更新提示文字和状态标题（图标由 StartInstanceMonitor 单独管理，不覆盖）
	if attentionCount > 0 {
		systray.SetTooltip(fmt.Sprintf("Kanban Watcher — %d 个任务需要关注", attentionCount))
	} else {
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
		item.title.Hide()
		item.summary.Hide()
	}

	// 复用或创建新的菜单项显示工作区
	for i, w := range workspaces {
		view := formatWorkspaceMenu(w)

		if i < len(a.menuItems) {
			// 复用已有菜单项
			a.menuItems[i].title.SetTitle(view.Title)
			a.menuItems[i].title.SetTooltip(view.TitleTooltip)
			a.menuItems[i].title.Show()
			if view.ShowSummary {
				a.menuItems[i].summary.SetTitle(view.Summary)
				a.menuItems[i].summary.SetTooltip(view.SummaryTooltip)
				a.menuItems[i].summary.Show()
			} else {
				a.menuItems[i].summary.Hide()
			}
		} else {
			titleItem := systray.AddMenuItemCheckbox(view.Title, view.TitleTooltip, false)
			titleItem.Disable()
			summaryItem := systray.AddMenuItem(view.Summary, view.SummaryTooltip)
			summaryItem.Disable()
			if !view.ShowSummary {
				summaryItem.Hide()
			}
			a.menuItems = append(a.menuItems, &workspaceMenuItems{
				title:   titleItem,
				summary: summaryItem,
			})
		}
	}
}

func statusIconBytes(attentionCount int) []byte {
	if attentionCount > 0 && len(iconAlert) > 0 {
		return iconAlert
	}
	return iconNormal
}

func usesDistinctStatusIcons() bool {
	return !bytes.Equal(iconNormal, iconAlert)
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
