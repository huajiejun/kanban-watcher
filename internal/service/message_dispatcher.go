package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/huajiejun/kanban-watcher/internal/store"
)

type messageContextStore interface {
	GetMessageContextByWorkspaceID(context.Context, string) (*store.MessageContext, error)
}

type messageSender interface {
	SendFollowUpWithContext(context.Context, string, string, *store.MessageContext) error
	QueueMessageWithContext(context.Context, string, string, *store.MessageContext) error
}

type DispatchResult struct {
	WorkspaceID string `json:"workspace_id"`
	SessionID   string `json:"session_id"`
	Action      string `json:"action"`
	Message     string `json:"message"`
}

type MessageDispatcher struct {
	store  messageContextStore
	sender messageSender
}

func NewMessageDispatcher(store messageContextStore, sender messageSender) *MessageDispatcher {
	return &MessageDispatcher{
		store:  store,
		sender: sender,
	}
}

func (d *MessageDispatcher) DispatchWorkspaceMessage(ctx context.Context, workspaceID, message, mode string) (*DispatchResult, error) {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return nil, errors.New("message is required")
	}

	msgCtx, err := d.store.GetMessageContextByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("获取消息上下文失败: %w", err)
	}
	if msgCtx == nil {
		return nil, errors.New("工作区缺少可用消息上下文，请等待同步完成后重试")
	}
	if msgCtx.SessionID == "" {
		return nil, errors.New("工作区缺少可用 session_id")
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
