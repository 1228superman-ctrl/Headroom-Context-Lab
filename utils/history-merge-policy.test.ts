import { describe, expect, it } from "vitest";
import { shouldMergeCloudRounds } from "./history-merge-policy";

describe("cloud history merge policy", () => {
  it("does not re-add inactive ChatGPT regeneration branches", () => {
    expect(shouldMergeCloudRounds("chatgpt")).toBe(false);
  });
  it("retains existing merge behavior for other platforms", () => {
    expect(shouldMergeCloudRounds("deepseek")).toBe(true);
    expect(shouldMergeCloudRounds("gemini")).toBe(true);
  });
});
