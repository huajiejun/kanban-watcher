import type {
  KanbanEntityAttributes,
  KanbanSessionAttributes,
  KanbanWorkspace,
} from "../types";

export const previewEntityId = "sensor.kanban_watcher_kanban_watcher";

type PreviewHass = {
  states: Record<string, { attributes: KanbanEntityAttributes | KanbanSessionAttributes }>;
};

function createPreviewWorkspaces(): KanbanWorkspace[] {
  return [
    {
      id: "approval-needed",
      name: "消息确认待审批",
      status: "completed",
      latest_session_id: "preview-session-approval-needed",
      has_pending_approval: true,
      has_unseen_turns: true,
      files_changed: 4,
      lines_added: 18,
      lines_removed: 6,
      relative_time: "刚刚",
    },
    {
      id: "running-active",
      name: "批量对话运行中",
      status: "running",
      latest_session_id: "preview-session-running-active",
      has_running_dev_server: true,
      files_changed: 9,
      lines_added: 56,
      lines_removed: 14,
      relative_time: "2 分钟前",
    },
    {
      id: "idle-completed",
      name: "常规对话已完成",
      status: "completed",
      latest_session_id: "preview-session-idle-completed",
      completed_at: "2026-03-22T11:25:00Z",
      files_changed: 2,
      lines_added: 7,
      lines_removed: 1,
      relative_time: "18 分钟前",
    },
    {
      id: "attention-failed",
      name: "失败任务待跟进",
      status: "completed",
      latest_session_id: "preview-session-attention-failed",
      latest_process_status: "failed",
      has_unseen_turns: true,
      files_changed: 3,
      lines_added: 12,
      lines_removed: 9,
      relative_time: "35 分钟前",
    },
  ];
}

function createPreviewSessions(): Record<string, { attributes: KanbanSessionAttributes }> {
  return {
    "sensor.kanban_watcher_kanban_session_preview_approval_needed": {
      attributes: {
        session_id: "preview-session-approval-needed",
        workspace_id: "approval-needed",
        workspace_name: "消息确认待审批",
        recent_messages: [
          { role: "user", content: "请先确认这个工作区的下一步安排。" },
          { role: "assistant", content: "我先整理最新状态，稍后给你结论。" },
          { role: "user", content: "如果需要审批，直接告诉我卡在哪一步。" },
          { role: "assistant", content: "目前还差最后一条确认消息，我会继续跟进。" },
          { role: "user", content: "如果下午还没有结果，就先给我一个阻塞说明。" },
          { role: "assistant", content: "可以，我会先把阻塞点、影响范围和建议处理顺序写清楚。" },
          { role: "user", content: "顺便看下是不是有人还没回复你。" },
          { role: "assistant", content: "我已经补发了一次提醒，接下来等对方确认后再继续推进。" },
          { role: "user", content: "如果对方继续没回复，就先给我一个备选方案。" },
          { role: "assistant", content: "明白，我会准备一个不依赖对方输入的降级处理方案。" },
          { role: "user", content: "晚上之前给我一个阶段性结论。" },
          { role: "assistant", content: "好的，今晚之前我会回传当前进度、阻塞点和建议动作。" },
          { role: "user", content: "如果需要我拍板，直接把选项写清楚。" },
          { role: "assistant", content: "收到，我会把可选方案整理成简短列表，方便你直接决策。" },
          { role: "user", content: "先继续推进，有更新就按这个线程同步。" },
        ],
      },
    },
    "sensor.kanban_watcher_kanban_session_preview_running_active": {
      attributes: {
        session_id: "preview-session-running-active",
        workspace_id: "running-active",
        workspace_name: "批量对话运行中",
        recent_messages: [
          { role: "user", content: "运行中的任务目前有新的输出吗？" },
          { role: "assistant", content: "有，刚刚补充了一段新的处理结果，还在继续执行。" },
          { role: "user", content: "先盯住结果，如果异常就立刻提醒我。" },
          { role: "assistant", content: "收到，我会在异常出现时第一时间同步。" },
          { role: "user", content: "日志里面如果出现重复重试，也一起带上。" },
          { role: "assistant", content: "好的，我会继续观察日志，并在下一轮输出后同步你。" },
          { role: "user", content: "如果今晚之前能跑完，就顺手帮我总结一次。" },
          { role: "assistant", content: "明白，结束后我会整理一版简短总结放在最后一条消息里。" },
          { role: "user", content: "有没有发现性能抖动或者处理延迟？" },
          { role: "assistant", content: "目前有轻微波动，但还没超过预期阈值，我会继续监控。" },
          { role: "user", content: "如果延迟继续升高，就优先保结果不要保速度。" },
          { role: "assistant", content: "了解，我会先确保结果稳定，再考虑吞吐表现。" },
          { role: "user", content: "下一轮输出后把关键日志摘给我。" },
          { role: "assistant", content: "可以，我会只保留关键片段，避免消息太长影响阅读。" },
          { role: "user", content: "继续跑，先不要中断。" },
        ],
      },
    },
    "sensor.kanban_watcher_kanban_session_preview_idle_completed": {
      attributes: {
        session_id: "preview-session-idle-completed",
        workspace_id: "idle-completed",
        workspace_name: "常规对话已完成",
        recent_messages: [
          { role: "user", content: "这个任务已经结束了吗？" },
          { role: "assistant", content: "已经结束，当前没有新的待处理动作。" },
          { role: "user", content: "那先保留记录，后续有变更再通知。" },
          { role: "assistant", content: "好的，我会保留上下文并等待下一步指令。" },
          { role: "user", content: "之前确认过的问题点也一起保留下来。" },
          { role: "assistant", content: "已记录，后续如果重新打开这个任务，我会先把这些点带出来。" },
          { role: "user", content: "那就先这样，今天不用再继续追了。" },
          { role: "assistant", content: "收到，当前先保持静默，等待新的输入。" },
          { role: "user", content: "如果有人重新提这个任务，就先提醒我历史结论。" },
          { role: "assistant", content: "可以，我会优先附上之前的结论和保留意见。" },
          { role: "user", content: "这条线程先别清掉，可能明天还要继续。" },
          { role: "assistant", content: "明白，我会保留完整上下文，方便后续直接续接。" },
          { role: "user", content: "若有新的相关消息，也合并到这里。" },
          { role: "assistant", content: "可以，相关更新我会继续归档到同一个会话中。" },
          { role: "user", content: "好，先归档但不要删除。" },
        ],
      },
    },
    "sensor.kanban_watcher_kanban_session_preview_attention_failed": {
      attributes: {
        session_id: "preview-session-attention-failed",
        workspace_id: "attention-failed",
        workspace_name: "失败任务待跟进",
        recent_messages: [
          { role: "user", content: "这个失败任务现在卡在哪里？" },
          { role: "assistant", content: "当前卡在最后一步校验，前面的处理已经完成。" },
          { role: "user", content: "先确认是不是输入条件有变化。" },
          { role: "assistant", content: "我正在回看最近一次输入，暂时没看到明显变更。" },
          { role: "user", content: "如果不是输入问题，就查执行链路。" },
          { role: "assistant", content: "明白，我会沿着执行链路逐步排查失败位置。" },
          { role: "user", content: "把你认为最可能的三个原因列出来。" },
          { role: "assistant", content: "目前优先怀疑依赖超时、重试失效和状态回写异常。" },
          { role: "user", content: "先验证最便宜的那个。" },
          { role: "assistant", content: "我会优先检查依赖超时和日志缺口，这两项验证成本最低。" },
          { role: "user", content: "如果 30 分钟内没有结果，就先发阻塞说明。" },
          { role: "assistant", content: "收到，超时后我会先给你阻塞说明和下一步建议。" },
          { role: "user", content: "别直接重跑，先搞清楚根因。" },
          { role: "assistant", content: "了解，在没有根因前我不会盲目重试。" },
          { role: "user", content: "继续查，有进展就发这里。" },
        ],
      },
    },
  };
}

export function createPreviewHass(): PreviewHass {
  return {
    states: {
      [previewEntityId]: {
        attributes: {
          count: 4,
          attention_count: 2,
          updated_at: "2026-03-22T11:43:00Z",
          workspaces: createPreviewWorkspaces(),
        },
      },
      ...createPreviewSessions(),
    },
  };
}
