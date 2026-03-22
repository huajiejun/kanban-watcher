import { describe, expect, it } from "vitest";
import { createPreviewHass, previewEntityId } from "../src/dev/preview-fixture";

describe("preview fixture", () => {
  it("provides a local hass fixture that covers all workspace sections", () => {
    const hass = createPreviewHass();
    const workspaces = hass.states[previewEntityId]?.attributes?.workspaces;

    expect(Array.isArray(workspaces)).toBe(true);
    expect(workspaces).toHaveLength(4);
    expect(workspaces?.some((workspace) => workspace.has_unseen_turns)).toBe(true);
    expect(workspaces?.some((workspace) => workspace.status === "running")).toBe(true);
    expect(workspaces?.some((workspace) => workspace.has_pending_approval)).toBe(true);
    expect(workspaces?.some((workspace) => workspace.completed_at)).toBe(true);
  });
});
