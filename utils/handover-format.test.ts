import { describe, expect, it } from "vitest";
import {
  normalizeHandoverResult,
  summaryFormatInstructions,
} from "./handover-format";
import { createAiHandoverPrompt } from "./ai-handover-prompt";
import type { HistoryRound } from "./platform-adapter";

const data = {
  project: { title: "Headroom", goal: "窗口交接" },
  current_state: {
    summary: "已开发未验收",
    verified_at_source_end: false,
    evidence: ["第3轮"],
  },
  decisions: [
    { decision: "手动复制", reason: "长对话接近上限", evidence: ["第2轮"] },
  ],
  completed: [{ task: "生成草稿", status: "reported", evidence: ["第3轮"] }],
  pending: [{ task: "测试授权", priority: "P0", evidence: ["第3轮"] }],
  constraints: ["不操作另一台电脑"],
  technical_details: [{ item: "版本", value: "v6.7" }],
  gaps: ["未提供工具结果"],
  next_action: "先做真实生成测试",
};

describe("handover format and evidence rules", () => {
  it("chooses human-readable Markdown by default", () => {
    const prompt = summaryFormatInstructions("markdown");
    expect(prompt).toContain("当前项目状态");
    expect(prompt).toContain("已验证");
    expect(prompt).toContain("助手声称完成");
    expect(prompt).toContain("第N轮");
  });
  it("requests strict structured JSON without inventing task completion", () => {
    const prompt = summaryFormatInstructions("json");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("completed.status");
    expect(prompt).toContain("verified|reported");
    expect(prompt).toContain("next_action");
    expect(prompt).toContain("禁止 Markdown 代码围栏");
  });
  it("generates format-specific prompt from same conversation evidence", () => {
    const round: HistoryRound = {
      messageId: "id1",
      order: 1,
      promptText: "好，按这个方案做",
      answerText: "代码完成，但还没有实际验收",
      toolText: "SENSITIVE_TOOL_RESULT_DO_NOT_SHARE",
    };
    const args = { title: "插件开发", conversationId: "c", rounds: [round] };
    const md = createAiHandoverPrompt(args).text;
    const json = createAiHandoverPrompt(args, 42000, "json").text;
    expect(md).toContain("## 当前项目状态");
    expect(json).toContain(' "project"'.trim());
    expect(json).toContain("严格合法的 JSON");
    expect(json).toContain("助手：代码完成");
    expect(json).not.toContain("SENSITIVE_TOOL_RESULT_DO_NOT_SHARE");
  });
  it("normalizes valid JSON including optional code fences", () => {
    const input = JSON.stringify(data);
    const value = normalizeHandoverResult(input, "json");
    expect(value.warning).toBeNull();
    expect(JSON.parse(value.text)).toEqual(data);
    const fenced = normalizeHandoverResult(
      "```json\n" + input + "\n```",
      "json",
    );
    expect(fenced.warning).toBeNull();
    expect(JSON.parse(fenced.text)).toEqual(data);
  });
  it("reports invalid or incomplete JSON without silently treating it as valid", () => {
    for (const text of ['{"project":{}}', "This is not JSON", "[]"]) {
      const result = normalizeHandoverResult(text, "json");
      expect(result.warning).toContain("有效 JSON");
      expect(result.text).toBe(text);
    }
  });
  it("does not reformat or claim validation of Markdown", () => {
    const result = normalizeHandoverResult(
      "## 当前项目状态\n待确认",
      "markdown",
    );
    expect(result).toEqual({ text: "## 当前项目状态\n待确认", warning: null });
  });
});
