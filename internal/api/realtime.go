package api

import (
	"context"
	"net/http"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/realtime"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type RealtimePublisher struct {
	store *store.Store
	hub   *realtime.Hub
}

func NewRealtimePublisher(dbStore *store.Store, hub *realtime.Hub) *RealtimePublisher {
	return &RealtimePublisher{
		store: dbStore,
		hub:   hub,
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

	messages := make([]realtime.MessagePayload, 0, len(entries))
	for _, entry := range entries {
		messages = append(messages, toRealtimeMessage(entry))
	}
	p.hub.BroadcastSessionMessagesAppended(sessionID, messages)
	return nil
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
	if summary.LatestSessionID != nil {
		payload.LatestSessionID = *summary.LatestSessionID
	}
	if summary.UpdatedAt != nil {
		payload.UpdatedAt = summary.UpdatedAt.Format(time.RFC3339)
	}
	if summary.LastMessageAt != nil {
		payload.LastMessageAt = summary.LastMessageAt.Format(time.RFC3339)
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
