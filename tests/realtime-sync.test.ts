import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/http-api", () => ({
  fetchVibeInfo: vi.fn(),
}));

import type { KanbanWorkspace } from "../src/types";
import {
  ACTIVE_PANE_MESSAGE_TYPES,
  didSelectedWorkspaceMessageVersionChange,
  didSelectedWorkspaceSessionChange,
  getSelectedWorkspaceSessionId,
  getWorkspaceMessageVersion,
  getWorkspaceSessionId,
  loadRealtimeRuntimeInfo,
} from "../src/lib/realtime-sync";
import { fetchVibeInfo } from "../src/lib/http-api";

const fetchVibeInfoMock = vi.mocked(fetchVibeInfo);

describe("realtime-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads preview proxy port and realtime base url from vibe info", async () => {
    fetchVibeInfoMock.mockResolvedValue({
      success: true,
      data: {
        config: {
          preview_proxy_port: 53480,
        },
        realtime: {
          base_url: "http://127.0.0.1:7778",
        },
      },
    });

    await expect(loadRealtimeRuntimeInfo({
      baseUrl: "http://127.0.0.1:18842",
      apiKey: "test-api-key",
    })).resolves.toEqual({
      previewProxyPort: 53480,
      realtimeBaseUrl: "http://127.0.0.1:7778",
    });
  });

  it("falls back to the current base url when realtime base url is missing", async () => {
    fetchVibeInfoMock.mockResolvedValue({
      success: true,
      data: {
        config: {},
        realtime: {},
      },
    });

    await expect(loadRealtimeRuntimeInfo({
      baseUrl: "http://127.0.0.1:18842",
      apiKey: "test-api-key",
    })).resolves.toEqual({
      previewProxyPort: undefined,
      realtimeBaseUrl: "http://127.0.0.1:18842",
    });
  });

  it("falls back to the current base url when vibe info request fails", async () => {
    fetchVibeInfoMock.mockRejectedValue(new Error("boom"));

    await expect(loadRealtimeRuntimeInfo({
      baseUrl: "http://127.0.0.1:18842",
      apiKey: "test-api-key",
    })).resolves.toEqual({
      previewProxyPort: undefined,
      realtimeBaseUrl: "http://127.0.0.1:18842",
    });
  });

  it("exposes the shared active pane message types", () => {
    expect(ACTIVE_PANE_MESSAGE_TYPES).toEqual([
      "assistant_message",
      "user_message",
      "error_message",
      "tool_use",
    ]);
  });

  it("extracts workspace session ids consistently", () => {
    const workspace: KanbanWorkspace = {
      id: "ws-1",
      name: "任务一",
      status: "running",
      latest_session_id: "session-latest",
      last_session_id: "session-last",
    };

    expect(getWorkspaceSessionId(workspace)).toBe("session-latest");
    expect(getSelectedWorkspaceSessionId("ws-1", [workspace])).toBe("session-latest");
    expect(getSelectedWorkspaceSessionId("missing", [workspace])).toBeUndefined();
  });

  it("extracts workspace message versions consistently", () => {
    const workspace: KanbanWorkspace = {
      id: "ws-1",
      name: "任务一",
      status: "running",
      latest_session_id: "session-latest",
      updated_at: "2026-03-28T09:00:00Z",
      last_message_at: "2026-03-28T09:01:00Z",
    };

    expect(getWorkspaceMessageVersion(workspace)).toBe("2026-03-28T09:01:00Z");
    expect(getWorkspaceMessageVersion({
      ...workspace,
      last_message_at: undefined,
    })).toBe("2026-03-28T09:00:00Z");
  });

  it("detects selected workspace session changes", () => {
    const previousWorkspaces: KanbanWorkspace[] = [
      {
        id: "ws-1",
        name: "任务一",
        status: "running",
        latest_session_id: "session-1",
      },
    ];
    const currentWorkspaces: KanbanWorkspace[] = [
      {
        id: "ws-1",
        name: "任务一",
        status: "running",
        latest_session_id: "session-2",
      },
    ];

    expect(didSelectedWorkspaceSessionChange({
      previousSelectedWorkspaceId: "ws-1",
      previousWorkspaces,
      currentSelectedWorkspaceId: "ws-1",
      currentWorkspaces,
    })).toBe(true);

    expect(didSelectedWorkspaceSessionChange({
      previousSelectedWorkspaceId: "ws-1",
      previousWorkspaces,
      currentSelectedWorkspaceId: "ws-1",
      currentWorkspaces: previousWorkspaces,
    })).toBe(false);
  });

  it("detects selected workspace message version changes", () => {
    const previousWorkspaces: KanbanWorkspace[] = [
      {
        id: "ws-1",
        name: "任务一",
        status: "running",
        latest_session_id: "session-1",
        last_message_at: "2026-03-28T09:00:00Z",
      },
    ];
    const currentWorkspaces: KanbanWorkspace[] = [
      {
        id: "ws-1",
        name: "任务一",
        status: "running",
        latest_session_id: "session-1",
        last_message_at: "2026-03-28T09:01:00Z",
      },
    ];

    expect(didSelectedWorkspaceMessageVersionChange({
      previousSelectedWorkspaceId: "ws-1",
      previousWorkspaces,
      currentSelectedWorkspaceId: "ws-1",
      currentWorkspaces,
    })).toBe(true);

    expect(didSelectedWorkspaceMessageVersionChange({
      previousSelectedWorkspaceId: "ws-1",
      previousWorkspaces,
      currentSelectedWorkspaceId: "ws-1",
      currentWorkspaces: previousWorkspaces,
    })).toBe(false);
  });
});
