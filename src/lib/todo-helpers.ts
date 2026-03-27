import {
  fetchWorkspaceTodos,
  updateWorkspaceTodo,
} from "./http-api";

/**
 * 处理待办选中：先标记完成，再发送到对话。
 * 避免发送成功但标记失败导致重复发送。
 */
export async function handleTodoSelectedAndSend(options: {
  baseUrl: string;
  apiKey?: string;
  workspaceId: string;
  todoId: string;
  content: string;
  sendAction: () => Promise<void>;
  refreshCount: (workspaceId: string) => void;
}): Promise<void> {
  const { baseUrl, apiKey, workspaceId, todoId, content, sendAction, refreshCount } = options;

  // 先标记完成，确保状态一致性
  try {
    await updateWorkspaceTodo({
      baseUrl,
      apiKey,
      workspaceId,
      todoId,
      content,
      isCompleted: true,
    });
  } catch {
    // 标记失败不阻塞发送，但刷新计数以保持一致性
    refreshCount(workspaceId);
  }

  // 再发送到对话
  await sendAction();

  // 刷新待办计数
  refreshCount(workspaceId);
}

/**
 * 加载待办待处理数量
 */
export async function loadTodoPendingCount(options: {
  baseUrl: string;
  apiKey?: string;
  workspaceId: string;
}): Promise<number> {
  try {
    const response = await fetchWorkspaceTodos({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      workspaceId: options.workspaceId,
    });
    return response.pending_count ?? 0;
  } catch {
    return 0;
  }
}
