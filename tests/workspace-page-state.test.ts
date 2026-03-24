import { describe, expect, it } from "vitest";

import {
  createWorkspacePageState,
  dismissWorkspacePane,
  openWorkspacePane,
  reconcileWorkspacePageState,
} from "../src/web/workspace-page-state";
import type { KanbanWorkspace } from "../src/types";

function createWorkspace(
  id: string,
  overrides: Partial<KanbanWorkspace> = {},
): KanbanWorkspace {
  return {
    id,
    name: `任务 ${id}`,
    status: "running",
    updated_at: "2026-03-24T12:00:00Z",
    ...overrides,
  };
}

describe("workspace page state", () => {
  it("does not auto-open existing attention workspaces on first load", () => {
    const next = reconcileWorkspacePageState(
      createWorkspacePageState(),
      [createWorkspace("ws-1", { needs_attention: true })],
    );

    expect(next.openWorkspaceIds).toEqual([]);
    expect(next.previousAttentionMap).toEqual({ "ws-1": true });
  });

  it("auto-opens when a workspace newly enters attention", () => {
    const initial = reconcileWorkspacePageState(
      createWorkspacePageState(),
      [createWorkspace("ws-1", { needs_attention: false })],
    );

    const next = reconcileWorkspacePageState(initial, [
      createWorkspace("ws-1", { needs_attention: true }),
    ]);

    expect(next.openWorkspaceIds).toEqual(["ws-1"]);
    expect(next.activeWorkspaceId).toBe("ws-1");
  });

  it("does not auto-open a manually dismissed attention workspace on ordinary refresh", () => {
    const entered = reconcileWorkspacePageState(
      reconcileWorkspacePageState(createWorkspacePageState(), [
        createWorkspace("ws-1", { needs_attention: false }),
      ]),
      [createWorkspace("ws-1", { needs_attention: true })],
    );

    const dismissed = dismissWorkspacePane(entered, "ws-1", true);
    const refreshed = reconcileWorkspacePageState(dismissed, [
      createWorkspace("ws-1", { needs_attention: true }),
    ]);

    expect(refreshed.openWorkspaceIds).toEqual([]);
    expect(refreshed.dismissedAttentionIds).toContain("ws-1");
  });

  it("re-opens after a workspace leaves attention and enters attention again", () => {
    const entered = reconcileWorkspacePageState(
      reconcileWorkspacePageState(createWorkspacePageState(), [
        createWorkspace("ws-1", { needs_attention: false }),
      ]),
      [createWorkspace("ws-1", { needs_attention: true })],
    );

    const dismissed = dismissWorkspacePane(entered, "ws-1", true);
    const cleared = reconcileWorkspacePageState(dismissed, [
      createWorkspace("ws-1", { needs_attention: false }),
    ]);
    const reentered = reconcileWorkspacePageState(cleared, [
      createWorkspace("ws-1", { needs_attention: true }),
    ]);

    expect(reentered.openWorkspaceIds).toEqual(["ws-1"]);
    expect(reentered.dismissedAttentionIds).toEqual([]);
  });

  it("replaces the oldest open workspace when opening the fifth pane", () => {
    const base = createWorkspacePageState({
      openWorkspaceIds: ["ws-1", "ws-2", "ws-3", "ws-4"],
      activeWorkspaceId: "ws-4",
    });

    const next = openWorkspacePane(base, "ws-5");

    expect(next.openWorkspaceIds).toEqual(["ws-2", "ws-3", "ws-4", "ws-5"]);
    expect(next.activeWorkspaceId).toBe("ws-5");
  });
});
