package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/notify"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/sessioncleaner"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/store"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

type activeWorkspaceSummaryFetcher interface {
	GetActiveWorkspaceSummaries(context.Context) ([]store.ActiveWorkspaceSummary, error)
}

func main() {
	err := run(os.Args[1:], commandDeps{
		runSyncNow: func() error {
			return executeSyncNow(syncNowDeps{})
		},
		runDaemon:   runDaemon,
		runHeadless: runHeadless,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

// runEventLoop 事件处理主循环
// 接收轮询结果，分发给菜单栏、企业微信通知
func runEventLoop(
	ctx context.Context,
	results <-chan poller.PollResult,
	summaryFetcher activeWorkspaceSummaryFetcher,
	sessionExtractor *sessionlog.Extractor,
	cfg *config.Config,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
	dialogNotifier *notify.DialogNotifier,
) {
	// 创建 session 清理器
	var cleaner *sessioncleaner.Cleaner
	var cleanupTicker *time.Ticker
	var cleanupCh <-chan time.Time

	if cfg.ConversationSync.IsEnabled() && cfg.ConversationSync.BaseDir != "" {
		cleaner = sessioncleaner.NewCleaner(
			cfg.ConversationSync.BaseDir,
			cfg.ConversationSync.SessionPreservedDays,
		)
		cleanupInterval := time.Duration(cfg.ConversationSync.SessionCleanupHours) * time.Hour
		if cleanupInterval <= 0 {
			cleanupInterval = time.Hour
		}
		cleanupTicker = time.NewTicker(cleanupInterval)
		cleanupCh = cleanupTicker.C
		defer cleanupTicker.Stop()
	}

	// 缓存最新的工作区列表，供清理器使用
	var latestWorkspaces []api.EnrichedWorkspace

	// 首次轮询静默标志：启动后的第一次轮询不触发通知
	isFirstPoll := true

	for {
		select {
		case <-ctx.Done():
			return
		case result := <-results:
			if result.Err != nil {
				fmt.Fprintf(os.Stderr, "轮询错误: %v\n", result.Err)
				continue
			}
			if summaryFetcher != nil {
				if summaries, err := summaryFetcher.GetActiveWorkspaceSummaries(ctx); err == nil {
					result.Workspaces = mergeLocalMenuSummaries(result.Workspaces, summaries)
				}
			}
			latestWorkspaces = result.Workspaces

			// 首次轮询静默：只更新菜单栏，不发送通知
			if isFirstPoll {
				isFirstPoll = false
				if trayApp != nil {
					trayApp.UpdateWorkspaces(result.Workspaces)
				}
				continue
			}

			handlePollResult(ctx, result, sessionExtractor, cfg, wechatNotifier, tracker, trayApp, dialogNotifier)
		case <-cleanupCh:
			// 每小时清理一次过期 session
			if cleaner != nil && len(latestWorkspaces) > 0 {
				cleanResult := cleaner.Cleanup(latestWorkspaces)
				if cleanResult.DeletedCount > 0 || cleanResult.FailedCount > 0 {
					fmt.Printf("sessioncleaner: 清理完成 - 扫描=%d, 活跃=%d, 过期=%d, 已删除=%d, 失败=%d\n",
						cleanResult.ScannedCount,
						cleanResult.ActiveCount,
						cleanResult.ExpiredCount,
						cleanResult.DeletedCount,
						cleanResult.FailedCount,
					)
				}
			}
		}
	}
}

func mergeLocalMenuSummaries(workspaces []api.EnrichedWorkspace, summaries []store.ActiveWorkspaceSummary) []api.EnrichedWorkspace {
	if len(workspaces) == 0 || len(summaries) == 0 {
		return workspaces
	}

	summaryMap := make(map[string]store.ActiveWorkspaceSummary, len(summaries))
	for _, summary := range summaries {
		summaryMap[summary.ID] = summary
	}

	merged := make([]api.EnrichedWorkspace, len(workspaces))
	copy(merged, workspaces)

	for i, workspace := range merged {
		summary, ok := summaryMap[workspace.ID]
		if !ok {
			continue
		}

		menuSummary, menuSummaryBy := api.BuildLocalMenuSummary(summary)
		if menuSummary == "" {
			continue
		}

		merged[i].MenuSummary = menuSummary
		merged[i].MenuSummaryBy = menuSummaryBy
	}

	return merged
}

// handlePollResult 处理单次轮询结果
// 依次执行：更新菜单栏 → 评估通知阈值 → 发送微信通知 → 持久化状态
func handlePollResult(
	ctx context.Context,
	result poller.PollResult,
	sessionExtractor *sessionlog.Extractor,
	cfg *config.Config,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
	dialogNotifier *notify.DialogNotifier,
) {
	workspaces := result.Workspaces

	// 1. 更新菜单栏显示（所有实例都更新）
	if trayApp != nil {
		trayApp.UpdateWorkspaces(workspaces)
	}

	// 只有主后端实例才发送通知
	if !cfg.Runtime.IsMain() {
		return
	}

	// 2. 评估通知阈值，获取需要告警的工作区列表
	toNotify := tracker.ProcessWorkspaces(workspaces, result.FetchedAt)

	// 3. 发送企业微信通知
	for _, tw := range toNotify {
		if err := wechatNotifier.Send(ctx, tw); err != nil {
			fmt.Fprintf(os.Stderr, "微信发送错误 [%s]: %v\n", tw.Workspace.DisplayName, err)
		}
	}

	// 4. 本地弹框通知（如果启用）
	if cfg.Notify.Enabled && dialogNotifier != nil {
		for _, tw := range toNotify {
			// 构建弹框信息
			title := "Kanban Watcher - 需要关注"
			message := fmt.Sprintf("工作区：%s\n状态：%s\n等待时间：%d 分钟",
				tw.Workspace.DisplayName,
				tw.Workspace.StatusText(),
				tw.ElapsedMinutes,
			)
			url := fmt.Sprintf("%s/workspace/%s", cfg.KanbanAPIURL, tw.Workspace.ID)

			clicked, err := dialogNotifier.ShowAndOpen(title, message, url)
			if err != nil {
				fmt.Fprintf(os.Stderr, "弹框失败 [%s]: %v\n", tw.Workspace.DisplayName, err)
			}

			// tracker.ProcessWorkspaces 已经在达到阈值时更新了 LastAlertedAt
			// 所以这里不需要再次更新
			_ = clicked
		}
	}

	// 5. 若发送了通知，更新持久化状态（记录已通知，避免重复）
	if len(toNotify) > 0 {
		if err := state.SaveState(tracker.GetState()); err != nil {
			fmt.Fprintf(os.Stderr, "警告: 保存状态: %v\n", err)
		}
	}
}
