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
  setConfig(config: { entity: string }): void;
  updateComplete?: Promise<unknown>;
};

const entityId = "sensor.kanban_watcher_kanban_watcher";

function createWorkspaces(): KanbanWorkspace[] {
  return [
    {
      id: "attention-1",
      name: "Needs Attention",
      status: "completed",
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
      has_unseen_turns: true,
      files_changed: 5,
      lines_added: 20,
      lines_removed: 8,
    },
    {
      id: "idle-1",
      name: "Idle Workspace",
      status: "completed",
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

function normalizeText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
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
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
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

  it("opens a large workspace chat dialog with scrolling messages and compact actions", async () => {
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
    expect(text).toContain("请先确认这个工作区的下一步安排。");
    expect(text).toContain("我先整理最新状态，稍后给你结论。");
    expect(text).toContain("如果下午还没有结果，就先给我一个阻塞说明。");
    expect(shadowRoot?.querySelectorAll(".message-row").length).toBeGreaterThan(6);
    expect(text).not.toContain("查看兑换内容");
    expect(shadowRoot?.querySelector(".dialog-summary")).toBeNull();
    expect(shadowRoot?.querySelector(".message-list")).not.toBeNull();
    expect(text).toContain("发送消息");
    expect(text).toContain("队列消息");
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

  it("keeps message input local to the active workspace and shows placeholder action feedback", async () => {
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
    sendButton?.click();
    await card.updateComplete;

    expect(
      normalizeText(shadowRoot?.querySelector(".dialog-feedback")?.textContent),
    ).toContain("发送消息功能暂未接入");

    taskCards[1]?.click();
    await card.updateComplete;

    expect(
      normalizeText(shadowRoot?.querySelector(".message-list")?.textContent),
    ).toContain("运行中的任务目前有新的输出吗？");
    expect(
      normalizeText(shadowRoot?.querySelector(".message-list")?.textContent),
    ).toContain("我会继续观察日志，并在下一轮输出后同步你。");

    expect(
      (shadowRoot?.querySelector(".message-input") as HTMLTextAreaElement | null)?.value,
    ).toBe("");

    const queueButton = shadowRoot?.querySelector(
      ".dialog-action-secondary",
    ) as HTMLButtonElement | null;
    queueButton?.click();
    await card.updateComplete;

    expect(
      normalizeText(shadowRoot?.querySelector(".dialog-feedback")?.textContent),
    ).toContain("队列消息功能暂未接入");
  });

  it("declares a large dialog with its own scrollable full-width message flow", () => {
    const cssText = cardStyles.cssText;

    expect(cssText).toContain(".message-list");
    expect(cssText).toContain("overflow-y: auto");
    expect(cssText).toContain(".message-row.is-user");
    expect(cssText).toContain("justify-content: flex-start");
    expect(cssText).toContain(".message-row.is-ai");
    expect(cssText).toContain("justify-content: flex-end");
    expect(cssText).toContain("width: 100%");
    expect(cssText).toContain("width: min(900px, calc(100vw - 24px))");
    expect(cssText).not.toContain("max-width: min(72%, 560px)");
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
});
