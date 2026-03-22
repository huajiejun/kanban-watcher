package sessioncleaner

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

func TestNewCleaner(t *testing.T) {
	t.Run("default preserved days", func(t *testing.T) {
		c := NewCleaner("/tmp", 0)
		if c.preservedDays != 7 {
			t.Errorf("expected preservedDays=7, got %d", c.preservedDays)
		}
	})

	t.Run("custom preserved days", func(t *testing.T) {
		c := NewCleaner("/tmp", 14)
		if c.preservedDays != 14 {
			t.Errorf("expected preservedDays=14, got %d", c.preservedDays)
		}
	})
}

func TestCleanup(t *testing.T) {
	// 创建临时测试目录
	tmpDir := t.TempDir()
	sessionsDir := filepath.Join(tmpDir, "sessions")

	// 创建模拟的 session 目录结构
	// sessions/ab/abc123/...
	activeSessionID := "abc123active"
	expiredSessionID := "xyz789expired"

	// 活跃 session（最近修改）
	activeDir := filepath.Join(sessionsDir, "ab", activeSessionID, "processes")
	if err := os.MkdirAll(activeDir, 0755); err != nil {
		t.Fatalf("failed to create active session dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(activeDir, "test.jsonl"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// 过期 session（旧修改时间）
	expiredSessionDir := filepath.Join(sessionsDir, "xy", expiredSessionID)
	expiredDir := filepath.Join(expiredSessionDir, "processes")
	if err := os.MkdirAll(expiredDir, 0755); err != nil {
		t.Fatalf("failed to create expired session dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(expiredDir, "test.jsonl"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// 设置过期 session 目录的修改时间为 10 天前
	expiredTime := time.Now().Add(-10 * 24 * time.Hour)
	if err := os.Chtimes(expiredSessionDir, expiredTime, expiredTime); err != nil {
		t.Fatalf("failed to set expired dir time: %v", err)
	}

	// 创建清理器（保留 7 天）
	cleaner := NewCleaner(tmpDir, 7)

	// 准备活跃工作区列表
	activeSessionIDPtr := activeSessionID
	workspaces := []api.EnrichedWorkspace{
		{
			Summary: api.WorkspaceSummary{
				LatestSessionID: &activeSessionIDPtr,
			},
		},
	}

	// 执行清理
	result := cleaner.Cleanup(workspaces)

	// 验证结果
	if result.ScannedCount != 2 {
		t.Errorf("expected ScannedCount=2, got %d", result.ScannedCount)
	}
	if result.ActiveCount != 1 {
		t.Errorf("expected ActiveCount=1, got %d", result.ActiveCount)
	}
	if result.ExpiredCount != 1 {
		t.Errorf("expected ExpiredCount=1, got %d", result.ExpiredCount)
	}
	if result.DeletedCount != 1 {
		t.Errorf("expected DeletedCount=1, got %d", result.DeletedCount)
	}

	// 验证活跃 session 仍然存在
	if _, err := os.Stat(filepath.Join(sessionsDir, "ab", activeSessionID)); os.IsNotExist(err) {
		t.Error("active session should still exist")
	}

	// 验证过期 session 已被删除
	if _, err := os.Stat(filepath.Join(sessionsDir, "xy", expiredSessionID)); !os.IsNotExist(err) {
		t.Error("expired session should be deleted")
	}
}

func TestCleanup_NoSessionsDir(t *testing.T) {
	tmpDir := t.TempDir()
	cleaner := NewCleaner(tmpDir, 7)

	result := cleaner.Cleanup(nil)

	if result.ScannedCount != 0 {
		t.Errorf("expected ScannedCount=0, got %d", result.ScannedCount)
	}
}

func TestCleanup_PreserveRecentInactive(t *testing.T) {
	// 创建临时测试目录
	tmpDir := t.TempDir()
	sessionsDir := filepath.Join(tmpDir, "sessions")

	// 创建一个最近但不在活跃列表中的 session（应该保留）
	recentInactiveID := "recent123"
	recentDir := filepath.Join(sessionsDir, "re", recentInactiveID, "processes")
	if err := os.MkdirAll(recentDir, 0755); err != nil {
		t.Fatalf("failed to create recent session dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(recentDir, "test.jsonl"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// 创建清理器（保留 7 天）
	cleaner := NewCleaner(tmpDir, 7)

	// 空的活跃工作区列表
	result := cleaner.Cleanup(nil)

	// 最近的非活跃 session 应该被保留
	if result.ExpiredCount != 0 {
		t.Errorf("expected ExpiredCount=0 (recent inactive preserved), got %d", result.ExpiredCount)
	}
	if result.DeletedCount != 0 {
		t.Errorf("expected DeletedCount=0, got %d", result.DeletedCount)
	}

	// 验证 session 仍然存在
	if _, err := os.Stat(recentDir); os.IsNotExist(err) {
		t.Error("recent inactive session should be preserved")
	}
}
