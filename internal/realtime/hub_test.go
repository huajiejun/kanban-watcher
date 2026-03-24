package realtime

import "testing"

func TestBroadcastWorkspaceSnapshotSkipsDuplicatePayload(t *testing.T) {
	hub := NewHub()
	listener := &client{send: make(chan Event, 2)}
	hub.clients[listener] = struct{}{}

	snapshot := []WorkspacePayload{
		{
			ID:          "ws-1",
			Name:        "workspace-1",
			Status:      "running",
			MessageCount: 3,
			UpdatedAt:   "2026-03-23T10:00:00Z",
		},
	}

	hub.BroadcastWorkspaceSnapshot(snapshot)

	select {
	case event := <-listener.send:
		if event.Type != EventTypeWorkspaceSnapshot {
			t.Fatalf("首次广播事件类型错误: %s", event.Type)
		}
	default:
		t.Fatal("首次广播未送达")
	}

	hub.BroadcastWorkspaceSnapshot(snapshot)

	select {
	case event := <-listener.send:
		t.Fatalf("重复快照不应再次广播: %#v", event)
	default:
	}

	updatedSnapshot := []WorkspacePayload{
		{
			ID:          "ws-1",
			Name:        "workspace-1",
			Status:      "running",
			MessageCount: 4,
			UpdatedAt:   "2026-03-23T10:01:00Z",
		},
	}
	hub.BroadcastWorkspaceSnapshot(updatedSnapshot)

	select {
	case event := <-listener.send:
		if len(event.Workspaces) != 1 || event.Workspaces[0].MessageCount != 4 {
			t.Fatalf("变更后的快照广播内容错误: %#v", event.Workspaces)
		}
	default:
		t.Fatal("变更后的快照应再次广播")
	}
}

func TestBroadcastSessionMessagesAppendedFiltersBySessionID(t *testing.T) {
	hub := NewHub()
	sessionA := &client{sessionID: "session-a", send: make(chan Event, 1)}
	sessionB := &client{sessionID: "session-b", send: make(chan Event, 1)}
	allSessions := &client{sessionID: "", send: make(chan Event, 1)}

	hub.clients[sessionA] = struct{}{}
	hub.clients[sessionB] = struct{}{}
	hub.clients[allSessions] = struct{}{}

	hub.BroadcastSessionMessagesAppended("session-a", []MessagePayload{
		{SessionID: "session-a", EntryIndex: 1, Content: "hello"},
	})

	select {
	case event := <-sessionA.send:
		if event.SessionID != "session-a" {
			t.Fatalf("sessionA 收到错误 session: %s", event.SessionID)
		}
	default:
		t.Fatal("sessionA 未收到事件")
	}

	select {
	case event := <-allSessions.send:
		t.Fatalf("未指定 session 的客户端不应收到事件: %#v", event)
	default:
	}

	select {
	case event := <-sessionB.send:
		t.Fatalf("sessionB 不应收到事件: %#v", event)
	default:
	}
}
