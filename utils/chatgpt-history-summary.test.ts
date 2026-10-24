import { describe, expect, it } from "vitest";
import { summarizeChatGptHistory } from "./chatgpt-history-summary";
import type { UsageState } from "./messages";

const makeRound = (
  n: number,
  prompt: number,
  tool: number,
  answer: number,
): UsageState["rounds"][number] => ({
  messageId: "m" + n,
  n,
  order: n,
  createdAt: n,
  promptTokens: prompt,
  toolTokens: tool,
  answerTokens: answer,
  total: prompt + tool + answer,
});

describe("ChatGPT text history breakdown", () => {
  it("calculates category shares only among available round text", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 100,
      roundCount: 2,
      rounds: [makeRound(1, 20, 30, 10), makeRound(2, 10, 0, 30)],
    });
    expect(summary).toMatchObject({
      visibleRounds: 2,
      promptTokens: 30,
      toolTokens: 30,
      answerTokens: 40,
      toolRounds: 1,
      toolShare: 0.3,
      isFullBreakdown: true,
      isConsistent: true,
    });
  });

  it("marks the breakdown partial when earlier rounds were trimmed", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 9000,
      roundCount: 300,
      rounds: [makeRound(299, 2, 30, 8), makeRound(300, 4, 6, 10)],
    });
    expect(summary.isFullBreakdown).toBe(false);
    expect(summary.isConsistent).toBe(false);
    expect(summary.toolShare).toBeCloseTo(0.6);
  });

  it("does not claim full coverage when cache total disagrees", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 200,
      roundCount: 1,
      rounds: [makeRound(1, 5, 5, 10)],
    });
    expect(summary.isFullBreakdown).toBe(true);
    expect(summary.isConsistent).toBe(false);
  });

  it("handles empty rows without inventing a tool percentage", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 0,
      roundCount: 0,
      rounds: [],
    });
    expect(summary.toolShare).toBeNull();
    expect(summary.isConsistent).toBe(true);
  });
});
