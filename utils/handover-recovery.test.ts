import { describe, expect, it } from "vitest";
import {
  handoverFailureMessage,
  visibleChatGptRounds,
} from "./handover-recovery";

function fakeNode(role: string, text: string) {
  const content = { innerText: text };
  return {
    getAttribute: () => role,
    querySelector: () => content,
    querySelectorAll: () => (role === "assistant" ? [content] : []),
  };
}
describe("ChatGPT handover failure diagnosis and visible fallback", () => {
  it("distinguishes session, HTTP, response-shape and empty-history failures", () => {
    expect(handoverFailureMessage("session-token")).toContain("令牌");
    expect(handoverFailureMessage("history-http", 403)).toContain("403");
    expect(handoverFailureMessage("history-shape")).toContain("mapping");
    expect(handoverFailureMessage("history-empty")).toContain("0 轮");
  });
  it("collects only visible user text plus assistant markdown, excluding tool text", () => {
    const doc = {
      querySelectorAll: () => [
        fakeNode("user", "第一个用户问题"),
        fakeNode("assistant", "助手文字回答"),
        fakeNode("user", "第二个用户问题"),
        fakeNode("assistant", "第二条文字回答"),
      ],
    } as unknown as Document;
    const rounds = visibleChatGptRounds(doc);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.promptText).toBe("第一个用户问题");
    expect(rounds[0]?.answerText).toBe("助手文字回答");
    expect(rounds[1]?.answerText).toBe("第二条文字回答");
    expect(rounds.every((r) => !r.toolText)).toBe(true);
  });
  it("returns empty for no rendered rounds and does not fabricate history", () => {
    const doc = { querySelectorAll: () => [] } as unknown as Document;
    expect(visibleChatGptRounds(doc)).toEqual([]);
  });
});
