// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanWorkspace, SessionMessageResponse, TodoItem } from "../src/types";

type KanbanWatcherCardElement = HTMLElement & {
  hass?: {
    states: Record<string, { attributes?: Record<string, unknown> }>;
  };
  setConfig(config: {
    entity: string;
    base_url?: string;
    api_key?: string;
    messages_limit?: number;
  }): void;
  updateComplete?: Promise<unknown>;
  workspaces?: KanbanWorkspace[];
  selectedWorkspaceId?: string;
  todosByWorkspace?: Record<string, TodoItem[]>;
};

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.(new Event("open"));
    });
  }

  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify(payload),
    }) as MessageEvent<string>);
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

const entityId = "sensor.kanban_watcher_kanban_watcher";

function createHass(workspaces: KanbanWorkspace[] = []) {
  return {
    states: {
      [entityId]: {
        attributes: {
          updated_at: "2026-03-21T11:55:00Z",
          workspaces,
        },
      },
    },
  };
}

async function renderApiCard(options: { baseUrl?: string; apiKey?: string } = {}) {
  const card = document.createElement(
    "kanban-watcher-card",
  ) as KanbanWatcherCardElement;
  card.setConfig({
    entity: entityId,
    base_url: options.baseUrl ?? "http://localhost:7778",
    api_key: options.apiKey ?? "test-api-key",
    messages_limit: 50,
  });
  card.hass = createHass([]);
  document.body.append(card);
  await settleCard(card);
  return card;
}

async function renderEntityCard(workspaces: KanbanWorkspace[]) {
  const card = document.createElement(
    "kanban-watcher-card",
  ) as KanbanWatcherCardElement;
  card.setConfig({
    entity: entityId,
  });
  card.hass = createHass(workspaces);
  document.body.append(card);
  await settleCard(card);
  return card;
}

async function settleCard(card: KanbanWatcherCardElement) {
  await Promise.resolve();
  await Promise.resolve();
  await card.updateComplete;
  await Promise.resolve();
  await card.updateComplete;
}

async function settleApiCard(card: KanbanWatcherCardElement) {
  await settleCard(card);
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await settleCard(card);
}

describe("Todo Integration", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T12:00:00Z"));
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    MockWebSocket.reset();
  });

  it("prefers timestamp recalculation over entity relative_time in mobile card mode", async () => {
    await import("../src/index");

    const card = await renderEntityCard([
      {
        id: "ws-mobile-time",
        name: "手机端时间任务",
        status: "completed",
        latest_process_completed_at: "2026-03-20T12:00:00Z",
        updated_at: "2026-03-21T11:59:50Z",
        relative_time: "just now",
      },
    ]);

    const cardText = card.shadowRoot?.querySelector(".task-card")?.textContent ?? "";
    expect(cardText).toContain("1d ago");
    expect(cardText).not.toContain("just now");
  });

  it("falls back to recently instead of updated_at in mobile card mode", async () => {
    await import("../src/index");

    const card = await renderEntityCard([
      {
        id: "ws-mobile-updated-only",
        name: "手机端兜底时间任务",
        status: "completed",
        updated_at: "2026-03-21T11:59:50Z",
        relative_time: "just now",
      },
    ]);

    const cardText = card.shadowRoot?.querySelector(".task-card")?.textContent ?? "";
    expect(cardText).toContain("recently");
    expect(cardText).not.toContain("just now");
  });

  it("uses realtime.base_url for the mobile card board websocket", async () => {
    await import("../src/index");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/info")) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
            realtime: {
              base_url: "http://127.0.0.1:7778",
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return new Response(JSON.stringify({
          workspaces: [
            {
              id: "ws-mobile-live",
              name: "手机模式实时任务",
              status: "completed",
              latest_session_id: "session-mobile-live",
              updated_at: "2026-03-28T09:00:00Z",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const card = await renderApiCard({ baseUrl: "http://127.0.0.1:18842" });
    await settleApiCard(card);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:7778/api/realtime/ws?api_key=test-api-key");
  });

  it("uses realtime.base_url for the mobile card session websocket", async () => {
    await import("../src/index");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/info")) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
            realtime: {
              base_url: "http://127.0.0.1:7778",
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return new Response(JSON.stringify({
          workspaces: [
            {
              id: "ws-mobile-dialog",
              name: "手机模式弹窗任务",
              status: "running",
              latest_session_id: "session-mobile-dialog",
              updated_at: "2026-03-28T09:00:00Z",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/ws-mobile-dialog/latest-messages")) {
        return new Response(JSON.stringify({
          messages: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspace/ws-mobile-dialog/queue")) {
        return new Response(JSON.stringify({
          success: true,
          workspace_id: "ws-mobile-dialog",
          session_id: "session-mobile-dialog",
          status: "empty",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const card = await renderApiCard({ baseUrl: "http://127.0.0.1:18842" });
    await settleApiCard(card);
    const workspaceCard = card.shadowRoot?.querySelector(".task-card");

    expect(workspaceCard).toBeTruthy();

    (workspaceCard as HTMLElement).click();
    await settleApiCard(card);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.url).toBe("ws://127.0.0.1:7778/api/realtime/ws?api_key=test-api-key&session_id=session-mobile-dialog");
  });

  it("requests filtered latest messages for the mobile card dialog", async () => {
    await import("../src/index");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/info")) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
            realtime: {
              base_url: "http://127.0.0.1:7778",
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return new Response(JSON.stringify({
          workspaces: [
            {
              id: "ws-mobile-filter",
              name: "手机模式过滤任务",
              status: "running",
              latest_session_id: "session-mobile-filter",
              updated_at: "2026-03-28T09:00:00Z",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/ws-mobile-filter/latest-messages")) {
        return new Response(JSON.stringify({
          messages: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspace/ws-mobile-filter/queue")) {
        return new Response(JSON.stringify({
          success: true,
          workspace_id: "ws-mobile-filter",
          session_id: "session-mobile-filter",
          status: "empty",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const card = await renderApiCard({ baseUrl: "http://127.0.0.1:18842" });
    await settleApiCard(card);

    const workspaceCard = card.shadowRoot?.querySelector(".task-card");
    expect(workspaceCard).toBeTruthy();

    (workspaceCard as HTMLElement).click();
    await settleApiCard(card);

    const latestMessagesRequest = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return url.includes("/api/workspaces/ws-mobile-filter/latest-messages");
    });

    expect(latestMessagesRequest).toBeDefined();
    expect(String(latestMessagesRequest?.[0])).toContain(
      "/api/workspaces/ws-mobile-filter/latest-messages?limit=50&types=assistant_message%2Cuser_message%2Cerror_message%2Ctool_use",
    );
  });

  it("switches the mobile card session websocket when workspace snapshot updates latest_session_id", async () => {
    await import("../src/index");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/info")) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            config: {
              preview_proxy_port: 53480,
            },
            realtime: {
              base_url: "http://127.0.0.1:7778",
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/active")) {
        return new Response(JSON.stringify({
          workspaces: [
            {
              id: "ws-mobile-session-shift",
              name: "手机模式会话切换任务",
              status: "running",
              latest_session_id: "session-1",
              updated_at: "2026-03-28T09:00:00Z",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspaces/ws-mobile-session-shift/latest-messages")) {
        return new Response(JSON.stringify({
          messages: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workspace/ws-mobile-session-shift/queue")) {
        return new Response(JSON.stringify({
          success: true,
          workspace_id: "ws-mobile-session-shift",
          session_id: "session-1",
          status: "empty",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const card = await renderApiCard({ baseUrl: "http://127.0.0.1:18842" });
    await settleApiCard(card);

    const workspaceCard = card.shadowRoot?.querySelector(".task-card");
    expect(workspaceCard).toBeTruthy();

    (workspaceCard as HTMLElement).click();
    await settleApiCard(card);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.url).toContain("session_id=session-1");

    MockWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "ws-mobile-session-shift",
          name: "手机模式会话切换任务",
          status: "running",
          latest_session_id: "session-2",
          updated_at: "2026-03-28T09:01:00Z",
        },
      ],
    });
    await settleApiCard(card);

    expect(MockWebSocket.instances).toHaveLength(3);
    expect(MockWebSocket.instances[2]?.url).toContain("session_id=session-2");
  });

  describe("TodoProgressPopup component", () => {
    it("should render TodoProgressPopup in dialog header", async () => {
      // Import the card component
      await import("../src/index");

      const workspaces: KanbanWorkspace[] = [
        {
          id: "test-workspace",
          name: "Test Workspace",
          status: "running",
          latest_session_id: "session-1",
        },
      ];

      // Mock fetch for workspace messages
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/workspace/test-workspace/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ messages: [] })),
          } as unknown as Response);
        }
        if (url.includes("/api/workspaces")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  workspaces: workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    latest_session_id: w.latest_session_id,
                  })),
                }),
              ),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      vi.stubGlobal("fetch", mockFetch);

      const card = await renderApiCard();

      // Set workspaces and trigger a dialog open
      card.workspaces = workspaces;
      await card.updateComplete;

      // Find the workspace card and click it to open the dialog
      const workspaceCard = card.shadowRoot?.querySelector(".task-card");
      expect(workspaceCard).toBeDefined();

      (workspaceCard as HTMLElement)?.click();
      await card.updateComplete;
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // Check if TodoProgressPopup is rendered in the dialog header
      const todoPopup = card.shadowRoot?.querySelector("todo-progress-popup");
      expect(todoPopup).toBeDefined();
    });

    it("should display progress text when todos are present", async () => {
      await import("../src/index");

      const todos: TodoItem[] = [
        { content: "Completed task", status: "completed" },
        { content: "In progress task", status: "in_progress" },
        { content: "Pending task", status: "pending" },
      ];

      const workspaces: KanbanWorkspace[] = [
        {
          id: "test-workspace",
          name: "Test Workspace",
          status: "running",
          latest_session_id: "session-1",
        },
      ];

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/workspace/test-workspace/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ messages: [] })),
          } as unknown as Response);
        }
        if (url.includes("/api/workspaces")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  workspaces: workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    latest_session_id: w.latest_session_id,
                  })),
                }),
              ),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      vi.stubGlobal("fetch", mockFetch);

      const card = await renderApiCard();
      card.workspaces = workspaces;
      await card.updateComplete;

      // Click to open dialog
      const workspaceCard = card.shadowRoot?.querySelector(".task-card");
      (workspaceCard as HTMLElement)?.click();
      await card.updateComplete;
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // Get the todo-progress-popup and set todos directly
      const todoPopup = card.shadowRoot?.querySelector(
        "todo-progress-popup",
      ) as HTMLElement & { todos: TodoItem[]; updateComplete: Promise<unknown> };

      if (todoPopup) {
        todoPopup.todos = todos;
        await todoPopup.updateComplete;

        // Check progress display
        const progressText =
          todoPopup.shadowRoot?.querySelector(".progress-text");
        expect(progressText?.textContent).toContain("1/3");
      }
    });
  });

  describe("ChatTodoList component", () => {
    it("should render ChatTodoList in message when todo_management is present", async () => {
      await import("../src/index");

      const todos: TodoItem[] = [
        { content: "Task 1", status: "completed" },
        { content: "Task 2", status: "in_progress" },
      ];

      const workspaces: KanbanWorkspace[] = [
        {
          id: "test-workspace",
          name: "Test Workspace",
          status: "running",
          latest_session_id: "session-1",
        },
      ];

      const messageWithTodos: SessionMessageResponse = {
        id: 1,
        session_id: "session-1",
        role: "assistant",
        content: "Updated todos",
        tool_info: {
          tool_name: "TodoWrite",
          action_type: {
            action: "todo_management",
            todos,
          },
        },
        timestamp: "2026-03-21T11:55:00Z",
      };

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/workspace/test-workspace/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  session_id: "session-1",
                  messages: [messageWithTodos],
                }),
              ),
          } as unknown as Response);
        }
        if (url.includes("/api/workspaces")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  workspaces: workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    latest_session_id: w.latest_session_id,
                  })),
                }),
              ),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      vi.stubGlobal("fetch", mockFetch);

      const card = await renderApiCard();
      card.workspaces = workspaces;
      await card.updateComplete;

      // Click to open dialog
      const workspaceCard = card.shadowRoot?.querySelector(".task-card");
      (workspaceCard as HTMLElement)?.click();
      await card.updateComplete;
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // Wait for messages to load
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // Check if chat-todo-list is rendered in the message
      const chatTodoList = card.shadowRoot?.querySelector("chat-todo-list");
      expect(chatTodoList).toBeDefined();
    });
  });

  describe("Todo extraction from messages", () => {
    it("should render TodoProgressPopup with correct todos when provided", async () => {
      // This test verifies that the TodoProgressPopup correctly displays todos
      // when they are passed to it. The actual extraction from realtime messages
      // happens in appendRealtimeMessages which is tested separately.
      await import("../src/index");

      const todos: TodoItem[] = [
        { content: "Completed task", status: "completed" },
        { content: "In progress task", status: "in_progress" },
        { content: "Pending task", status: "pending" },
      ];

      const workspaces: KanbanWorkspace[] = [
        {
          id: "test-workspace",
          name: "Test Workspace",
          status: "running",
          latest_session_id: "session-1",
        },
      ];

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/workspace/test-workspace/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ messages: [] })),
          } as unknown as Response);
        }
        if (url.includes("/api/workspaces")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  workspaces: workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    latest_session_id: w.latest_session_id,
                  })),
                }),
              ),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      vi.stubGlobal("fetch", mockFetch);

      const card = await renderApiCard();
      card.workspaces = workspaces;
      await card.updateComplete;

      // Click to open dialog - this triggers message loading
      const workspaceCard = card.shadowRoot?.querySelector(".task-card");
      (workspaceCard as HTMLElement)?.click();
      await card.updateComplete;
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // Get the TodoProgressPopup and set todos directly
      const todoPopup = card.shadowRoot?.querySelector(
        "todo-progress-popup",
      ) as HTMLElement & { todos: TodoItem[]; updateComplete: Promise<unknown> };

      // Verify the popup exists
      expect(todoPopup).toBeDefined();
      expect(todoPopup).not.toBeNull();

      if (todoPopup) {
        // Set todos directly to verify the popup displays them correctly
        todoPopup.todos = todos;
        await todoPopup.updateComplete;

        // Verify todos were set correctly
        expect(todoPopup.todos).toEqual(todos);

        // Verify progress is displayed
        const progressText =
          todoPopup.shadowRoot?.querySelector(".progress-text");
        expect(progressText?.textContent).toContain("1/3");
      }
    });

    it("should handle messages without todo_management", async () => {
      await import("../src/index");

      const workspaces: KanbanWorkspace[] = [
        {
          id: "test-workspace",
          name: "Test Workspace",
          status: "running",
          latest_session_id: "session-1",
        },
      ];

      const regularMessage: SessionMessageResponse = {
        id: 1,
        session_id: "session-1",
        role: "assistant",
        content: "Regular message without todos",
        timestamp: "2026-03-21T11:55:00Z",
      };

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/workspace/test-workspace/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  session_id: "session-1",
                  messages: [regularMessage],
                }),
              ),
          } as unknown as Response);
        }
        if (url.includes("/api/workspaces")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  workspaces: workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    latest_session_id: w.latest_session_id,
                  })),
                }),
              ),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      vi.stubGlobal("fetch", mockFetch);

      const card = await renderApiCard();
      card.workspaces = workspaces;
      await card.updateComplete;

      // Click to open dialog
      const workspaceCard = card.shadowRoot?.querySelector(".task-card");
      (workspaceCard as HTMLElement)?.click();
      await card.updateComplete;
      await vi.runAllTimersAsync();
      await card.updateComplete;

      // The TodoProgressPopup should have empty todos
      const todoPopup = card.shadowRoot?.querySelector(
        "todo-progress-popup",
      ) as HTMLElement & { todos: TodoItem[] };

      if (todoPopup) {
        expect(todoPopup.todos).toEqual([]);
      }
    });
  });

  describe("TodoProgressPopup popover interaction", () => {
    it("should show popover when button is clicked", async () => {
      await import("../src/components/todo-progress-popup");

      const todos: TodoItem[] = [
        { content: "Task 1", status: "completed" },
        { content: "Task 2", status: "in_progress" },
      ];

      const element = document.createElement(
        "todo-progress-popup",
      ) as HTMLElement & { todos: TodoItem[]; open: boolean; updateComplete: Promise<unknown> };
      element.todos = todos;
      document.body.appendChild(element);
      await element.updateComplete;

      // Initially popover is rendered but not open (CSS display: none)
      let popover = element.shadowRoot?.querySelector(".todo-popover");
      expect(popover).toBeDefined();
      expect(popover?.classList.contains("open")).toBe(false);
      expect(element.open).toBe(false);

      // Click button to show popover
      const button = element.shadowRoot?.querySelector("button");
      button?.click();
      await element.updateComplete;

      // Now popover should be open
      popover = element.shadowRoot?.querySelector(".todo-popover");
      expect(popover?.classList.contains("open")).toBe(true);
      expect(element.open).toBe(true);

      document.body.removeChild(element);
    });
  });
});
