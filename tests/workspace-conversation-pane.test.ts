import { afterEach, describe, expect, it } from "vitest";

import "../src/components/workspace-conversation-pane";
import type { WorkspaceConversationPane } from "../src/components/workspace-conversation-pane";
import type { WorkspaceQueueStatusResponse } from "../src/types";

type PaneMessage =
  | {
      kind: "message";
      sender: "user" | "ai";
      text: string;
    }
  | {
      kind: "tool";
      toolName: string;
      summary: string;
      detail: string;
      status: "running" | "success" | "error";
      statusLabel: string;
      icon: string;
    };

function createElement() {
  const element = document.createElement(
    "workspace-conversation-pane",
  ) as WorkspaceConversationPane;

  element.workspaceName = "任务 A";
  element.messages = [
    {
      kind: "message",
      sender: "ai",
      text: "这里是对话消息",
    } satisfies PaneMessage,
  ];
  element.quickButtons = ["继续执行", "总结状态"];
  element.messageDraft = "先看一下日志";
  element.currentFeedback = "消息已同步";
  element.queueStatus = {
    status: "empty",
  } as WorkspaceQueueStatusResponse;

  document.body.append(element);
  return element;
}

describe("workspace-conversation-pane", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders messages, quick buttons and composer without modal shell", async () => {
    const element = createElement();

    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain("任务 A");
    expect(element.shadowRoot?.textContent).toContain("这里是对话消息");
    expect(element.shadowRoot?.textContent).toContain("继续执行");
    expect(element.shadowRoot?.querySelector(".message-input")).not.toBeNull();
    expect(element.shadowRoot?.textContent).toContain("消息已同步");
  });
});
