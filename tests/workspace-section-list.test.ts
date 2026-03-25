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
    selectedWorkspaceId?: string;
  },
) {
  const element = document.createElement(
    "workspace-section-list",
  ) as WorkspaceSectionList;
  element.sections = sections;
  element.collapsedSections = options?.collapsedSections ?? new Set();
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

  it("renders grouped sections and workspace cards", async () => {
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
    ]);

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    expect(shadowRoot?.querySelectorAll(".section")).toHaveLength(2);
    expect(shadowRoot?.textContent).toContain("需要注意");
    expect(shadowRoot?.textContent).toContain("运行中");
    expect(shadowRoot?.textContent).toContain("Workspace 1");
    expect(shadowRoot?.textContent).toContain("Workspace 2");
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
    (element.shadowRoot?.querySelector(".task-card") as HTMLButtonElement).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-3", name: "Workspace 3" }),
    );
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
