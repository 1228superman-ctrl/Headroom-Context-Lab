import { describe, expect, it } from "vitest";
import { automaticSummaryPreflight } from "./summary-preflight";
import type { CompanionStatus } from "./local-summary-client";

function credentials(
  apiKeySaved: boolean,
  planAuthorized: boolean,
): CompanionStatus {
  return {
    ok: true,
    apiKeySaved,
    planAuthorized,
    account: null,
    modelChoices: [],
  };
}
describe("automatic summary credential preflight", () => {
  it("explains why API mode cannot run without a key", () => {
    expect(
      automaticSummaryPreflight("api", credentials(false, false)),
    ).toContain("API Key");
  });
  it("explains why ChatGPT plan mode cannot run without OAuth approval", () => {
    expect(
      automaticSummaryPreflight("plan", credentials(false, false)),
    ).toContain("授权");
  });
  it("does not require the other provider to be configured", () => {
    expect(
      automaticSummaryPreflight("api", credentials(true, false)),
    ).toBeNull();
    expect(
      automaticSummaryPreflight("plan", credentials(false, true)),
    ).toBeNull();
  });
});
