import { describe, expect, it } from "vitest";
import { groupWorkspaces } from "../src/lib/group-workspaces";
import type { KanbanEntityAttributes, KanbanWorkspace } from "../src/types";

describe("groupWorkspaces", () => {
  it("groups completed unseen, running, and other workspaces from a typed entity fixture", () => {
    const workspaces: KanbanWorkspace[] = [
      {
        id: "attention-1",
        name: "Attention",
        status: "completed",
        has_unseen_turns: true,
      },
      {
        id: "running-1",
        name: "Running",
        status: "running",
      },
      {
        id: "idle-1",
        name: "Idle",
        status: "completed",
        completed_at: "2026-03-21T00:00:00Z",
      },
    ];

    const entity: KanbanEntityAttributes = {
      count: 3,
      attention_count: 1,
      updated_at: "2026-03-21T01:00:00Z",
      workspaces,
    };

    expect(groupWorkspaces(entity.workspaces)).toEqual({
      attention: [workspaces[0]],
      running: [workspaces[1]],
      idle: [workspaces[2]],
    });
  });

  it("routes completed workspaces with unseen turns into attention", () => {
    const workspaces: KanbanWorkspace[] = [
      {
        id: "completed-unseen-1",
        name: "Completed Unseen",
        status: "completed",
        has_unseen_turns: true,
      },
    ];

    expect(groupWorkspaces(workspaces)).toEqual({
      attention: [workspaces[0]],
      running: [],
      idle: [],
    });
  });

  it("keeps running workspaces in running even when they have unseen turns", () => {
    const workspaces: KanbanWorkspace[] = [
      {
        id: "running-unseen-1",
        name: "Running Unseen",
        status: "running",
        has_unseen_turns: true,
      },
      {
        id: "running-seen-1",
        name: "Running Seen",
        status: "running",
      },
    ];

    expect(groupWorkspaces(workspaces)).toEqual({
      attention: [],
      running: [workspaces[0], workspaces[1]],
      idle: [],
    });
  });

  it("routes pending approval workspaces into attention even when they are running", () => {
    const workspaces: KanbanWorkspace[] = [
      {
        id: "running-pending-approval-1",
        name: "Running Pending Approval",
        status: "running",
        has_pending_approval: true,
      },
    ];

    expect(groupWorkspaces(workspaces)).toEqual({
      attention: [workspaces[0]],
      running: [],
      idle: [],
    });
  });

  it("keeps empty sections as empty arrays", () => {
    expect(groupWorkspaces([])).toEqual({
      attention: [],
      running: [],
      idle: [],
    });
  });

  it("keeps killed workspaces in idle for abnormal but non-attention display", () => {
    const workspaces: KanbanWorkspace[] = [
      {
        id: "killed-1",
        name: "Killed Workspace",
        status: "completed",
        latest_process_status: "killed",
      },
    ];

    expect(groupWorkspaces(workspaces)).toEqual({
      attention: [],
      running: [],
      idle: [workspaces[0]],
    });
  });
});
