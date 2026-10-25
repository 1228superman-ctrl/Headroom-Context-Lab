import { describe, expect, it } from "vitest";
import {
  HANDOVER_EXPIRES_MS,
  handoverKey,
  isSourceChat,
  restorableHandover,
} from "./handover-session";

describe("conversation-specific session handover state", () => {
  it("never shares stored output between chats", () => {
    expect(handoverKey("chat-A")).not.toBe(handoverKey("chat-B"));
    expect(isSourceChat("chat-A", "chat-B")).toBe(false);
    expect(isSourceChat("chat-A", "chat-A")).toBe(true);
    expect(isSourceChat("chat-A", null)).toBe(false);
  });
  it("restores recent chat drafts but not expired or malformed entries", () => {
    const now = 1_000_000_000;
    expect(
      restorableHandover({ text: "Markdown text", updatedAt: now - 100 }, now),
    ).toBe(true);
    expect(
      restorableHandover(
        { text: "Old text", updatedAt: now - HANDOVER_EXPIRES_MS - 1 },
        now,
      ),
    ).toBe(false);
    expect(
      restorableHandover({ text: "Future text", updatedAt: now + 1 }, now),
    ).toBe(false);
    expect(restorableHandover({ text: {}, updatedAt: now }, now)).toBe(false);
    expect(restorableHandover(null, now)).toBe(false);
  });
});