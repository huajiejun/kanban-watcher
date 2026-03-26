package api

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestProxyClientStopExecutionProcessIntegration(t *testing.T) {
	baseURL := os.Getenv("KANBAN_REAL_BASE_URL")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:7777"
	}

	processID := os.Getenv("KANBAN_REAL_PROCESS_ID")
	if processID == "" {
		t.Skip("未设置 KANBAN_REAL_PROCESS_ID，跳过真实 execution process 停止验证")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	reader := NewClient(baseURL)
	process, err := reader.FetchExecutionProcess(ctx, processID)
	if err != nil {
		t.Fatalf("停止前获取 execution process 失败: %v", err)
	}
	if process == nil {
		t.Fatal("停止前 execution process 为空")
	}
	if process.Status != "running" {
		t.Fatalf("停止前状态 = %q，期望 running；请确认这个 process 仍在运行", process.Status)
	}

	proxy := NewProxyClient(baseURL)
	if err := proxy.StopExecutionProcess(ctx, processID); err != nil {
		t.Fatalf("StopExecutionProcess 返回错误: %v", err)
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		current, err := reader.FetchExecutionProcess(ctx, processID)
		if err != nil {
			t.Fatalf("停止后获取 execution process 失败: %v", err)
		}
		if current == nil {
			t.Fatal("停止后 execution process 为空")
		}
		if current.Status != "running" {
			return
		}
		time.Sleep(500 * time.Millisecond)
	}

	t.Fatalf("execution process %s 在 10 秒内仍未停止", processID)
}
