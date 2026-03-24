package service

import (
	"context"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type fakeMessageContextStore struct {
	ctx           *store.MessageContext
	latestProcess *store.ExecutionProcess
	upsertedCtx   *store.MessageContext
}

func (f *fakeMessageContextStore) GetMessageContextByWorkspaceID(_ context.Context, workspaceID string) (*store.MessageContext, error) {
	if f.ctx == nil || f.ctx.WorkspaceID != workspaceID {
		return nil, nil
	}
	return f.ctx, nil
}

func (f *fakeMessageContextStore) GetLatestCodingAgentProcessByWorkspaceID(_ context.Context, workspaceID string) (*store.ExecutionProcess, error) {
	if f.latestProcess == nil || f.latestProcess.WorkspaceID != workspaceID {
		return nil, nil
	}
	return f.latestProcess, nil
}

func (f *fakeMessageContextStore) UpsertMessageContext(_ context.Context, msgCtx *store.MessageContext) error {
	f.upsertedCtx = msgCtx
	f.ctx = msgCtx
	return nil
}

type dispatchedCall struct {
	sessionID          string
	message            string
	executorConfigJSON string
}

type fakeMessageSender struct {
	sendCall  *dispatchedCall
	queueCall *dispatchedCall
}

func (f *fakeMessageSender) SendFollowUpWithContext(_ context.Context, sessionID, message string, ctx *store.MessageContext) error {
	f.sendCall = &dispatchedCall{
		sessionID:          sessionID,
		message:            message,
		executorConfigJSON: ctx.ExecutorConfigJSON,
	}
	return nil
}

type fakeExecutionProcessFetcher struct {
	process *api.ExecutionProcessDetail
}

func (f *fakeExecutionProcessFetcher) FetchExecutionProcess(_ context.Context, processID string) (*api.ExecutionProcessDetail, error) {
	if f.process == nil || f.process.ID != processID {
		return nil, nil
	}
	return f.process, nil
}

func (f *fakeMessageSender) QueueMessageWithContext(_ context.Context, sessionID, message string, ctx *store.MessageContext) error {
	f.queueCall = &dispatchedCall{
		sessionID:          sessionID,
		message:            message,
		executorConfigJSON: ctx.ExecutorConfigJSON,
	}
	return nil
}

func TestDispatchWorkspaceMessageUsesStoredContextForSend(t *testing.T) {
	dispatcher := NewMessageDispatcher(
		&fakeMessageContextStore{
			ctx: &store.MessageContext{
				WorkspaceID:        "ws-1",
				SessionID:          "session-1",
				ExecutorConfigJSON: `{"executor":"CLAUDE_CODE","variant":"ZHIPU"}`,
				DefaultSendMode:    "send",
				Source:             "sync",
				UpdatedAt:          time.Now(),
			},
		},
		&fakeMessageSender{},
		nil,
	)

	sender := dispatcher.sender.(*fakeMessageSender)

	result, err := dispatcher.DispatchWorkspaceMessage(context.Background(), "ws-1", "继续处理", "send")
	if err != nil {
		t.Fatalf("DispatchWorkspaceMessage 返回错误: %v", err)
	}
	if result.Action != "send" {
		t.Fatalf("action = %q, want send", result.Action)
	}
	if sender.sendCall == nil {
		t.Fatal("sendCall = nil, want called")
	}
	if sender.sendCall.sessionID != "session-1" {
		t.Fatalf("sessionID = %q, want session-1", sender.sendCall.sessionID)
	}
	if sender.sendCall.message != "继续处理" {
		t.Fatalf("message = %q, want 继续处理", sender.sendCall.message)
	}
}

func TestDispatchWorkspaceMessageUsesStoredContextForQueue(t *testing.T) {
	dispatcher := NewMessageDispatcher(
		&fakeMessageContextStore{
			ctx: &store.MessageContext{
				WorkspaceID:        "ws-1",
				SessionID:          "session-1",
				ExecutorConfigJSON: `{"executor":"CLAUDE_CODE","variant":"ZHIPU"}`,
				DefaultSendMode:    "send",
				Source:             "sync",
				UpdatedAt:          time.Now(),
			},
		},
		&fakeMessageSender{},
		nil,
	)

	sender := dispatcher.sender.(*fakeMessageSender)

	result, err := dispatcher.DispatchWorkspaceMessage(context.Background(), "ws-1", "当前任务完成后补测试", "queue")
	if err != nil {
		t.Fatalf("DispatchWorkspaceMessage 返回错误: %v", err)
	}
	if result.Action != "queue" {
		t.Fatalf("action = %q, want queue", result.Action)
	}
	if sender.queueCall == nil {
		t.Fatal("queueCall = nil, want called")
	}
	if sender.queueCall.message != "当前任务完成后补测试" {
		t.Fatalf("message = %q, want 当前任务完成后补测试", sender.queueCall.message)
	}
}

func TestDispatchWorkspaceMessageFallsBackToRemoteProcessWhenContextMissing(t *testing.T) {
	storeStub := &fakeMessageContextStore{
		latestProcess: &store.ExecutionProcess{
			ID:          "proc-1",
			SessionID:   "session-1",
			WorkspaceID: "ws-1",
			RunReason:   "codingagent",
			Status:      "running",
		},
	}
	dispatcher := NewMessageDispatcher(
		storeStub,
		&fakeMessageSender{},
		&fakeExecutionProcessFetcher{
			process: &api.ExecutionProcessDetail{
				ID:        "proc-1",
				SessionID: "session-1",
				ExecutorAction: struct {
					Typ struct {
						Type           string                 `json:"type"`
						ExecutorConfig map[string]interface{} `json:"executor_config"`
					} `json:"typ"`
				}{
					Typ: struct {
						Type           string                 `json:"type"`
						ExecutorConfig map[string]interface{} `json:"executor_config"`
					}{
						Type: "CodingAgentInitialRequest",
						ExecutorConfig: map[string]interface{}{
							"executor": "CLAUDE_CODE",
							"variant":  "ZHIPU",
						},
					},
				},
			},
		},
	)

	sender := dispatcher.sender.(*fakeMessageSender)

	result, err := dispatcher.DispatchWorkspaceMessage(context.Background(), "ws-1", "继续处理", "send")
	if err != nil {
		t.Fatalf("DispatchWorkspaceMessage 返回错误: %v", err)
	}
	if result.Action != "send" {
		t.Fatalf("action = %q, want send", result.Action)
	}
	if storeStub.upsertedCtx == nil {
		t.Fatal("upsertedCtx = nil, want cached context")
	}
	if sender.sendCall == nil {
		t.Fatal("sendCall = nil, want called")
	}
	if sender.sendCall.executorConfigJSON == "" {
		t.Fatal("executorConfigJSON 为空，want persisted config")
	}
}
