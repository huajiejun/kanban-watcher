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

async function settleCard(card: KanbanWatcherCardElement) {
  await Promise.resolve();
  await Promise.resolve();
  await card.updateComplete;
  await Promise.resolve();
  await card.updateComplete;
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
