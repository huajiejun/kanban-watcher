package tray

import (
	"context"
	"fmt"
	"sync"

	"github.com/getlantern/systray"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

// App manages the macOS menu bar icon and menu.
// All systray methods must be called from the goroutine that runs systray.Run,
// so updates are queued via UpdateWorkspaces which is called from the event loop.
type App struct {
	mu           sync.Mutex
	menuItems    []*systray.MenuItem // dynamic workspace items
	statusItem   *systray.MenuItem   // header showing counts
	quitItem     *systray.MenuItem
}

// New creates a new App.
func New() *App {
	return &App{}
}

// OnReady is passed to systray.Run and called on the main goroutine when the
// tray icon is ready. It sets up the initial menu structure.
func (a *App) OnReady() {
	systray.SetTemplateIcon(iconNormal, iconNormal)
	systray.SetTooltip("Kanban Watcher — 正在监控工作区")

	a.mu.Lock()
	a.statusItem = systray.AddMenuItem("Kanban Watcher", "工作区状态")
	a.statusItem.Disable()
	systray.AddSeparator()
	a.quitItem = systray.AddMenuItem("退出", "退出 Kanban Watcher")
	a.mu.Unlock()

	go a.handleClicks()
}

// OnExit returns a cleanup function passed to systray.Run.
// It cancels the application context so all goroutines shut down.
func (a *App) OnExit(cancel context.CancelFunc) func() {
	return func() {
		cancel()
	}
}

// UpdateWorkspaces refreshes the tray menu with the current workspace list.
// This must be called from outside the systray goroutine; systray methods
// are goroutine-safe on all platforms.
func (a *App) UpdateWorkspaces(workspaces []api.EnrichedWorkspace) {
	attentionCount := 0
	for _, w := range workspaces {
		if w.NeedsAttention() {
			attentionCount++
		}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// Update icon and tooltip
	if attentionCount > 0 {
		systray.SetTemplateIcon(iconAlert, iconAlert)
		systray.SetTooltip(fmt.Sprintf("Kanban Watcher — %d 个任务需要关注", attentionCount))
	} else {
		systray.SetTemplateIcon(iconNormal, iconNormal)
		systray.SetTooltip("Kanban Watcher — 所有任务正常")
	}

	// Update header
	if a.statusItem != nil {
		if attentionCount > 0 {
			a.statusItem.SetTitle(fmt.Sprintf("Kanban (%d 需关注 / 共 %d)", attentionCount, len(workspaces)))
		} else {
			a.statusItem.SetTitle(fmt.Sprintf("Kanban (%d 个工作区)", len(workspaces)))
		}
	}

	// Hide old workspace items; systray does not support removal so we hide them
	for _, item := range a.menuItems {
		item.Hide()
	}

	// Reuse or extend the item slice
	for i, w := range workspaces {
		title := fmt.Sprintf("%s %s", statusEmoji(w), w.DisplayName)
		tooltip := fmt.Sprintf("状态: %s", w.StatusText())

		if i < len(a.menuItems) {
			a.menuItems[i].SetTitle(title)
			a.menuItems[i].SetTooltip(tooltip)
			a.menuItems[i].Show()
		} else {
			item := systray.AddMenuItemCheckbox(title, tooltip, false)
			item.Disable() // items are display-only for now
			a.menuItems = append(a.menuItems, item)
		}
	}
}

// handleClicks processes menu item clicks in a dedicated goroutine.
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

// statusEmoji returns a visual status indicator for a workspace.
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
