import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/workspace-section-list";
import type { KanbanWorkspace } from "../src/types";
import type { WorkspaceSectionList } from "../src/components/workspace-section-list";

type TestSection = {
  key: "attention" | "running" | "idle";
  label: string;
  workspaces: KanbanWorkspace[];
};

function createWorkspace(
  overrides: Partial<KanbanWorkspace> & Pick<KanbanWorkspace, "id" | "name">,
): KanbanWorkspace {
  return {
    status: "completed",
    ...overrides,
  };
}

function createElement(
  sections: TestSection[],
  options?: {
    collapsedSections?: Set<string>;
    compact?: boolean;
    selectedWorkspaceId?: string;
  },
) {
  const element = document.createElement(
    "workspace-section-list",
  ) as WorkspaceSectionList;
  element.sections = sections;
  element.collapsedSections = options?.collapsedSections ?? new Set();
  element.compact = options?.compact ?? false;
  element.selectedWorkspaceId = options?.selectedWorkspaceId;
  element.getWorkspaceDisplayMeta = (workspace) => ({
    relativeTime: workspace.relative_time ?? "刚刚",
    filesChanged: workspace.files_changed ?? 0,
    linesAdded: workspace.lines_added ?? 0,
    linesRemoved: workspace.lines_removed ?? 0,
  });

  document.body.append(element);

  return element;
}

describe("workspace-section-list", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders compact workspace cards with only names", async () => {
    const element = createElement([
      {
        key: "attention",
        label: "需要注意",
        workspaces: [createWorkspace({ id: "ws-1", name: "Workspace 1", has_unseen_turns: true })],
      },
      {
        key: "running",
        label: "运行中",
        workspaces: [createWorkspace({ id: "ws-2", name: "Workspace 2", status: "running" })],
      },
    ], { compact: true });

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    expect(shadowRoot?.querySelectorAll(".section")).toHaveLength(2);
    expect(shadowRoot?.textContent).toContain("需要注意");
    expect(shadowRoot?.textContent).toContain("运行中");
    expect(shadowRoot?.textContent).toContain("Workspace 1");
    expect(shadowRoot?.textContent).toContain("Workspace 2");
    expect(shadowRoot?.querySelector(".task-meta")).toBeNull();
    expect(shadowRoot?.querySelector(".task-card.is-compact")).not.toBeNull();
    expect(shadowRoot?.textContent).not.toContain("刚刚");
  });

  it("renders expanded workspace cards with full meta information", async () => {
    const element = createElement([
      {
        key: "idle",
        label: "空闲",
        workspaces: [createWorkspace({ id: "ws-3", name: "Workspace 3" })],
      },
    ]);

    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".task-meta")).not.toBeNull();
    expect(element.shadowRoot?.textContent).toContain("刚刚");
  });

  it("applies status accent classes for attention, running and idle workspaces", async () => {
    const element = createElement([
      {
        key: "attention",
        label: "需要注意",
        workspaces: [createWorkspace({ id: "ws-1", name: "Workspace 1", has_unseen_turns: true })],
      },
      {
        key: "running",
        label: "运行中",
        workspaces: [createWorkspace({ id: "ws-2", name: "Workspace 2", status: "running" })],
      },
      {
        key: "idle",
        label: "空闲",
        workspaces: [createWorkspace({ id: "ws-3", name: "Workspace 3" })],
      },
    ]);

    await element.updateComplete;

    const cards = [...(element.shadowRoot?.querySelectorAll(".task-card") ?? [])];
    expect(cards[0]?.classList.contains("is-attention")).toBe(true);
    expect(cards[1]?.classList.contains("is-running")).toBe(true);
    expect(cards[2]?.classList.contains("is-idle")).toBe(true);
  });

  it("emits workspace-select when a workspace is clicked", async () => {
    const element = createElement([
      {
        key: "idle",
        label: "空闲",
        workspaces: [createWorkspace({ id: "ws-3", name: "Workspace 3" })],
      },
    ]);
    const onSelect = vi.fn();

    element.addEventListener("workspace-select", ((event: CustomEvent<KanbanWorkspace>) => {
      onSelect(event.detail);
    }) as EventListener);

    await element.updateComplete;
    (element.shadowRoot?.querySelector(".task-card-main") as HTMLButtonElement).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-3", name: "Workspace 3" }),
    );
  });

  it("renders sibling select and run buttons and keeps run action isolated", async () => {
    const idleWorkspace = createWorkspace({ id: "ws-4", name: "Workspace 4" });
    const runningWorkspace = createWorkspace({
      id: "ws-5",
      name: "Workspace 5",
      status: "running",
      has_running_dev_server: true,
    });
    const element = createElement([
      {
        key: "idle",
        label: "空闲",
        workspaces: [idleWorkspace, runningWorkspace],
      },
    ]);
    const onSelect = vi.fn();
    const onRun = vi.fn();

    element.addEventListener("workspace-select", ((event: CustomEvent<KanbanWorkspace>) => {
      onSelect(event.detail);
    }) as EventListener);
    element.addEventListener("workspace-run", ((event: CustomEvent<KanbanWorkspace>) => {
      onRun(event.detail);
    }) as EventListener);

    await element.updateComplete;

    const cards = [...(element.shadowRoot?.querySelectorAll(".task-card") ?? [])];
    const idleCard = cards[0] as HTMLElement;
    const runningCard = cards[1] as HTMLElement;
    const idleButtons = idleCard.querySelectorAll("button");
    const runningButtons = runningCard.querySelectorAll("button");

    expect(idleCard.tagName).toBe("DIV");
    expect(idleButtons).toHaveLength(2);
    expect(idleButtons[0]?.classList.contains("task-card-main")).toBe(true);
    expect(idleButtons[1]?.classList.contains("task-card-run")).toBe(true);

    (idleButtons[1] as HTMLButtonElement).click();

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-4", name: "Workspace 4" }),
    );
    expect(onSelect).not.toHaveBeenCalled();

    expect(runningButtons).toHaveLength(2);
    expect((runningButtons[1] as HTMLButtonElement).disabled).toBe(true);
    expect(runningButtons[1]?.textContent).toContain("运行中");
  });

  it("disables run when dev server is already running even if workspace status is not running", async () => {
    const element = createElement([
      {
        key: "idle",
        label: "空闲",
        workspaces: [
          createWorkspace({
            id: "ws-dev-server",
            name: "已有开发服务器",
            status: "completed",
            has_running_dev_server: true,
          }),
        ],
      },
    ]);

    await element.updateComplete;

    const runButton = element.shadowRoot?.querySelector(".task-card-run") as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    expect(runButton?.disabled).toBe(true);
    expect(runButton?.textContent).toContain("运行中");
  });

  it("keeps run enabled when only the workspace task is running but dev server is not", async () => {
    const element = createElement([
      {
        key: "running",
        label: "运行中",
        workspaces: [
          createWorkspace({
            id: "ws-task-running",
            name: "任务运行中但服务未启动",
            status: "running",
            has_running_dev_server: false,
          }),
        ],
      },
    ]);

    await element.updateComplete;

    const runButton = element.shadowRoot?.querySelector(".task-card-run") as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    expect(runButton?.disabled).toBe(false);
    expect(runButton?.textContent).toContain("运行");
    expect(runButton?.textContent).not.toContain("运行中");
  });

  it("hides section body content when section is collapsed", async () => {
    const element = createElement(
      [
        {
          key: "running",
          label: "运行中",
          workspaces: [createWorkspace({ id: "ws-4", name: "Workspace 4", status: "running" })],
        },
      ],
      { collapsedSections: new Set(["running"]) },
    );

    await element.updateComplete;

    expect(element.shadowRoot?.querySelector(".section-body")).toBeNull();
    expect(element.shadowRoot?.textContent).not.toContain("Workspace 4");
  });
});
