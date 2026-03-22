package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/getlantern/systray"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	mqttclient "github.com/huajiejun/kanban-watcher/internal/mqtt"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/server"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
	"github.com/huajiejun/kanban-watcher/internal/singleton"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

type commandDeps struct {
	runSyncNow func() error
	runDaemon  func() error
}

func run(args []string, deps commandDeps) error {
	options, err := parseCommandOptions(args)
	if err != nil {
		return err
	}
	if options.syncNow {
		return deps.runSyncNow()
	}
	return deps.runDaemon()
}

type commandOptions struct {
	syncNow bool
}

func parseCommandOptions(args []string) (commandOptions, error) {
	fs := flag.NewFlagSet("kanban-watcher", flag.ContinueOnError)
	fs.SetOutput(io.Discard)

	var options commandOptions
	fs.BoolVar(&options.syncNow, "sync-now", false, "同步当前真实数据到 Home Assistant 后退出")
	if err := fs.Parse(args); err != nil {
		return commandOptions{}, err
	}
	if fs.NArg() > 0 {
		return commandOptions{}, fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	return options, nil
}

type workspaceFetcher interface {
	FetchAll(context.Context) ([]api.EnrichedWorkspace, error)
}

type syncPublisher interface {
	PublishIfChanged(context.Context, []api.EnrichedWorkspace) (bool, error)
	PublishSessionSnapshots(context.Context, []sessionlog.SessionConversationSnapshot) (int, int, error)
}

type syncNowPublisher interface {
	syncPublisher
	Connect(context.Context) error
	Disconnect()
}

type syncResult struct {
	WorkspaceCount           int
	SessionSnapshotCount     int
	SessionPublishCount      int
	SessionCleanupCount      int
	SessionExtractErrorCount int
}

type syncNowDeps struct {
	loadConfig      func() (*config.Config, error)
	newFetcher      func(string) workspaceFetcher
	newPublisher    func(config.MQTTConfig) syncNowPublisher
	collectSessions func([]api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int)
	stdout          io.Writer
	stderr          io.Writer
}

func defaultSyncNowDeps() syncNowDeps {
	return syncNowDeps{
		loadConfig: func() (*config.Config, error) {
			return config.LoadConfig()
		},
		newFetcher: func(baseURL string) workspaceFetcher {
			return api.NewClient(baseURL)
		},
		newPublisher: func(cfg config.MQTTConfig) syncNowPublisher {
			return mqttclient.NewPublisher(cfg)
		},
		collectSessions: func(workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
			cfg, err := config.LoadConfig()
			if err != nil {
				return nil, 0
			}
			extractor := sessionlog.NewExtractor(
				cfg.ConversationSync.BaseDir,
				cfg.ConversationSync.RecentMessageLimit,
				cfg.ConversationSync.RecentToolCallLimit,
			)
			return collectSnapshots(extractor, workspaces)
		},
		stdout: os.Stdout,
		stderr: os.Stderr,
	}
}

func executeSyncNow(deps syncNowDeps) error {
	if deps.loadConfig == nil {
		deps.loadConfig = func() (*config.Config, error) { return config.LoadConfig() }
	}
	if deps.stdout == nil {
		deps.stdout = os.Stdout
	}
	if deps.stderr == nil {
		deps.stderr = os.Stderr
	}

	cfg, err := deps.loadConfig()
	if err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}
	if cfg.MQTT.Broker == "" {
		return errors.New("mqtt broker 未配置，无法执行单次同步")
	}

	if deps.newFetcher == nil {
		deps.newFetcher = func(baseURL string) workspaceFetcher { return api.NewClient(baseURL) }
	}
	if deps.newPublisher == nil {
		deps.newPublisher = func(mqttCfg config.MQTTConfig) syncNowPublisher { return mqttclient.NewPublisher(mqttCfg) }
	}
	if deps.collectSessions == nil {
		extractor := sessionlog.NewExtractor(
			cfg.ConversationSync.BaseDir,
			cfg.ConversationSync.RecentMessageLimit,
			cfg.ConversationSync.RecentToolCallLimit,
		)
		deps.collectSessions = func(workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
			return collectSnapshots(extractor, workspaces)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	fetcher := deps.newFetcher(cfg.KanbanAPIURL)
	publisher := deps.newPublisher(cfg.MQTT)
	if err := publisher.Connect(ctx); err != nil {
		return fmt.Errorf("mqtt 连接失败: %w", err)
	}
	defer publisher.Disconnect()

	result, err := syncCurrentData(ctx, cfg, fetcher, publisher, deps.collectSessions)
	if err != nil {
		return err
	}

	fmt.Fprintf(
		deps.stdout,
		"单次同步完成: 工作区=%d, 会话快照=%d, 会话发布=%d, 会话清理=%d, 提取错误=%d\n",
		result.WorkspaceCount,
		result.SessionSnapshotCount,
		result.SessionPublishCount,
		result.SessionCleanupCount,
		result.SessionExtractErrorCount,
	)
	if result.SessionExtractErrorCount > 0 {
		fmt.Fprintf(deps.stderr, "警告: 有 %d 个会话日志提取失败并被跳过\n", result.SessionExtractErrorCount)
	}
	return nil
}

func syncCurrentData(
	ctx context.Context,
	cfg *config.Config,
	fetcher workspaceFetcher,
	publisher syncPublisher,
	collectSessions func([]api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int),
) (syncResult, error) {
	workspaces, err := fetcher.FetchAll(ctx)
	if err != nil {
		return syncResult{}, fmt.Errorf("获取工作区失败: %w", err)
	}

	return publishCurrentData(ctx, cfg, workspaces, publisher, collectSessions)
}

func runDaemon() error {
	// 单实例检查：确保只有一个 kanban-watcher 在运行
	lock, err := singleton.Acquire("kanban-watcher")
	if err != nil {
		return fmt.Errorf("错误: %v\n提示: 如果确定没有实例在运行，请手动删除 PID 文件", err)
	}
	defer lock.Release()

	cfg := config.MustLoad()
	persistedState := state.MustLoad()

	apiClient := api.NewClient(cfg.KanbanAPIURL)
	mqttPub := mqttclient.NewPublisher(cfg.MQTT)
	sessionExtractor := sessionlog.NewExtractor(
		cfg.ConversationSync.BaseDir,
		cfg.ConversationSync.RecentMessageLimit,
		cfg.ConversationSync.RecentToolCallLimit,
	)
	wechatNotifier := wechat.NewNotifier(cfg.WeChat)
	tracker := wechat.NewTracker(persistedState, cfg.WeChat.NotifyThresholdMinutes)
	trayApp := tray.New()

	proxyClient := api.NewProxyClient(cfg.KanbanAPIURL)
	httpServer := server.NewServer(proxyClient, 7778, "your-api-key-here")
	if err := httpServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "HTTP 服务器启动失败: %v\n", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	if cfg.MQTT.Broker != "" {
		if err := mqttPub.Connect(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "mqtt: 连接警告: %v\n", err)
		}
	}

	pollResults := make(chan poller.PollResult, 2)
	go poller.Run(ctx, cfg, apiClient, pollResults)
	go runEventLoop(ctx, pollResults, mqttPub, sessionExtractor, cfg, wechatNotifier, tracker, trayApp)

	systray.Run(trayApp.OnReady, trayApp.OnExit(cancel))

	if httpServer != nil {
		httpServer.Stop(context.Background())
	}
	mqttPub.Disconnect()
	if err := state.SaveState(tracker.GetState()); err != nil {
		fmt.Fprintf(os.Stderr, "警告: 退出时保存状态失败: %v\n", err)
	}
	return nil
}

func collectSnapshots(extractor *sessionlog.Extractor, workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
	if extractor == nil {
		return nil, 0
	}

	snapshots := make([]sessionlog.SessionConversationSnapshot, 0, len(workspaces))
	errCount := 0
	for _, workspace := range workspaces {
		if workspace.Summary.LatestSessionID == nil || *workspace.Summary.LatestSessionID == "" {
			continue
		}
		snapshot, err := extractor.ExtractSnapshot(sessionlog.SessionTarget{
			SessionID:     *workspace.Summary.LatestSessionID,
			WorkspaceID:   workspace.ID,
			WorkspaceName: workspace.DisplayName,
		})
		if err != nil {
			errCount++
			continue
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, errCount
}

func publishCurrentData(
	ctx context.Context,
	cfg *config.Config,
	workspaces []api.EnrichedWorkspace,
	publisher syncPublisher,
	collectSessions func([]api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int),
) (syncResult, error) {
	result := syncResult{WorkspaceCount: len(workspaces)}

	if _, err := publisher.PublishIfChanged(ctx, workspaces); err != nil {
		return result, fmt.Errorf("发布工作区汇总失败: %w", err)
	}

	if cfg != nil && cfg.ConversationSync.IsEnabled() && collectSessions != nil {
		snapshots, extractErrCount := collectSessions(workspaces)
		result.SessionSnapshotCount = len(snapshots)
		result.SessionExtractErrorCount = extractErrCount

		published, cleaned, err := publisher.PublishSessionSnapshots(ctx, snapshots)
		if err != nil {
			return result, fmt.Errorf("发布会话实体失败: %w", err)
		}
		result.SessionPublishCount = published
		result.SessionCleanupCount = cleaned
	}

	return result, nil
}
