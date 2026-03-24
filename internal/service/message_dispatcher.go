package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type messageContextStore interface {
	GetMessageContextByWorkspaceID(context.Context, string) (*store.MessageContext, error)
	GetLatestCodingAgentProcessByWorkspaceID(context.Context, string) (*store.ExecutionProcess, error)
	UpsertMessageContext(context.Context, *store.MessageContext) error
}

type messageSender interface {
	SendFollowUpWithContext(context.Context, string, string, *store.MessageContext) error
	QueueMessageWithContext(context.Context, string, string, *store.MessageContext) error
	GetQueueStatus(context.Context, string) (*api.QueueStatusResponse, error)
	CancelQueue(context.Context, string) (*api.QueueStatusResponse, error)
}

type executionProcessFetcher interface {
	FetchExecutionProcess(context.Context, string) (*api.ExecutionProcessDetail, error)
}

type DispatchResult struct {
	WorkspaceID string `json:"workspace_id"`
	SessionID   string `json:"session_id"`
	Action      string `json:"action"`
	Message     string `json:"message"`
}

type QueueResult struct {
	WorkspaceID string                  `json:"workspace_id"`
	SessionID   string                  `json:"session_id"`
	Status      string                  `json:"status"`
	Message     string                  `json:"message,omitempty"`
	Queued      *api.QueuedMessageState `json:"queued,omitempty"`
}

type MessageDispatcher struct {
	store   messageContextStore
	sender  messageSender
	fetcher executionProcessFetcher
}

func NewMessageDispatcher(store messageContextStore, sender messageSender, fetcher executionProcessFetcher) *MessageDispatcher {
	return &MessageDispatcher{
		store:   store,
		sender:  sender,
		fetcher: fetcher,
	}
}

func (d *MessageDispatcher) DispatchWorkspaceMessage(ctx context.Context, workspaceID, message, mode string) (*DispatchResult, error) {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return nil, errors.New("message is required")
	}

	msgCtx, err := d.resolveMessageContext(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(msgCtx.ExecutorConfigJSON) == "" {
		return nil, errors.New("工作区缺少可用 executor_config")
	}

	action := strings.TrimSpace(mode)
	if action == "" {
		action = strings.TrimSpace(msgCtx.DefaultSendMode)
	}
	if action == "" {
		action = "send"
	}

	switch action {
	case "send":
		if err := d.sender.SendFollowUpWithContext(ctx, msgCtx.SessionID, trimmed, msgCtx); err != nil {
			return nil, err
		}
		return &DispatchResult{
			WorkspaceID: workspaceID,
			SessionID:   msgCtx.SessionID,
			Action:      "send",
			Message:     "消息已发送",
		}, nil
	case "queue":
		if err := d.sender.QueueMessageWithContext(ctx, msgCtx.SessionID, trimmed, msgCtx); err != nil {
			return nil, err
		}
		return &DispatchResult{
			WorkspaceID: workspaceID,
			SessionID:   msgCtx.SessionID,
			Action:      "queue",
			Message:     "消息已加入队列",
		}, nil
	default:
		return nil, fmt.Errorf("unsupported mode: %s", action)
	}
}

func (d *MessageDispatcher) GetWorkspaceQueueStatus(ctx context.Context, workspaceID string) (*QueueResult, error) {
	msgCtx, err := d.resolveMessageContext(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	status, err := d.sender.GetQueueStatus(ctx, msgCtx.SessionID)
	if err != nil {
		return nil, err
	}

	return &QueueResult{
		WorkspaceID: workspaceID,
		SessionID:   msgCtx.SessionID,
		Status:      status.Status,
		Queued:      status.Message,
		Message:     queueStatusMessage(status),
	}, nil
}

func (d *MessageDispatcher) CancelWorkspaceQueue(ctx context.Context, workspaceID string) (*QueueResult, error) {
	msgCtx, err := d.resolveMessageContext(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	status, err := d.sender.CancelQueue(ctx, msgCtx.SessionID)
	if err != nil {
		return nil, err
	}

	return &QueueResult{
		WorkspaceID: workspaceID,
		SessionID:   msgCtx.SessionID,
		Status:      status.Status,
		Queued:      status.Message,
		Message:     "队列已取消",
	}, nil
}

func (d *MessageDispatcher) resolveMessageContext(ctx context.Context, workspaceID string) (*store.MessageContext, error) {
	msgCtx, err := d.store.GetMessageContextByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("获取消息上下文失败: %w", err)
	}
	if msgCtx == nil {
		msgCtx, err = d.hydrateMessageContext(ctx, workspaceID)
		if err != nil {
			return nil, err
		}
	}
	if msgCtx.SessionID == "" {
		return nil, errors.New("工作区缺少可用 session_id")
	}
	return msgCtx, nil
}

func (d *MessageDispatcher) hydrateMessageContext(ctx context.Context, workspaceID string) (*store.MessageContext, error) {
	if d.fetcher == nil {
		return nil, errors.New("工作区缺少可用消息上下文，请等待同步完成后重试")
	}

	latestProcess, err := d.store.GetLatestCodingAgentProcessByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("获取最新 process 失败: %w", err)
	}
	if latestProcess == nil || latestProcess.ID == "" {
		return nil, errors.New("工作区缺少可用消息上下文，请等待同步完成后重试")
	}

	processDetail, err := d.fetcher.FetchExecutionProcess(ctx, latestProcess.ID)
	if err != nil {
		return nil, fmt.Errorf("拉取 execution process 详情失败: %w", err)
	}
	if processDetail == nil || len(processDetail.ExecutorAction.Typ.ExecutorConfig) == 0 {
		return nil, errors.New("远端 execution process 缺少 executor_config")
	}

	encoded, err := json.Marshal(processDetail.ExecutorAction.Typ.ExecutorConfig)
	if err != nil {
		return nil, fmt.Errorf("序列化 executor_config 失败: %w", err)
	}

	msgCtx := &store.MessageContext{
		WorkspaceID:        workspaceID,
		SessionID:          processDetail.SessionID,
		ProcessID:          stringPtr(processDetail.ID),
		ExecutorConfigJSON: string(encoded),
		DefaultSendMode:    "send",
		Source:             "fallback_fetch",
		UpdatedAt:          time.Now(),
	}
	if executor, ok := processDetail.ExecutorAction.Typ.ExecutorConfig["executor"].(string); ok && executor != "" {
		msgCtx.Executor = stringPtr(executor)
	}
	if variant, ok := processDetail.ExecutorAction.Typ.ExecutorConfig["variant"].(string); ok && variant != "" {
		msgCtx.Variant = stringPtr(variant)
	}

	if err := d.store.UpsertMessageContext(ctx, msgCtx); err != nil {
		return nil, fmt.Errorf("回写消息上下文失败: %w", err)
	}
	return msgCtx, nil
}

func stringPtr(v string) *string {
	return &v
}

func queueStatusMessage(status *api.QueueStatusResponse) string {
	if status == nil {
		return ""
	}
	if status.Status == "queued" {
		return "消息已排队 - 将在当前运行完成时执行"
	}
	return ""
}
