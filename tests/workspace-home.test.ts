import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
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

async function waitForWorkspaceData(element: KanbanWorkspaceHome) {
  for (let index = 0; index < 5; index += 1) {
    await flushElement(element);
    if (element.workspaces.length > 0 || !element.loading) {
      return;
    }
  }
}

async function waitForWorkspaceList(element: KanbanWorkspaceHome) {
  await waitForWorkspaceData(element);

  if (element.isSidebarCollapsed) {
    (element.shadowRoot?.querySelector(".workspace-home-sidebar-toggle") as HTMLButtonElement | null)
      ?.click();
  }

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
    expect(homeCssText).toContain(".workspace-home-layout");
    expect(homeCssText).toContain("position: relative");
    expect(homeCssText).toContain("min-height: var(--workspace-home-pane-height);\n    overflow: hidden;");
    expect(homeCssText).toContain(".workspace-home-layout[data-sidebar-collapsed=\"true\"]");
    expect(homeCssText).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(homeCssText).toContain(".workspace-home-layout[data-sidebar-collapsed=\"false\"]");
    expect(homeCssText).toContain(".workspace-home-layout[data-sidebar-docked=\"true\"][data-sidebar-collapsed=\"false\"]");
    expect(homeCssText).toContain("grid-template-columns: minmax(280px, 320px) minmax(0, 1fr)");
    expect(homeCssText).toContain(".workspace-home-sidebar[data-docked=\"true\"]");
    expect(homeCssText).toContain("position: static");
    expect(homeCssText).toContain(".workspace-home-sidebar-content");
    expect(homeCssText).toContain("overflow-y: auto");
    expect(homeCssText).toContain(".workspace-home-sidebar-toggle");
    expect(homeCssText).toContain("position: absolute");
    expect(homeCssText).toContain("min-height: 36px");
    expect(homeCssText).toContain("width: auto");
    expect(homeCssText).toContain("padding: 0");
    expect(homeCssText).toContain("border: 0");
    expect(homeCssText).toContain("background: transparent");
    expect(homeCssText).toContain("transform: translateX(calc(-100% - 16px))");
    expect(homeCssText).toContain("transform: translateX(0)");
    expect(homeCssText).toContain("visibility: hidden");
    expect(homeCssText).toContain("visibility: visible");
    expect(homeCssText).toContain(".workspace-home-sidebar-backdrop");
    expect(homeCssText).toContain("grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 520px)");
    expect(homeCssText).not.toContain("width: min(1440px, 100%)");
    expect(homeCssText).not.toContain("margin: 0 auto");
    expect(homeCssText).toContain("@media (max-width: 768px)");
    expect(homeCssText).toContain(".workspace-home-placeholder {\n      border: 0;");
    expect(homeCssText).toContain("padding: 0;");
    expect(homeCssText).toContain("background: transparent;");
    expect(homeCssText).toContain("box-shadow: none;");
    expect(homeCssText).toContain("backdrop-filter: none;");
    expect(homeCssText).toContain(".workspace-home-sidebar .task-card");
    expect(homeCssText).toContain(".workspace-home-sidebar .task-card-main");
    expect(homeCssText).toContain("appearance: none");
    expect(homeCssText).toContain("padding: 9px 12px");
    expect(homeCssText).toContain(".workspace-home-sidebar .meta-files");
    expect(homeCssText).toContain("justify-self: end");
    expect(homeCssText).toContain(".status-icon");
    expect(homeCssText).toContain("background: transparent");
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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

  it("keeps the left workspace sidebar expanded and docked when zero or one pane is open", async () => {
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
    await waitForWorkspaceData(element);

    const toggle = element.shadowRoot?.querySelector(".workspace-home-sidebar-toggle") as HTMLButtonElement | null;
    const layout = element.shadowRoot?.querySelector(".workspace-home-layout") as HTMLElement | null;
    const sidebar = element.shadowRoot?.querySelector(".workspace-home-sidebar") as HTMLElement | null;

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("true");
    expect(sidebar?.getAttribute("data-collapsed")).toBe("false");
    expect(sidebar?.getAttribute("data-docked")).toBe("true");
    expect(toggle?.textContent).not.toContain("项目状态");
    expect(element.shadowRoot?.querySelector(".workspace-home-sidebar-backdrop")).toBeNull();
    expect(element.shadowRoot?.querySelector(".task-card")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".task-meta")).not.toBeNull();

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement | null)?.click();
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("true");
    expect(sidebar?.getAttribute("data-collapsed")).toBe("false");
    expect(sidebar?.getAttribute("data-docked")).toBe("true");
    expect(element.shadowRoot?.querySelector(".workspace-home-sidebar-backdrop")).toBeNull();
  });

  it("auto-collapses the left workspace sidebar when more than one pane is open and re-expands when returning to one", async () => {
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
    const layout = element.shadowRoot?.querySelector(".workspace-home-layout") as HTMLElement | null;
    const sidebar = element.shadowRoot?.querySelector(".workspace-home-sidebar") as HTMLElement | null;

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("true");

    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("true");
    expect(sidebar?.getAttribute("data-docked")).toBe("true");

    (cards[1] as HTMLButtonElement).click();
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("false");
    expect(sidebar?.getAttribute("data-collapsed")).toBe("true");
    expect(sidebar?.getAttribute("data-docked")).toBe("false");

    const panes = [
      ...(element.shadowRoot?.querySelectorAll("workspace-conversation-pane") ?? []),
    ] as HTMLElement[];
    panes[1]?.dispatchEvent(new CustomEvent("pane-close", { bubbles: true, composed: true }));
    await flushElement(element);

    expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(layout?.getAttribute("data-sidebar-docked")).toBe("true");
    expect(sidebar?.getAttribute("data-collapsed")).toBe("false");
    expect(sidebar?.getAttribute("data-docked")).toBe("true");
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

  it("does not reconfigure the mobile card on unrelated workspace-home updates", async () => {
    setWindowWidth(390);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-mobile",
              name: "移动端任务",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await flushElement(element);
    const baselineActiveRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/active"),
    ).length;
    expect(baselineActiveRequests).toBeGreaterThan(0);

    element.pageState = {
      ...element.pageState,
      dismissedAttentionIds: ["ws-mobile"],
    };
    await flushElement(element);

    const nextActiveRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/workspaces/active"),
    ).length;
    expect(nextActiveRequests).toBe(baselineActiveRequests);
  });

  it("delegates mobile realtime startup to the embedded card so the page does not open duplicate sockets", async () => {
    setWindowWidth(390);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-mobile",
              name: "移动端任务",
              status: "completed",
              latest_session_id: "session-mobile",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await flushElement(element);

    const activeRequests = fetchMock.mock.calls.filter(([url]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspaces/active"),
    );

    expect(activeRequests).toHaveLength(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("stops realtime startup when initial workspace load is unauthorized", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return new Response("401 Unauthorized", { status: 401 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceData(element);

    expect(element.error).toContain("401 Unauthorized");
    expect(FakeWebSocket.instances).toHaveLength(0);
    const initialFetchCount = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000);
    await flushElement(element);

    expect(fetchMock).toHaveBeenCalledTimes(initialFetchCount);
    expect(FakeWebSocket.instances).toHaveLength(0);
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

  it("auto-opens a newly entered attention workspace from board snapshots and appends it after the current pane", async () => {
    setWindowWidth(1200);

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
          messages: [{ role: "assistant", content: "任务一消息" }],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "任务二需要注意的最新消息" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);

    FakeWebSocket.instances[0]?.emitOpen();
    FakeWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
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
          has_unseen_turns: true,
          updated_at: "2026-03-24T12:02:00Z",
        },
      ],
    });
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-1", "ws-2"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-1");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        readRequestUrl(url as RequestInfo | URL).includes("/api/workspaces/ws-2/latest-messages"),
      ),
    ).toBe(true);

    const previewCard = element.shadowRoot?.querySelector("workspace-preview-card") as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null;
    expect(previewCard?.shadowRoot?.textContent).toContain("任务二需要注意的最新消息");
  });

  it("does not auto-open a workspace that only transitions into running", async () => {
    setWindowWidth(1200);

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
          messages: [{ role: "assistant", content: "任务一消息" }],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "任务二运行中的消息" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
    (cards[0] as HTMLButtonElement).click();
    await flushElement(element);

    FakeWebSocket.instances[0]?.emitOpen();
    FakeWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
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
          status: "running",
          has_unseen_turns: true,
          updated_at: "2026-03-24T12:02:00Z",
        },
      ],
    });
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-1"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-1");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        readRequestUrl(url as RequestInfo | URL).includes("/api/workspaces/ws-2/latest-messages"),
      ),
    ).toBe(false);
    expect(element.shadowRoot?.querySelector("workspace-preview-card")).toBeNull();
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

  it("does not reconnect the active session websocket when workspace snapshot leaves the active session unchanged", async () => {
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

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.instances[0]?.emitOpen();
    FakeWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "ws-attention",
          name: "需要处理的任务",
          status: "completed",
          latest_session_id: "session-1",
          has_pending_approval: true,
          has_unseen_turns: true,
          updated_at: "2026-03-24T12:01:00Z",
        },
      ],
    });
    await flushElement(element);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toContain("session_id=session-1");
  });

  it("keeps pane order and switches the active workspace without focusing the composer", async () => {
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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
    expect(panes[0]?.shadowRoot?.activeElement).not.toBe(firstPaneInput);
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

    const cards = firstElement.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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

  it("hydrates workspace view from the remote shared layout before using stale local storage", async () => {
    window.localStorage.setItem(
      WORKSPACE_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        openWorkspaceIds: ["ws-local"],
        activeWorkspaceId: "ws-local",
        dismissedAttentionIds: ["ws-local-dismissed"],
      }),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspace-view")) {
        return createJsonResponse({
          open_workspace_ids: ["ws-remote"],
          active_workspace_id: "ws-remote",
          dismissed_attention_ids: ["ws-remote"],
          version: 2,
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-remote",
              name: "远端任务",
              status: "completed",
              has_unseen_turns: true,
              updated_at: "2026-03-25T08:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-remote/latest-messages")) {
        return createJsonResponse({
          messages: [
            {
              role: "assistant",
              content: "来自远端共享布局",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);
    await flushElement(element);

    expect(fetchMock.mock.calls.some(([url]) => readRequestUrl(url as RequestInfo | URL).includes("/api/workspace-view"))).toBe(true);
    expect(element.pageState.openWorkspaceIds).toEqual(["ws-remote"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-remote");
    expect(element.pageState.dismissedAttentionIds).toEqual(["ws-remote"]);
  });

  it("syncs the shared layout from realtime workspace_view_updated events", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspace-view")) {
        return createJsonResponse({
          open_workspace_ids: [],
          dismissed_attention_ids: [],
          version: 1,
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "任务一",
              status: "completed",
              updated_at: "2026-03-25T08:00:00Z",
            },
            {
              id: "ws-2",
              name: "任务二",
              status: "completed",
              updated_at: "2026-03-25T08:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-2/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "任务二来自广播" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const element = createElement();
    await waitForWorkspaceList(element);

    FakeWebSocket.instances.at(0)?.emitOpen();
    await flushElement(element);

    FakeWebSocket.instances.at(0)?.emitMessage({
      type: "workspace_view_updated",
      workspace_view: {
        open_workspace_ids: ["ws-2"],
        active_workspace_id: "ws-2",
        dismissed_attention_ids: ["ws-1"],
        version: 3,
      },
    });
    await flushElement(element);

    expect(element.pageState.openWorkspaceIds).toEqual(["ws-2"]);
    expect(element.pageState.activeWorkspaceId).toBe("ws-2");
    expect(element.pageState.dismissedAttentionIds).toEqual(["ws-1"]);
  });

  it("persists dismissed attention ids to local storage when an attention pane is manually closed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspace-view")) {
        return createJsonResponse({
          open_workspace_ids: [],
          dismissed_attention_ids: [],
          version: 1,
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-attention",
              name: "需要注意任务",
              status: "completed",
              has_unseen_turns: true,
              updated_at: "2026-03-25T08:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-attention/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "需要处理" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement;
    pane.dispatchEvent(new CustomEvent("pane-close", { bubbles: true, composed: true }));
    await flushElement(element);

    const persisted = window.localStorage.getItem(WORKSPACE_PAGE_STATE_STORAGE_KEY);
    expect(persisted).toContain("\"dismissedAttentionIds\":[\"ws-attention\"]");
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

    const cards = element.shadowRoot?.querySelectorAll(".task-card-main") ?? [];
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
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

  it("does not render the old sidebar browser button after moving preview entry into the pane header", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "可打开浏览器的工作区",
              status: "completed",
              browser_url: "http://127.0.0.1:4173",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "没有地址的工作区",
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

    expect(element.shadowRoot?.querySelector(".workspace-home-open-browser")).toBeNull();
  });

  it("calls the workspace dev-server api when clicking run and shows local error feedback on failure", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "运行失败的工作区",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
            },
            {
              id: "ws-2",
              name: "未受影响的工作区",
              status: "completed",
              updated_at: "2026-03-24T12:01:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-1/dev-server")) {
        expect(init?.method).toBe("POST");
        return new Response("启动开发服务器失败", { status: 500 });
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

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    (pane?.shadowRoot?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement).click();
    await flushElement(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/workspace/ws-1/dev-server"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(element.shadowRoot?.textContent).toContain("启动开发服务器失败");
    expect(element.shadowRoot?.textContent).not.toContain("未受影响的工作区启动开发服务器失败");
  });

  it("stores the returned dev-server execution process and uses detail status to show running controls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "工作区一",
              status: "completed",
              updated_at: "2026-03-24T12:00:00Z",
              browser_url: "http://127.0.0.1:4173",
              has_running_dev_server: false,
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "dev server ready" }],
        });
      }

      if (url.includes("/api/workspace/ws-1/dev-server")) {
        return createJsonResponse({
          success: true,
          workspace_id: "ws-1",
          action: "dev-server",
          execution_processes: [
            {
              id: "proc-dev-1",
              session_id: "session-1",
              workspace_id: "ws-1",
              run_reason: "dev_server",
              status: "running",
            },
          ],
        });
      }

      if (url.includes("/api/execution-processes/proc-dev-1")) {
        return createJsonResponse({
          success: true,
          data: {
            id: "proc-dev-1",
            session_id: "session-1",
            workspace_id: "ws-1",
            run_reason: "dev_server",
            status: "running",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const root = pane?.shadowRoot;
    (root?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement).click();
    await flushElement(element);

    const toggle = root?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement | null;
    const preview = root?.querySelector(".dialog-dev-server-preview") as HTMLButtonElement | null;

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/execution-processes/proc-dev-1"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(toggle?.getAttribute("data-dev-server-state")).toBe("running");
    expect(preview).not.toBeNull();
  });

  it("disables run when active workspace already has a running dev server", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "已有开发服务器的工作区",
              status: "completed",
              has_running_dev_server: true,
              running_dev_server_process_id: "proc-dev-1",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/execution-processes/proc-dev-1")) {
        return createJsonResponse({
          success: true,
          data: {
            id: "proc-dev-1",
            workspace_id: "ws-1",
            run_reason: "dev_server",
            status: "running",
          },
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    const runButton = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/execution-processes/proc-dev-1"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(runButton?.getAttribute("data-dev-server-state")).toBe("running");
    expect(runButton?.textContent).toContain("❚❚");
  });

  it("prevents duplicate dev-server requests while the previous start request is still pending", async () => {
    let resolveStartRequest: (() => void) | undefined;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const url = readRequestUrl(input);

          if (url.includes("/api/workspaces/active")) {
            resolve(
              createJsonResponse({
                workspaces: [
                  {
                    id: "ws-1",
                    name: "防重入工作区",
                    status: "completed",
                    updated_at: "2026-03-24T12:00:00Z",
                  },
                ],
              }),
            );
            return;
          }

          if (url.includes("/api/workspaces/ws-1/latest-messages")) {
            resolve(createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] }));
            return;
          }

          if (url.includes("/api/workspace/ws-1/dev-server")) {
            expect(init?.method).toBe("POST");
            resolveStartRequest = () =>
              resolve(
                createJsonResponse({
                  success: true,
                  workspace_id: "ws-1",
                  action: "dev-server",
                  message: "已触发 dev server 启动",
                }),
              );
            return;
          }

          throw new Error(`Unexpected fetch URL: ${url}`);
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    const runButton = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement;
    runButton.click();
    await flushElement(element);
    runButton.click();
    await flushElement(element);

    const startRequestsBeforeResolve = fetchMock.mock.calls.filter(([url, init]) =>
      readRequestUrl(url as RequestInfo | URL).includes("/api/workspace/ws-1/dev-server") &&
      (init as RequestInit | undefined)?.method === "POST",
    );
    expect(startRequestsBeforeResolve).toHaveLength(1);
    expect(runButton.disabled).toBe(true);
    expect(element.shadowRoot?.textContent).toContain("正在启动开发服务器...");

    resolveStartRequest?.();
    await flushElement(element);
  });

  it("shows dev server controls in the active pane header and opens a preview drawer with iframe", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "运行中的工作区",
              status: "completed",
              has_running_dev_server: true,
              browser_url: "https://relay.example/ws-1",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    const paneRoot = pane?.shadowRoot;
    const toggle = paneRoot?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement | null;
    const preview = paneRoot?.querySelector(
      ".dialog-dev-server-preview",
    ) as HTMLButtonElement | null;

    expect(toggle?.getAttribute("data-dev-server-state")).toBe("running");
    expect(preview).not.toBeNull();

    preview?.click();
    await flushElement(element);

    const iframe = element.shadowRoot?.querySelector(
      ".workspace-home-preview-drawer-frame",
    ) as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("https://relay.example/ws-1");
  });

  it("renders the workspace web preview button before the dev-server toggle when browser_url is available", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "有快捷网页入口的工作区",
              status: "completed",
              has_running_dev_server: true,
              browser_url: "https://relay.example/ws-1",
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const actionButtons = Array.from(
      pane?.shadowRoot?.querySelectorAll(".dialog-header-actions > button") ?? [],
    );
    const buttonClasses = actionButtons.map((button) => button.className);

    expect(buttonClasses).toContain("dialog-web-preview");
    expect(buttonClasses.indexOf("dialog-web-preview")).toBeLessThan(
      buttonClasses.indexOf("dialog-dev-server-toggle"),
    );
  });

  it("opens a desktop web preview modal with iframe when the workspace web preview button is clicked", async () => {
    setWindowWidth(1440);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "桌面端工作区",
              status: "completed",
              browser_url: "https://relay.example/ws-1",
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    (pane?.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement).click();
    await flushElement(element);

    const overlay = element.shadowRoot?.querySelector(
      ".workspace-home-web-preview-overlay",
    ) as HTMLElement | null;
    const frame = element.shadowRoot?.querySelector(
      ".workspace-home-web-preview-frame",
    ) as HTMLIFrameElement | null;

    expect(overlay).not.toBeNull();
    expect(overlay?.dataset.layout).toBe("desktop");
    expect(frame).not.toBeNull();
    expect(frame?.src).toContain("https://relay.example/ws-1");
  });

  it("keeps the pane header in idle state when only the workspace task is running", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "任务运行中但服务未启动",
              status: "running",
              has_running_dev_server: false,
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-1/dev-server")) {
        expect(init?.method).toBe("POST");
        return createJsonResponse({
          success: true,
          workspace_id: "ws-1",
          action: "dev-server-start",
          message: "已触发 dev server 启动",
          execution_processes: [
            {
              id: "proc-dev-1",
              workspace_id: "ws-1",
              status: "running",
              run_reason: "devserver",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    const toggle = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;

    expect(toggle?.getAttribute("data-dev-server-state")).toBe("idle");

    toggle?.click();
    await flushElement(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/workspace/ws-1/dev-server"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends a dev-server stop request when clicking the running pause control in the pane header", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "运行中的工作区",
              status: "completed",
              has_running_dev_server: true,
              running_dev_server_process_id: "proc-dev-1",
              browser_url: "https://relay.example/ws-1",
              updated_at: "2026-03-24T12:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspace/ws-1/dev-server")) {
        expect(init?.method).toBe("DELETE");
        return createJsonResponse({
          success: true,
          workspace_id: "ws-1",
          action: "dev-server-stop",
          message: "已停止 dev server",
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    const pauseButton = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;

    pauseButton?.click();
    await flushElement(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/workspace/ws-1/dev-server?process_id=proc-dev-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("updates the pane header back to idle after the dev-server stop request succeeds", async () => {
    let activeWorkspacesRequestCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        activeWorkspacesRequestCount += 1;
        return createJsonResponse({
          workspaces: [
            activeWorkspacesRequestCount === 1
              ? {
                  id: "ws-1",
                  name: "运行中的工作区",
                  status: "completed",
                  has_running_dev_server: true,
                  running_dev_server_process_id: "proc-dev-1",
                  browser_url: "https://relay.example/ws-1",
                  updated_at: "2026-03-24T12:00:00Z",
                }
              : {
                  id: "ws-1",
                  name: "运行中的工作区",
                  status: "completed",
                  has_running_dev_server: false,
                  updated_at: "2026-03-24T12:00:00Z",
                },
          ],
        });
      }

      if (url.includes("/api/execution-processes/proc-dev-1")) {
        return createJsonResponse({
          success: true,
          data: {
            id: "proc-dev-1",
            session_id: "session-1",
            status: "running",
          },
        });
      }

      if (url.includes("/api/workspace/ws-1/dev-server")) {
        expect(init?.method).toBe("DELETE");
        return createJsonResponse({
          success: true,
          workspace_id: "ws-1",
          action: "dev-server-stop",
          message: "已停止 dev server",
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({ messages: [{ role: "assistant", content: "消息一" }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForWorkspaceList(element);

    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();
    await flushElement(element);

    const pane = element.shadowRoot?.querySelector(
      "workspace-conversation-pane",
    ) as HTMLElement | null;
    let toggle = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-toggle",
    ) as HTMLButtonElement | null;
    let preview = pane?.shadowRoot?.querySelector(
      ".dialog-dev-server-preview",
    ) as HTMLButtonElement | null;

    expect(toggle?.getAttribute("data-dev-server-state")).toBe("running");
    expect(preview).not.toBeNull();

    toggle?.click();
    await flushElement(element);

    toggle = pane?.shadowRoot?.querySelector(".dialog-dev-server-toggle") as HTMLButtonElement | null;
    preview = pane?.shadowRoot?.querySelector(".dialog-dev-server-preview") as HTMLButtonElement | null;

    expect(toggle?.getAttribute("data-dev-server-state")).toBe("idle");
    expect(preview).toBeNull();
    expect(element.shadowRoot?.textContent).toContain("已停止 dev server");
  });
});
