import { describe, expect, it } from "vitest";
import {
  scrollStorageKey,
  validScrollY,
  shouldRecordScroll,
} from "./handover-scroll";

describe("side-panel scroll restoration", () => {
  it("keeps scroll offsets independent across conversations", () => {
    expect(scrollStorageKey("chatA")).not.toEqual(scrollStorageKey("chatB"));
  });

  it("rejects invalid saved positions", () => {
    for (const value of [-4, Infinity, NaN, "42", null, 1e10]) {
      expect(validScrollY(value)).toBe(false);
    }
    expect(validScrollY(0)).toBe(true);
    expect(validScrollY(1482)).toBe(true);
  });

  it("does not overwrite 1800px with 0 when switching to a short non-chat page", () => {
    expect(shouldRecordScroll(1800, 0, 200)).toBe(false);
    expect(shouldRecordScroll(1800, 200, 200)).toBe(false);
  });

  it("allows deliberate scrolling to top when the original chat is still tall", () => {
    expect(shouldRecordScroll(1800, 0, 5000)).toBe(true);
    expect(shouldRecordScroll(1800, 400, 5000)).toBe(true);
    expect(shouldRecordScroll(undefined, 0, 0)).toBe(true);
  });
});