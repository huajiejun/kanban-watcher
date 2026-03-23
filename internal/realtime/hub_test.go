package realtime

import "testing"

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
	case <-allSessions.send:
	default:
		t.Fatal("未指定 session 的客户端也应该收到事件")
	}

	select {
	case event := <-sessionB.send:
		t.Fatalf("sessionB 不应收到事件: %#v", event)
	default:
	}
}
