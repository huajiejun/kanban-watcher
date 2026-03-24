import { describe, expect, it } from "vitest";

import { getPageMode } from "../src/web-entry";

describe("web entry page mode", () => {
  it("returns workspace for root paths", () => {
    expect(getPageMode(new URL("http://localhost:5173/"))).toBe("workspace");
    expect(getPageMode(new URL("http://localhost:5173/?foo=bar"))).toBe("workspace");
  });

  it("returns preview for preview paths", () => {
    expect(getPageMode(new URL("http://localhost:5173/preview"))).toBe("preview");
    expect(getPageMode(new URL("http://localhost:5173/preview/"))).toBe("preview");
    expect(getPageMode(new URL("http://localhost:5173/preview?foo=bar"))).toBe("preview");
  });
});
