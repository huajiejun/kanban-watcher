import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/web/workspace-home";
import {
  KanbanWorkspaceHome,
  getPaneColumns,
  resolveWorkspaceHomeMode,
} from "../src/web/workspace-home";
import { WORKSPACE_PAGE_STATE_STORAGE_KEY } from "../src/web/workspace-page-state-storage";
import { workspaceHomeStyles, workspaceSectionListStyles } from "../src/styles";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify(payload),
    }) as MessageEvent<string>);
  }

  emitClose() {
    this.onclose?.();
  }
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function readRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function flushElement(element: KanbanWorkspaceHome) {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await element.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await element.updateComplete;
}

async function waitForWorkspaceList(element: KanbanWorkspaceHome) {
  for (let index = 0; index < 5; index += 1) {
    await flushElement(element);
    if (element.shadowRoot?.querySelector(".task-card")) {
      return;
    }
  }
}

function createElement() {
  const element = document.createElement("kanban-workspace-home") as KanbanWorkspaceHome;
  document.body.append(element);
  return element;
}

describe("workspace home helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setWindowWidth(1440);
    vi.stubGlobal("WebSocket", undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("uses desktop mode for wide screens and mobile-card for narrow screens", () => {
    expect(resolveWorkspaceHomeMode(1440)).toBe("desktop");
    expect(resolveWorkspaceHomeMode(768)).toBe("mobile-card");
    expect(resolveWorkspaceHomeMode(390)).toBe("mobile-card");
  });

  it("computes responsive pane columns from the number of opened panes and width", () => {
    expect(getPaneColumns(0, 1280)).toBe(1);
    expect(getPaneColumns(1, 1280)).toBe(1);
    expect(getPaneColumns(2, 1280)).toBe(2);
    expect(getPaneColumns(3, 1280)).toBe(2);
    expect(getPaneColumns(4, 1440)).toBe(3);
    expect(getPaneColumns(4, 1920)).toBe(4);
    expect(getPaneColumns(5, 1920)).toBe(4);
  });

  it("uses the full desktop width without centering the workspace shell", () => {
    const homeCssText = Array.isArray(workspaceHomeStyles)
      ? workspaceHomeStyles.map((style) => style.cssText).join("\n")
      : workspaceHomeStyles.cssText;
    const listCssText = Array.isArray(workspaceSectionListStyles)
      ? workspaceSectionListStyles.map((style) => style.cssText).join("\n")
      : workspaceSectionListStyles.cssText;

    expect(homeCssText).toContain("--workspace-home-panel-height: calc(100vh - 72px)");
    expect(homeCssText).toContain("--workspace-home-pane-height: calc(var(--workspace-home-panel-height) + 12px)");
    expect(homeCssText).toContain(".workspace-home-pane-grid");
    expect(homeCssText).toContain("height: var(--workspace-home-pane-height)");
    expect(homeCssText).toContain("width: 100%");
    expect(homeCssText).toContain(".workspace-home-layout[data-sidebar-collapsed=\"true\"]");
    expect(homeCssText).toContain("grid-template-columns: clamp(156px, 14vw, 184px) minmax(0, 1fr)");
    expect(homeCssText).toContain(".workspace-home-layout[data-sidebar-collapsed=\"false\"]");
    expect(homeCssText).toContain("grid-template-columns: 320px minmax(0, 1fr)");
    expect(homeCssText).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(homeCssText).toContain(".workspace-home-sidebar-content");
    expect(homeCssText).toContain("overflow-y: auto");
    expect(homeCssText).toContain(".workspace-home-sidebar-toggle");
    expect(homeCssText).toContain("min-height: 36px");
    expect(homeCssText).toContain("width: auto");
    expect(homeCssText).toContain("padding: 0");
    expect(homeCssText).toContain("border: 0");
    expect(homeCssText).toContain("background: transparent");
    expect(homeCssText).toContain("grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 520px)");
    expect(homeCssText).not.toContain("width: min(1440px, 100%)");
    expect(homeCssText).not.toContain("margin: 0 auto");
    expect(listCssText).toContain(".task-card");
    expect(listCssText).toContain("border: 1px solid");
    expect(listCssText).toContain(".task-card[data-selected=\"true\"]");
    expect(listCssText).toContain(".task-card.is-idle");
    expect(listCssText).toContain(".task-card.is-running");
    expect(listCssText).toContain(".task-card.is-attention");
    expect(listCssText).toContain(".section-toggle");
    expect(listCssText).toContain("background: transparent");
    expect(listCssText).toContain("white-space: nowrap");
    expect(listCssText).toContain("var(--card-background-color, #111827)");
    expect(listCssText).toContain("var(--secondary-background-color, #111827)");
  });

  it("uses focus layout on smaller desktop screens while keeping a summary rail", async () => {
    setWindowWidth(1200);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "工作区一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "工作区二",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这里是工作区一最近的一条关键结论。",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这里是工作区二最近的一条关键结论。",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);

    expect(element.shadowRoot?.querySelector(".workspace-home-pane-focus-layout")).not.toBeNull();
    expect(element.shadowRoot?.querySelectorAll("workspace-conversation-pane")).toHaveLength(1);
    const previewCard = element.shadowRoot?.querySelector("workspace-preview-card") as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null;
    expect(previewCard?.shadowRoot?.textContent).toContain("这里是工作区一最近的一条关键结论。");
  });

  it("collapses and expands the left workspace sidebar", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "工作区一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "工作区一消息" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    const toggle = element.shadowRoot?.querySelector(".workspace-home-sidebar-toggle") as HTMLButtonElement | null;
    const layout = element.shadowRoot?.querySelector(".workspace-home-layout") as HTMLElement | null;
    const sidebarContent = element.shadowRoot?.querySelector(".workspace-home-sidebar-content");

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
    expect(sidebarContent).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".task-card")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".task-meta")).toBeNull();
    toggle?.click();
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(element.shadowRoot?.querySelector(".task-card")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".task-meta")).not.toBeNull();

    toggle?.click();
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
    expect(element.shadowRoot?.querySelector(".task-card")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".task-meta")).toBeNull();
  });

  it("closes a secondary workspace from the summary rail", async () => {
    setWindowWidth(1200);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "工作区一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "工作区二",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "工作区一消息" }],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "工作区二消息" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);

    const previewCard = element.shadowRoot?.querySelector("workspace-preview-card") as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null;
    const closeButton = previewCard?.shadowRoot?.querySelector(".workspace-preview-close") as HTMLButtonElement | null;
    closeButton?.click();
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-2"]);
    expect(element.shadowRoot?.querySelector("workspace-preview-card")).toBeNull();
  });

  it("keeps grid layout on very wide screens", async () => {
    setWindowWidth(1920);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "工作区一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "工作区二",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息二" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);

    expect(element.shadowRoot?.querySelector(".workspace-home-pane-focus-layout")).toBeNull();
    expect(element.shadowRoot?.querySelectorAll("workspace-conversation-pane")).toHaveLength(2);
  });

  it("keeps polling opened panes when websocket is unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这是最新同步的消息",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/workspaces/ws-attention/latest-messages"),
      expect.any(Object),
    );

    const latestMessageRequestsBeforeTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-attention/latest-messages"),
    );
    expect(latestMessageRequestsBeforeTick).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await flushElement(element);

    const latestMessageRequestsAfterTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-attention/latest-messages"),
    );
    expect(latestMessageRequestsAfterTick.length).toBeGreaterThan(1);
  });

  it("uses board websocket snapshots to update the workspace list in api mode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-initial",
              name: "初始任务",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-live/latest-messages")) {
        return createJsonResponse({ messages: [] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    expect(element.shadowRoot?.textContent).toContain("初始任务");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toContain("/api/realtime/ws");

    FakeWebSocket.instances[0]?.emitOpen();
    FakeWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "ws-live",
          name: "实时任务",
          status: "completed",
          updated_at: "2026-03-24T12:10:00Z",
        },
      ],
    });
    await flushElement(element);

    expect(element.shadowRoot?.textContent).toContain("实时任务");
  });

  it("keeps a manually closed attention pane closed until attention changes again", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这是最新同步的消息",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;

    expect(pane).not.toBeNull();

    pane.dispatchEvent(new CustomEvent("pane-close", { bubbles: true, composed: true }));
    await flushElement(element);

    expect(element.shadowRoot?.querySelector("workspace-conversation-pane")).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    await flushElement(element);

    expect(element.shadowRoot?.querySelector("workspace-conversation-pane")).toBeNull();
  });

  it("sends desktop pane messages through the workspace API and refreshes the pane", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这是最新同步的消息",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-attention/message")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ message: "请继续推进", mode: "send" }));
        return createJsonResponse({
          success: true,
          workspace_id: "ws-attention",
          message: "已发送",
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;

    pane.dispatchEvent(
      new CustomEvent("draft-change", {
        detail: "请继续推进",
        bubbles: true,
        composed: true,
      }),
    );
    await flushElement(element);

    pane.dispatchEvent(
      new CustomEvent("action-click", {
        detail: "send",
        bubbles: true,
        composed: true,
      }),
    );
    await flushElement(element);

    const messageRequests = fetchMock.mock.calls.filter(([url]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspace/ws-attention/message"),
    );
    const latestMessageRequests = fetchMock.mock.calls.filter(([url]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspaces/ws-attention/latest-messages"),
    );

    expect(messageRequests).toHaveLength(1);
    expect(latestMessageRequests).toHaveLength(2);
  });

  it("clears stale cached messages and fetches fresh content when opening a pane", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return Promise.resolve().then(() =>
          createJsonResponse({
            messages: [
              {
                role: "assistant",
                content: "最新消息",
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    element.messagesByWorkspace = {
      "ws-attention": [
        {
          kind: "message",
          sender: "ai",
          text: "旧消息",
        },
      ],
    };

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await element.updateComplete;

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;
    const paneShadowRoot = (pane as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;

    expect(paneShadowRoot?.textContent).not.toContain("旧消息");
    expect(paneShadowRoot?.textContent).toContain("正在同步最新消息...");

    await flushElement(element);

    expect(paneShadowRoot?.textContent).toContain("最新消息");
  });

  it("renders tool calls and file changes in desktop panes from API messages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              entry_type: "tool_use",
              process_id: "proc-1",
              entry_index: 1,
              content: "已更新按钮文案",
              tool_info: {
                tool_name: "修改文件",
                action_type: {
                  action: "file_edit",
                  path: "src/demo.ts",
                  changes: [
                    {
                      action: "edit",
                      unified_diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
                    },
                  ],
                },
                status: "success",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;
    const paneShadowRoot = (pane as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const toggle = paneShadowRoot?.querySelector(".message-tool-button") as HTMLButtonElement;

    expect(toggle?.textContent).toContain("修改文件");
    expect(toggle?.textContent).toContain("src/demo.ts");

    toggle.click();
    await flushElement(element);

    expect(paneShadowRoot?.textContent).toContain("已更新按钮文案");
    expect(paneShadowRoot?.textContent).toContain("编辑");
    expect(paneShadowRoot?.textContent).toContain("console.log");
  });

  it("renders card-like quick buttons and feedback in desktop panes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "这里有两个方案，建议先继续，然后确认是否同意。",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;
    const paneShadowRoot = (pane as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const staticButtons = [...(paneShadowRoot?.querySelectorAll(".quick-button.is-static") ?? [])]
      .map((button) => button.textContent?.trim());

    expect(staticButtons).toContain("继续");
    expect(staticButtons).toContain("同意");
    expect(paneShadowRoot?.textContent).not.toContain("消息已切换为本地持久化接口。");
    expect(paneShadowRoot?.querySelector(".dialog-feedback.is-empty")).not.toBeNull();
  });

  it("uses websocket for the active pane and appends realtime session messages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要处理的任务",
              status: "completed",
              latest_session_id: "session-1",
              has_pending_approval: true,
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              process_id: "proc-1",
              entry_index: 1,
              role: "assistant",
              content: "初始消息",
              timestamp: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toContain("session_id=session-1");

    FakeWebSocket.instances[1]?.emitOpen();
    FakeWebSocket.instances[1]?.emitMessage({
      type: "session_messages_appended",
      session_id: "session-1",
      messages: [
        {
          process_id: "proc-1",
          entry_index: 2,
          role: "assistant",
          content: "实时追加消息",
          timestamp: "2026-03-24T12:01:00Z",
        },
      ],
    });
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;
    const paneShadowRoot = (pane as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;

    expect(paneShadowRoot?.textContent).toContain("实时追加消息");
  });

  it("keeps pane order and focuses the composer when reselecting an already opened workspace", async () => {
    setWindowWidth(1920);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "任务一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "任务二",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "任务一消息",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "任务二消息",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-1", "ws-2"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-2");

    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-1", "ws-2"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-1");

    const panes = [
      ...(element.shadowRoot?.querySelectorAll("workspace-conversation-pane") ?? []),
    ] as Array<HTMLElement & { shadowRoot: ShadowRoot }>;
    const paneTitles = panes.map((pane) =>
      pane.shadowRoot?.querySelector(".dialog-title")?.textContent?.trim(),
    );
    const firstPaneInput = panes[0]?.shadowRoot?.querySelector(".message-input") as
      | HTMLTextAreaElement
      | null;

    expect(paneTitles).toEqual(["任务一", "任务二"]);
    expect(firstPaneInput).not.toBeNull();
    expect(panes[0]?.shadowRoot?.activeElement).toBe(firstPaneInput);
  });

  it("persists opened panes and restores them after recreating the page", async () => {
    setWindowWidth(1920);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "任务一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "任务二",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "任务一消息",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "任务二消息",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const firstElement = createElement();
    await waitForWorkspaceList(firstElement);

    const cards = firstElement.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(firstElement);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(firstElement);

    const persisted = window.localStorage.getItem(WORKSPACE_PAGE_STATE_STORAGE_KEY);
    expect(persisted).toContain("\"openWorkspaceIds\":[\"ws-1\",\"ws-2\"]");
    expect(persisted).toContain("\"activeWorkspaceId\":\"ws-2\"");

    firstElement.remove();

    const secondElement = createElement();
    await waitForWorkspaceList(secondElement);
    await flushElement(secondElement);

    expect(secondElement.pageState.openWorkspaceIds).toEqual(["ws-1", "ws-2"]);
    expect(secondElement.pageState.activeWorkspaceId).toBe("ws-2");

    const paneTitles = [
      ...(secondElement.shadowRoot?.querySelectorAll("workspace-conversation-pane") ?? []),
    ].map((pane) =>
      (pane as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot?.querySelector(".dialog-title")
        ?.textContent?.trim(),
    );

    expect(paneTitles).toEqual(["任务一", "任务二"]);
  });

  it("polls other opened panes while the active pane stays on websocket updates", async () => {
    setWindowWidth(1920);

    let ws2MessageRevision = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "任务一",
              status: "completed",
              latest_session_id: "session-1",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "任务二",
              status: "completed",
              latest_session_id: "session-2",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "任务一消息",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        ws2MessageRevision += 1;
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              process_id: "proc-ws-2",
              entry_index: ws2MessageRevision,
              content: ws2MessageRevision > 1 ? "任务二消息已刷新" : "任务二消息",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);

    FakeWebSocket.instances.at(-1)?.emitOpen();
    await flushElement(element);

    const ws1BeforeTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-1/latest-messages"),
    );
    const ws2BeforeTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-2/latest-messages"),
    );

    await vi.advanceTimersByTimeAsync(3_000);
    await flushElement(element);

    const ws1AfterTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-1/latest-messages"),
    );
    const ws2AfterTick = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/ws-2/latest-messages"),
    );
    const panes = [
      ...(element.shadowRoot?.querySelectorAll("workspace-conversation-pane") ?? []),
    ] as Array<HTMLElement & { shadowRoot: ShadowRoot }>;
    const secondPaneReveal = panes[1]?.shadowRoot?.querySelector(".message-bubble.is-smooth-reveal");

    expect(ws1AfterTick).toHaveLength(ws1BeforeTick.length);
    expect(ws2AfterTick.length).toBeGreaterThan(ws2BeforeTick.length);
    expect(secondPaneReveal?.textContent).toContain("任务二消息已刷新");
  });

  it("hydrates running panes with stop and queue controls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-running",
              name: "运行中的任务",
              status: "running",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-running/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "还在执行中",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-running/queue")) {
        return createJsonResponse({
          success: true,
          workspace_id: "ws-running",
          status: "queued",
          queued: {
            data: {
              message: "跑完后继续补全",
            },
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement & {
      isRunning?: boolean;
      canQueue?: boolean;
      queueStatus?: { status?: string };
      messageDraft?: string;
    };

    expect(pane.isRunning).toBe(true);
    expect(pane.canQueue).toBe(true);
    expect(pane.queueStatus?.status).toBe("queued");
    expect(pane.messageDraft).toBe("跑完后继续补全");
  });

  it("applies workspace status accent to the opened pane shell", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要注意的任务",
              status: "completed",
              has_unseen_turns: true,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "需要尽快确认。",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement & { shadowRoot: ShadowRoot };
    const paneShell = pane.shadowRoot.querySelector(".workspace-pane-shell");

    expect(paneShell?.classList.contains("is-attention")).toBe(true);
  });

  it("cancels queued work instead of stopping execution when the queued action is closed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-running",
              name: "运行中的任务",
              status: "running",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-running/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "还在执行中",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-running/queue")) {
        if (init?.method === "GET") {
          return createJsonResponse({
            success: true,
            workspace_id: "ws-running",
            status: "queued",
            queued: {
              data: {
                message: "跑完后继续补全",
              },
            },
          });
        }

        if (init?.method === "DELETE") {
          return createJsonResponse({
            success: true,
            workspace_id: "ws-running",
            status: "empty",
            message: "队列已取消",
          });
        }
      }

      if (url.includes("/api/workspace/ws-running/stop")) {
        throw new Error("stop endpoint should not be called for queued work");
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();

    await waitForWorkspaceList(element);
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement;

    pane.dispatchEvent(
      new CustomEvent("action-click", {
        detail: "stop",
        bubbles: true,
        composed: true,
      }),
    );
    await flushElement(element);

    const deleteQueueRequests = fetchMock.mock.calls.filter(([url, init]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspace/ws-running/queue") &&
      (init as RequestInit | undefined)?.method === "DELETE",
    );
    const stopRequests = fetchMock.mock.calls.filter(([url]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspace/ws-running/stop"),
    );

    expect(deleteQueueRequests).toHaveLength(1);
    expect(stopRequests).toHaveLength(0);
  });
});
