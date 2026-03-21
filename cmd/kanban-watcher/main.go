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
	"github.com/huajiejun/kanban-watcher/internal/singleton"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

func main() {
	// 单实例检查：确保只有一个 kanban-watcher 在运行
	// 如果已有实例在运行，会返回错误并退出
	lock, err := singleton.Acquire("kanban-watcher")
	if err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		fmt.Fprintf(os.Stderr, "提示: 如果确定没有实例在运行，请手动删除 PID 文件\n")
		os.Exit(1)
	}
	defer lock.Release() // 程序退出时自动清理 PID 文件

	// 加载配置（出错时直接退出）
	cfg := config.MustLoad()

	// 加载持久化状态（出错时返回空状态，不阻塞启动）
	persistedState := state.MustLoad()

	// 初始化各组件
	apiClient := api.NewClient(cfg.KanbanAPIURL)
	mqttPub := mqttclient.NewPublisher(cfg.MQTT)
	wechatNotifier := wechat.NewNotifier(cfg.WeChat)
	tracker := wechat.NewTracker(persistedState, cfg.WeChat.NotifyThresholdMinutes)
	trayApp := tray.New()

	// 创建可取消的根上下文
	ctx, cancel := context.WithCancel(context.Background())

	// 在后台连接 MQTT；失败仅记录日志，不阻塞启动
	if cfg.MQTT.Broker != "" {
		if err := mqttPub.Connect(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "mqtt: 连接警告: %v\n", err)
		}
	}

	// 创建带缓冲的结果通道，避免轮询器阻塞
	pollResults := make(chan poller.PollResult, 2)

	// 启动轮询器（后台 goroutine）
	go poller.Run(ctx, cfg, apiClient, pollResults)

	// 启动事件循环（后台 goroutine）
	go runEventLoop(ctx, pollResults, mqttPub, wechatNotifier, tracker, trayApp)

	// systray.Run 必须在主 goroutine 调用（macOS Cocoa 要求）
	// 它会阻塞直到调用 Quit()
	systray.Run(
		trayApp.OnReady,        // 图标准备好的回调
		trayApp.OnExit(cancel), // 退出时的清理回调
	)

	// 优雅退出：断开 MQTT，保存状态
	mqttPub.Disconnect()
	if err := state.SaveState(tracker.GetState()); err != nil {
		fmt.Fprintf(os.Stderr, "警告: 退出时保存状态失败: %v\n", err)
	}
}

// runEventLoop 事件处理主循环
// 接收轮询结果，分发给菜单栏、MQTT、企业微信通知
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
				fmt.Fprintf(os.Stderr, "轮询错误: %v\n", result.Err)
				continue
			}
			handlePollResult(ctx, result, mqttPub, wechatNotifier, tracker, trayApp)
		}
	}
}

// handlePollResult 处理单次轮询结果
// 依次执行：更新菜单栏 → 推送 MQTT → 评估通知阈值 → 发送微信通知 → 持久化状态
func handlePollResult(
	ctx context.Context,
	result poller.PollResult,
	mqttPub *mqttclient.Publisher,
	wechatNotifier *wechat.Notifier,
	tracker *wechat.Tracker,
	trayApp *tray.App,
) {
	workspaces := result.Workspaces

	// 1. 更新菜单栏显示
	trayApp.UpdateWorkspaces(workspaces)

	// 2. 推送至 MQTT（失败仅记录，不中断流程）
	if _, err := mqttPub.PublishIfChanged(ctx, workspaces); err != nil {
		fmt.Fprintf(os.Stderr, "mqtt 发布错误: %v\n", err)
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
