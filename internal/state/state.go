package state

import "time"

// NotificationKey 通知去重键，唯一标识一次"需要关注"的状态
//
// 设计原理：
//   - 使用 WorkspaceID + CompletedAt 组合，确保同一工作区在同一构建周期内只通知一次
//   - CompletedAt 为 "" 表示进程仍在运行中（对应 API 返回的 null）
//   - 当有新构建完成时，CompletedAt 会变化，从而重置去重状态，允许再次通知
//
// 示例场景：
//   - 工作区 A 的构建 #10 正在运行且需要关注 → 持续计时，达到阈值后发送通知
//   - 构建 #10 完成后，CompletedAt 被填充 → 若问题仍存在，新 Key 开始计时
//   - 这确保同一构建不会被重复通知，但新构建会触发新的通知流程
type NotificationKey struct {
	WorkspaceID string // 工作区唯一标识
	CompletedAt string // 构建完成时间（ISO8601）或 ""（运行中）
}

// AttentionEntry 记录某个 NotificationKey 的跟踪状态
// 用于实现"持续需要关注超过阈值才通知"的逻辑
type AttentionEntry struct {
	Key         NotificationKey // 去重键
	FirstSeenAt time.Time       // 首次发现需要关注的时间（开始计时）
	NotifiedAt  *time.Time      // 实际发送通知的时间（nil 表示尚未通知）
}

// AppState 应用持久化状态，包含所有正在跟踪的 AttentionEntry
//
// 设计模式：值语义（Value Semantics）
//   - AppState 是值类型，所有修改操作返回新的 AppState，而非修改原对象
//   - 好处：天然线程安全，可轻松实现快照和回滚，避免副作用
//   - 代价：每次修改都有拷贝开销，但条目数量少（工作区数），可忽略
//
// 使用方式：
//   state := NewAppState()
//   state = state.WithEntry(key, entry)  // 添加或更新条目
//   state = state.WithoutKey(key)        // 删除条目
//   state = state.WithoutWorkspace(id)   // 删除某工作区的所有条目
type AppState struct {
	Entries map[NotificationKey]AttentionEntry // 从 Key 到 Entry 的映射
}

// NewAppState 创建空的初始状态
func NewAppState() AppState {
	return AppState{
		Entries: make(map[NotificationKey]AttentionEntry),
	}
}

// WithEntry 返回一个新 AppState，包含添加或替换后的条目
// 原 AppState 不会被修改（不可变模式）
func (s AppState) WithEntry(key NotificationKey, entry AttentionEntry) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries)+1)
	for k, v := range s.Entries {
		newEntries[k] = v
	}
	newEntries[key] = entry
	return AppState{Entries: newEntries}
}

// WithoutKey 返回一个新 AppState，移除了指定的 Key
// 若 Key 不存在，返回原状态的副本（不共享底层 map）
func (s AppState) WithoutKey(key NotificationKey) AppState {
	if _, exists := s.Entries[key]; !exists {
		// Key 不存在，仍需返回拷贝以保持一致性
		return s.clone()
	}
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if k != key {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}

// WithoutWorkspace 返回一个新 AppState，移除了指定工作区的所有条目
// 用于工作区被归档或删除时清理残留状态
func (s AppState) WithoutWorkspace(workspaceID string) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if k.WorkspaceID != workspaceID {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}

// WithoutWorkspacesNotIn 返回一个新 AppState，仅保留存在于 activeIDs 中的工作区条目
// 用于同步 API 返回的最新列表，清理已不存在的工作区状态
func (s AppState) WithoutWorkspacesNotIn(activeIDs map[string]struct{}) AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		if _, ok := activeIDs[k.WorkspaceID]; ok {
			newEntries[k] = v
		}
	}
	return AppState{Entries: newEntries}
}

// clone 创建当前状态的深拷贝
func (s AppState) clone() AppState {
	newEntries := make(map[NotificationKey]AttentionEntry, len(s.Entries))
	for k, v := range s.Entries {
		newEntries[k] = v
	}
	return AppState{Entries: newEntries}
}
