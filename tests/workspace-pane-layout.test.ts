import { describe, expect, it } from "vitest";

import type { DialogMessage } from "../src/lib/dialog-messages";
import {
  resolveWorkspacePaneLayoutMode,
  summarizeWorkspacePreview,
} from "../src/web/workspace-pane-layout";

describe("workspace pane layout", () => {
  it("keeps grid layout for wide screens or a single pane", () => {
    expect(resolveWorkspacePaneLayoutMode(1440, 4)).toBe("grid");
    expect(resolveWorkspacePaneLayoutMode(1440, 1)).toBe("grid");
  });

  it("uses focus layout for smaller desktop screens with multiple panes", () => {
    expect(resolveWorkspacePaneLayoutMode(1279, 2)).toBe("focus");
    expect(resolveWorkspacePaneLayoutMode(1200, 4)).toBe("focus");
  });

  it("summarizes the latest plain text messages and skips tool noise", () => {
    const messages: DialogMessage[] = [
      { kind: "tool", toolName: "Read", summary: "file", detail: "content", status: "success", statusLabel: "完成", icon: "R" },
      { kind: "message", sender: "ai", text: "第一条关键进展" },
      { kind: "message", sender: "user", text: "第二条补充说明" },
      { kind: "tool-group", toolName: "Edit", summary: "2 commands", status: "success", statusLabel: "2 条", icon: "E", items: [] },
      { kind: "message", sender: "ai", text: "第三条最终结论" },
    ];

    expect(summarizeWorkspacePreview(messages)).toEqual([
      "第一条关键进展",
      "第二条补充说明",
      "第三条最终结论",
    ]);
  });

  it("falls back to the latest tool label when there is no text message", () => {
    const messages: DialogMessage[] = [
      { kind: "tool-group", toolName: "Edit", summary: "2 commands", status: "success", statusLabel: "2 条", icon: "E", items: [] },
    ];

    expect(summarizeWorkspacePreview(messages)).toEqual(["最近活动: Edit"]);
  });

  it("preserves markdown structure in preview text", () => {
    const messages: DialogMessage[] = [
      { kind: "message", sender: "ai", text: "# 标题\n- 列表一\n- 列表二" },
    ];

    expect(summarizeWorkspacePreview(messages)).toEqual(["# 标题\n- 列表一\n- 列表二"]);
  });
});
