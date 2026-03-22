package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	mqttclient "github.com/huajiejun/kanban-watcher/internal/mqtt"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

func main() {
	err := run(os.Args[1:], commandDeps{
		runSyncNow: func() error {
			return executeSyncNow(syncNowDeps{})
		},
		runDaemon: runDaemon,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

// runEventLoop 事件处理主循环
// 接收轮询结果，分发给菜单栏、MQTT、企业微信通知
func runEventLoop(
	ctx context.Context,
	results <-chan poller.PollResult,
	mqttPub *mqttclient.Publisher,
	sessionExtractor *sessionlog.Extractor,
	cfg *config.Config,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
) {
	for {
		select {
		case <-ctx.Done():
			return
		case result := <-results:
			if result.Err != nil {
				fmt.Fprintf(os.Stderr, "轮询错误: %v\n", result.Err)
				continue
			}
			handlePollResult(ctx, result, mqttPub, sessionExtractor, cfg, wechatNotifier, tracker, trayApp)
		}
	}
}

// handlePollResult 处理单次轮询结果
// 依次执行：更新菜单栏 → 推送 MQTT → 评估通知阈值 → 发送微信通知 → 持久化状态
func handlePollResult(
	ctx context.Context,
	result poller.PollResult,
	mqttPub *mqttclient.Publisher,
	sessionExtractor *sessionlog.Extractor,
	cfg *config.Config,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
) {
	workspaces := result.Workspaces

	// 1. 更新菜单栏显示
	trayApp.UpdateWorkspaces(workspaces)

	// 2. 推送真实数据到 MQTT（汇总实体 + session 实体）
	publishResult, err := publishCurrentData(ctx, cfg, workspaces, mqttPub, func(workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
		return collectSnapshots(sessionExtractor, workspaces)
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "mqtt 发布错误: %v\n", err)
	} else {
		fmt.Fprintln(os.Stderr, formatPollLog(publishResult))
	}

	// 3. 评估通知阈值，获取需要告警的工作区列表
	toNotify := tracker.ProcessWorkspaces(workspaces, result.FetchedAt)

	// 4. 发送企业微信通知
	for _, tw := range toNotify {
		if err := wechatNotifier.Send(ctx, tw); err != nil {
			fmt.Fprintf(os.Stderr, "微信发送错误 [%s]: %v\n", tw.Workspace.DisplayName, err)
		}
	}

	// 5. 若发送了通知，更新持久化状态（记录已通知，避免重复）
	if len(toNotify) > 0 {
		if err := state.SaveState(tracker.GetState()); err != nil {
			fmt.Fprintf(os.Stderr, "警告: 保存状态: %v\n", err)
		}
	}
}

func formatPollLog(result syncResult) string {
	return fmt.Sprintf(
		"poll: at=%s workspaces=%d summary_changed=%t session_snapshots=%d session_published=%d session_cleaned=%d extract_errors=%d",
		time.Now().UTC().Format(time.RFC3339),
		result.WorkspaceCount,
		result.SummaryPublished,
		result.SessionSnapshotCount,
		result.SessionPublishCount,
		result.SessionCleanupCount,
		result.SessionExtractErrorCount,
	)
}
