import { describe, expect, it } from "vitest";

import {
  getPaneColumns,
  resolveWorkspaceHomeMode,
} from "../src/web/workspace-home";

describe("workspace home helpers", () => {
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
});
