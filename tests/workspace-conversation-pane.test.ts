import { afterEach, describe, expect, it, vi } from "vitest";

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
      command?: string;
      changes?: Array<{
        action: "write" | "edit" | "delete" | "rename";
        unified_diff?: string;
        content?: string;
        new_path?: string;
      }>;
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
  (element as WorkspaceConversationPane & { statusAccentClass?: string }).statusAccentClass =
    "is-running";
  element.queueStatus = {
    status: "empty",
  } as WorkspaceQueueStatusResponse;
  (element as WorkspaceConversationPane & { devServerState?: string }).devServerState = "idle";
  (element as WorkspaceConversationPane & { showDevServerPreview?: boolean }).showDevServerPreview =
    false;

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

  it("applies status accent class to the pane shell", async () => {
    const element = createElement();
    (element as WorkspaceConversationPane & { statusAccentClass?: string }).statusAccentClass =
      "is-attention";

    await element.updateComplete;

    expect(
      element.shadowRoot?.querySelector(".workspace-pane-shell")?.classList.contains("is-attention"),
    ).toBe(true);
  });

  it("keeps feedback space reserved when there is no current feedback", async () => {
    const element = createElement();
    element.currentFeedback = "";

    await element.updateComplete;

    const feedback = element.shadowRoot?.querySelector(".dialog-feedback.is-empty");
    expect(feedback).not.toBeNull();
    expect(feedback?.textContent).toContain("\u00a0");
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

    expect(cssText).toContain(".task-card {\n    --task-card-accent");
    expect(cssText).toContain("display: grid");
    expect(cssText).toContain("gap: 6px");
    expect(cssText).toContain(".task-meta");
    expect(cssText).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
    expect(cssText).toContain(".meta-status,\n  .meta-files");
    expect(cssText).toContain(".relative-time");
    expect(cssText).toContain(".message-list");
    expect(cssText).toContain("overflow-y: auto");
    expect(cssText).toContain("height: 100%");
    expect(cssText).toContain("var(--card-background-color, #111827)");
    expect(cssText).toContain("var(--secondary-background-color, #1e293b)");
    expect(cssText).toContain(".workspace-pane-shell.is-idle");
    expect(cssText).toContain(".workspace-pane-shell.is-running");
    expect(cssText).toContain(".workspace-pane-shell.is-attention");
    expect(cssText).toContain("@media (max-width: 640px)");
    expect(cssText).not.toContain(".task-meta {\n       grid-template-columns: 1fr;");
    expect(cssText).not.toContain(".meta-files {\n      justify-self: start;");
  });

  it("renders tool messages with expandable detail and file changes", async () => {
    const element = createElement();
    element.messages = [
      {
        kind: "tool",
        toolName: "修改文件",
        summary: "src/demo.ts",
        detail: "已更新按钮文案",
        status: "success",
        statusLabel: "完成",
        icon: "✏️",
        changes: [
          {
            action: "edit",
            unified_diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
          },
        ],
      } satisfies PaneMessage,
    ];

    await element.updateComplete;

    const toggle = element.shadowRoot?.querySelector(".message-tool-button");
    expect(toggle?.textContent).toContain("修改文件");
    expect(toggle?.textContent).toContain("src/demo.ts");
    expect(element.shadowRoot?.textContent).not.toContain("console.log('new')");

    (toggle as HTMLButtonElement).click();
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain("已更新按钮文案");
    expect(element.shadowRoot?.textContent).toContain("编辑");
    expect(element.shadowRoot?.textContent).toContain("console.log");
  });

  it("emits send when pressing cmd+enter in the composer", async () => {
    const element = createElement();
    const actionListener = vi.fn();
    element.addEventListener("action-click", actionListener);

    await element.updateComplete;

    const input = element.shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement;
    const keydownEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      composed: true,
      cancelable: true,
      metaKey: true,
    });

    input.dispatchEvent(keydownEvent);

    expect(actionListener).toHaveBeenCalledTimes(1);
    expect(actionListener.mock.calls[0]?.[0]).toMatchObject({
      detail: "send",
    });
    expect(keydownEvent.defaultPrevented).toBe(true);
  });

  it("renders a gray play control in the header when dev server is idle", async () => {
    const element = createElement();

    await element.updateComplete;

    const toggle = element.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;
    const preview = element.shadowRoot?.querySelector(".dialog-dev-server-preview");

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("data-dev-server-state")).toBe("idle");
    expect(toggle?.textContent).toContain("▶");
    expect(preview).toBeNull();
  });

  it("renders a pause control and preview button in the header when dev server is running", async () => {
    const element = createElement();
    (element as WorkspaceConversationPane & { devServerState?: string }).devServerState = "running";
    (element as WorkspaceConversationPane & { showDevServerPreview?: boolean }).showDevServerPreview =
      true;

    await element.updateComplete;

    const toggle = element.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;
    const preview = element.shadowRoot?.querySelector(
      ".dialog-dev-server-preview",
    ) as HTMLButtonElement | null;

    expect(toggle?.getAttribute("data-dev-server-state")).toBe("running");
    expect(toggle?.textContent).toContain("❚❚");
    expect(preview).not.toBeNull();
  });

  it("renders the workspace web preview entry as a gray svg icon without emoji background", async () => {
    const element = createElement();
    (element as WorkspaceConversationPane & { showWorkspaceWebPreview?: boolean }).showWorkspaceWebPreview =
      true;

    await element.updateComplete;

    const button = element.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement | null;
    const icon = button?.querySelector(".dialog-web-preview-icon");

    expect(button).not.toBeNull();
    expect(icon?.tagName).toBe("svg");
    expect(button?.textContent).not.toContain("🌐");
  });

  it("declares transparent header controls and a red running dev server toggle", () => {
    const cssText = Array.isArray(cardStyles)
      ? cardStyles.map((style) => style.cssText).join("\n")
      : cardStyles.cssText;

    expect(cssText).toContain(".dialog-dev-server-toggle");
    expect(cssText).toContain("background: transparent");
    expect(cssText).toContain(".dialog-dev-server-toggle[data-dev-server-state=\"running\"]");
    expect(cssText).toContain("color: var(--error-color, #f87171)");
  });

  it("emits dedicated header events for dev server toggle and preview open", async () => {
    const element = createElement();
    (element as WorkspaceConversationPane & { devServerState?: string }).devServerState = "running";
    (element as WorkspaceConversationPane & { showDevServerPreview?: boolean }).showDevServerPreview =
      true;
    const toggleListener = vi.fn();
    const previewListener = vi.fn();
    element.addEventListener("dev-server-toggle", toggleListener);
    element.addEventListener("dev-server-preview-toggle", previewListener);

    await element.updateComplete;

    (element.shadowRoot?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement).click();
    (element.shadowRoot?.querySelector(".dialog-dev-server-preview") as HTMLButtonElement).click();

    expect(toggleListener).toHaveBeenCalledTimes(1);
    expect(previewListener).toHaveBeenCalledTimes(1);
  });

  it("marks a targeted assistant message with smooth reveal styling", async () => {
    const element = createElement();
    element.messages = [
      {
        key: "msg-1",
        kind: "message",
        sender: "ai",
        text: "新的后台同步消息",
      } satisfies PaneMessage & { key: string },
    ];
    (element as WorkspaceConversationPane & { smoothRevealMessageKey?: string }).smoothRevealMessageKey = "msg-1";

    await element.updateComplete;

    const bubble = element.shadowRoot?.querySelector(".message-bubble.is-smooth-reveal");
    expect(bubble?.textContent).toContain("新的后台同步消息");
  });
});
