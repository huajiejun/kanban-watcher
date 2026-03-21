package main

import (
	"context"
	"fmt"
	"os"

	"github.com/getlantern/systray"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	mqttclient "github.com/huajiejun/kanban-watcher/internal/mqtt"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

func main() {
	cfg := config.MustLoad()
	persistedState := state.MustLoad()

	apiClient := api.NewClient(cfg.KanbanAPIURL)
	mqttPub := mqttclient.NewPublisher(cfg.MQTT)
	wechatNotifier := wechat.NewNotifier(cfg.WeChat)
	tracker := wechat.NewTracker(persistedState, cfg.WeChat.NotifyThresholdMinutes)
	trayApp := tray.New()

	ctx, cancel := context.WithCancel(context.Background())

	// Connect MQTT in background; failures are logged but non-fatal
	if cfg.MQTT.Broker != "" {
		if err := mqttPub.Connect(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "mqtt: connect warning: %v\n", err)
		}
	}

	pollResults := make(chan poller.PollResult, 2)
	go poller.Run(ctx, cfg, apiClient, pollResults)
	go runEventLoop(ctx, pollResults, mqttPub, wechatNotifier, tracker, trayApp)

	// systray.Run must be called on the main goroutine (macOS Cocoa requirement).
	// It blocks until Quit() is called.
	systray.Run(
		trayApp.OnReady,
		trayApp.OnExit(cancel),
	)

	// Graceful shutdown
	mqttPub.Disconnect()
	if err := state.SaveState(tracker.GetState()); err != nil {
		fmt.Fprintf(os.Stderr, "warning: save state on exit: %v\n", err)
	}
}

// runEventLoop processes poll results and dispatches to MQTT, WeChat, and tray.
func runEventLoop(
	ctx context.Context,
	results <-chan poller.PollResult,
	mqttPub *mqttclient.Publisher,
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
				fmt.Fprintf(os.Stderr, "poll error: %v\n", result.Err)
				continue
			}
			handlePollResult(ctx, result, mqttPub, wechatNotifier, tracker, trayApp)
		}
	}
}

func handlePollResult(
	ctx context.Context,
	result poller.PollResult,
	mqttPub *mqttclient.Publisher,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
) {
	workspaces := result.Workspaces

	// Update tray menu
	trayApp.UpdateWorkspaces(workspaces)

	// Push to MQTT (non-fatal if fails)
	if _, err := mqttPub.PublishIfChanged(ctx, workspaces); err != nil {
		fmt.Fprintf(os.Stderr, "mqtt publish error: %v\n", err)
	}

	// Evaluate notification thresholds
	toNotify := tracker.ProcessWorkspaces(workspaces, result.FetchedAt)

	// Send WeChat notifications
	for _, tw := range toNotify {
		if err := wechatNotifier.Send(ctx, tw); err != nil {
			fmt.Fprintf(os.Stderr, "wechat send error for %s: %v\n", tw.Workspace.DisplayName, err)
		}
	}

	// Persist updated state if anything changed
	if len(toNotify) > 0 {
		if err := state.SaveState(tracker.GetState()); err != nil {
			fmt.Fprintf(os.Stderr, "warning: save state: %v\n", err)
		}
	}
}
