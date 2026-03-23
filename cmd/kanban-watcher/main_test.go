package main

import (
	"bytes"
	"context"
	"errors"
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

func TestSyncCurrentDataPublishesSummaryAndSessions(t *testing.T) {
	fetcher := &fakeFetcher{
		workspaces: []api.EnrichedWorkspace{
			{
				Workspace:   api.Workspace{ID: "ws-1", Branch: "main"},
				Summary:     api.WorkspaceSummary{WorkspaceID: "ws-1"},
				DisplayName: "Workspace 1",
			},
		},
	}
	publisher := &fakeSyncPublisher{}
	cfg := &config.Config{
		ConversationSync: config.ConversationSyncConfig{
			Enabled: configBoolPtr(true),
		},
	}

	result, err := syncCurrentData(context.Background(), cfg, fetcher, publisher, func(workspaces []api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
		if len(workspaces) != 1 {
			t.Fatalf("collect got %d workspaces, want 1", len(workspaces))
		}
		return []sessionlog.SessionConversationSnapshot{
			{
				SessionID:     "session-1",
				WorkspaceID:   "ws-1",
				WorkspaceName: "Workspace 1",
				LastMessage:   "真实内容",
				LastRole:      "assistant",
				UpdatedAt:     time.Now().UTC(),
			},
		}, 1
	})
	if err != nil {
		t.Fatalf("syncCurrentData returned error: %v", err)
	}
	if !publisher.summaryCalled {
		t.Fatalf("summary publish was not called")
	}
	if !publisher.sessionsCalled {
		t.Fatalf("session publish was not called")
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

func TestRunSyncNowReturnsErrorWhenBrokerMissing(t *testing.T) {
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
	if !strings.Contains(err.Error(), "mqtt broker") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunSyncNowReturnsErrorWhenSessionPublishFails(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	publisher := &fakeConnectablePublisher{
		fakeSyncPublisher: fakeSyncPublisher{
			publishSessionErr: errors.New("boom"),
		},
	}

	err := executeSyncNow(syncNowDeps{
		loadConfig: func() (*config.Config, error) {
			return &config.Config{
				MQTT: config.MQTTConfig{Broker: "tcp://broker:1883"},
				ConversationSync: config.ConversationSyncConfig{
					Enabled: configBoolPtr(true),
				},
			}, nil
		},
		newFetcher: func(string) workspaceFetcher {
			return &fakeFetcher{
				workspaces: []api.EnrichedWorkspace{
					{
						Workspace:   api.Workspace{ID: "ws-1", Branch: "main"},
						Summary:     api.WorkspaceSummary{WorkspaceID: "ws-1"},
						DisplayName: "Workspace 1",
					},
				},
			}
		},
		newPublisher: func(config.MQTTConfig) syncNowPublisher {
			return publisher
		},
		collectSessions: func([]api.EnrichedWorkspace) ([]sessionlog.SessionConversationSnapshot, int) {
			return []sessionlog.SessionConversationSnapshot{{SessionID: "session-1"}}, 0
		},
		stdout: &stdout,
		stderr: &stderr,
	})
	if err == nil {
		t.Fatalf("executeSyncNow error = nil, want error")
	}
	if !publisher.connectCalled {
		t.Fatalf("publisher.Connect was not called")
	}
	if !publisher.disconnectCalled {
		t.Fatalf("publisher.Disconnect was not called")
	}
}

func TestHandlePollResultSkipsMQTTTimerPublish(t *testing.T) {
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

	// 编译通过且函数不再接收 publisher，意味着后台轮询路径不会再触发 MQTT 推送。
}

type fakeFetcher struct {
	workspaces []api.EnrichedWorkspace
	err        error
}

func (f *fakeFetcher) FetchAll(context.Context) ([]api.EnrichedWorkspace, error) {
	return f.workspaces, f.err
}

type fakeSyncPublisher struct {
	summaryCalled     bool
	sessionsCalled    bool
	publishSummaryErr error
	publishSessionErr error
}

func (f *fakeSyncPublisher) PublishIfChanged(context.Context, []api.EnrichedWorkspace) (bool, error) {
	f.summaryCalled = true
	return true, f.publishSummaryErr
}

func (f *fakeSyncPublisher) PublishSessionSnapshots(context.Context, []sessionlog.SessionConversationSnapshot) (int, int, error) {
	f.sessionsCalled = true
	return 1, 0, f.publishSessionErr
}

type fakeConnectablePublisher struct {
	fakeSyncPublisher
	connectCalled    bool
	disconnectCalled bool
	connectErr       error
}

func (f *fakeConnectablePublisher) Connect(context.Context) error {
	f.connectCalled = true
	return f.connectErr
}

func (f *fakeConnectablePublisher) Disconnect() {
	f.disconnectCalled = true
}

func configBoolPtr(v bool) *bool {
	return &v
}
