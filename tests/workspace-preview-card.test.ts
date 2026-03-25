import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/components/workspace-preview-card";
import type { WorkspacePreviewCard } from "../src/components/workspace-preview-card";

function createElement() {
  const element = document.createElement("workspace-preview-card") as WorkspacePreviewCard;
  element.workspaceName = "任务 A";
  element.statusAccentClass = "is-idle";
  element.previewLines = [
    "第一条消息",
    "第二条消息",
    "第三条消息",
  ];
  document.body.append(element);
  return element;
}

describe("workspace-preview-card", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders each preview line inside a separate message block", async () => {
    const element = createElement();
    await element.updateComplete;

    const blocks = element.shadowRoot?.querySelectorAll(".workspace-preview-message") ?? [];

    expect(blocks).toHaveLength(3);
  });

  it("renders the title inside a clickable banner", async () => {
    const element = createElement();
    await element.updateComplete;

    const header = element.shadowRoot?.querySelector(".workspace-preview-header");
    const banner = element.shadowRoot?.querySelector(".workspace-preview-title-banner");
    const trigger = element.shadowRoot?.querySelector(".workspace-preview-activate");
    const closeButton = element.shadowRoot?.querySelector(".workspace-preview-close");

    expect(header).not.toBeNull();
    expect(banner).not.toBeNull();
    expect(trigger?.classList.contains("is-full-bleed")).toBe(true);
    expect(closeButton?.closest(".workspace-preview-activate")).toBeNull();
  });

  it("emits a close event from the preview card close button", async () => {
    const element = createElement();
    const onClose = vi.fn();
    element.addEventListener("preview-close", onClose);
    await element.updateComplete;

    const closeButton = element.shadowRoot?.querySelector(".workspace-preview-close") as HTMLButtonElement | null;
    closeButton?.click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto scrolls to bottom when preview lines update", async () => {
    const element = createElement();
    await element.updateComplete;

    const lines = element.shadowRoot?.querySelector(".workspace-preview-lines") as HTMLDivElement;
    Object.defineProperty(lines, "scrollHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(lines, "clientHeight", {
      configurable: true,
      value: 200,
    });

    element.previewLines = [...element.previewLines, "第四条消息"];
    await element.updateComplete;

    expect(lines.scrollTop).toBe(600);
  });

  it("stops auto scroll after user scrolls away from bottom", async () => {
    const element = createElement();
    await element.updateComplete;

    const lines = element.shadowRoot?.querySelector(".workspace-preview-lines") as HTMLDivElement;
    Object.defineProperty(lines, "scrollHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(lines, "clientHeight", {
      configurable: true,
      value: 200,
    });

    lines.scrollTop = 100;
    lines.dispatchEvent(new Event("scroll"));

    element.previewLines = [...element.previewLines, "第四条消息"];
    await element.updateComplete;

    expect(lines.scrollTop).toBe(100);
  });
});
