package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// stateVersion 状态文件格式版本号
// 用于将来需要升级文件格式时做兼容性判断
const stateVersion = 1

// persistedEntry 磁盘上存储的 AttentionEntry 表示（扁平化结构）
// 使用 workspace_id + completed_at 替代复合 Key，便于 JSON 序列化
type persistedEntry struct {
	WorkspaceID string     `json:"workspace_id"`         // 工作区标识
	CompletedAt string     `json:"completed_at"`         // 完成时间或空字符串
	FirstSeenAt time.Time  `json:"first_seen_at"`        // 首次发现时间
	NotifiedAt  *time.Time `json:"notified_at,omitempty"` // 通知时间（可选）
}

// persistedState 磁盘文件的顶层结构
type persistedState struct {
	Version int              `json:"version"` // 格式版本
	Entries []persistedEntry `json:"entries"` // 所有条目
}

// StatePath 返回状态文件路径（~/.config/kanban-watcher/state.json）
func StatePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("获取用户主目录: %w", err)
	}
	return filepath.Join(home, ".config", "kanban-watcher", "state.json"), nil
}

// LoadState 从磁盘读取持久化状态
// 若文件不存在，返回空状态（首次运行）；若文件损坏，打印警告并返回空状态
func LoadState() (AppState, error) {
	path, err := StatePath()
	if err != nil {
		return NewAppState(), err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// 首次运行：无状态文件，返回空状态
			return NewAppState(), nil
		}
		return NewAppState(), fmt.Errorf("读取状态 %s: %w", path, err)
	}

	var ps persistedState
	if err := json.Unmarshal(data, &ps); err != nil {
		// 文件损坏：打印警告，丢弃旧状态重新开始
		fmt.Fprintf(os.Stderr, "警告: 状态文件 %s 损坏，重新开始: %v\n", path, err)
		return NewAppState(), nil
	}

	// 将磁盘格式转换为内存格式
	s := NewAppState()
	for _, e := range ps.Entries {
		key := NotificationKey{
			WorkspaceID: e.WorkspaceID,
			CompletedAt: e.CompletedAt,
		}
		s = s.WithEntry(key, AttentionEntry{
			Key:         key,
			FirstSeenAt: e.FirstSeenAt,
			NotifiedAt:  e.NotifiedAt,
		})
	}
	return s, nil
}

// MustLoad 加载状态，出错时返回空状态并打印警告（不阻塞启动）
func MustLoad() AppState {
	s, err := LoadState()
	if err != nil {
		fmt.Fprintf(os.Stderr, "警告: 加载状态: %v\n", err)
	}
	return s
}

// SaveState 将 AppState 原子化写入磁盘
//
// 原子化写入策略（write temp → rename）：
//   1. 写入到临时文件 state.json.tmp
//   2. 使用 os.Rename 原子性地覆盖 state.json
//   3. 若写入失败，删除临时文件
//
// 这样可以确保：
//   - 即使程序崩溃，也不会留下半写入的损坏文件
//   - 外部进程始终看到旧版本或新版本，不会看到中间状态
func SaveState(s AppState) error {
	path, err := StatePath()
	if err != nil {
		return err
	}

	// 确保目录存在
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("创建状态目录: %w", err)
	}

	// 转换为磁盘格式
	entries := make([]persistedEntry, 0, len(s.Entries))
	for _, e := range s.Entries {
		entries = append(entries, persistedEntry{
			WorkspaceID: e.Key.WorkspaceID,
			CompletedAt: e.Key.CompletedAt,
			FirstSeenAt: e.FirstSeenAt,
			NotifiedAt:  e.NotifiedAt,
		})
	}

	ps := persistedState{
		Version: stateVersion,
		Entries: entries,
	}

	data, err := json.MarshalIndent(ps, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化状态: %w", err)
	}

	// 原子写入：先写临时文件，再重命名
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("写入临时状态: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp) // 重命名失败，清理临时文件
		return fmt.Errorf("重命名状态文件: %w", err)
	}
	return nil
}
