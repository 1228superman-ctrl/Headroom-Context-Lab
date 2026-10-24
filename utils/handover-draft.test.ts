import { describe, expect, it } from "vitest";
import { createHandoverDraft } from "./handover-draft";
import type { HistoryRound } from "./platform-adapter";

function row(
  index: number,
  prompt: string,
  answer: string,
  toolText = "SECRET_TOOL_RESULT",
): HistoryRound {
  return {
    messageId: String(index),
    order: index,
    promptText: prompt,
    answerText: answer,
    toolText,
  };
}

describe("handover draft", () => {
  it("includes the current conversation's decisions, pending prompts, and recent excerpts", () => {
    const result = createHandoverDraft({
      title: "上下文监控",
      conversationId: "abc",
      rounds: [
        row(1, "以后不要自动发布", "已经保存到本地"),
        row(2, "继续检查所有问题", "已完成初步测试"),
        row(3, "请给出下一步计划", "先安装再测试"),
      ],
    });
    expect(result.markdown).toContain("上下文监控");
    expect(result.markdown).toContain("以后不要自动发布");
    expect(result.markdown).toContain("继续检查所有问题");
    expect(result.markdown).toContain("第 3 轮");
    expect(result.markdown).toContain("未经独立验证");
    expect(result.roundCount).toBe(3);
    expect(result.sourceTruncated).toBe(false);
  });
  it("does not include tool outputs, even when it contains secrets", () => {
    const result = createHandoverDraft({
      title: "A",
      conversationId: "b",
      rounds: [row(1, "继续分析资料", "完成了")],
    });
    expect(result.markdown).not.toContain("SECRET_TOOL_RESULT");
  });
  it("bounds long transcripts and distinguishes truncation", () => {
    const rounds = Array.from({ length: 70 }, (_, i) =>
      row(
        i,
        "以后保持这个设置。" + "X".repeat(1200),
        "已完成处理。" + "Y".repeat(1300),
      ),
    );
    const result = createHandoverDraft(
      { title: "A", conversationId: "b", rounds },
      5000,
    );
    expect(result.sourceTruncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(5000);
    expect(result.markdown).toContain("已截断");
  });
  it("handles empty conversations honestly", () => {
    const result = createHandoverDraft({
      title: "",
      conversationId: "x",
      rounds: [],
    });
    expect(result.markdown).toContain("没有可读取");
    expect(result.roundCount).toBe(0);
    expect(result.includedRecentRounds).toBe(0);
  });
});
