import { describe, expect, it } from "vitest";
import { isCurrentConversation } from "./conversation-identity";

const fromUrl = (url: string) =>
  new URL(url).pathname.match(/^\/c\/([^/]+)$/)?.[1] ?? null;

describe("conversation identity during rapid switching", () => {
  it("accepts current conversation", () => {
    expect(
      isCurrentConversation("https://chatgpt.com/c/alpha", "alpha", fromUrl),
    ).toBe(true);
  });
  it("rejects old conversation after a same-tab navigation", () => {
    expect(
      isCurrentConversation("https://chatgpt.com/c/beta", "alpha", fromUrl),
    ).toBe(false);
  });
  it("rejects home page, missing tab, and invalid URL", () => {
    expect(
      isCurrentConversation("https://chatgpt.com/", "alpha", fromUrl),
    ).toBe(false);
    expect(isCurrentConversation(undefined, "alpha", fromUrl)).toBe(false);
    expect(isCurrentConversation("%%%bad%%%", "alpha", fromUrl)).toBe(false);
  });
});
