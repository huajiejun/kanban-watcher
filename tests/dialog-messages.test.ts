import { describe, expect, it } from "vitest";

import {
  compareDialogMessageOrder,
  type DialogMessage,
} from "../src/lib/dialog-messages";

function createTextMessage(overrides: Partial<Extract<DialogMessage, { kind: "message" }>> = {}): Extract<DialogMessage, { kind: "message" }> {
  return {
    kind: "message",
    sender: "ai",
    text: "默认消息",
    timestamp: "2026-03-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("dialog-messages compareDialogMessageOrder", () => {
  it("orders same-process messages by entry index before timestamp", () => {
    const laterEntry = createTextMessage({
      processId: "process-1",
      entryIndex: 2,
      timestamp: "2026-03-28T10:00:01.000Z",
      text: "第二条",
    });
    const earlierEntry = createTextMessage({
      processId: "process-1",
      entryIndex: 1,
      timestamp: "2026-03-28T10:00:02.000Z",
      text: "第一条",
    });

    const sorted = [laterEntry, earlierEntry].sort(compareDialogMessageOrder);

    expect(sorted.map((message) => message.entryIndex)).toEqual([1, 2]);
  });

  it("orders messages by message id when process differs", () => {
    const laterId = createTextMessage({
      processId: "process-2",
      messageId: 20,
      timestamp: "2026-03-28T10:00:00.000Z",
      text: "id 20",
    });
    const earlierId = createTextMessage({
      processId: "process-1",
      messageId: 10,
      timestamp: "2026-03-28T10:00:01.000Z",
      text: "id 10",
    });

    const sorted = [laterId, earlierId].sort(compareDialogMessageOrder);

    expect(sorted.map((message) => message.messageId)).toEqual([10, 20]);
  });

  it("falls back to timestamps when message ids are missing", () => {
    const later = createTextMessage({
      text: "后",
      timestamp: "2026-03-28T10:00:02.000Z",
    });
    const earlier = createTextMessage({
      text: "前",
      timestamp: "2026-03-28T10:00:01.000Z",
    });

    const sorted = [later, earlier].sort(compareDialogMessageOrder);

    expect(sorted.map((message) => message.text)).toEqual(["前", "后"]);
  });
});
