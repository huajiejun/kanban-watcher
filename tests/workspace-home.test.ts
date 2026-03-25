import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/web/workspace-home";
import {
  KanbanWorkspaceHome,
  getPaneColumns,
  resolveWorkspaceHomeMode,
} from "../src/web/workspace-home";
import { workspaceHomeStyles, workspaceSectionListStyles } from "../src/styles";

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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("uses desktop mode for wide screens and mobile-card for narrow screens", () => {
    expect(resolveWorkspaceHomeMode(1440)).toBe("desktop");
    expect(resolveWorkspaceHomeMode(768)).toBe("mobile-card");
    expect(resolveWorkspaceHomeMode(390)).toBe("mobile-card");
  });

  it("computes pane columns from the number of opened panes", () => {
    expect(getPaneColumns(0)).toBe(1);
    expect(getPaneColumns(1)).toBe(1);
    expect(getPaneColumns(2)).toBe(2);
    expect(getPaneColumns(3)).toBe(3);
    expect(getPaneColumns(4)).toBe(4);
    expect(getPaneColumns(5)).toBe(4);
  });

  it("keeps desktop panes inside a fixed-height grid and uses dark card fallbacks", () => {
    const homeCssText = Array.isArray(workspaceHomeStyles)
      ? workspaceHomeStyles.map((style) => style.cssText).join("\n")
      : workspaceHomeStyles.cssText;
    const listCssText = Array.isArray(workspaceSectionListStyles)
      ? workspaceSectionListStyles.map((style) => style.cssText).join("\n")
      : workspaceSectionListStyles.cssText;

    expect(homeCssText).toContain(".workspace-home-pane-grid");
    expect(homeCssText).toContain("height: min(72vh, 960px)");
    expect(listCssText).toContain("var(--card-background-color, #111827)");
    expect(listCssText).toContain("var(--secondary-background-color, #111827)");
  });

  it("refreshes latest messages for every opened pane on the desktop interval", async () => {
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
    expect(latestMessageRequestsAfterTick).toHaveLength(2);
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
