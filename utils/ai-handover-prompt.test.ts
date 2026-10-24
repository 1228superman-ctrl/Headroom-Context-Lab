import { describe, expect, it } from "vitest";
import { createAiHandoverPrompt } from "./ai-handover-prompt";
import type { HistoryRound } from "./platform-adapter";

const row = (n: number, prompt: string, answer: string): HistoryRound => ({
  messageId: String(n),
  order: n,
  promptText: prompt,
  answerText: answer,
  toolText: "PRIVATE_TOOL_OUTPUT_SHOULD_NOT_APPEAR",
});

describe("AI handover prompt (no API)", () => {
  it("includes confirmation and its prior proposal for semantic reasoning", () => {
    const rounds = [
      row(1, "我们做插件", "建议以 Headroom 二次开发"),
      row(2, "好", "收到，会先测试"),
      row(3, "继续", "已完成第一轮测试"),
    ];
    const result = createAiHandoverPrompt({
      title: "监控插件",
      conversationId: "xyz",
      rounds,
    });
    expect(result.includedRounds).toBe(3);
    expect(result.text).toContain("Headroom");
    expect(result.text).toContain("用户：好");
    expect(result.text).toContain("与其前一轮助手");
    expect(result.text).toContain("未经");
    expect(result.text).not.toContain("PRIVATE_TOOL_OUTPUT_SHOULD_NOT_APPEAR");
  });
  it("limits long conversations and signals incomplete coverage", () => {
    const rounds = Array.from({ length: 160 }, (_, i) =>
      row(
        i,
        "以后按照这个方案继续，第" + i + "步" + "Q".repeat(2000),
        "第" + i + "轮测试结果 " + "A".repeat(4000),
      ),
    );
    const result = createAiHandoverPrompt(
      { title: "很长的聊天", conversationId: "t", rounds },
      16000,
    );
    expect(result.text.length).toBeLessThanOrEqual(16000);
    expect(result.truncated).toBe(true);
    expect(result.includedRounds).toBeLessThan(rounds.length);
    expect(result.text).toContain("样本覆盖");
    expect(result.text).toContain("部分轮次或消息文本被省略");
    expect(result.text).not.toContain("PRIVATE_TOOL_OUTPUT_SHOULD_NOT_APPEAR");
  });
  it("does not suggest direct API calls and warns about sensitive content", () => {
    const result = createAiHandoverPrompt({
      title: "Demo",
      conversationId: "id",
      rounds: [],
    });
    expect(result.text).toContain("手动粘贴");
    expect(result.text).toContain("密码");
    expect(result.includedRounds).toBe(0);
  });
});
