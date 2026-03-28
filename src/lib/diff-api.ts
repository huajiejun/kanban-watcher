import type { Diff, DiffStats, RepoBranchStatus } from "../types";

type RequestOptions = {
  baseUrl: string;
  apiKey?: string;
};

function buildHeaders(apiKey?: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

function normalizeBaseUrl(baseUrl: string) {
  if (!baseUrl) {
    return "";
  }
  return baseUrl.replace(/\/+$/, "");
}

async function fetchJSON<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `请求失败（${response.status}）`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * 获取工作区分支状态（包含差异统计）
 */
export async function fetchWorkspaceBranchStatus({
  baseUrl,
  apiKey,
  workspaceId,
}: RequestOptions & {
  workspaceId: string;
}): Promise<RepoBranchStatus[]> {
  const response = await fetchJSON<{
    success?: boolean;
    data?: RepoBranchStatus[];
    message?: string;
  }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/git/status`,
    {
      method: "GET",
      headers: buildHeaders(apiKey),
    },
  );

  if (!response.success) {
    throw new Error(response.message || "获取分支状态失败");
  }

  return response.data || [];
}

/**
 * 格式化差异统计为简短文本
 */
export function formatDiffStats(stats: DiffStats | undefined): string {
  if (!stats || stats.files_changed === 0) {
    return "";
  }

  const parts: string[] = [];

  if (stats.files_changed > 0) {
    parts.push(`${stats.files_changed} 文件`);
  }

  if (stats.lines_added > 0 || stats.lines_removed > 0) {
    parts.push(`+${stats.lines_added}/-${stats.lines_removed}`);
  }

  return parts.join(", ");
}

/**
 * 计算差异总计
 */
export function sumDiffStats(statsList: DiffStats[]): DiffStats {
  const result: DiffStats = {
    files_changed: 0,
    lines_added: 0,
    lines_removed: 0,
  };

  for (const stats of statsList) {
    result.files_changed += stats.files_changed;
    result.lines_added += stats.lines_added;
    result.lines_removed += stats.lines_removed;
  }

  return result;
}

/**
 * 从分支状态中提取差异统计
 */
export function extractDiffStatsFromBranchStatus(
  branchStatusList: RepoBranchStatus[],
): DiffStats {
  const result: DiffStats = {
    files_changed: 0,
    lines_added: 0,
    lines_removed: 0,
  };

  for (const repo of branchStatusList) {
    if (repo.status.has_uncommitted_changes) {
      result.files_changed += repo.status.uncommitted_count;
    }
  }

  return result;
}

// ───────────────────────────────────────────
// WebSocket Diff Stream
// ───────────────────────────────────────────

/**
 * 后端 LogMsg 枚举序列化格式：
 * - JsonPatch: { "JsonPatch": Patch } 其中 Patch 是 RFC 6902 操作数组
 * - Ready: { "Ready": true }
 * - Finished: { "finished": true }
 *
 * 每个 patch 操作的 value 是 PatchType（SCREAMING_SNAKE_CASE）：
 * { "type": "DIFF", "content": { change, oldPath, ... } }
 */

type WsPatchOp = {
  op: string;
  path: string;
  value?: {
    type: string;
    content?: Diff;
  };
};

type WsMessage =
  | { JsonPatch: WsPatchOp[] }
  | { Ready: boolean }
  | { finished: boolean };

function toDiffWsUrl(baseUrl: string, workspaceId: string, apiKey?: string) {
  const normalized = baseUrl ? baseUrl.replace(/\/+$/, "") : window.location.origin;
  const url = new URL(`${normalized}/api/workspaces/${workspaceId}/git/diff/ws`);
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol === "http:") {
    url.protocol = "ws:";
  }
  return url.toString();
}

export type DiffStreamCallbacks = {
  onDiff: (diff: Diff) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

/**
 * 连接 WebSocket diff 流，收集文件差异列表
 * 返回关闭函数
 */
export function connectDiffStream(
  baseUrl: string,
  workspaceId: string,
  apiKey: string | undefined,
  callbacks: DiffStreamCallbacks,
): () => void {
  const url = toDiffWsUrl(baseUrl, workspaceId, apiKey);
  const socket = new WebSocket(url);

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as WsMessage;
      if ("JsonPatch" in msg && Array.isArray(msg.JsonPatch)) {
        for (const op of msg.JsonPatch) {
          if (op.value?.type === "DIFF" && op.value.content) {
            callbacks.onDiff(op.value.content);
          }
        }
      }
    } catch {
      // ignore invalid payload
    }
  };

  socket.onerror = () => {
    callbacks.onError?.(new Error("Diff 流连接失败"));
  };

  socket.onclose = () => {
    callbacks.onClose?.();
  };

  return () => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  };
}
