package service

import (
	"context"
	"errors"
	"fmt"
)

const (
	minFrontendPort = 6020
	maxFrontendPort = 6030
)

var (
	ErrWorkspaceArchived         = errors.New("workspace is archived")
	ErrWorkspaceNotFound         = errors.New("workspace not found")
	ErrFrontendPortPoolExhausted = errors.New("frontend port pool exhausted")
)

type frontendPortStore interface {
	ResolveWorkspaceID(ctx context.Context, workspaceID string) (resolvedID string, exists bool, err error)
	GetWorkspaceFrontendPortState(ctx context.Context, workspaceID string) (frontendPort *int, archived bool, exists bool, err error)
	ListAllocatedFrontendPorts(ctx context.Context, excludeWorkspaceID string) ([]int, error)
	AssignFrontendPort(ctx context.Context, workspaceID string, port int) error
}

type FrontendPortAllocator struct {
	store           frontendPortStore
	isPortAvailable func(port int) bool
}

func NewFrontendPortAllocator(store frontendPortStore, isPortAvailable func(port int) bool) *FrontendPortAllocator {
	checker := isPortAvailable
	if checker == nil {
		checker = func(port int) bool { return true }
	}
	return &FrontendPortAllocator{store: store, isPortAvailable: checker}
}

func (a *FrontendPortAllocator) Allocate(ctx context.Context, workspaceID string) (int, int, error) {
	resolvedWorkspaceID, exists, err := a.store.ResolveWorkspaceID(ctx, workspaceID)
	if err != nil {
		return 0, 0, err
	}
	if !exists {
		return 0, 0, ErrWorkspaceNotFound
	}

	frontendPort, archived, exists, err := a.store.GetWorkspaceFrontendPortState(ctx, resolvedWorkspaceID)
	if err != nil {
		return 0, 0, err
	}
	if !exists {
		return 0, 0, ErrWorkspaceNotFound
	}
	if archived {
		return 0, 0, ErrWorkspaceArchived
	}

	allocatedPorts, err := a.store.ListAllocatedFrontendPorts(ctx, resolvedWorkspaceID)
	if err != nil {
		return 0, 0, err
	}
	used := make(map[int]struct{}, len(allocatedPorts))
	for _, port := range allocatedPorts {
		used[port] = struct{}{}
	}

	if frontendPort != nil {
		port := *frontendPort
		if port >= minFrontendPort && port <= maxFrontendPort && a.isPortAvailable(port) {
			if _, exists := used[port]; !exists {
				return port, port + 10000, nil
			}
		}
	}

	for port := minFrontendPort; port <= maxFrontendPort; port++ {
		if _, exists := used[port]; exists {
			continue
		}
		if !a.isPortAvailable(port) {
			continue
		}
		if err := a.store.AssignFrontendPort(ctx, resolvedWorkspaceID, port); err != nil {
			return 0, 0, fmt.Errorf("assign frontend port: %w", err)
		}
		return port, port + 10000, nil
	}

	return 0, 0, ErrFrontendPortPoolExhausted
}
