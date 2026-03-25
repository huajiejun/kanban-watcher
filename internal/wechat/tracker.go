package wechat

import (
	"time"

	"github.com/huajiejun/kanban-watcher/internal/api"
	"github.com/huajiejun/kanban-watcher/internal/state"
)

// TrackedWorkspace 带等待时长的工作区信息
// 用于通知时展示该工作区已需要关注多长时间
type TrackedWorkspace struct {
	Workspace      api.EnrichedWorkspace // 工作区完整信息
	ElapsedMinutes int                   // 已持续需要关注的分钟数
}

// Tracker 管理通知去重和阈值判断逻辑
// 非并发安全，应由单 goroutine 调用（通过 channel 串行化）
type Tracker struct {
	current           state.AppState // 当前跟踪状态
	approvalThreshold int            // 待审批超时（分钟）
	messageThreshold  int            // 未读消息超时（分钟）
	repeatInterval    int            // 叠加提醒间隔（分钟）
}

// NewTracker 使用持久化状态创建跟踪器
// 启动时从磁盘加载上次保存的状态，确保跨进程去重
func NewTracker(s state.AppState, approvalThreshold, messageThreshold, repeatInterval int) *Tracker {
	// 兼容性迁移：检查所有 ConfirmedAt 为 nil 的旧记录
	threshold := time.Duration(approvalThreshold) * time.Minute
	now := time.Now()

	for key, entry := range s.Entries {
		if entry.ConfirmedAt == nil {
			// 旧记录：检查是否已超时
			if now.Sub(entry.FirstSeenAt) >= threshold {
				// 已超时：强制重新确认
				confirmedAt := now
				entry.ConfirmedAt = &confirmedAt
			} else {
				// 未超时：向后兼容，设置 ConfirmedAt = FirstSeenAt
				entry.ConfirmedAt = &entry.FirstSeenAt
			}
			s = s.WithEntry(key, entry)
		}
	}

	return &Tracker{
		current:           s,
		approvalThreshold: approvalThreshold,
		messageThreshold:  messageThreshold,
		repeatInterval:    repeatInterval,
	}
}

// ProcessWorkspaces 评估最新工作区数据，决定是否需要发送通知
//
// 核心逻辑（去重规则）：
//   1. 为每个工作区生成去重键 Key = (workspace_id, latest_process_completed_at)
//   2. 同一 Key 在一次构建周期内（CompletedAt 不变）只通知一次
//   3. 需要持续关注达到阈值后才触发通知
//   4. 当问题消失（resolved）或工作区被删除，清理对应跟踪记录
//
// 返回值：
//   - 需要立即通知的工作区列表（已达到阈值且未通知过）
//   - 内部状态会更新，调用者需通过 GetState() 获取并持久化
func (t *Tracker) ProcessWorkspaces(workspaces []api.EnrichedWorkspace, now time.Time) []TrackedWorkspace {
	// 步骤 1：构建当前活跃工作区 ID 集合
	// 用于清理已不存在（被归档或删除）的工作区的残留记录
	activeIDs := make(map[string]struct{}, len(workspaces))
	for _, w := range workspaces {
		activeIDs[w.ID] = struct{}{}
	}

	// 步骤 2：清理已不存在的工作区条目
	updated := t.current.WithoutWorkspacesNotIn(activeIDs)

	var toNotify []TrackedWorkspace

	for _, w := range workspaces {
		key := notificationKey(w)

		// 若工作区已不需要关注，移除其所有跟踪记录
		if !w.NeedsAttention() {
			updated = updated.WithoutWorkspace(w.ID)
			continue
		}

		// 根据工作区类型获取阈值
		threshold := time.Duration(t.getThreshold(w)) * time.Minute
		if threshold == 0 {
			continue // 不需要关注
		}

		// 工作区需要关注：检查是否已跟踪
		existing, found := updated.Entries[key]
		if !found {
			// 尝试查找同一工作区的任何现有条目（忽略 UpdatedAt 的差异）
			// 这处理两种情况：
			// 1. UpdatedAt 从空变成有值（原来的 legacy key 逻辑）
			// 2. UpdatedAt 从一个值变成另一个值（任务有新操作）
			for existingKey, existingEntry := range updated.Entries {
				if existingKey.WorkspaceID == w.ID && existingKey.CompletedAt == key.CompletedAt {
					// 找到了同一工作区的现有条目，迁移到新的 key
					updated = updated.WithoutKey(existingKey)
					existingEntry.Key = key
					updated = updated.WithEntry(key, existingEntry)
					existing = existingEntry
					found = true
					break
				}
			}
		}
		if !found {
			// 首次发现此问题：创建条目，开始计时
			updated = updated.WithoutWorkspace(w.ID)
			updated = updated.WithEntry(key, state.AttentionEntry{
				Key:         key,
				FirstSeenAt: now,
			})
			continue
		}

		// 已存在条目
		if existing.NotifiedAt != nil {
			// 检查是否应该弹框（叠加提醒）
			if !t.shouldShowDialog(existing, now) {
				continue
			}
		}

		// 检查是否已确认稳定
		if existing.ConfirmedAt == nil {
			// 首次确认：检查是否已超时（从首次发现到现在）
			elapsedFromFirstSeen := now.Sub(existing.FirstSeenAt)
			if elapsedFromFirstSeen >= threshold {
				// 已超时：立即通知
				notifiedAt := now
				updated = updated.WithEntry(key, state.AttentionEntry{
					Key:           existing.Key,
					FirstSeenAt:   existing.FirstSeenAt,
					ConfirmedAt:   &now,
					NotifiedAt:    &notifiedAt,
					LastAlertedAt: &now,
				})
				toNotify = append(toNotify, TrackedWorkspace{
					Workspace:      w,
					ElapsedMinutes: int(elapsedFromFirstSeen.Minutes()),
				})
			} else {
				// 未超时：设置 ConfirmedAt，从现在起计算阈值
				confirmedAt := now
				updated = updated.WithEntry(key, state.AttentionEntry{
					Key:         existing.Key,
					FirstSeenAt: existing.FirstSeenAt,
					ConfirmedAt: &confirmedAt,
					NotifiedAt:  existing.NotifiedAt,
				})
			}
			continue
		}

		// 已确认稳定，检查是否达到阈值
		elapsed := now.Sub(*existing.ConfirmedAt)
		if elapsed < threshold {
			// 仍在宽限期内，继续等待
			continue
		}

		// 检查是否应该弹框（叠加提醒）
		if !t.shouldShowDialog(existing, now) {
			continue
		}

		// 达到阈值：标记为已通知，加入待通知列表
		notifiedAt := now
		updated = updated.WithEntry(key, state.AttentionEntry{
			Key:           existing.Key,
			FirstSeenAt:   existing.FirstSeenAt,
			ConfirmedAt:   existing.ConfirmedAt,
			NotifiedAt:    &notifiedAt,
			LastAlertedAt: &now,
		})
		// 通知时计算从首次发现到现在的总时长
		totalElapsed := now.Sub(existing.FirstSeenAt)
		toNotify = append(toNotify, TrackedWorkspace{
			Workspace:      w,
			ElapsedMinutes: int(totalElapsed.Minutes()),
		})
	}

	t.current = updated
	return toNotify
}

// GetState 返回当前跟踪状态，供调用者持久化到磁盘
func (t *Tracker) GetState() state.AppState {
	return t.current
}

// notificationKey 为工作区构建去重键
// CompletedAt 使用空字符串表示进程仍在运行中（对应 API 的 null）
func notificationKey(w api.EnrichedWorkspace) state.NotificationKey {
	completedAt := ""
	if w.Summary.LatestProcessCompletedAt != nil {
		completedAt = *w.Summary.LatestProcessCompletedAt
	}
	return state.NotificationKey{
		WorkspaceID: w.ID,
		CompletedAt: completedAt,
		UpdatedAt:   w.UpdatedAt,
	}
}

// getThreshold 根据工作区类型返回超时阈值
func (t *Tracker) getThreshold(w api.EnrichedWorkspace) int {
	if w.Summary.HasPendingApproval {
		return t.approvalThreshold
	}
	if w.Summary.HasUnseenTurns {
		return t.messageThreshold
	}
	return 0 // 不需要关注
}

// shouldShowDialog 检查是否应该弹框（基于 LastAlertedAt 和 repeatInterval）
func (t *Tracker) shouldShowDialog(entry state.AttentionEntry, now time.Time) bool {
	if entry.LastAlertedAt == nil {
		return true
	}
	elapsed := now.Sub(*entry.LastAlertedAt)
	return elapsed >= time.Duration(t.repeatInterval)*time.Minute
}
