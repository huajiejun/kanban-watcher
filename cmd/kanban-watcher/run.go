package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getlantern/systray"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/auth"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/notify"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/realtime"
	"github.com/huajiejun/kanban-watcher/internal/server"
	"github.com/huajiejun/kanban-watcher/internal/service"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
	"github.com/huajiejun/kanban-watcher/internal/singleton"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/store"
	"github.com/huajiejun/kanban-watcher/internal/sync"
	"github.com/huajiejun/kanban-watcher/internal/tokenstats"
	"github.com/huajiejun/kanban-watcher/internal/tray"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

//go:embed web
var webFS embed.FS

type commandDeps struct {
	runSyncNow  func() error
	runDaemon   func() error
	runHeadless func() error
}

func run(args []string, deps commandDeps) error {
	options, err := parseCommandOptions(args)
	if err != nil {
		return err
	}
	if options.syncNow {
		return deps.runSyncNow()
	}
	if options.headless {
		return deps.runHeadless()
	}
	return deps.runDaemon()
}

type commandOptions struct {
	syncNow  bool
	headless bool
}

func parseCommandOptions(args []string) (commandOptions, error) {
	fs := flag.NewFlagSet("kanban-watcher", flag.ContinueOnError)
	fs.SetOutput(io.Discard)

	var options commandOptions
	fs.BoolVar(&options.syncNow, "sync-now", false, "同步当前真实数据到数据库后退出")
	fs.BoolVar(&options.headless, "headless", false, "无托盘常驻运行，仅启动同步和 HTTP API")
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

type syncResult struct {
	WorkspaceCount           int
	SessionSnapshotCount     int
	SessionCleanupCount      int
	SessionExtractErrorCount int
}

type runtimeFeatures struct {
	role            string
	enableSync      bool
	enableRealtime  bool
	enableNotify    bool
	realtimeBaseURL string
}

type syncNowDeps struct {
	loadConfig      func() (*config.Config, error)
	newFetcher      func(string) workspaceFetcher
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
	if !cfg.Database.IsEnabled() {
		return errors.New("数据库未配置，无法执行单次同步")
	}

	if deps.newFetcher == nil {
		deps.newFetcher = func(baseURL string) workspaceFetcher { return api.NewClient(baseURL) }
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
	result, err := syncCurrentData(ctx, cfg, fetcher, deps.collectSessions)
	if err != nil {
		return err
	}

	fmt.Fprintf(
		deps.stdout,
		"单次同步完成: 工作区=%d, 会话快照=%d, 会话清理=%d, 提取错误=%d\n",
		result.WorkspaceCount,
		result.SessionSnapshotCount,
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
	collectSessions func([]api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int),
) (syncResult, error) {
	workspaces, err := fetcher.FetchAll(ctx)
	if err != nil {
		return syncResult{}, fmt.Errorf("获取工作区失败: %w", err)
	}

	result := syncResult{WorkspaceCount: len(workspaces)}

	if cfg != nil && cfg.ConversationSync.IsEnabled() && collectSessions != nil {
		snapshots, extractErrCount := collectSessions(workspaces)
		result.SessionSnapshotCount = len(snapshots)
		result.SessionExtractErrorCount = extractErrCount
	}

	return result, nil
}

func runDaemon() error {
	// 先加载配置，获取端口号
	cfg := config.MustLoad()
	features := resolveRuntimeFeatures(cfg)
	log.Printf("[Role] %s: sync=%t realtime=%t notify=%t", features.role, features.enableSync, features.enableRealtime, features.enableNotify)

	// 单实例检查：使用端口号作为实例ID，支持多端口运行
	instanceID := fmt.Sprintf("%d", cfg.HTTPAPI.Port)
	lock, err := singleton.AcquireWithInstance("kanban-watcher", instanceID)
	if err != nil {
		return fmt.Errorf("错误: %v\n提示: 如果确定没有实例在运行，请手动删除 PID 文件", err)
	}
	defer lock.Release()
	persistedState := state.MustLoad()

	apiClient := api.NewClient(cfg.KanbanAPIURL)
	sessionExtractor := sessionlog.NewExtractor(
		cfg.ConversationSync.BaseDir,
		cfg.ConversationSync.RecentMessageLimit,
		cfg.ConversationSync.RecentToolCallLimit,
	)
	wechatNotifier := wechat.NewNotifier(cfg.WeChat)
	tracker := wechat.NewTracker(persistedState, cfg.Notify.ApprovalThreshold, cfg.Notify.MessageThreshold, cfg.Notify.RepeatInterval)
	trayApp := tray.New()
	dialogNotifier := notify.NewDialogNotifier()

	// 初始化数据库 Store（如果配置了）
	var dbStore *store.Store
	var realtimePublisher *api.RealtimePublisher
	if cfg.Database.IsEnabled() {
		var err error
		dbStore, err = store.NewStoreWithOptions(cfg.Database.DSN(), store.Options{
			MaxOpenConns:    4,
			MaxIdleConns:    4,
			ConnMaxLifetime: time.Duration(cfg.Database.ConnMaxLifetimeSecs) * time.Second,
			ConnMaxIdleTime: time.Duration(cfg.Database.ConnMaxIdleTimeSecs) * time.Second,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "数据库连接失败: %v\n", err)
		} else {
			// 初始化数据库表结构
			if err := dbStore.InitSchema(context.Background()); err != nil {
				fmt.Fprintf(os.Stderr, "数据库表初始化失败: %v\n", err)
				dbStore.Close()
				dbStore = nil
			} else {
				fmt.Fprintf(os.Stdout, "数据库连接成功\n")

				if features.enableSync {
					syncService := sync.NewSyncService(cfg, dbStore)
					if features.enableRealtime {
						realtimeHub := realtime.NewHub()
						realtimePublisher = api.NewRealtimePublisher(dbStore, realtimeHub)
						syncService.SetRealtimePublisher(realtimePublisher)
					}
					go syncService.Start(context.Background())
				}

				// 启动 token stats collector
				if cfg.TokenStats.IsEnabled() {
					tokenCollector := tokenstats.NewCollector(cfg.TokenStats, cfg.ConversationSync.BaseDir, dbStore)
					tokenCollector.Start()
					defer tokenCollector.Stop()
				}
			}
		}
	} else {
		fmt.Fprintf(os.Stdout, "数据库未配置或配置不完整\n")
	}

	proxyClient := api.NewProxyClient(cfg.KanbanAPIURL)

	// 初始化 JWT 服务
	jwtSecret := cfg.Auth.JWTSecret
	if jwtSecret == "" {
		// 自动生成密钥
		jwtSecret = generateRandomSecret()
		log.Printf("[Main] 自动生成 JWT 密钥")
	}
	jwtService := auth.NewJWTService(jwtSecret, cfg.Auth.TokenExpireDays)

	// 获取嵌入的静态文件系统
	staticFS, _ := fs.Sub(webFS, "web")

	httpServer := server.NewServer(proxyClient, cfg.HTTPAPI.Port, cfg.HTTPAPI.APIKey, cfg.Auth.IsEnabled(), jwtService, staticFS)
	httpServer.SetRuntimeInfo(server.RuntimeInfo{
		Role:            features.role,
		RealtimeEnabled: features.enableRealtime,
		RealtimeBaseURL: features.realtimeBaseURL,
	})

	// 设置关联的 vibe-kanban 项目 ID（用于 Issue API）
	if cfg.ProjectID != "" {
		httpServer.SetProjectID(cfg.ProjectID)
	}

	// 设置认证处理器
	authHandler := &server.AuthHandler{
		JWTService: jwtService,
		APIKey:     cfg.HTTPAPI.APIKey,
		Users:      convertUsers(cfg.Auth.Users),
	}
	httpServer.SetAuthHandler(authHandler)

	if dbStore != nil {
		httpServer.SetStore(dbStore)
		httpServer.SetAPIClient(apiClient)
		httpServer.SetWorkspaceMessageDispatcher(service.NewMessageDispatcher(dbStore, proxyClient, apiClient))
	}

	// 注册消息 API 路由（如果数据库已连接）
	if dbStore != nil {
		routes := api.GetMessageRoutes(dbStore, cfg.HTTPAPI.BrowserURLTemplate, realtimePublisher)
		for pattern, handler := range routes {
			httpServer.RegisterRoute(pattern, handler)
		}
		if realtimePublisher != nil {
			pattern, handler := realtimePublisher.Route()
			httpServer.RegisterRoute(pattern, handler)
		} else if !features.enableRealtime {
			httpServer.RegisterRoute("/api/realtime/ws", httpServer.HandleRealtimeUnavailable)
		}
	}

	if err := httpServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "HTTP 服务器启动失败: %v\n", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	if features.enableNotify {
		pollResults := make(chan poller.PollResult, 2)
		go poller.Run(ctx, cfg, apiClient, pollResults)
		go runEventLoop(ctx, pollResults, dbStore, sessionExtractor, cfg, wechatNotifier, tracker, trayApp, dialogNotifier)
	}

	systray.Run(trayApp.OnReady, trayApp.OnExit(cancel))

	if httpServer != nil {
		httpServer.Stop(context.Background())
	}
	if dbStore != nil {
		dbStore.Close()
	}
	if err := state.SaveState(tracker.GetState()); err != nil {
		fmt.Fprintf(os.Stderr, "警告: 退出时保存状态失败: %v\n", err)
	}
	return nil
}

func runHeadless() error {
	// 先加载配置，获取端口号
	cfg := config.MustLoad()
	features := resolveRuntimeFeatures(cfg)
	log.Printf("[Role] %s: sync=%t realtime=%t notify=%t", features.role, features.enableSync, features.enableRealtime, features.enableNotify)

	// 单实例检查：使用端口号作为实例ID，支持多端口运行
	instanceID := fmt.Sprintf("%d", cfg.HTTPAPI.Port)
	lock, err := singleton.AcquireWithInstance("kanban-watcher", instanceID)
	if err != nil {
		return fmt.Errorf("错误: %v\n提示: 如果确定没有实例在运行，请手动删除 PID 文件", err)
	}
	defer lock.Release()

	persistedState := state.MustLoad()

	apiClient := api.NewClient(cfg.KanbanAPIURL)
	sessionExtractor := sessionlog.NewExtractor(
		cfg.ConversationSync.BaseDir,
		cfg.ConversationSync.RecentMessageLimit,
		cfg.ConversationSync.RecentToolCallLimit,
	)
	wechatNotifier := wechat.NewNotifier(cfg.WeChat)
	tracker := wechat.NewTracker(persistedState, cfg.Notify.ApprovalThreshold, cfg.Notify.MessageThreshold, cfg.Notify.RepeatInterval)
	dialogNotifier := notify.NewDialogNotifier()

	var dbStore *store.Store
	var realtimePublisher *api.RealtimePublisher
	if cfg.Database.IsEnabled() {
		dbStore, err = store.NewStoreWithOptions(cfg.Database.DSN(), store.Options{
			MaxOpenConns:    4,
			MaxIdleConns:    4,
			ConnMaxLifetime: time.Duration(cfg.Database.ConnMaxLifetimeSecs) * time.Second,
			ConnMaxIdleTime: time.Duration(cfg.Database.ConnMaxIdleTimeSecs) * time.Second,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "数据库连接失败: %v\n", err)
		} else {
			if err := dbStore.InitSchema(context.Background()); err != nil {
				fmt.Fprintf(os.Stderr, "数据库表初始化失败: %v\n", err)
				dbStore.Close()
				dbStore = nil
			} else {
				fmt.Fprintf(os.Stdout, "数据库连接成功\n")
				if features.enableSync {
					syncService := sync.NewSyncService(cfg, dbStore)
					if features.enableRealtime {
						realtimeHub := realtime.NewHub()
						realtimePublisher = api.NewRealtimePublisher(dbStore, realtimeHub)
						syncService.SetRealtimePublisher(realtimePublisher)
					}
					go syncService.Start(context.Background())
				}

				// 启动 token stats collector
				if cfg.TokenStats.IsEnabled() {
					tokenCollector := tokenstats.NewCollector(cfg.TokenStats, cfg.ConversationSync.BaseDir, dbStore)
					tokenCollector.Start()
					defer tokenCollector.Stop()
				}
			}
		}
	} else {
		fmt.Fprintf(os.Stdout, "数据库未配置或配置不完整\n")
	}

	proxyClient := api.NewProxyClient(cfg.KanbanAPIURL)

	// 初始化 JWT 服务
	jwtSecret := cfg.Auth.JWTSecret
	if jwtSecret == "" {
		jwtSecret = generateRandomSecret()
		log.Printf("[Main] 自动生成 JWT 密钥 (headless)")
	}
	jwtService := auth.NewJWTService(jwtSecret, cfg.Auth.TokenExpireDays)

	// 获取嵌入的静态文件系统
	staticFS, _ := fs.Sub(webFS, "web")

	httpServer := server.NewServer(proxyClient, cfg.HTTPAPI.Port, cfg.HTTPAPI.APIKey, cfg.Auth.IsEnabled(), jwtService, staticFS)
	httpServer.SetRuntimeInfo(server.RuntimeInfo{
		Role:            features.role,
		RealtimeEnabled: features.enableRealtime,
		RealtimeBaseURL: features.realtimeBaseURL,
	})

	// 设置关联的 vibe-kanban 项目 ID（用于 Issue API）
	if cfg.ProjectID != "" {
		httpServer.SetProjectID(cfg.ProjectID)
	}

	// 设置认证处理器
	authHandler := &server.AuthHandler{
		JWTService: jwtService,
		APIKey:     cfg.HTTPAPI.APIKey,
		Users:      convertUsers(cfg.Auth.Users),
	}
	httpServer.SetAuthHandler(authHandler)

	if dbStore != nil {
		httpServer.SetStore(dbStore)
		httpServer.SetAPIClient(apiClient)
		routes := api.GetMessageRoutes(dbStore, cfg.HTTPAPI.BrowserURLTemplate, realtimePublisher)
		httpServer.SetWorkspaceMessageDispatcher(service.NewMessageDispatcher(dbStore, proxyClient, apiClient))
		for pattern, handler := range routes {
			httpServer.RegisterRoute(pattern, handler)
		}
		if realtimePublisher != nil {
			pattern, handler := realtimePublisher.Route()
			httpServer.RegisterRoute(pattern, handler)
		} else if !features.enableRealtime {
			httpServer.RegisterRoute("/api/realtime/ws", httpServer.HandleRealtimeUnavailable)
		}
	}
	if err := httpServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "HTTP 服务器启动失败: %v\n", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if features.enableNotify {
		pollResults := make(chan poller.PollResult, 2)
		go poller.Run(ctx, cfg, apiClient, pollResults)
		go runEventLoop(ctx, pollResults, dbStore, sessionExtractor, cfg, wechatNotifier, tracker, nil, dialogNotifier)
	}

	fmt.Fprintln(os.Stdout, "headless 模式已启动")
	<-ctx.Done()

	if httpServer != nil {
		httpServer.Stop(context.Background())
	}
	if dbStore != nil {
		dbStore.Close()
	}
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

func resolveRuntimeFeatures(cfg *config.Config) runtimeFeatures {
	role := cfg.Runtime.Role
	if role == "" {
		role = config.RuntimeRoleWorker
	}
	return runtimeFeatures{
		role:            role,
		enableSync:      cfg.Runtime.IsMain(),
		enableRealtime:  cfg.Runtime.IsMain(),
		enableNotify:    cfg.Runtime.IsMain(),
		realtimeBaseURL: cfg.Runtime.RealtimeBaseURL,
	}
}

// generateRandomSecret 生成随机密钥
func generateRandomSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("生成随机密钥失败: %v", err)
	}
	return base64.StdEncoding.EncodeToString(b)
}

// convertUsers 转换用户配置
func convertUsers(users []config.UserConfig) []server.UserCredentials {
	result := make([]server.UserCredentials, len(users))
	for i, u := range users {
		result[i] = server.UserCredentials{
			Username:     u.Username,
			PasswordHash: u.PasswordHash,
		}
	}
	return result
}
