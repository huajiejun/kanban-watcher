import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import type { KanbanWatcherCard } from "../src/kanban-watcher-card";

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

async function flushCard(element: KanbanWatcherCard) {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await element.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await element.updateComplete;
}

async function waitForBoard(element: KanbanWatcherCard) {
  for (let index = 0; index < 5; index += 1) {
    await flushCard(element);
    if (element.shadowRoot?.querySelector(".task-card")) {
      return;
    }
  }
}

function createElement() {
  const element = document.createElement("kanban-watcher-card") as KanbanWatcherCard;
  element.setConfig({
    entity: "sensor.kanban_watcher_kanban_watcher",
    base_url: "",
  });
  document.body.append(element);
  return element;
}

describe("kanban-watcher-card mobile web preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setWindowWidth(390);
    vi.stubGlobal("WebSocket", undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("opens the web preview in a new page from browser_url on mobile", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

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
              name: "手机工作区",
              status: "completed",
              has_running_dev_server: true,
              browser_url: "https://relay.example/ws-1",
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "消息一" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForBoard(element);

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushCard(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const button = pane?.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);

    button?.click();
    await flushCard(element);

    expect(openSpy).toHaveBeenCalledWith("https://relay.example/ws-1", "_blank", "noopener");
    expect(element.shadowRoot?.querySelector(".workspace-home-web-preview-overlay")).toBeNull();
  });

  it("accepts the camelCase browserUrl field on mobile", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

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
              name: "手机驼峰工作区",
              status: "completed",
              has_running_dev_server: true,
              browserUrl: "https://relay.example/ws-1-camel",
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "消息一" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForBoard(element);

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushCard(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const button = pane?.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);

    button?.click();
    await flushCard(element);

    expect(openSpy).toHaveBeenCalledWith("https://relay.example/ws-1-camel", "_blank", "noopener");
    expect(element.shadowRoot?.querySelector(".workspace-home-web-preview-overlay")).toBeNull();
  });

  it("falls back to the frontend port API on mobile and opens the huajiejun preview URL", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: null,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "手机端口工作区",
              status: "completed",
              has_running_dev_server: true,
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "消息一" }],
        });
      }

      if (url.includes("/api/workspace/ws-1/frontend-port")) {
        expect(init?.method).toBe("POST");
        return createJsonResponse({
          success: true,
          data: {
            workspace_id: "ws-1",
            frontend_port: 6020,
            backend_port: 16020,
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForBoard(element);

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushCard(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const button = pane?.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);

    button?.click();
    await flushCard(element);

    expect(openSpy).toHaveBeenCalledWith("https://6020.huajiejun.cn:999", "_blank", "noopener");
    expect(element.shadowRoot?.querySelector(".workspace-home-web-preview-overlay")).toBeNull();
  });

  it("hides the mobile web preview button when the dev server is not running", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);

      if (url.includes("/api/info")) {
        return createJsonResponse({
          success: true,
          data: {
            config: {
              preview_proxy_port: null,
            },
          },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return createJsonResponse({
          workspaces: [
            {
              id: "ws-1",
              name: "手机无地址工作区",
              status: "completed",
              updated_at: "2026-03-26T10:00:00Z",
            },
          ],
        });
      }

      if (url.includes("/api/workspaces/ws-1/latest-messages")) {
        return createJsonResponse({
          messages: [{ role: "assistant", content: "消息一" }],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const element = createElement();
    await waitForBoard(element);

    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();
    await flushCard(element);

    const pane = element.shadowRoot?.querySelector("workspace-conversation-pane") as HTMLElement | null;
    const button = pane?.shadowRoot?.querySelector(".dialog-web-preview") as HTMLButtonElement | null;

    expect(button).toBeNull();
  });
});
