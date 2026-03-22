import { describe, expect, it } from "vitest";
import { createPreviewHass, previewEntityId } from "../src/dev/preview-fixture";

describe("preview fixture", () => {
  it("provides a local hass fixture that covers all workspace sections", () => {
    const hass = createPreviewHass();
    const workspaces = hass.states[previewEntityId]?.attributes?.workspaces;
    const session = hass.states["sensor.kanban_watcher_kanban_session_4f495318"]?.attributes;

    expect(Array.isArray(workspaces)).toBe(true);
    expect(workspaces).toHaveLength(4);
    expect(workspaces?.some((workspace) => workspace.has_unseen_turns)).toBe(true);
    expect(workspaces?.some((workspace) => workspace.status === "running")).toBe(true);
    expect(workspaces?.some((workspace) => workspace.has_pending_approval)).toBe(true);
    expect(workspaces?.some((workspace) => workspace.completed_at)).toBe(true);
    expect(workspaces?.some((workspace) => workspace.latest_session_id === "4f495318-07a4-4882-b4c1-4453ea9e2818")).toBe(true);
    expect(session?.session_id).toBe("4f495318-07a4-4882-b4c1-4453ea9e2818");
  });
});
