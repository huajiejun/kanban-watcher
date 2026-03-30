package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/huajiejun/kanban-watcher/internal/realtime"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type RealtimePublisher struct {
	store *store.Store
	hub   *realtime.Hub
	rdb   *redis.Client

	mu                     sync.Mutex
	sessionMessageThrottle time.Duration
	throttledMessages      map[string]*throttledSessionMessage
}

type throttledSessionMessage struct {
	sessionID  string
	lastSentAt time.Time
	pending    *realtime.MessagePayload
	flushTimer *time.Timer
}

func NewRealtimePublisher(dbStore *store.Store, hub *realtime.Hub, rdb *redis.Client) *RealtimePublisher {
	return &RealtimePublisher{
		store:                  dbStore,
		hub:                    hub,
		rdb:                    rdb,
		sessionMessageThrottle: 500 * time.Millisecond,
		throttledMessages:      make(map[string]*throttledSessionMessage),
	}
}

func (p *RealtimePublisher) Route() (string, http.HandlerFunc) {
	return "/api/realtime/ws", func(w http.ResponseWriter, r *http.Request) {
		if p.hub == nil {
			http.Error(w, "实时推送未启用", http.StatusServiceUnavailable)
			return
		}
		p.hub.HandleWebSocket(w, r)
	}
}

func (p *RealtimePublisher) PublishWorkspaceSnapshot(ctx context.Context) error {
	if p == nil || p.store == nil || p.hub == nil {
		return nil
	}

	summaries, err := p.store.GetActiveWorkspaceSummaries(ctx)
	if err != nil {
		return err
	}

	workspaces := make([]realtime.WorkspacePayload, 0, len(summaries))
	for _, summary := range summaries {
		workspaces = append(workspaces, toRealtimeWorkspace(summary))
	}
	p.hub.BroadcastWorkspaceSnapshot(workspaces)
	return nil
}

func (p *RealtimePublisher) PublishSessionMessagesAppended(_ context.Context, sessionID string, entries []store.ProcessEntry) error {
	if p == nil || p.hub == nil || sessionID == "" || len(entries) == 0 {
		return nil
	}

	for _, entry := range entries {
		p.publishSessionMessage(sessionID, toRealtimeMessage(entry))
	}
	return nil
}

func (p *RealtimePublisher) PublishWorkspaceViewUpdated(view *store.WorkspaceView) error {
	if p == nil || p.hub == nil || view == nil {
		return nil
	}

	var openWorkspaceIDs []string
	if err := json.Unmarshal([]byte(view.OpenWorkspaceIDsJSON), &openWorkspaceIDs); err != nil {
		return err
	}

	var dismissedAttentionIDs []string
	if err := json.Unmarshal([]byte(view.DismissedAttentionIDsJSON), &dismissedAttentionIDs); err != nil {
		return err
	}

	payload := realtime.WorkspaceViewPayload{
		OpenWorkspaceIDs:      openWorkspaceIDs,
		DismissedAttentionIDs: dismissedAttentionIDs,
		Version:               view.Version,
		UpdatedAt:             view.UpdatedAt.Format(time.RFC3339Nano),
	}
	if view.ActiveWorkspaceID != nil {
		payload.ActiveWorkspaceID = *view.ActiveWorkspaceID
	}

	p.hub.BroadcastWorkspaceViewUpdated(payload)
	return nil
}

func (p *RealtimePublisher) publishSessionMessage(sessionID string, message realtime.MessagePayload) {
	if p.sessionMessageThrottle <= 0 {
		p.broadcastSessionMessage(sessionID, message)
		return
	}

	key := sessionMessageThrottleKey(sessionID, message)
	now := time.Now()

	p.mu.Lock()
	state := p.throttledMessages[key]
	if state == nil {
		state = &throttledSessionMessage{}
		p.throttledMessages[key] = state
	}

	if state.lastSentAt.IsZero() || now.Sub(state.lastSentAt) >= p.sessionMessageThrottle {
		if state.flushTimer != nil {
			state.flushTimer.Stop()
			state.flushTimer = nil
		}
		state.pending = nil
		state.sessionID = sessionID
		state.lastSentAt = now
		p.mu.Unlock()

		p.broadcastSessionMessage(sessionID, message)
		return
	}

	state.sessionID = sessionID
	state.pending = &message
	if state.flushTimer == nil {
		wait := p.sessionMessageThrottle - now.Sub(state.lastSentAt)
		if wait < 0 {
			wait = 0
		}
		state.flushTimer = time.AfterFunc(wait, func() {
			p.flushThrottledSessionMessage(key)
		})
	}
	p.mu.Unlock()
}

func (p *RealtimePublisher) flushThrottledSessionMessage(key string) {
	p.mu.Lock()
	state := p.throttledMessages[key]
	if state == nil {
		p.mu.Unlock()
		return
	}

	message := state.pending
	sessionID := state.sessionID
	state.pending = nil
	state.flushTimer = nil
	if message == nil {
		p.mu.Unlock()
		return
	}
	state.lastSentAt = time.Now()
	p.mu.Unlock()

	p.broadcastSessionMessage(sessionID, *message)
}

func (p *RealtimePublisher) broadcastSessionMessage(sessionID string, message realtime.MessagePayload) {
	if p.rdb != nil {
		payload, err := json.Marshal([]realtime.MessagePayload{message})
		if err != nil {
			log.Printf("[Pub/Sub] 序列化 session 消息失败: %v", err)
			p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
			return
		}
		channel := fmt.Sprintf("push:session:%s", sessionID)
		if err := p.rdb.Publish(context.Background(), channel, payload).Err(); err != nil {
			log.Printf("[Pub/Sub] 发布 session 消息失败 [%s]，降级到直推: %v", sessionID, err)
			p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
		}
		return
	}
	p.hub.BroadcastSessionMessagesAppended(sessionID, []realtime.MessagePayload{message})
}

func sessionMessageThrottleKey(sessionID string, message realtime.MessagePayload) string {
	return sessionID + "::" + message.ProcessID + "::" + strconv.Itoa(message.EntryIndex)
}

func toRealtimeWorkspace(summary store.ActiveWorkspaceSummary) realtime.WorkspacePayload {
	payload := realtime.WorkspacePayload{
		ID:                  summary.ID,
		Name:                summary.Name,
		Branch:              summary.Branch,
		Status:              summary.Status,
		HasPendingApproval:  summary.HasPendingApproval,
		HasUnseenTurns:      summary.HasUnseenTurns,
		HasRunningDevServer: summary.HasRunningDevServer,
		FilesChanged:        summary.FilesChanged,
		LinesAdded:          summary.LinesAdded,
		LinesRemoved:        summary.LinesRemoved,
		MessageCount:        summary.MessageCount,
	}
	if summary.PrURL != nil && *summary.PrURL != "" {
		payload.PrURL = *summary.PrURL
	}
	if summary.LatestSessionID != nil {
		payload.LatestSessionID = *summary.LatestSessionID
	}
	if summary.UpdatedAt != nil {
		payload.UpdatedAt = summary.UpdatedAt.Format(time.RFC3339)
	}
	if summary.RunningDevServerProcessID != nil {
		payload.RunningDevServerProcessID = *summary.RunningDevServerProcessID
	}
	if summary.LastMessageAt != nil {
		payload.LastMessageAt = summary.LastMessageAt.Format(time.RFC3339)
	}
	if summary.LatestProcessCompletedAt != nil {
		payload.LatestProcessCompletedAt = summary.LatestProcessCompletedAt.Format(time.RFC3339)
	}
	return payload
}

func toRealtimeMessage(entry store.ProcessEntry) realtime.MessagePayload {
	payload := realtime.MessagePayload{
		ID:         entry.ID,
		SessionID:  entry.SessionID,
		ProcessID:  entry.ProcessID,
		EntryIndex: entry.EntryIndex,
		EntryType:  entry.EntryType,
		Role:       entry.Role,
		Content:    entry.Content,
		Timestamp:  entry.EntryTimestamp.Format(time.RFC3339Nano),
	}
	if info := buildToolInfo(entry); len(info) > 0 {
		payload.ToolInfo = info
	}
	return payload
}
