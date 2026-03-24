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
	current          state.AppState // 当前跟踪状态
	thresholdMinutes int            // 通知阈值（分钟）
}

// NewTracker 使用持久化状态创建跟踪器
// 启动时从磁盘加载上次保存的状态，确保跨进程去重
func NewTracker(s state.AppState, thresholdMinutes int) *Tracker {
	// 兼容性迁移：检查所有 ConfirmedAt 为 nil 的旧记录
	threshold := time.Duration(thresholdMinutes) * time.Minute
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
		current:          s,
		thresholdMinutes: thresholdMinutes,
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
	threshold := time.Duration(t.thresholdMinutes) * time.Minute

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

		// 工作区需要关注：检查是否已跟踪
		existing, found := updated.Entries[key]
		if !found {
			// 首次发现此问题：创建条目，开始计时
			updated = updated.WithEntry(key, state.AttentionEntry{
				Key:         key,
				FirstSeenAt: now,
			})
			continue
		}

		// 已存在条目
		if existing.NotifiedAt != nil {
			// 已发送过通知，跳过（去重）
			continue
		}

		// 检查是否已确认稳定
		if existing.ConfirmedAt == nil {
			// 首次确认：检查是否已超时（从首次发现到现在）
			elapsedFromFirstSeen := now.Sub(existing.FirstSeenAt)
			if elapsedFromFirstSeen >= threshold {
				// 已超时：立即通知
				notifiedAt := now
				updated = updated.WithEntry(key, state.AttentionEntry{
					Key:         existing.Key,
					FirstSeenAt: existing.FirstSeenAt,
					ConfirmedAt: &now,
					NotifiedAt:  &notifiedAt,
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

		// 达到阈值：标记为已通知，加入待通知列表
		notifiedAt := now
		updated = updated.WithEntry(key, state.AttentionEntry{
			Key:         existing.Key,
			FirstSeenAt: existing.FirstSeenAt,
			ConfirmedAt:  existing.ConfirmedAt,
			NotifiedAt:  &notifiedAt,
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
	}
}
