import { describe, expect, it } from "vitest";

import type { DialogMessage } from "../src/lib/dialog-messages";
import {
  resolveWorkspacePaneLayoutMode,
  summarizeWorkspacePreview,
} from "../src/web/workspace-pane-layout";

describe("workspace pane layout", () => {
  it("keeps grid layout for ultra-wide screens or a single pane", () => {
    expect(resolveWorkspacePaneLayoutMode(1920, 4)).toBe("grid");
    expect(resolveWorkspacePaneLayoutMode(1440, 1)).toBe("grid");
  });

  it("uses focus layout for smaller and mid-wide desktop screens with multiple panes", () => {
    expect(resolveWorkspacePaneLayoutMode(1279, 2)).toBe("focus");
    expect(resolveWorkspacePaneLayoutMode(1200, 4)).toBe("focus");
    expect(resolveWorkspacePaneLayoutMode(1440, 4)).toBe("focus");
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
      "第三条最终结论",
      "第二条补充说明",
      "第一条关键进展",
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

  it("counts only text messages toward the 10 preview lines", () => {
    const messages: DialogMessage[] = [
      { kind: "tool", toolName: "Read", summary: "file", detail: "content", status: "success", statusLabel: "完成", icon: "R" },
      { kind: "message", sender: "ai", text: "文本 1" },
      { kind: "message", sender: "ai", text: "文本 2" },
      { kind: "tool-group", toolName: "Edit", summary: "2 commands", status: "success", statusLabel: "2 条", icon: "E", items: [] },
      { kind: "message", sender: "ai", text: "文本 3" },
      { kind: "message", sender: "ai", text: "文本 4" },
      { kind: "message", sender: "ai", text: "文本 5" },
      { kind: "tool", toolName: "todo_management", summary: "todo", detail: "todo", status: "success", statusLabel: "完成", icon: "T" },
      { kind: "message", sender: "ai", text: "文本 6" },
      { kind: "message", sender: "ai", text: "文本 7" },
      { kind: "message", sender: "ai", text: "文本 8" },
      { kind: "message", sender: "ai", text: "文本 9" },
      { kind: "message", sender: "ai", text: "文本 10" },
      { kind: "message", sender: "ai", text: "文本 11" },
    ];

    expect(summarizeWorkspacePreview(messages)).toEqual([
      "文本 11",
      "文本 10",
      "文本 9",
      "文本 8",
      "文本 7",
      "文本 6",
      "文本 5",
      "文本 4",
      "文本 3",
      "文本 2",
    ]);
  });

  it("truncates preview text at 250 characters", () => {
    const withinLimit = "甲".repeat(250);
    const overLimit = "乙".repeat(251);
    const messages: DialogMessage[] = [
      { kind: "message", sender: "ai", text: withinLimit },
      { kind: "message", sender: "ai", text: overLimit },
    ];

    expect(summarizeWorkspacePreview(messages)).toEqual([
      `${"乙".repeat(249)}…`,
      withinLimit,
    ]);
  });
});
