package main

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/huajiejun/kanban-watcher/internal/config"
)

type storeStub struct {
	initCalled           bool
	getWorkspaceCalled   bool
	getWorkspacePort     *int
	getWorkspaceArchived bool
	getWorkspaceExists   bool
}

func (s *storeStub) Close() error { return nil }

func (s *storeStub) InitSchema(ctx context.Context) error {
	s.initCalled = true
	return nil
}

func (s *storeStub) GetWorkspaceFrontendPortState(ctx context.Context, workspaceID string) (*int, bool, bool, error) {
	s.getWorkspaceCalled = true
	if !s.initCalled {
		return nil, false, false, errSchemaNotInitialized
	}
	return s.getWorkspacePort, s.getWorkspaceArchived, s.getWorkspaceExists, nil
}

func (s *storeStub) ListAllocatedFrontendPorts(ctx context.Context, excludeWorkspaceID string) ([]int, error) {
	return nil, nil
}

func (s *storeStub) AssignFrontendPort(ctx context.Context, workspaceID string, port int) error {
	return nil
}

type allocatorStub struct {
	store          *storeStub
	allocateCalled bool
}

func (a *allocatorStub) Allocate(ctx context.Context, workspaceID string) (int, int, error) {
	a.allocateCalled = true
	if !a.store.initCalled {
		return 0, 0, errSchemaNotInitialized
	}
	return 6020, 16020, nil
}

var errSchemaNotInitialized = os.ErrInvalid

func TestRunReserveInitializesSchemaBeforeAllocate(t *testing.T) {
	originalOpenStore := openPortStore
	originalNewAllocator := newPortAllocator
	originalLoadConfig := loadPortCommandConfig
	t.Cleanup(func() {
		openPortStore = originalOpenStore
		newPortAllocator = originalNewAllocator
		loadPortCommandConfig = originalLoadConfig
	})

	store := &storeStub{}
	allocator := &allocatorStub{store: store}
	openPortStore = func(cfg *config.Config) (workspacePortStore, error) {
		return store, nil
	}
	newPortAllocator = func(store workspacePortStore) portAllocator {
		return allocator
	}
	loadPortCommandConfig = func() (*config.Config, error) {
		return &config.Config{Database: config.DatabaseConfig{Host: "127.0.0.1", Port: 3306, User: "root", Database: "kanban"}}, nil
	}

	output, err := captureStdout(func() error {
		return runReserve([]string{"--workspace", "ws-1"})
	})
	if err != nil {
		t.Fatalf("runReserve 返回错误: %v", err)
	}
	if !store.initCalled {
		t.Fatalf("runReserve 没有先初始化 schema")
	}
	if !allocator.allocateCalled {
		t.Fatalf("runReserve 没有调用分配器")
	}
	if !strings.Contains(output, `"frontend_port":6020`) {
		t.Fatalf("runReserve 输出 = %s, want frontend_port", output)
	}
}

func TestRunLookupInitializesSchemaBeforeQuery(t *testing.T) {
	originalOpenStore := openPortStore
	originalLoadConfig := loadPortCommandConfig
	t.Cleanup(func() {
		openPortStore = originalOpenStore
		loadPortCommandConfig = originalLoadConfig
	})

	frontendPort := 6028
	store := &storeStub{
		getWorkspacePort:   &frontendPort,
		getWorkspaceExists: true,
	}
	openPortStore = func(cfg *config.Config) (workspacePortStore, error) {
		return store, nil
	}
	loadPortCommandConfig = func() (*config.Config, error) {
		return &config.Config{Database: config.DatabaseConfig{Host: "127.0.0.1", Port: 3306, User: "root", Database: "kanban"}}, nil
	}

	output, err := captureStdout(func() error {
		return runLookup([]string{"--workspace", "ws-1"})
	})
	if err != nil {
		t.Fatalf("runLookup 返回错误: %v", err)
	}
	if !store.initCalled {
		t.Fatalf("runLookup 没有先初始化 schema")
	}
	if !store.getWorkspaceCalled {
		t.Fatalf("runLookup 没有查询工作区端口")
	}
	if !strings.Contains(output, `"backend_port":16028`) {
		t.Fatalf("runLookup 输出 = %s, want backend_port", output)
	}
}

func captureStdout(run func() error) (string, error) {
	originalStdout := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		return "", err
	}
	os.Stdout = writer

	runErr := run()

	_ = writer.Close()
	os.Stdout = originalStdout

	output, readErr := io.ReadAll(reader)
	if readErr != nil {
		return "", readErr
	}
	return string(output), runErr
}
