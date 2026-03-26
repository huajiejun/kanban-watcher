package api

import (
	"context"
	"os"
	"testing"
	"time"
)

const defaultRealBaseURL = "http://127.0.0.1:7777"
const defaultRealWorkspaceID = "565514a3-ae39-47eb-8b62-6f625f7eb87d"

func TestProxyClientStartDevServerIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	baseURL := realBaseURL()
	workspaceID := realWorkspaceID()

	proxy := NewProxyClient(baseURL)
	processID := startRealDevServer(t, ctx, proxy, workspaceID)
	t.Cleanup(func() {
		stopRealExecutionProcess(t, baseURL, processID)
	})

	process := waitForExecutionProcessStatus(t, ctx, baseURL, processID, 20*time.Second, func(status string) bool {
		return status == "running"
	})

	if process.ID != processID {
		t.Fatalf("process.id = %q, want %q", process.ID, processID)
	}
	if process.SessionID == "" {
		t.Fatal("process.session_id 为空")
	}
	if process.RunReason != "devserver" {
		t.Fatalf("process.run_reason = %q, want devserver", process.RunReason)
	}
}

func TestProxyClientStopExecutionProcessIntegration(t *testing.T) {
	baseURL := os.Getenv("KANBAN_REAL_BASE_URL")
	if baseURL == "" {
		baseURL = defaultRealBaseURL
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	processID := os.Getenv("KANBAN_REAL_PROCESS_ID")
	if processID == "" {
		proxy := NewProxyClient(baseURL)
		processID = startRealDevServer(t, ctx, proxy, realWorkspaceID())
		waitForExecutionProcessStatus(t, ctx, baseURL, processID, 20*time.Second, func(status string) bool {
			return status == "running"
		})
	}

	stopRealExecutionProcess(t, baseURL, processID)

	process := waitForExecutionProcessStatus(t, ctx, baseURL, processID, 20*time.Second, func(status string) bool {
		return status != "running"
	})
	if process.Status == "running" {
		t.Fatalf("execution process %s 仍处于 running", processID)
	}
}

func realBaseURL() string {
	baseURL := os.Getenv("KANBAN_REAL_BASE_URL")
	if baseURL == "" {
		baseURL = defaultRealBaseURL
	}
	return baseURL
}

func realWorkspaceID() string {
	workspaceID := os.Getenv("KANBAN_REAL_WORKSPACE_ID")
	if workspaceID == "" {
		workspaceID = defaultRealWorkspaceID
	}
	return workspaceID
}

func startRealDevServer(t *testing.T, ctx context.Context, proxy *ProxyClient, workspaceID string) string {
	t.Helper()

	processes, err := proxy.StartDevServer(ctx, workspaceID)
	if err != nil {
		t.Fatalf("StartDevServer 返回错误: %v", err)
	}
	if len(processes) == 0 {
		t.Fatal("StartDevServer 未返回 execution process")
	}

	processID := processes[0].ID
	if processID == "" {
		t.Fatal("StartDevServer 返回的第一个 process id 为空")
	}
	return processID
}

func stopRealExecutionProcess(t *testing.T, baseURL, processID string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	proxy := NewProxyClient(baseURL)
	if err := proxy.StopExecutionProcess(ctx, processID); err != nil {
		t.Fatalf("StopExecutionProcess 返回错误: %v", err)
	}
}

func waitForExecutionProcessStatus(t *testing.T, ctx context.Context, baseURL, processID string, timeout time.Duration, match func(string) bool) *ExecutionProcessDetail {
	t.Helper()

	reader := NewClient(baseURL)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		process, err := reader.FetchExecutionProcess(ctx, processID)
		if err != nil {
			t.Fatalf("获取 execution process 失败: %v", err)
		}
		if process == nil {
			t.Fatal("execution process 为空")
		}
		if match(process.Status) {
			return process
		}
		time.Sleep(500 * time.Millisecond)
	}

	process, err := reader.FetchExecutionProcess(ctx, processID)
	if err != nil {
		t.Fatalf("超时后获取 execution process 失败: %v", err)
	}
	if process == nil {
		t.Fatal("超时后 execution process 为空")
	}
	t.Fatalf("execution process %s 在 %s 内未达到期望状态，当前状态 = %q", processID, timeout, process.Status)
	return nil
}
