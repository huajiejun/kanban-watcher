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

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("用法: kw_frontend_port reserve --workspace <workspace_id>")
	}
	if args[0] != "reserve" {
		return fmt.Errorf("未知命令: %s", args[0])
	}

	fs := flag.NewFlagSet("reserve", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	workspaceID := fs.String("workspace", "", "工作区 ID")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *workspaceID == "" {
		return errors.New("缺少 --workspace 参数")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}
	if !cfg.Database.IsEnabled() {
		return errors.New("数据库配置未启用")
	}

	dbStore, err := store.NewStore(cfg.Database.DSN())
	if err != nil {
		return err
	}
	defer dbStore.Close()

	allocator := service.NewFrontendPortAllocator(dbStore, isFrontendPortAvailable)
	frontendPort, backendPort, err := allocator.Allocate(context.Background(), *workspaceID)
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(reserveResult{
		FrontendPort: frontendPort,
		BackendPort:  backendPort,
	})
}

func isFrontendPortAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}
