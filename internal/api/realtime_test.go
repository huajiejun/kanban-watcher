package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/huajiejun/kanban-watcher/internal/realtime"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

func TestPublishSessionMessagesAppendedThrottlesSameEntryUpdates(t *testing.T) {
	hub := realtime.NewHub()
	server := httptest.NewServer(hubRouteHandler(hub))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?session_id=session-a"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("连接测试 websocket 失败: %v", err)
	}
	defer conn.Close()

	events := make(chan realtime.Event, 8)
	readErrs := make(chan error, 1)
	go func() {
		for {
			var event realtime.Event
			if err := conn.ReadJSON(&event); err != nil {
				readErrs <- err
				return
			}
			events <- event
		}
	}()

	publisher := NewRealtimePublisher(nil, hub)
	publisher.sessionMessageThrottle = 30 * time.Millisecond

	ctx := context.Background()
	first := store.ProcessEntry{
		ProcessID:      "proc-1",
		SessionID:      "session-a",
		EntryIndex:     7,
		EntryType:      "assistant_message",
		Role:           "assistant",
		Content:        "a",
		EntryTimestamp: time.Now(),
	}
	second := first
	second.Content = "ab"
	second.EntryTimestamp = second.EntryTimestamp.Add(10 * time.Millisecond)
	third := second
	third.Content = "abc"
	third.EntryTimestamp = third.EntryTimestamp.Add(10 * time.Millisecond)

	if err := publisher.PublishSessionMessagesAppended(ctx, "session-a", []store.ProcessEntry{first}); err != nil {
		t.Fatalf("首次广播返回错误: %v", err)
	}

	firstEvent := waitRealtimeEvent(t, events, readErrs, 20*time.Millisecond)
	if got := firstEvent.Messages[0].Content; got != "a" {
		t.Fatalf("首次广播内容 = %q, want a", got)
	}

	if err := publisher.PublishSessionMessagesAppended(ctx, "session-a", []store.ProcessEntry{second}); err != nil {
		t.Fatalf("第二次广播返回错误: %v", err)
	}
	if err := publisher.PublishSessionMessagesAppended(ctx, "session-a", []store.ProcessEntry{third}); err != nil {
		t.Fatalf("第三次广播返回错误: %v", err)
	}

	select {
	case event := <-events:
		t.Fatalf("节流窗口内不应立即再次广播: %#v", event)
	case err := <-readErrs:
		t.Fatalf("读取实时事件失败: %v", err)
	case <-time.After(10 * time.Millisecond):
	}

	flushedEvent := waitRealtimeEvent(t, events, readErrs, 80*time.Millisecond)
	if got := flushedEvent.Messages[0].Content; got != "abc" {
		t.Fatalf("节流后应只发送最后一帧，got = %q, want abc", got)
	}
}

func hubRouteHandler(hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hub.HandleWebSocket(w, r)
	}
}

func waitRealtimeEvent(t *testing.T, events <-chan realtime.Event, readErrs <-chan error, timeout time.Duration) realtime.Event {
	t.Helper()
	select {
	case event := <-events:
		return event
	case err := <-readErrs:
		t.Fatalf("等待实时事件失败: %v", err)
		return realtime.Event{}
	case <-time.After(timeout):
		t.Fatalf("等待实时事件超时: %s", timeout)
		return realtime.Event{}
	}
}
