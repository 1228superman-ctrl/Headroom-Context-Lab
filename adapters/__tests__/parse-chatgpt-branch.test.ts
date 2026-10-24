import { describe, expect, it } from "vitest";
import { parseChatGptHistory } from "../chatgpt";

const text = (role: string, body: string, time = 0) => ({
  author: { role },
  content: { content_type: "text", parts: [body] },
  create_time: time,
});

describe("ChatGPT active-branch and multi-part reply handling", () => {
  it("captures multiple public segments and tool results in one turn", () => {
    const mapping = {
      u1: { parent: null, message: text("user", "Explain"), children: ["a1"] },
      a1: {
        parent: "u1",
        message: text("assistant", "First finding", 100),
        children: ["tool1"],
      },
      tool1: {
        parent: "a1",
        message: text("tool", "Search result text", 101),
        children: ["a2"],
      },
      a2: {
        parent: "tool1",
        message: text("assistant", "Final answer", 102),
        children: [],
      },
    };
    const result = parseChatGptHistory({ mapping, current_node: "a2" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      messageId: "a1",
      promptText: "Explain",
      answerText: "First finding\n\nFinal answer",
      toolText: "Search result text",
    });
  });

  it("does not count an abandoned regeneration branch", () => {
    const mapping = {
      u1: {
        parent: null,
        message: text("user", "Question"),
        children: ["old", "new"],
      },
      old: {
        parent: "u1",
        message: text("assistant", "Abandoned answer", 101),
        children: [],
      },
      new: {
        parent: "u1",
        message: text("assistant", "Selected answer", 102),
        children: [],
      },
    };
    const result = parseChatGptHistory({ mapping, current_node: "new" });
    expect(result).toHaveLength(1);
    expect(result[0]?.answerText).toBe("Selected answer");
  });

  it("separates two turns and ignores hidden assistant nodes", () => {
    const mapping = {
      u1: {
        parent: null,
        message: text("user", "First"),
        children: ["hidden"],
      },
      hidden: {
        parent: "u1",
        message: {
          ...text("assistant", "internal", 101),
          metadata: { is_visually_hidden_from_conversation: true },
        },
        children: ["a1"],
      },
      a1: {
        parent: "hidden",
        message: text("assistant", "Visible", 102),
        children: ["u2"],
      },
      u2: { parent: "a1", message: text("user", "Second"), children: ["a2"] },
      a2: {
        parent: "u2",
        message: text("assistant", "Response", 103),
        children: [],
      },
    };
    const result = parseChatGptHistory({ mapping, current_node: "a2" });
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.answerText)).toEqual(["Visible", "Response"]);
  });

  it("reads a string tool result field and never counts it twice", () => {
    const mapping = {
      u1: { parent: null, message: text("user", "Search") },
      call: {
        parent: "u1",
        message: {
          author: { role: "assistant" },
          recipient: "web",
          content: { content_type: "code", text: 'search("Search")' },
        },
      },
      tool1: {
        parent: "call",
        message: {
          author: { role: "tool" },
          content: {
            content_type: "tool_result",
            result: "weather is cloudy",
            summary: "weather is cloudy",
          },
        },
      },
      a1: {
        parent: "tool1",
        message: text("assistant", "Clouds expected", 101),
      },
    };
    const result = parseChatGptHistory({ mapping, current_node: "a1" });
    expect(result).toHaveLength(1);
    expect(result[0]?.toolText).toBe("weather is cloudy");
    expect(result[0]?.answerText).toBe("Clouds expected");
  });
  it("ignores duplicated prompt-only search invocations on the active path", () => {
    const mapping = {
      u1: { parent: null, message: text("user", "Check weather") },
      call: {
        parent: "u1",
        message: {
          author: { role: "assistant" },
          recipient: "web",
          content: { content_type: "code", text: 'search("Check weather")' },
        },
      },
      a1: { parent: "call", message: text("assistant", "Fine", 101) },
    };
    const result = parseChatGptHistory({ mapping, current_node: "a1" });
    expect(result[0]?.toolText).toBeUndefined();
    expect(result[0]?.answerText).toBe("Fine");
  });
});
