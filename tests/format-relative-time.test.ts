import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../src/lib/format-relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-03-21T12:00:00Z");

  it("returns just now for timestamps under a minute old", () => {
    expect(formatRelativeTime("2026-03-21T11:59:30Z", now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(formatRelativeTime("2026-03-21T11:55:00Z", now)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(formatRelativeTime("2026-03-21T10:00:00Z", now)).toBe("2h ago");
  });

  it("returns days ago", () => {
    expect(formatRelativeTime("2026-03-20T12:00:00Z", now)).toBe("1d ago");
  });

  it("falls back to recently when input is missing or invalid", () => {
    expect(formatRelativeTime(undefined, now)).toBe("recently");
    expect(formatRelativeTime("", now)).toBe("recently");
    expect(formatRelativeTime("not-a-date", now)).toBe("recently");
  });
});
