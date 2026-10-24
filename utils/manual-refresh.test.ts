import { describe, expect, it } from "vitest";
import { refreshIdentity, isSameRefreshTarget } from "./manual-refresh";

describe("manual refresh scoping", () => {
  it("binds to one conversation and one platform", () => {
    const current = { platformId: "chatgpt", dialogueId: "abc" };
    const id = refreshIdentity(current);
    expect(id).toBe("chatgpt:abc");
    expect(isSameRefreshTarget(id, current)).toBe(true);
    expect(
      isSameRefreshTarget(id, { platformId: "chatgpt", dialogueId: "other" }),
    ).toBe(false);
    expect(
      isSameRefreshTarget(id, { platformId: "gemini", dialogueId: "abc" }),
    ).toBe(false);
  });
  it("does not refresh when a current chat identity is missing", () => {
    expect(
      refreshIdentity({ platformId: "chatgpt", dialogueId: null }),
    ).toBeNull();
    expect(refreshIdentity({ platformId: null, dialogueId: null })).toBeNull();
    expect(
      isSameRefreshTarget(null, { platformId: "chatgpt", dialogueId: "x" }),
    ).toBe(false);
  });
});
