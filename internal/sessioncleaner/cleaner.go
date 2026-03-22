package sessioncleaner

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
)

// Cleaner 负责清理过期的 session 目录
type Cleaner struct {
	baseDir       string
	cleanupAge    time.Duration // session 过期时间（超过此时间未更新的 session 被视为过期）
	preservedDays int           // 保留最近 N 天的 session
}

// NewCleaner 创建清理器实例
func NewCleaner(baseDir string, preservedDays int) *Cleaner {
	if preservedDays <= 0 {
		preservedDays = 7 // 默认保留 7 天
	}
	return &Cleaner{
		baseDir:       baseDir,
		preservedDays: preservedDays,
		cleanupAge:    time.Duration(preservedDays) * 24 * time.Hour,
	}
}

// CleanupResult 清理结果统计
type CleanupResult struct {
	ScannedCount   int // 扫描的 session 数量
	ActiveCount    int // 活跃的 session 数量
	ExpiredCount   int // 过期的 session 数量
	DeletedCount   int // 成功删除的 session 数量
	FailedCount    int // 删除失败的 session 数量
	FreedBytes     int64
}

// Cleanup 执行清理，删除不在活跃工作区列表中且超过保留时间的 session 目录
// activeWorkspaces: 当前活跃的工作区列表，用于确定哪些 session 是活跃的
func (c *Cleaner) Cleanup(activeWorkspaces []api.EnrichedWorkspace) CleanupResult {
	result := CleanupResult{}

	// 1. 构建活跃 session ID 集合
	activeSessionIDs := make(map[string]struct{})
	for _, w := range activeWorkspaces {
		if w.Summary.LatestSessionID != nil && *w.Summary.LatestSessionID != "" {
			activeSessionIDs[strings.ToLower(*w.Summary.LatestSessionID)] = struct{}{}
		}
	}

	// 2. 扫描 sessions 目录
	sessionsDir := filepath.Join(c.baseDir, "sessions")
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return result // 目录不存在，无需清理
		}
		fmt.Fprintf(os.Stderr, "sessioncleaner: 读取 sessions 目录失败: %v\n", err)
		return result
	}

	// 3. 遍历所有 session 子目录
	cutoffTime := time.Now().Add(-c.cleanupAge)

	for _, prefixEntry := range entries {
		if !prefixEntry.IsDir() {
			continue
		}

		prefixDir := filepath.Join(sessionsDir, prefixEntry.Name())
		sessionEntries, err := os.ReadDir(prefixDir)
		if err != nil {
			continue
		}

		for _, sessionEntry := range sessionEntries {
			if !sessionEntry.IsDir() {
				continue
			}

			sessionID := sessionEntry.Name()
			result.ScannedCount++

			// 检查是否为活跃 session
			if _, isActive := activeSessionIDs[strings.ToLower(sessionID)]; isActive {
				result.ActiveCount++
				continue
			}

			// 检查最后修改时间
			sessionPath := filepath.Join(prefixDir, sessionID)
			info, err := sessionEntry.Info()
			if err != nil {
				continue
			}

			// 如果 session 修改时间在保留期内，跳过
			if info.ModTime().After(cutoffTime) {
				continue
			}

			result.ExpiredCount++

			// 删除 session 目录
			if err := c.deleteSessionDir(sessionPath); err != nil {
				fmt.Fprintf(os.Stderr, "sessioncleaner: 删除 session %s 失败: %v\n", sessionID, err)
				result.FailedCount++
				continue
			}

			result.DeletedCount++
		}
	}

	return result
}

// deleteSessionDir 删除 session 目录并计算释放的空间
func (c *Cleaner) deleteSessionDir(path string) error {
	// 计算目录大小
	var size int64
	filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})

	// 删除目录
	if err := os.RemoveAll(path); err != nil {
		return err
	}

	return nil
}

// RunCleanupLoop 启动定时清理循环，每小时执行一次
// 通过 channel 通知主循环执行清理
func RunCleanupLoop(ctx context.Context, cleaner *Cleaner, getActiveWorkspaces func() []api.EnrichedWorkspace, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour // 默认每小时执行一次
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			workspaces := getActiveWorkspaces()
			result := cleaner.Cleanup(workspaces)
			if result.DeletedCount > 0 || result.FailedCount > 0 {
				fmt.Printf("sessioncleaner: 清理完成 - 扫描=%d, 活跃=%d, 过期=%d, 已删除=%d, 失败=%d\n",
					result.ScannedCount,
					result.ActiveCount,
					result.ExpiredCount,
					result.DeletedCount,
					result.FailedCount,
				)
			}
		}
	}
}
