package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"

	"github.com/huajiejun/kanban-watcher/internal/config"
	"github.com/huajiejun/kanban-watcher/internal/service"
	"github.com/huajiejun/kanban-watcher/internal/store"
)

type reserveResult struct {
	FrontendPort int `json:"frontend_port"`
	BackendPort  int `json:"backend_port"`
}

type workspacePortStore interface {
	Close() error
	InitSchema(context.Context) error
	ResolveWorkspaceID(ctx context.Context, workspaceID string) (resolvedID string, exists bool, err error)
	GetWorkspaceFrontendPortState(ctx context.Context, workspaceID string) (frontendPort *int, archived bool, exists bool, err error)
	ListAllocatedFrontendPorts(ctx context.Context, excludeWorkspaceID string) ([]int, error)
	AssignFrontendPort(ctx context.Context, workspaceID string, port int) error
}

type portAllocator interface {
	Allocate(context.Context, string) (int, int, error)
}

var (
	loadPortCommandConfig = config.LoadConfig
	openPortStore         = func(cfg *config.Config) (workspacePortStore, error) {
		return store.NewStore(cfg.Database.DSN())
	}
	newPortAllocator = func(dbStore workspacePortStore) portAllocator {
		return service.NewFrontendPortAllocator(dbStore, isFrontendPortAvailable)
	}
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("用法: kw_frontend_port <reserve|lookup> --workspace <workspace_id>")
	}
	switch args[0] {
	case "reserve":
		return runReserve(args[1:])
	case "lookup":
		return runLookup(args[1:])
	default:
		return fmt.Errorf("未知命令: %s", args[0])
	}
}

func runReserve(args []string) error {
	workspaceID, cfg, err := parseWorkspaceCommand(args)
	if err != nil {
		return err
	}

	dbStore, err := openPreparedPortStore(cfg)
	if err != nil {
		return err
	}
	defer dbStore.Close()

	allocator := newPortAllocator(dbStore)
	frontendPort, backendPort, err := allocator.Allocate(context.Background(), workspaceID)
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(reserveResult{
		FrontendPort: frontendPort,
		BackendPort:  backendPort,
	})
}

func runLookup(args []string) error {
	workspaceID, cfg, err := parseWorkspaceCommand(args)
	if err != nil {
		return err
	}

	dbStore, err := openPreparedPortStore(cfg)
	if err != nil {
		return err
	}
	defer dbStore.Close()

	resolvedWorkspaceID, exists, err := dbStore.ResolveWorkspaceID(context.Background(), workspaceID)
	if err != nil {
		return err
	}
	if !exists {
		return service.ErrWorkspaceNotFound
	}

	frontendPort, archived, exists, err := dbStore.GetWorkspaceFrontendPortState(context.Background(), resolvedWorkspaceID)
	if err != nil {
		return err
	}
	if archived {
		return service.ErrWorkspaceArchived
	}
	if frontendPort == nil {
		return errors.New("workspace frontend port not assigned")
	}

	return json.NewEncoder(os.Stdout).Encode(reserveResult{
		FrontendPort: *frontendPort,
		BackendPort:  *frontendPort + 10000,
	})
}

func openPreparedPortStore(cfg *config.Config) (workspacePortStore, error) {
	dbStore, err := openPortStore(cfg)
	if err != nil {
		return nil, err
	}
	if err := dbStore.InitSchema(context.Background()); err != nil {
		_ = dbStore.Close()
		return nil, err
	}
	return dbStore, nil
}

func parseWorkspaceCommand(args []string) (string, *config.Config, error) {
	fs := flag.NewFlagSet("reserve", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	workspaceID := fs.String("workspace", "", "工作区 ID")
	if err := fs.Parse(args); err != nil {
		return "", nil, err
	}
	if *workspaceID == "" {
		return "", nil, errors.New("缺少 --workspace 参数")
	}

	cfg, err := loadPortCommandConfig()
	if err != nil {
		return "", nil, err
	}
	if !cfg.Database.IsEnabled() {
		return "", nil, errors.New("数据库配置未启用")
	}

	return *workspaceID, cfg, nil
}

func isFrontendPortAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}
