import { afterEach, describe, expect, it } from "vitest";

import "../src/components/workspace-conversation-pane";
import type { WorkspaceConversationPane } from "../src/components/workspace-conversation-pane";
import { cardStyles } from "../src/styles";
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

  it("scrolls the message list to the bottom when messages change", async () => {
    const element = createElement();

    await element.updateComplete;

    const messageList = element.shadowRoot?.querySelector(".message-list") as HTMLDivElement;
    Object.defineProperty(messageList, "scrollHeight", {
      configurable: true,
      value: 480,
    });
    messageList.scrollTop = 0;

    element.messages = [
      ...element.messages,
      {
        kind: "message",
        sender: "ai",
        text: "新的同步消息",
      } satisfies PaneMessage,
    ];
    await element.updateComplete;

    expect(messageList.scrollTop).toBe(480);
  });

  it("uses dark-friendly pane styles with fixed-height scrolling content", () => {
    const cssText = Array.isArray(cardStyles)
      ? cardStyles.map((style) => style.cssText).join("\n")
      : cardStyles.cssText;

    expect(cssText).toContain(".message-list");
    expect(cssText).toContain("overflow-y: auto");
    expect(cssText).toContain("height: 100%");
    expect(cssText).toContain("var(--card-background-color, #111827)");
    expect(cssText).toContain("var(--secondary-background-color, #1e293b)");
  });
});
