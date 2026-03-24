// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewHass } from "../src/dev/preview-fixture";
import { getStatusMeta } from "../src/lib/status-meta";
import "../src/index";
import { cardStyles } from "../src/styles";
import type { KanbanEntityAttributes, KanbanWorkspace } from "../src/types";

type HassEntity = {
  attributes?: KanbanEntityAttributes;
};

type HassLike = {
  states: Record<string, HassEntity>;
};

type KanbanWatcherCardElement = HTMLElement & {
  hass?: HassLike;
  setConfig(config: {
    entity: string;
    base_url?: string;
    api_key?: string;
    messages_limit?: number;
  }): void;
  updateComplete?: Promise<unknown>;
};

type MockRealtimeEvent = {
  type: string;
  session_id?: string;
  workspaces?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
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

  emitMessage(payload: MockRealtimeEvent) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(payload),
      }),
    );
  }

  emitClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

const entityId = "sensor.kanban_watcher_kanban_watcher";

function createWorkspaces(): KanbanWorkspace[] {
  return [
    {
      id: "attention-1",
      name: "Needs Attention",
      status: "completed",
      latest_session_id: "session-attention-1",
      has_unseen_turns: true,
      has_running_dev_server: true,
      files_changed: 3,
      lines_added: 12,
      lines_removed: 4,
    },
    {
      id: "running-1",
      name: "Running Workspace",
      status: "running",
      latest_session_id: "session-running-1",
      has_unseen_turns: true,
      files_changed: 5,
      lines_added: 20,
      lines_removed: 8,
    },
    {
      id: "idle-1",
      name: "Idle Workspace",
      status: "completed",
      latest_session_id: "session-idle-1",
      completed_at: "2026-03-21T11:45:00Z",
      files_changed: 2,
      lines_added: 6,
      lines_removed: 1,
    },
  ];
}

function createHass(
  workspaces: KanbanWorkspace[] | string | undefined = createWorkspaces(),
  updatedAt = "2026-03-21T11:55:00Z",
): HassLike {
  return {
    states: {
      [entityId]: {
        attributes: {
          updated_at: updatedAt,
          workspaces,
        },
      },
      "sensor.kanban_watcher_kanban_session_attention_1": {
        attributes: {
          session_id: "session-attention-1",
          workspace_id: "attention-1",
          workspace_name: "Needs Attention",
          recent_messages: [
            {
              role: "user",
              content: "真实 attention 用户消息",
              timestamp: "2026-03-21T11:53:00Z",
            },
            {
              role: "assistant",
              content: "真实 attention 助手消息",
              timestamp: "2026-03-21T11:54:00Z",
            },
          ],
        },
      },
      "sensor.kanban_watcher_kanban_session_running_1": {
        attributes: {
          session_id: "session-running-1",
          workspace_id: "running-1",
          workspace_name: "Running Workspace",
          recent_messages: [
            {
              role: "user",
              content: "真实运行中用户消息",
              timestamp: "2026-03-21T11:54:30Z",
            },
            {
              role: "assistant",
              content: "真实运行中助手消息",
              timestamp: "2026-03-21T11:55:00Z",
            },
          ],
        },
      },
      "sensor.kanban_watcher_kanban_session_idle_1": {
        attributes: {
          session_id: "session-idle-1",
          workspace_id: "idle-1",
          workspace_name: "Idle Workspace",
          recent_messages: [
            {
              role: "user",
              content: "真实已完成用户消息",
              timestamp: "2026-03-21T11:44:00Z",
            },
            {
              role: "assistant",
              content: "真实已完成助手消息",
              timestamp: "2026-03-21T11:45:00Z",
            },
          ],
        },
      },
    },
  };
}

function createHassWithoutSessionState(workspaces: KanbanWorkspace[] = createWorkspaces()): HassLike {
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

async function renderCard(hass = createHass()) {
  const card = document.createElement(
    "kanban-watcher-card",
  ) as KanbanWatcherCardElement;
  card.setConfig({ entity: entityId });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

async function renderApiCard(
  options: {
    baseUrl?: string;
    apiKey?: string;
    messagesLimit?: number;
  } = {},
) {
  const card = document.createElement(
    "kanban-watcher-card",
  ) as KanbanWatcherCardElement;
  card.setConfig({
    entity: entityId,
    base_url: options.baseUrl ?? "http://localhost:7778",
    api_key: options.apiKey ?? "test-api-key",
    messages_limit: options.messagesLimit ?? 50,
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

function normalizeText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function mockJSONResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("getStatusMeta", () => {
  it("returns display metadata for attention, running, and idle states", () => {
    expect(getStatusMeta({ status: "completed", has_unseen_turns: true })).toEqual({
      icons: [{ symbol: "●", kind: "unseen", tone: "brand" }],
      accentClass: "is-attention",
    });

    expect(
      getStatusMeta({
        status: "running",
        has_unseen_turns: true,
        has_running_dev_server: true,
      }),
    ).toEqual({
      icons: [
        { symbol: "🖥️", kind: "dev-server", tone: "brand" },
        { symbol: "⋯", kind: "running", tone: "brand" },
      ],
      accentClass: "is-running",
    });

    expect(getStatusMeta({ status: "running" })).toEqual({
      icons: [{ symbol: "⋯", kind: "running", tone: "brand" }],
      accentClass: "is-running",
    });

    expect(
      getStatusMeta({ status: "completed", has_running_dev_server: true }),
    ).toEqual({
      icons: [{ symbol: "🖥️", kind: "dev-server", tone: "brand" }],
      accentClass: "is-idle",
    });

    expect(getStatusMeta({ status: "completed", has_pending_approval: true })).toEqual({
      icons: [{ symbol: "✋", kind: "approval", tone: "brand" }],
      accentClass: "is-attention",
    });

    expect(getStatusMeta({ status: "completed" })).toEqual({
      icons: [{ symbol: "•", kind: "idle", tone: "muted" }],
      accentClass: "is-idle",
    });

    expect(getStatusMeta({ status: "paused" })).toEqual({
      icons: [{ symbol: "•", kind: "idle", tone: "muted" }],
      accentClass: "is-idle",
    });
  });

  it("preserves unread and approval indicators together when both are present", () => {
    expect(
      getStatusMeta({
        status: "completed",
        has_unseen_turns: true,
        has_pending_approval: true,
      }),
    ).toEqual({
      icons: [
        { symbol: "✋", kind: "approval", tone: "brand" },
        { symbol: "●", kind: "unseen", tone: "brand" },
      ],
      accentClass: "is-attention",
    });
  });

  it("does not show an extra unread dot for running workspaces", () => {
    expect(
      getStatusMeta({
        status: "running",
        has_unseen_turns: true,
      }),
    ).toEqual({
      icons: [{ symbol: "⋯", kind: "running", tone: "brand" }],
      accentClass: "is-running",
    });
  });

  it("keeps pending approval icon on running workspaces that will be grouped into attention", () => {
    expect(
      getStatusMeta({
        status: "running",
        has_pending_approval: true,
      }),
    ).toEqual({
      icons: [{ symbol: "✋", kind: "approval", tone: "brand" }],
      accentClass: "is-attention",
    });
  });

  it("shows a red triangle for killed or failed non-running workspaces", () => {
    expect(
      getStatusMeta({
        status: "completed",
        latest_process_status: "killed",
      }),
    ).toEqual({
      icons: [{ symbol: "▲", kind: "process-error", tone: "error" }],
      accentClass: "is-idle",
    });
  });

  it("treats killed workspaces with unseen turns as attention", () => {
    expect(
      getStatusMeta({
        status: "killed",
        latest_process_status: "killed",
        has_unseen_turns: true,
      }),
    ).toEqual({
      icons: [
        { symbol: "▲", kind: "process-error", tone: "error" },
        { symbol: "●", kind: "unseen", tone: "brand" },
      ],
      accentClass: "is-attention",
    });
  });

  it("orders dev server, process state, unread, pr, and pin icons by priority", () => {
    expect(
      getStatusMeta({
        status: "completed",
        has_unseen_turns: true,
        has_running_dev_server: true,
        pr_status: "open",
        is_pinned: true,
      }),
    ).toEqual({
      icons: [
        { symbol: "🖥️", kind: "dev-server", tone: "brand" },
        { symbol: "●", kind: "unseen", tone: "brand" },
        { symbol: "⎇", kind: "pr-open", tone: "success" },
        { symbol: "📌", kind: "pin", tone: "brand" },
      ],
      accentClass: "is-attention",
    });
  });
});

describe("kanban-watcher-card", () => {
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

  it("registers the custom card with Home Assistant metadata", () => {
    const registry = (window as typeof window & { customCards?: unknown[] })
      .customCards;

    expect(customElements.get("kanban-watcher-card")).toBeDefined();
    expect(registry).toEqual([
      expect.objectContaining({
        type: "kanban-watcher-card",
        name: "Kanban Watcher Card",
      }),
    ]);
  });

  it("requires an entity in the card config", () => {
    const card = document.createElement(
      "kanban-watcher-card",
    ) as KanbanWatcherCardElement;

    expect(() => card.setConfig({ entity: "" })).toThrow("`entity` is required");
  });

  it("renders visible sections in attention, running, idle order with compact task metadata", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;

    const content = normalizeText(shadowRoot?.textContent);

    expect(content).toContain("需要注意");
    expect(content).toContain("运行中");
    expect(content).toContain("空闲");
    expect(content).toContain("Needs Attention");
    expect(content).toContain("Running Workspace");
    expect(content).toContain("Idle Workspace");
    expect(content).toContain("5m ago");
    expect(content).toContain("15m ago");
    expect(content).toContain("📄 3 +12 -4");
    expect(content).toContain("🖥️");

    const sectionTitles = Array.from(
      shadowRoot?.querySelectorAll(".section-title") ?? [],
    ).map((element) => element.textContent?.trim());

    expect(sectionTitles).toEqual(["需要注意", "运行中", "空闲"]);
    expect(shadowRoot?.querySelectorAll(".task-card")).toHaveLength(3);
    expect(shadowRoot?.querySelector(".relative-time")?.textContent?.trim()).toBe(
      "5m ago",
    );
  });

  it("uses completed_at only for completed workspaces and updated_at otherwise", async () => {
    const card = await renderCard(
      createHass(
        [
          {
            id: "running-with-old-completion",
            name: "Running Freshness",
            status: "running",
            completed_at: "2026-03-01T12:00:00Z",
            files_changed: 1,
            lines_added: 5,
            lines_removed: 2,
          },
          {
            id: "completed-with-own-completion",
            name: "Completed Freshness",
            status: "completed",
            completed_at: "2026-03-21T11:45:00Z",
            files_changed: 2,
            lines_added: 8,
            lines_removed: 1,
          },
        ],
        "2026-03-21T11:55:00Z",
      ),
    );

    const relativeTimes = Array.from(
      card.shadowRoot?.querySelectorAll(".relative-time") ?? [],
    ).map((element) => element.textContent?.trim());

    expect(relativeTimes).toContain("5m ago");
    expect(relativeTimes).toContain("15m ago");
    expect(relativeTimes).not.toContain("20d ago");
  });

  it("prefers backend relative_time when provided", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "completed-with-relative-time",
          name: "Completed Relative Time",
          status: "completed",
          completed_at: "2026-03-21T11:45:00Z",
          relative_time: "15分钟前",
          files_changed: 2,
          lines_added: 8,
          lines_removed: 1,
        },
      ]),
    );

    const relativeTimes = Array.from(
      card.shadowRoot?.querySelectorAll(".relative-time") ?? [],
    ).map((element) => element.textContent?.trim());

    expect(relativeTimes).toContain("15分钟前");
    expect(relativeTimes).not.toContain("15m ago");
  });

  it("parses workspaces when the backend provides a JSON string", async () => {
    const card = await renderCard(
      createHass(
        JSON.stringify([
          {
            id: "json-workspace-1",
            name: "JSON Workspace",
            status: "completed",
            relative_time: "1分钟前",
            files_changed: 4,
            lines_added: 10,
            lines_removed: 2,
            needs_attention: false,
            has_pending_approval: false,
          },
        ]),
      ),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("JSON Workspace");
    expect(text).toContain("1分钟前");
    expect(text).toContain("空闲");
  });

  it("renders only the attention section when all tasks need attention", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "attention-only",
          name: "Attention Only",
          status: "completed",
          has_unseen_turns: true,
          files_changed: 2,
          lines_added: 50,
          lines_removed: 10,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("需要注意");
    expect(text).not.toContain("运行中");
    expect(text).not.toContain("空闲");
  });

  it("renders running tasks with pending approval under attention", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "running-approval",
          name: "Running Approval",
          status: "running",
          has_pending_approval: true,
          files_changed: 2,
          lines_added: 7,
          lines_removed: 1,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("需要注意");
    expect(text).not.toContain("运行中");
    expect(text).not.toContain("空闲");
    expect(text).toContain("Running Approval");
    expect(text).toContain("✋");
  });

  it("hides empty sections and shows the empty state when there are no tasks", async () => {
    const cardWithRunningOnly = await renderCard(
      createHass([
        {
          id: "running-only",
          name: "Solo Running",
          status: "running",
          files_changed: 1,
          lines_added: 1,
          lines_removed: 0,
        },
      ]),
    );

    expect(cardWithRunningOnly.shadowRoot?.textContent).not.toContain(
      "需要注意",
    );
    expect(cardWithRunningOnly.shadowRoot?.textContent).toContain("运行中");
    expect(cardWithRunningOnly.shadowRoot?.textContent).not.toContain("空闲");

    document.body.innerHTML = "";

    const emptyCard = await renderCard(createHass([]));
    expect(emptyCard.shadowRoot?.textContent).toContain("当前没有任务");
    expect(emptyCard.shadowRoot?.querySelectorAll(".section")).toHaveLength(0);
  });

  it("renders only the idle section when tasks are completed", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "idle-only",
          name: "Idle Only",
          status: "completed",
          completed_at: "2026-03-20T12:00:00Z",
          files_changed: 1,
          lines_added: 3,
          lines_removed: 1,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).not.toContain("需要注意");
    expect(text).not.toContain("运行中");
    expect(text).toContain("空闲");
  });

  it("falls back unknown backend statuses into the idle section with neutral styling", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "paused-only",
          name: "Paused Workspace",
          status: "paused",
          files_changed: 4,
          lines_added: 9,
          lines_removed: 2,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);
    const taskCard = card.shadowRoot?.querySelector(".task-card");

    expect(text).not.toContain("需要注意");
    expect(text).not.toContain("运行中");
    expect(text).toContain("空闲");
    expect(text).toContain("Paused Workspace");
    expect(taskCard?.classList.contains("is-idle")).toBe(true);
  });

  it("shows running workspaces under running even when they have unseen turns", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "running-unseen",
          name: "Running Unseen",
          status: "running",
          has_unseen_turns: true,
          files_changed: 4,
          lines_added: 9,
          lines_removed: 2,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).not.toContain("需要注意");
    expect(text).toContain("运行中");
    expect(text).not.toContain("空闲");
    expect(text).toContain("Running Unseen");
  });

  it("renders only one attention dot for completed unseen tasks", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "attention-dot",
          name: "Single Attention Dot",
          status: "completed",
          has_unseen_turns: true,
          files_changed: 1,
          lines_added: 2,
          lines_removed: 0,
        },
      ]),
    );

    const icons = Array.from(card.shadowRoot?.querySelectorAll(".meta-status span") ?? []).map(
      (element) => element.textContent?.trim(),
    );

    expect(icons).toEqual(["●"]);
  });

  it("toggles section collapse when the header is clicked", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const firstSectionHeader = shadowRoot?.querySelector(
      ".section-toggle",
    ) as HTMLButtonElement | null;

    expect(
      shadowRoot?.querySelectorAll(".section-body .task-card").length,
    ).toBeGreaterThan(0);

    firstSectionHeader?.click();
    await card.updateComplete;

    expect(shadowRoot?.querySelector(".section")?.hasAttribute("collapsed")).toBe(
      true,
    );
    expect(
      shadowRoot?.querySelectorAll(".section-body .task-card").length,
    ).toBeLessThan(4);

    firstSectionHeader?.click();
    await card.updateComplete;

    expect(shadowRoot?.querySelector(".section")?.hasAttribute("collapsed")).toBe(
      false,
    );
  });

  it("declares truncation rules for long workspace names", () => {
    const cssText = cardStyles.cssText;

    expect(cssText).toContain(".workspace-name");
    expect(cssText).toContain("overflow: hidden");
    expect(cssText).toContain("text-overflow: ellipsis");
    expect(cssText).toContain("white-space: nowrap");
  });

  it("renders large diff counts without dropping the metadata summary", async () => {
    const card = await renderCard(
      createHass([
        {
          id: "diff-heavy",
          name: "Large Diff Workspace",
          status: "completed",
          completed_at: "2026-03-19T12:00:00Z",
          files_changed: 999,
          lines_added: 12345,
          lines_removed: 6789,
        },
      ]),
    );

    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("📄 999 +12345 -6789");
  });

  it("opens a large workspace chat dialog with status-aware actions", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const taskCard = shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;

    taskCard?.click();
    await card.updateComplete;

    const dialog = shadowRoot?.querySelector(".workspace-dialog");
    const text = normalizeText(dialog?.textContent);

    expect(dialog).not.toBeNull();
    expect(text).toContain("Needs Attention");
    expect(text).toContain("对话消息");
    expect(text).toContain("真实 attention 用户消息");
    expect(text).toContain("真实 attention 助手消息");
    expect(shadowRoot?.querySelectorAll(".message-row").length).toBe(2);
    expect(text).not.toContain("查看兑换内容");
    expect(shadowRoot?.querySelector(".dialog-summary")).toBeNull();
    expect(shadowRoot?.querySelector(".message-list")).not.toBeNull();
    expect(text).toContain("发送消息");
    expect(text).not.toContain("加入队列");
    expect(
      (shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement | null)?.value,
    ).toBe("");
  });

  it("closes the workspace dialog from overlay, close button, and escape key", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const taskCard = shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;

    taskCard?.click();
    await card.updateComplete;
    (shadowRoot?.querySelector(".dialog-overlay") as HTMLButtonElement | null)?.click();
    await card.updateComplete;
    expect(shadowRoot?.querySelector(".workspace-dialog")).toBeNull();

    taskCard?.click();
    await card.updateComplete;
    (shadowRoot?.querySelector(".dialog-close") as HTMLButtonElement | null)?.click();
    await card.updateComplete;
    expect(shadowRoot?.querySelector(".workspace-dialog")).toBeNull();

    taskCard?.click();
    await card.updateComplete;
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await card.updateComplete;
    expect(shadowRoot?.querySelector(".workspace-dialog")).toBeNull();
  });

  it("switches actions by running state and keeps non-api queue action in placeholder mode", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const taskCards = Array.from(
      shadowRoot?.querySelectorAll(".task-card") ?? [],
    ) as HTMLButtonElement[];

    taskCards[0]?.click();
    await card.updateComplete;

    const messageInput = shadowRoot?.querySelector(
      ".message-input",
    ) as HTMLTextAreaElement | null;
    messageInput!.value = "请同步兑换进度";
    messageInput?.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await card.updateComplete;

    const sendButton = shadowRoot?.querySelector(
      ".dialog-action-primary",
    ) as HTMLButtonElement | null;
    expect(normalizeText(sendButton?.textContent)).toBe("发送消息");
    expect(shadowRoot?.querySelector(".dialog-action-secondary")).toBeNull();
    sendButton?.click();
    await card.updateComplete;

    expect(
      normalizeText(shadowRoot?.querySelector(".dialog-feedback")?.textContent),
    ).toContain("发送消息功能暂未接入");

    taskCards[1]?.click();
    await card.updateComplete;

    const stopButton = shadowRoot?.querySelector(
      ".dialog-action-primary",
    ) as HTMLButtonElement | null;
    const queueButton = shadowRoot?.querySelector(
      ".dialog-action-secondary",
    ) as HTMLButtonElement | null;

    expect(normalizeText(stopButton?.textContent)).toContain("停止");
    expect(stopButton?.querySelector(".action-spinner")).not.toBeNull();
    expect(normalizeText(queueButton?.textContent)).toBe("加入队列");
    expect(
      normalizeText(shadowRoot?.querySelector(".message-list")?.textContent),
    ).toContain("真实运行中用户消息");
    expect(
      normalizeText(shadowRoot?.querySelector(".message-list")?.textContent),
    ).toContain("真实运行中助手消息");

    expect(
      (shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement | null)?.value,
    ).toBe("");

    const runningMessageInput = shadowRoot?.querySelector(
      ".message-input",
    ) as HTMLTextAreaElement | null;
    runningMessageInput!.value = "运行中先加入这一条队列";
    runningMessageInput?.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await card.updateComplete;

    queueButton?.click();
    await card.updateComplete;

    expect(
      normalizeText(shadowRoot?.querySelector(".dialog-feedback")?.textContent),
    ).toContain("发送消息功能暂未接入");
  });

  it("declares a large dialog with its own scrollable full-width message flow", () => {
    const cssText = cardStyles.cssText;

    expect(cssText).toContain(".message-list");
    expect(cssText).toContain("overflow-y: auto");
    expect(cssText).toContain(".message-row");
    expect(cssText).toContain("width: 100%");
    expect(cssText).toContain("width: min(900px, calc(100vw - 24px))");
    expect(cssText).toContain(".message-bubble.is-user");
    expect(cssText).toContain(".message-bubble.is-ai");
    expect(cssText).not.toContain("justify-content: flex-end");
    expect(cssText).not.toContain("text-align: right");
    expect(cssText).toContain("white-space: normal");
    expect(cssText).not.toContain("white-space: pre-wrap");
  });

  it("shows a long default chat history for preview workspaces instead of the 2-message fallback", async () => {
    const card = await renderCard(createPreviewHass());
    const shadowRoot = card.shadowRoot;
    const taskCard = shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;

    taskCard?.click();
    await card.updateComplete;

    const messageRows = shadowRoot?.querySelectorAll(".message-row") ?? [];
    const text = normalizeText(shadowRoot?.querySelector(".message-list")?.textContent);

    expect(text).toContain("请先确认这个工作区的下一步安排。");
    expect(text).toContain("如果下午还没有结果，就先给我一个阻塞说明。");
    expect(messageRows.length).toBeGreaterThanOrEqual(15);
  });

  it("renders the mocked real session history for the design dialog workspace in preview", async () => {
    const card = await renderCard(createPreviewHass());
    const shadowRoot = card.shadowRoot;
    const taskCards = Array.from(
      shadowRoot?.querySelectorAll(".task-card") ?? [],
    ) as HTMLButtonElement[];
    const designDialogCard = taskCards.find((element) =>
      normalizeText(element.textContent).includes("设计点击弹框界面"),
    );

    designDialogCard?.click();
    await card.updateComplete;

    const dialogText = normalizeText(shadowRoot?.querySelector(".message-list")?.textContent);

    expect(dialogText).toContain("我们用的id不是workspace_id 而是上层接口里的last_session_id");
    expect(dialogText).toContain("明白，这个约束现在很关键：");
    expect(dialogText).toContain("弹窗真实对话不能按 workspace_id 关联");
    expect(dialogText).toContain("这意味着现阶段我不建议直接把弹窗改成读取真实 recent_messages");

    const renderedList = shadowRoot?.querySelector(".message-bubble ul");
    const renderedCode = Array.from(shadowRoot?.querySelectorAll(".message-bubble code") ?? []).find(
      (element) => normalizeText(element.textContent) === "workspace_id",
    );

    expect(renderedList).not.toBeNull();
    expect(renderedCode).not.toBeNull();
  });

  it("prefers real recent_messages matched by latest_session_id for dialog history", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const taskCards = Array.from(
      shadowRoot?.querySelectorAll(".task-card") ?? [],
    ) as HTMLButtonElement[];

    taskCards[0]?.click();
    await card.updateComplete;

    const dialogText = normalizeText(shadowRoot?.querySelector(".message-list")?.textContent);

    expect(dialogText).toContain("真实 attention 用户消息");
    expect(dialogText).toContain("真实 attention 助手消息");
    expect(dialogText).not.toContain("请先确认这个工作区的下一步安排。");
  });

  it("shows a real empty-state message instead of fake dialog content when the session is missing", async () => {
    const card = await renderCard(
      createHassWithoutSessionState([
        {
          id: "real-workspace-1",
          name: "真实工作区",
          status: "completed",
          latest_session_id: "missing-session-1",
        },
      ]),
    );
    const shadowRoot = card.shadowRoot;
    const taskCard = shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;

    taskCard?.click();
    await card.updateComplete;

    const dialogText = normalizeText(shadowRoot?.querySelector(".message-list")?.textContent);

    expect(dialogText).toContain("暂无同步的对话消息");
    expect(dialogText).not.toContain("请先确认这个工作区的下一步安排。");
    expect(dialogText).not.toContain("我正在整理消息记录，稍后继续反馈。");
  });

  it("opens each workspace at the latest message and lets older messages stay above", async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.classList?.contains("message-list") ? 480 : 0;
      },
    });

    try {
      const card = await renderCard(createPreviewHass());
      const shadowRoot = card.shadowRoot;
      const taskCards = Array.from(
        shadowRoot?.querySelectorAll(".task-card") ?? [],
      ) as HTMLButtonElement[];
      const approvalCard = taskCards.find((element) =>
        normalizeText(element.textContent).includes("消息确认待审批"),
      );
      const runningCard = taskCards.find((element) =>
        normalizeText(element.textContent).includes("批量对话运行中"),
      );

      approvalCard?.click();
      await card.updateComplete;

      const firstMessageList = shadowRoot?.querySelector(".message-list") as HTMLDivElement | null;
      expect(firstMessageList?.scrollTop).toBe(480);

      runningCard?.click();
      await card.updateComplete;

      const secondMessageList = shadowRoot?.querySelector(".message-list") as HTMLDivElement | null;
      expect(secondMessageList?.scrollTop).toBe(480);
      expect(normalizeText(secondMessageList?.textContent)).toContain("继续跑，先不要中断。");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollHeight;
      }
    }
  });

  it("shows the stop feedback for running workspaces", async () => {
    const card = await renderCard();
    const shadowRoot = card.shadowRoot;
    const taskCards = Array.from(
      shadowRoot?.querySelectorAll(".task-card") ?? [],
    ) as HTMLButtonElement[];

    taskCards[1]?.click();
    await card.updateComplete;

    const stopButton = shadowRoot?.querySelector(
      ".dialog-action-primary",
    ) as HTMLButtonElement | null;
    stopButton?.click();
    await card.updateComplete;

    expect(normalizeText(shadowRoot?.querySelector(".dialog-feedback")?.textContent)).toContain(
      "停止功能暂未接入",
    );
  });

  it("loads workspaces from the local API when base_url is configured", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-running",
              name: "API Running Workspace",
              status: "running",
              latest_session_id: "session-api-running",
              updated_at: "2026-03-21T11:58:00Z",
            },
            {
              id: "api-idle",
              name: "API Idle Workspace",
              status: "completed",
              latest_session_id: "session-api-idle",
              updated_at: "2026-03-21T11:50:00Z",
            },
          ],
        }),
      );

    const card = await renderApiCard({ baseUrl: "http://localhost:7778" });
    const text = normalizeText(card.shadowRoot?.textContent);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7778/api/workspaces/active",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
        }),
      }),
    );
    expect(text).toContain("API Running Workspace");
    expect(text).toContain("API Idle Workspace");
    expect(text).toContain("运行中");
    expect(text).toContain("空闲");
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toContain("/api/realtime/ws");
    expect(MockWebSocket.instances[0]?.url).not.toContain("session_id=");
  });

  it("renders API workspaces with unseen turns under attention", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJSONResponse({
        workspaces: [
          {
            id: "api-attention",
            name: "API Attention Workspace",
            status: "completed",
            latest_session_id: "session-api-attention",
            updated_at: "2026-03-21T11:58:00Z",
            has_unseen_turns: true,
            files_changed: 7,
            lines_added: 18,
            lines_removed: 4,
          },
        ],
      }),
    );

    const card = await renderApiCard({ baseUrl: "http://localhost:7778" });
    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("需要注意");
    expect(text).toContain("API Attention Workspace");
    expect(text).toContain("📄 7 +18 -4");
    expect(text).not.toContain("空闲");
  });

  it("renders killed API workspaces with unseen turns under attention", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJSONResponse({
        workspaces: [
          {
            id: "api-killed-attention",
            name: "API Killed Attention Workspace",
            status: "killed",
            latest_session_id: "session-api-killed-attention",
            updated_at: "2026-03-21T11:58:00Z",
            has_unseen_turns: true,
          },
        ],
      }),
    );

    const card = await renderApiCard({ baseUrl: "http://localhost:7778" });
    const text = normalizeText(card.shadowRoot?.textContent);

    expect(text).toContain("需要注意");
    expect(text).toContain("API Killed Attention Workspace");
    expect(text).not.toContain("空闲");
  });

  it("loads latest messages from the local API when opening a workspace dialog", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-dialog",
              name: "API Dialog Workspace",
              status: "completed",
              latest_session_id: "session-api-dialog",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-dialog",
          workspace_name: "API Dialog Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-dialog",
              entry_type: "user_message",
              role: "user",
              content: "这是 API 用户消息",
              timestamp: "2026-03-21T11:57:00Z",
            },
            {
              id: 2,
              session_id: "session-api-dialog",
              entry_type: "assistant_message",
              role: "assistant",
              content: "这是 API 助手消息",
              timestamp: "2026-03-21T11:58:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard({ messagesLimit: 20 });
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "这是 API 用户消息",
    );
    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "这是 API 助手消息",
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:7778/api/workspaces/api-dialog/latest-messages?limit=20",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
        }),
      }),
    );
  });

  it("reuses cached dialog messages when reopening the same workspace without new updates", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-reopen",
              name: "API Reopen Workspace",
              status: "running",
              latest_session_id: "session-api-reopen",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-reopen",
          workspace_name: "API Reopen Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-reopen",
              entry_type: "assistant_message",
              role: "assistant",
              content: "第一次打开时看到的消息",
              timestamp: "2026-03-21T11:57:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard({ messagesLimit: 20 });
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;

    taskCard?.click();
    await settleCard(card);

    (card.shadowRoot?.querySelector(".dialog-close") as HTMLButtonElement | null)?.click();
    await settleCard(card);

    taskCard?.click();
    await settleCard(card);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "第一次打开时看到的消息",
    );
  });

  it("renders tool_use entries as dimmed summary cards in the dialog message list", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-tools",
              name: "API Tool Workspace",
              status: "running",
              latest_session_id: "session-api-tools",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-tools",
          workspace_name: "API Tool Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-tools",
              entry_type: "assistant_message",
              role: "assistant",
              content: "先执行一次检查",
              timestamp: "2026-03-21T11:57:00Z",
            },
            {
              id: 2,
              session_id: "session-api-tools",
              process_id: "process-tools",
              entry_index: 1,
              entry_type: "tool_use",
              role: "assistant",
              content: "stdout: all checks passed",
              tool_info: {
                tool_name: "Bash",
                action_type: {
                  action: "command_run",
                  command: "npm test",
                },
                status: {
                  status: "running",
                },
              },
              timestamp: "2026-03-21T11:58:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard({ messagesLimit: 20 });
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const toolButton = card.shadowRoot?.querySelector(".message-tool-button") as HTMLButtonElement | null;
    expect(toolButton).not.toBeNull();
    expect(normalizeText(toolButton?.textContent)).toContain("Bash");
    expect(normalizeText(toolButton?.textContent)).toContain("npm test");
    expect(toolButton?.classList.contains("is-running")).toBe(true);
  });

  it("groups consecutive tool_use entries with the same tool name into one folded row", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-tool-group",
              name: "API Tool Group Workspace",
              status: "running",
              latest_session_id: "session-api-tool-group",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-tool-group",
          workspace_name: "API Tool Group Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-tool-group",
              entry_type: "assistant_message",
              role: "assistant",
              content: "先读两个文件",
              timestamp: "2026-03-21T11:57:00Z",
            },
            {
              id: 2,
              session_id: "session-api-tool-group",
              process_id: "process-tools",
              entry_index: 1,
              entry_type: "tool_use",
              role: "assistant",
              content: "README content",
              tool_info: {
                tool_name: "Read",
                action_type: {
                  action: "file_read",
                  path: "README.md",
                },
                status: {
                  status: "success",
                },
              },
              timestamp: "2026-03-21T11:58:00Z",
            },
            {
              id: 3,
              session_id: "session-api-tool-group",
              process_id: "process-tools",
              entry_index: 2,
              entry_type: "tool_use",
              role: "assistant",
              content: "package content",
              tool_info: {
                tool_name: "Read",
                action_type: {
                  action: "file_read",
                  path: "package.json",
                },
                status: {
                  status: "success",
                },
              },
              timestamp: "2026-03-21T11:58:01Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard({ messagesLimit: 20 });
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const toolButtons = card.shadowRoot?.querySelectorAll(".message-tool-button") ?? [];
    expect(toolButtons).toHaveLength(1);

    const groupButton = toolButtons[0] as HTMLButtonElement;
    expect(normalizeText(groupButton.textContent)).toContain("Read");
    expect(normalizeText(groupButton.textContent)).toContain("2 commands");

    groupButton.click();
    await settleCard(card);

    const detail = card.shadowRoot?.querySelector(".message-tool-detail");
    expect(normalizeText(detail?.textContent)).toContain("README.md");
    expect(normalizeText(detail?.textContent)).toContain("package.json");
  });

  it("sends follow-up messages through the local API in API mode", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-send",
              name: "API Send Workspace",
              status: "completed",
              latest_session_id: "session-api-send",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-send",
          workspace_name: "API Send Workspace",
          messages: [],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          success: true,
          message: "Follow-up sent successfully",
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-send",
          workspace_name: "API Send Workspace",
          messages: [],
          has_more: false,
        }),
      );

    const card = await renderApiCard();
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const input = card.shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement | null;
    input!.value = "继续推进这个任务";
    input?.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await card.updateComplete;

    const sendButton = card.shadowRoot?.querySelector(
      ".dialog-action-primary",
    ) as HTMLButtonElement | null;
    sendButton?.click();
    await settleCard(card);

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "http://localhost:7778/api/workspace/api-send/message",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-API-Key": "test-api-key",
        }),
        body: JSON.stringify({ message: "继续推进这个任务", mode: "send" }),
      }),
    );
    expect(normalizeText(card.shadowRoot?.querySelector(".dialog-feedback")?.textContent)).toContain(
      "发送成功",
    );
    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "继续推进这个任务",
    );
  });

  it("appends realtime messages through WebSocket in API mode", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-live",
              name: "API Live Workspace",
              status: "running",
              latest_session_id: "session-api-live",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-live",
          workspace_name: "API Live Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-live",
              process_id: "process-1",
              entry_index: 0,
              entry_type: "assistant_message",
              role: "assistant",
              content: "初始消息",
              timestamp: "2026-03-21T11:58:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard();
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const realtimeSocket = MockWebSocket.instances.at(-1);
    expect(realtimeSocket?.url).toContain("/api/realtime/ws");
    expect(realtimeSocket?.url).toContain("session_id=session-api-live");

    realtimeSocket?.emitMessage({
      type: "session_messages_appended",
      session_id: "session-api-live",
      messages: [
        {
          id: 2,
          session_id: "session-api-live",
          process_id: "process-1",
          entry_index: 1,
          entry_type: "assistant_message",
          role: "assistant",
          content: "实时新增消息",
          timestamp: "2026-03-21T11:59:00Z",
        },
      ],
    });
    await settleCard(card);

    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "实时新增消息",
    );
  });

  it("ignores older realtime history so only newer data refreshes the dialog", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-history-order",
              name: "API History Order Workspace",
              status: "running",
              latest_session_id: "session-api-history-order",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-history-order",
          workspace_name: "API History Order Workspace",
          messages: [
            {
              id: 2,
              session_id: "session-api-history-order",
              process_id: "process-history",
              entry_index: 1,
              entry_type: "assistant_message",
              role: "assistant",
              content: "当前较新的消息",
              timestamp: "2026-03-21T11:59:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard();
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const realtimeSocket = MockWebSocket.instances.at(-1);
    realtimeSocket?.emitMessage({
      type: "session_messages_appended",
      session_id: "session-api-history-order",
      messages: [
        {
          id: 1,
          session_id: "session-api-history-order",
          process_id: "process-history",
          entry_index: 0,
          entry_type: "assistant_message",
          role: "assistant",
          content: "更早的历史消息",
          timestamp: "2026-03-21T11:58:00Z",
        },
      ],
    });
    await settleCard(card);

    const messageListText = normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent);
    expect(messageListText).toContain("当前较新的消息");
    expect(messageListText).not.toContain("更早的历史消息");
  });

  it("updates streamed realtime messages when the same message key receives longer content", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-stream",
              name: "API Stream Workspace",
              status: "running",
              latest_session_id: "session-api-stream",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-stream",
          workspace_name: "API Stream Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-stream",
              process_id: "process-stream",
              entry_index: 0,
              entry_type: "assistant_message",
              role: "assistant",
              content: "开头消息",
              timestamp: "2026-03-21T11:58:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard();
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    const realtimeSocket = MockWebSocket.instances.at(-1);
    realtimeSocket?.emitMessage({
      type: "session_messages_appended",
      session_id: "session-api-stream",
      messages: [
        {
          id: 2,
          session_id: "session-api-stream",
          process_id: "process-stream",
          entry_index: 1,
          entry_type: "assistant_message",
          role: "assistant",
          content: "实",
          timestamp: "2026-03-21T11:59:00Z",
        },
      ],
    });
    await settleCard(card);

    realtimeSocket?.emitMessage({
      type: "session_messages_appended",
      session_id: "session-api-stream",
      messages: [
        {
          id: 2,
          session_id: "session-api-stream",
          process_id: "process-stream",
          entry_index: 1,
          entry_type: "assistant_message",
          role: "assistant",
          content: "实现和验证都已经收口",
          timestamp: "2026-03-21T11:59:01Z",
        },
      ],
    });
    await settleCard(card);

    const dialogText = normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent);
    expect(dialogText).toContain("实现和验证都已经收口");
    expect(dialogText).not.toMatch(/开头消息 实(?!现和验证都已经收口)/);
  });

  it("updates workspace status through the board realtime WebSocket", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJSONResponse({
        workspaces: [
          {
            id: "api-board",
            name: "API Board Workspace",
            status: "completed",
            latest_session_id: "session-api-board",
            updated_at: "2026-03-21T11:58:00Z",
          },
        ],
      }),
    );

    const card = await renderApiCard();
    expect(normalizeText(card.shadowRoot?.textContent)).toContain("空闲");

    const boardSocket = MockWebSocket.instances[0];
    boardSocket?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "api-board",
          name: "API Board Workspace",
          status: "running",
          latest_session_id: "session-api-board",
          updated_at: "2026-03-21T11:59:00Z",
        },
      ],
    });
    await settleCard(card);

    const text = normalizeText(card.shadowRoot?.textContent);
    expect(text).toContain("运行中");
    expect(text).not.toContain("空闲");
  });

  it("keeps a stable order inside sections when board realtime updates arrive", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJSONResponse({
        workspaces: [
          {
            id: "ws-b",
            name: "Beta Workspace",
            status: "completed",
            latest_session_id: "session-ws-b",
            updated_at: "2026-03-21T11:58:00Z",
          },
          {
            id: "ws-a",
            name: "Alpha Workspace",
            status: "completed",
            latest_session_id: "session-ws-a",
            updated_at: "2026-03-21T11:59:00Z",
          },
        ],
      }),
    );

    const card = await renderApiCard();

    const beforeNames = Array.from(
      card.shadowRoot?.querySelectorAll(".workspace-name") ?? [],
    ).map((node) => normalizeText(node.textContent));
    expect(beforeNames).toEqual(["Alpha Workspace", "Beta Workspace"]);

    MockWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "ws-b",
          name: "Beta Workspace",
          status: "completed",
          latest_session_id: "session-ws-b",
          updated_at: "2026-03-21T12:00:00Z",
        },
        {
          id: "ws-a",
          name: "Alpha Workspace",
          status: "completed",
          latest_session_id: "session-ws-a",
          updated_at: "2026-03-21T11:59:00Z",
        },
      ],
    });
    await settleCard(card);

    const afterNames = Array.from(
      card.shadowRoot?.querySelectorAll(".workspace-name") ?? [],
    ).map((node) => normalizeText(node.textContent));
    expect(afterNames).toEqual(["Alpha Workspace", "Beta Workspace"]);
  });

  it("emits preview status when the board realtime WebSocket connects and updates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJSONResponse({
        workspaces: [
          {
            id: "api-observe",
            name: "API Observe Workspace",
            status: "completed",
            latest_session_id: "session-api-observe",
            updated_at: "2026-03-21T11:58:00Z",
          },
        ],
      }),
    );

    const card = document.createElement("kanban-watcher-card") as KanbanWatcherCardElement;
    const messages: string[] = [];
    card.addEventListener("kanban-watcher-preview-status", (event: Event) => {
      messages.push(((event as CustomEvent<{ message?: string }>).detail?.message ?? "").trim());
    });
    card.setConfig({
      entity: entityId,
      base_url: "http://localhost:7778",
      api_key: "test-api-key",
    });
    card.hass = createHass([]);
    document.body.append(card);
    await settleCard(card);

    MockWebSocket.instances[0]?.emitMessage({
      type: "workspace_snapshot",
      workspaces: [
        {
          id: "api-observe",
          name: "API Observe Workspace",
          status: "running",
          latest_session_id: "session-api-observe",
          updated_at: "2026-03-21T11:59:00Z",
        },
      ],
    });
    await settleCard(card);

    expect(messages.some((message) => message.includes("首页实时已连接"))).toBe(true);
    expect(messages.some((message) => message.includes("首页实时已更新"))).toBe(true);
  });

  it("falls back to polling when realtime WebSocket closes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-fallback",
              name: "API Fallback Workspace",
              status: "running",
              latest_session_id: "session-api-fallback",
              updated_at: "2026-03-21T11:58:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-fallback",
          workspace_name: "API Fallback Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-fallback",
              process_id: "process-1",
              entry_index: 0,
              entry_type: "assistant_message",
              role: "assistant",
              content: "旧消息",
              timestamp: "2026-03-21T11:58:00Z",
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          workspaces: [
            {
              id: "api-fallback",
              name: "API Fallback Workspace",
              status: "completed",
              latest_session_id: "session-api-fallback",
              updated_at: "2026-03-21T11:59:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockJSONResponse({
          session_id: "session-api-fallback",
          workspace_name: "API Fallback Workspace",
          messages: [
            {
              id: 1,
              session_id: "session-api-fallback",
              process_id: "process-1",
              entry_index: 0,
              entry_type: "assistant_message",
              role: "assistant",
              content: "旧消息",
              timestamp: "2026-03-21T11:58:00Z",
            },
            {
              id: 2,
              session_id: "session-api-fallback",
              process_id: "process-1",
              entry_index: 1,
              entry_type: "assistant_message",
              role: "assistant",
              content: "轮询补偿消息",
              timestamp: "2026-03-21T11:59:00Z",
            },
          ],
          has_more: false,
        }),
      );

    const card = await renderApiCard();
    const taskCard = card.shadowRoot?.querySelector(".task-card") as HTMLButtonElement | null;
    taskCard?.click();
    await settleCard(card);

    MockWebSocket.instances.at(-1)?.emitClose();
    vi.advanceTimersByTime(5_000);
    await settleCard(card);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7778/api/workspaces/active",
      expect.anything(),
    );
    expect(normalizeText(card.shadowRoot?.querySelector(".message-list")?.textContent)).toContain(
      "轮询补偿消息",
    );
  });
});
