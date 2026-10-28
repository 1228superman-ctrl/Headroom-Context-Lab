import { describe, expect, it } from "vitest";
import {
  describeHistoryComposition,
  toolDominantReminder,
  historyEvidenceNote,
  summarizeChatGptHistory,
} from "./chatgpt-history-summary";
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
  it("puts ordinary dialogue first and keeps 356.9% only as a historical note", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 913776,
      roundCount: 1,
      rounds: [makeRound(1, 50000, 739398, 124378)],
    });
    const view = toolDominantReminder(summary, 913776, 256000);
    expect(view?.headline).toContain("174,378 Token");
    expect(view?.headline).toContain("80.9%");
    expect(view?.headline).not.toContain("356.9%");
    expect(view?.details).toContain("356.9%");
    expect(view?.details).toContain("非模型上下文占用");
    expect(view?.badge).toBe("工具多");
    expect(toolDominantReminder(summary, 913776, 128000)?.badge).toBe("对话长");
  });
  it("does not suppress the normal reminder for incomplete or ordinary chats", () => {
    const partial = summarizeChatGptHistory({
      totalTokens: 913776,
      roundCount: 3,
      rounds: [makeRound(3, 0, 739398, 0)],
    });
    expect(toolDominantReminder(partial, 913776, 256000)).toBeNull();
    const normal = summarizeChatGptHistory({
      totalTokens: 100,
      roundCount: 1,
      rounds: [makeRound(1, 25, 20, 55)],
    });
    expect(toolDominantReminder(normal, 100, 256000)).toBeNull();
    expect(toolDominantReminder(normal, 100, 0)).toBeNull();
  });
  it("explains the file-analysis case without treating 345% as live context use", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 913499,
      roundCount: 1,
      rounds: [makeRound(1, 50000, 739398, 124101)],
    });
    const info = describeHistoryComposition(summary);
    expect(info.toolHeavy).toBe(true);
    expect(info.breakdown).toContain("174,101");
    expect(info.breakdown).toContain("739,398");
    expect(info.breakdown).toContain("80.9%");
    expect(info.advice).toContain("不应仅凭");
    expect(info.advice).toContain("保存关键分析结论");
  });
  it("does not invent a conversation-only total when history is partial or inconsistent", () => {
    const partial = summarizeChatGptHistory({
      totalTokens: 913398,
      roundCount: 3,
      rounds: [makeRound(3, 1, 700, 2)],
    });
    const uncertain = describeHistoryComposition(partial);
    expect(uncertain.toolHeavy).toBe(false);
    expect(uncertain.breakdown).toContain("不完整");
    expect(uncertain.breakdown).not.toContain("739,398");
    const inconsistent = summarizeChatGptHistory({
      totalTokens: 1000,
      roundCount: 1,
      rounds: [makeRound(1, 1, 900, 2)],
    });
    expect(describeHistoryComposition(inconsistent).toolHeavy).toBe(false);
    const empty = summarizeChatGptHistory({
      totalTokens: 0,
      roundCount: 0,
      rounds: [],
    });
    expect(describeHistoryComposition(empty).breakdown).toContain("暂无");
  });
  it("reports ordinary conversation without claiming real available context", () => {
    const summary = summarizeChatGptHistory({
      totalTokens: 100,
      roundCount: 1,
      rounds: [makeRound(1, 30, 10, 60)],
    });
    const info = describeHistoryComposition(summary);
    expect(info.toolHeavy).toBe(false);
    expect(info.breakdown).toContain("90");
    expect(info.advice).toContain("未知");
  });
  it("separates missing rows, mismatch and aligned estimates", () => {
    const none = summarizeChatGptHistory({
      totalTokens: 0,
      roundCount: 0,
      rounds: [],
    });
    expect(historyEvidenceNote(none)).toContain("暂无可读取");
    const partial = summarizeChatGptHistory({
      totalTokens: 1000,
      roundCount: 3,
      rounds: [makeRound(3, 2, 3, 4)],
    });
    expect(historyEvidenceNote(partial)).toContain("1/3");
    expect(historyEvidenceNote(partial)).toContain("交接摘要");
    const mismatch = summarizeChatGptHistory({
      totalTokens: 100,
      roundCount: 1,
      rounds: [makeRound(1, 2, 3, 4)],
    });
    expect(historyEvidenceNote(mismatch)).toContain("不一致");
    const aligned = summarizeChatGptHistory({
      totalTokens: 9,
      roundCount: 1,
      rounds: [makeRound(1, 2, 3, 4)],
    });
    expect(historyEvidenceNote(aligned)).toContain("隐藏内容仍可能缺失");
  });
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
