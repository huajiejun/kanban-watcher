import type { KanbanEntityAttributes, KanbanWorkspace } from "../types";

export const previewEntityId = "sensor.kanban_watcher_kanban_watcher";

type PreviewHass = {
  states: Record<string, { attributes: KanbanEntityAttributes }>;
};

function createPreviewWorkspaces(): KanbanWorkspace[] {
  return [
    {
      id: "approval-needed",
      name: "兑换确认待审批",
      status: "completed",
      has_pending_approval: true,
      has_unseen_turns: true,
      files_changed: 4,
      lines_added: 18,
      lines_removed: 6,
      relative_time: "刚刚",
    },
    {
      id: "running-active",
      name: "批量同步运行中",
      status: "running",
      has_running_dev_server: true,
      files_changed: 9,
      lines_added: 56,
      lines_removed: 14,
      relative_time: "2 分钟前",
    },
    {
      id: "idle-completed",
      name: "常规兑换已完成",
      status: "completed",
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
      latest_process_status: "failed",
      has_unseen_turns: true,
      files_changed: 3,
      lines_added: 12,
      lines_removed: 9,
      relative_time: "35 分钟前",
    },
  ];
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
    },
  };
}
