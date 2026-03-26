package service

import (
	"context"
	"errors"
	"testing"
)

type allocatorStoreStub struct {
	workspace       *storeWorkspaceState
	occupiedPorts  []int
	assignedPort   *int
	assignCalls    int
	resolvedID     string
	getWorkspaceErr error
}

type storeWorkspaceState struct {
	ID           string
	Archived     bool
	FrontendPort *int
}

func (s *allocatorStoreStub) GetWorkspaceFrontendPortState(ctx context.Context, workspaceID string) (*int, bool, bool, error) {
	if s.getWorkspaceErr != nil {
		return nil, false, false, s.getWorkspaceErr
	}
	if s.workspace == nil || s.workspace.ID != workspaceID {
		return nil, false, false, nil
	}
	return s.workspace.FrontendPort, s.workspace.Archived, true, nil
}

func (s *allocatorStoreStub) ResolveWorkspaceID(ctx context.Context, workspaceID string) (string, bool, error) {
	if s.workspace == nil {
		return "", false, nil
	}
	if s.resolvedID != "" && workspaceID == s.resolvedID[:4] {
		return s.resolvedID, true, nil
	}
	if s.workspace.ID == workspaceID {
		return workspaceID, true, nil
	}
	return "", false, nil
}

func (s *allocatorStoreStub) ListAllocatedFrontendPorts(ctx context.Context, excludeWorkspaceID string) ([]int, error) {
	return append([]int(nil), s.occupiedPorts...), nil
}

func (s *allocatorStoreStub) AssignFrontendPort(ctx context.Context, workspaceID string, port int) error {
	s.assignCalls++
	s.assignedPort = &port
	if s.workspace != nil && s.workspace.ID == workspaceID {
		s.workspace.FrontendPort = &port
	}
	return nil
}

func TestFrontendPortAllocatorAllocatesPortInPool(t *testing.T) {
	store := &allocatorStoreStub{
		workspace: &storeWorkspaceState{ID: "ws-1"},
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return port != 6020
	})

	frontendPort, backendPort, err := allocator.Allocate(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("Allocate 返回错误: %v", err)
	}

	if frontendPort != 6021 {
		t.Fatalf("frontend port = %d, want 6021", frontendPort)
	}
	if backendPort != 16021 {
		t.Fatalf("backend port = %d, want 16021", backendPort)
	}
	if store.assignedPort == nil || *store.assignedPort != 6021 {
		t.Fatalf("assigned port = %#v, want 6021", store.assignedPort)
	}
}

func TestFrontendPortAllocatorReusesExistingPort(t *testing.T) {
	existing := 6024
	store := &allocatorStoreStub{
		workspace: &storeWorkspaceState{ID: "ws-1", FrontendPort: &existing},
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return true
	})

	frontendPort, backendPort, err := allocator.Allocate(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("Allocate 返回错误: %v", err)
	}

	if frontendPort != 6024 {
		t.Fatalf("frontend port = %d, want 6024", frontendPort)
	}
	if backendPort != 16024 {
		t.Fatalf("backend port = %d, want 16024", backendPort)
	}
	if store.assignCalls != 0 {
		t.Fatalf("assign calls = %d, want 0", store.assignCalls)
	}
}

func TestFrontendPortAllocatorReassignsUnavailableRecordedPort(t *testing.T) {
	existing := 6024
	store := &allocatorStoreStub{
		workspace:     &storeWorkspaceState{ID: "ws-1", FrontendPort: &existing},
		occupiedPorts: []int{6020, 6021},
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return port != 6024
	})

	frontendPort, backendPort, err := allocator.Allocate(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("Allocate 返回错误: %v", err)
	}

	if frontendPort != 6022 {
		t.Fatalf("frontend port = %d, want 6022", frontendPort)
	}
	if backendPort != 16022 {
		t.Fatalf("backend port = %d, want 16022", backendPort)
	}
	if store.assignCalls != 1 {
		t.Fatalf("assign calls = %d, want 1", store.assignCalls)
	}
}

func TestFrontendPortAllocatorRejectsArchivedWorkspace(t *testing.T) {
	store := &allocatorStoreStub{
		workspace: &storeWorkspaceState{ID: "ws-1", Archived: true},
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return true
	})

	_, _, err := allocator.Allocate(context.Background(), "ws-1")
	if !errors.Is(err, ErrWorkspaceArchived) {
		t.Fatalf("err = %v, want ErrWorkspaceArchived", err)
	}
}

func TestFrontendPortAllocatorFailsWhenPoolExhausted(t *testing.T) {
	store := &allocatorStoreStub{
		workspace: &storeWorkspaceState{ID: "ws-1"},
		occupiedPorts: []int{
			6020, 6021, 6022, 6023, 6024, 6025, 6026, 6027, 6028, 6029, 6030,
		},
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return false
	})

	_, _, err := allocator.Allocate(context.Background(), "ws-1")
	if !errors.Is(err, ErrFrontendPortPoolExhausted) {
		t.Fatalf("err = %v, want ErrFrontendPortPoolExhausted", err)
	}
}

func TestFrontendPortAllocatorResolvesShortWorkspaceID(t *testing.T) {
	store := &allocatorStoreStub{
		workspace:  &storeWorkspaceState{ID: "bf6664c1-a779-4142-8104-7390953cca7d"},
		resolvedID: "bf6664c1-a779-4142-8104-7390953cca7d",
	}
	allocator := NewFrontendPortAllocator(store, func(port int) bool {
		return port != 6020
	})

	frontendPort, backendPort, err := allocator.Allocate(context.Background(), "bf66")
	if err != nil {
		t.Fatalf("Allocate 返回错误: %v", err)
	}
	if frontendPort != 6021 || backendPort != 16021 {
		t.Fatalf("ports = (%d,%d), want (6021,16021)", frontendPort, backendPort)
	}
	if store.assignedPort == nil || *store.assignedPort != 6021 {
		t.Fatalf("assigned port = %#v, want 6021", store.assignedPort)
	}
}
