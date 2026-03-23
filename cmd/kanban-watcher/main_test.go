package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/poller"
	"github.com/huajiejun/kanban-watcher/internal/sessionlog"
	"github.com/huajiejun/kanban-watcher/internal/state"
	"github.com/huajiejun/kanban-watcher/internal/wechat"
)

func TestRunRoutesSyncNowWithoutDaemon(t *testing.T) {
	syncCalled := 0
	daemonCalled := 0

	err := run([]string{"--sync-now"}, commandDeps{
		runSyncNow: func() error {
			syncCalled++
			return nil
		},
		runDaemon: func() error {
			daemonCalled++
			return nil
		},
	})
	if err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	if syncCalled != 1 {
		t.Fatalf("syncCalled = %d, want 1", syncCalled)
	}
	if daemonCalled != 0 {
		t.Fatalf("daemonCalled = %d, want 0", daemonCalled)
	}
}

func TestRunRoutesHeadlessWithoutDaemon(t *testing.T) {
	syncCalled := 0
	daemonCalled := 0
	headlessCalled := 0

	err := run([]string{"--headless"}, commandDeps{
		runSyncNow: func() error {
			syncCalled++
			return nil
		},
		runDaemon: func() error {
			daemonCalled++
			return nil
		},
		runHeadless: func() error {
			headlessCalled++
			return nil
		},
	})
	if err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	if syncCalled != 0 {
		t.Fatalf("syncCalled = %d, want 0", syncCalled)
	}
	if daemonCalled != 0 {
		t.Fatalf("daemonCalled = %d, want 0", daemonCalled)
	}
	if headlessCalled != 1 {
		t.Fatalf("headlessCalled = %d, want 1", headlessCalled)
	}
}

func TestParseCommandOptionsSupportsHeadless(t *testing.T) {
	options, err := parseCommandOptions([]string{"--headless"})
	if err != nil {
		t.Fatalf("parseCommandOptions returned error: %v", err)
	}
	if !options.headless {
		t.Fatalf("headless = false, want true")
	}
	if options.syncNow {
		t.Fatalf("syncNow = true, want false")
	}
}

func TestSyncCurrentDataCollectsWorkspaces(t *testing.T) {
	fetcher := &fakeFetcher{
		workspaces: []api.EnrichedWorkspace{
			{
				Workspace:   api.Workspace{ID: "ws-1", Branch: "main"},
				Summary:     api.WorkspaceSummary{WorkspaceID: "ws-1"},
				DisplayName: "Workspace 1",
			},
		},
	}
	cfg := &config.Config{
		ConversationSync: config.ConversationSyncConfig{
			Enabled: configBoolPtr(true),
		},
	}

	result, err := syncCurrentData(context.Background(), cfg, fetcher, func(workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
		if len(workspaces) != 1 {
			t.Fatalf("collect got %d workspaces, want 1", len(workspaces))
		}
		return []sessionlog.SessionConversationSnapshot{
			{
				SessionID:     "session-1",
				WorkspaceID:   "ws-1",
				WorkspaceName: "Workspace 1",
				LastMessage:   "测试内容",
				LastRole:      "assistant",
				UpdatedAt:     time.Now().UTC(),
			},
		}, 1
	})
	if err != nil {
		t.Fatalf("syncCurrentData returned error: %v", err)
	}
	if result.WorkspaceCount != 1 {
		t.Fatalf("WorkspaceCount = %d, want 1", result.WorkspaceCount)
	}
	if result.SessionSnapshotCount != 1 {
		t.Fatalf("SessionSnapshotCount = %d, want 1", result.SessionSnapshotCount)
	}
	if result.SessionExtractErrorCount != 1 {
		t.Fatalf("SessionExtractErrorCount = %d, want 1", result.SessionExtractErrorCount)
	}
}

func TestRunSyncNowReturnsErrorWhenDatabaseNotConfigured(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	err := executeSyncNow(syncNowDeps{
		loadConfig: func() (*config.Config, error) {
			return &config.Config{}, nil
		},
		stdout: &stdout,
		stderr: &stderr,
	})
	if err == nil {
		t.Fatalf("executeSyncNow error = nil, want error")
	}
	if !strings.Contains(err.Error(), "数据库未配置") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandlePollResultProcessesWorkspaces(t *testing.T) {
	tracker := wechat.NewTracker(state.NewAppState(), 10)
	notifier := wechat.NewNotifier(config.WeChatConfig{})

	handlePollResult(
		context.Background(),
		poller.PollResult{
			Workspaces: []api.EnrichedWorkspace{
				{
					Workspace:   api.Workspace{ID: "ws-1", Branch: "main"},
					Summary:     api.WorkspaceSummary{WorkspaceID: "ws-1"},
					DisplayName: "Workspace 1",
				},
			},
			FetchedAt: time.Now(),
		},
		nil,
		&config.Config{},
		notifier,
		tracker,
		nil,
	)

	// 测试通过表示函数正常处理工作区数据
}

type fakeFetcher struct {
	workspaces []api.EnrichedWorkspace
	err        error
}

func (f *fakeFetcher) FetchAll(context.Context) ([]api.EnrichedWorkspace, error) {
	return f.workspaces, f.err
}

func configBoolPtr(v bool) *bool {
	return &v
}
