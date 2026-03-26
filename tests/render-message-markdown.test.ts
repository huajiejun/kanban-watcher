import { describe, expect, it } from "vitest";

import { renderMessageMarkdown } from "../src/lib/render-message-markdown";

describe("renderMessageMarkdown", () => {
  it("escapes raw html blocks so message content cannot inject styles", () => {
    const html = renderMessageMarkdown("<style>.message-bubble{white-space:nowrap}</style>\n正常内容");

    expect(html).not.toContain("<style>");
    expect(html).toContain("&lt;style&gt;.message-bubble{white-space:nowrap}&lt;/style&gt;");
    expect(html).toContain("<p>正常内容</p>");
  });
});
