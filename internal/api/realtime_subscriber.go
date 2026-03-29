package api

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/realtime"
)

// Channel name constants (shared with publisher)
const (
	pubsubPattern           = "push:*"
	pubsubSessionPrefix     = "push:session:"
	pubsubWorkspaceSnapshot = "push:workspace_snapshot"
	pubsubWorkspaceView     = "push:workspace_view"
)

// RealtimeSubscriber subscribes to Redis Pub/Sub and forwards to Hub
type RealtimeSubscriber struct {
	rdb    *redis.Client
	hub    *realtime.Hub
	stopCh chan struct{}
	wg     sync.WaitGroup
}

func NewRealtimeSubscriber(rdb *redis.Client, hub *realtime.Hub) *RealtimeSubscriber {
	return &RealtimeSubscriber{
		rdb:    rdb,
		hub:    hub,
		stopCh: make(chan struct{}),
	}
}

// Start begins subscribing to Redis Pub/Sub channels in a goroutine.
// Uses PSubscribe with "push:*" pattern to catch all push channels.
// On context cancellation or Stop(), the goroutine exits cleanly.
func (s *RealtimeSubscriber) Start(ctx context.Context) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		log.Printf("[Pub/Sub] 订阅器已启动")
		defer log.Printf("[Pub/Sub] 订阅器已停止")

		pubsub := s.rdb.PSubscribe(ctx, pubsubPattern)
		defer pubsub.Close()

		ch := pubsub.Channel()

		for {
			select {
			case <-s.stopCh:
				return
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				s.dispatchMessage(msg)
			}
		}
	}()
}

// Stop signals the subscriber goroutine to stop and waits for it to finish.
func (s *RealtimeSubscriber) Stop() {
	close(s.stopCh)
	s.wg.Wait()
}

// dispatchMessage routes messages to the correct handler based on channel name.
func (s *RealtimeSubscriber) dispatchMessage(msg *redis.Message) {
	switch {
	case strings.HasPrefix(msg.Channel, pubsubSessionPrefix):
		s.handleSessionMessage(msg)
	case msg.Channel == pubsubWorkspaceSnapshot:
		s.handleWorkspaceSnapshotMessage(msg)
	case msg.Channel == pubsubWorkspaceView:
		s.handleWorkspaceViewMessage(msg)
	}
}

func (s *RealtimeSubscriber) handleSessionMessage(msg *redis.Message) {
	sessionID := strings.TrimPrefix(msg.Channel, pubsubSessionPrefix)

	var messages []realtime.MessagePayload
	if err := json.Unmarshal([]byte(msg.Payload), &messages); err != nil {
		log.Printf("[Pub/Sub] 反序列化 session 消息失败 [%s]: %v", sessionID, err)
		return
	}
	if len(messages) == 0 {
		return
	}
	s.hub.BroadcastSessionMessagesAppended(sessionID, messages)
}

func (s *RealtimeSubscriber) handleWorkspaceSnapshotMessage(msg *redis.Message) {
	var workspaces []realtime.WorkspacePayload
	if err := json.Unmarshal([]byte(msg.Payload), &workspaces); err != nil {
		log.Printf("[Pub/Sub] 反序列化 workspace_snapshot 失败: %v", err)
		return
	}
	s.hub.BroadcastWorkspaceSnapshot(workspaces)
}

func (s *RealtimeSubscriber) handleWorkspaceViewMessage(msg *redis.Message) {
	var view realtime.WorkspaceViewPayload
	if err := json.Unmarshal([]byte(msg.Payload), &view); err != nil {
		log.Printf("[Pub/Sub] 反序列化 workspace_view 失败: %v", err)
		return
	}
	s.hub.BroadcastWorkspaceViewUpdated(view)
}
