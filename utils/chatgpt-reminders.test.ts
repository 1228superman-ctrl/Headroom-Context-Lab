import { describe, it, expect } from "vitest";
import {
  DEFAULT_CHAT_REMINDERS,
  reminderBadge,
  safeReminderConfig,
  reminderStage,
  referenceRatio,
  reminderDedupKey,
  shouldNotifyStage,
} from "./chatgpt-reminders";
describe("estimate-only chat monitoring", () => {
  const cfg = DEFAULT_CHAT_REMINDERS;
  it("uses the user's historical-reference, not effective model context", () => {
    expect(reminderStage(139999, cfg)).toBe(0);
    expect(reminderStage(140000, cfg)).toBe(1);
    expect(reminderStage(170000, cfg)).toBe(2);
    expect(reminderStage(190000, cfg)).toBe(3);
    expect(referenceRatio(220000, cfg)).toBeCloseTo(110);
  });
  it("validates ordered, editable thresholds and user-supplied reference", () => {
    expect(
      safeReminderConfig({ referenceTokens: 100000, stages: [60, 80, 90] })
        .stages,
    ).toEqual([60, 80, 90]);
    expect(
      safeReminderConfig({ referenceTokens: 0, stages: [95, 70, 85] }),
    ).toEqual(cfg);
    expect(reminderStage(100000, { ...cfg, enabled: false })).toBe(0);
  });
  it("shows 116% in badge for 231239 / 200000, rather than the 95% threshold", () => {
    expect(reminderStage(231239, DEFAULT_CHAT_REMINDERS)).toBe(3);
    expect(reminderBadge(231239, DEFAULT_CHAT_REMINDERS)).toBe("116%");
    expect(reminderBadge(100000, DEFAULT_CHAT_REMINDERS)).toBe("50%");
    expect(reminderBadge(0, DEFAULT_CHAT_REMINDERS)).toBe("");
    expect(reminderBadge(2100000, DEFAULT_CHAT_REMINDERS)).toBe("999+");
    expect(
      reminderBadge(231239, { ...DEFAULT_CHAT_REMINDERS, enabled: false }),
    ).toBe("");
  });
  it("deduplicates independently by chat and configuration", () => {
    expect(reminderDedupKey("A", cfg)).not.toBe(reminderDedupKey("B", cfg));
    expect(reminderDedupKey("A", cfg)).not.toBe(
      reminderDedupKey("A", { ...cfg, referenceTokens: 300000 }),
    );
    expect(shouldNotifyStage(2, 2)).toBe(false);
    expect(shouldNotifyStage(2, 3)).toBe(true);
    expect(shouldNotifyStage(0, 1)).toBe(true);
  });
  it("ignores missing and nonfinite data", () => {
    expect(reminderStage(NaN, cfg)).toBe(0);
    expect(reminderStage(-5, cfg)).toBe(0);
    expect(safeReminderConfig({ stages: [70, 70, 95] }).stages).toEqual([
      70, 85, 95,
    ]);
  });
});