package realtime

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type EventType string

const (
	EventTypeWorkspaceSnapshot       EventType = "workspace_snapshot"
	EventTypeSessionMessagesAppended EventType = "session_messages_appended"
	EventTypeWorkspaceViewUpdated    EventType = "workspace_view_updated"
)

type WorkspacePayload struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Branch              string `json:"branch,omitempty"`
	LatestSessionID     string `json:"latest_session_id,omitempty"`
	Status              string `json:"status"`
	HasPendingApproval  bool   `json:"has_pending_approval"`
	HasUnseenTurns      bool   `json:"has_unseen_turns"`
	HasRunningDevServer bool   `json:"has_running_dev_server"`
	RunningDevServerProcessID string `json:"running_dev_server_process_id,omitempty"`
	FilesChanged        int    `json:"files_changed"`
	LinesAdded          int    `json:"lines_added"`
	LinesRemoved        int    `json:"lines_removed"`
	UpdatedAt           string `json:"updated_at,omitempty"`
	MessageCount        int    `json:"message_count"`
	LastMessageAt       string `json:"last_message_at,omitempty"`
}

type MessagePayload struct {
	ID         int64                  `json:"id"`
	SessionID  string                 `json:"session_id"`
	ProcessID  string                 `json:"process_id,omitempty"`
	EntryIndex int                    `json:"entry_index"`
	EntryType  string                 `json:"entry_type"`
	Role       string                 `json:"role"`
	Content    string                 `json:"content"`
	ToolInfo   map[string]interface{} `json:"tool_info,omitempty"`
	Timestamp  string                 `json:"timestamp"`
}

type WorkspaceViewPayload struct {
	OpenWorkspaceIDs      []string `json:"open_workspace_ids,omitempty"`
	ActiveWorkspaceID     string   `json:"active_workspace_id,omitempty"`
	DismissedAttentionIDs []string `json:"dismissed_attention_ids,omitempty"`
	Version               int64    `json:"version,omitempty"`
	UpdatedAt             string   `json:"updated_at,omitempty"`
}

type Event struct {
	Type          EventType             `json:"type"`
	Workspaces    []WorkspacePayload    `json:"workspaces,omitempty"`
	SessionID     string                `json:"session_id,omitempty"`
	Messages      []MessagePayload      `json:"messages,omitempty"`
	WorkspaceView *WorkspaceViewPayload `json:"workspace_view,omitempty"`
}

type client struct {
	conn      *websocket.Conn
	send      chan Event
	sessionID string
}

type Hub struct {
	upgrader websocket.Upgrader

	mu                          sync.RWMutex
	clients                     map[*client]struct{}
	lastWorkspaceSnapshotDigest string
}

func NewHub() *Hub {
	return &Hub{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients: make(map[*client]struct{}),
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Realtime] websocket upgrade 失败: %v", err)
		return
	}

	c := &client{
		conn:      conn,
		send:      make(chan Event, 16),
		sessionID: r.URL.Query().Get("session_id"),
	}

	h.mu.Lock()
	h.clients[c] = struct{}{}
	clientCount := len(h.clients)
	h.mu.Unlock()
	log.Printf("[Realtime] 客户端已连接 session_id=%q clients=%d", c.sessionID, clientCount)

	go h.writeLoop(c)
	h.readLoop(c)
}

func (h *Hub) SendWorkspaceSnapshot(c *websocket.Conn, event Event) error {
	_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return c.WriteJSON(event)
}

func (h *Hub) BroadcastWorkspaceSnapshot(workspaces []WorkspacePayload) {
	digest, err := workspaceSnapshotDigest(workspaces)
	if err != nil {
		log.Printf("[Realtime] 计算 workspace_snapshot 摘要失败: %v", err)
		return
	}

	h.mu.Lock()
	if digest == h.lastWorkspaceSnapshotDigest {
		h.mu.Unlock()
		return
	}
	h.lastWorkspaceSnapshotDigest = digest
	h.mu.Unlock()

	h.broadcast(Event{
		Type:       EventTypeWorkspaceSnapshot,
		Workspaces: workspaces,
	})
}

func (h *Hub) BroadcastSessionMessagesAppended(sessionID string, messages []MessagePayload) {
	//log.Printf("[Realtime] 广播 session_messages_appended session_id=%s count=%d", sessionID, len(messages))
	h.broadcast(Event{
		Type:      EventTypeSessionMessagesAppended,
		SessionID: sessionID,
		Messages:  messages,
	})
}

func (h *Hub) BroadcastWorkspaceViewUpdated(view WorkspaceViewPayload) {
	h.broadcast(Event{
		Type:          EventTypeWorkspaceViewUpdated,
		WorkspaceView: &view,
	})
}

func (h *Hub) broadcast(event Event) {
	h.mu.RLock()
	clients := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		if event.Type == EventTypeSessionMessagesAppended {
			if c.sessionID == "" || c.sessionID != event.SessionID {
				continue
			}
		}
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- event:
		default:
			h.unregister(c)
		}
	}
}

func (h *Hub) writeLoop(c *client) {
	defer h.unregister(c)

	for event := range c.send {
		if err := h.SendWorkspaceSnapshot(c.conn, event); err != nil {
			return
		}
	}
}

func (h *Hub) readLoop(c *client) {
	defer h.unregister(c)

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	if _, exists := h.clients[c]; !exists {
		h.mu.Unlock()
		return
	}
	delete(h.clients, c)
	close(c.send)
	clientCount := len(h.clients)
	h.mu.Unlock()
	log.Printf("[Realtime] 客户端已断开 session_id=%q clients=%d", c.sessionID, clientCount)
	_ = c.conn.Close()
}

func workspaceSnapshotDigest(workspaces []WorkspacePayload) (string, error) {
	payload, err := json.Marshal(workspaces)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}
