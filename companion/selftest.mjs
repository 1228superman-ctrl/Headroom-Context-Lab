/* global process, console, Response, ReadableStream, TextEncoder */
import assert from "node:assert/strict";
import { saveSecret, loadSecret, deleteSecret } from "./security.mjs";
import { summarize } from "./response.mjs";

async function main() {
  try {
    await saveSecret("selftest", "test-key-ABC123-no-real-credential");
    assert.equal(
      await loadSecret("selftest"),
      "test-key-ABC123-no-real-credential",
    );
    console.log("DPAPI encryption/decryption: PASS");
  } finally {
    deleteSecret("selftest");
  }

  const savedFetch = globalThis.fetch;
  let mockBody = null;
  globalThis.fetch = async (_url, opts) => {
    mockBody = JSON.parse(opts.body);
    const messages = [
      { type: "response.output_text.delta", delta: "测试摘要：" },
      { type: "response.output_text.delta", delta: "重要决策和下一步。" },
      {
        type: "response.completed",
        response: {
          id: "resp_test",
          usage: { input_tokens: 60, output_tokens: 20 },
        },
      },
    ]
      .map((event) => "data: " + JSON.stringify(event) + "\n\n")
      .join("");
    const stream = new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(messages);
        controller.enqueue(bytes.slice(0, 55));
        controller.enqueue(bytes.slice(55));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  try {
    const result = await summarize(
      "fake-credential",
      "请总结以下测试历史信息：用户最终同意采用 API 和套餐额度模式，当前正在测试。该任务需要核对决策、已经完成的功能与下一步。",
      "gpt-6.1-sol",
    );
    assert.equal(result.summary, "测试摘要：重要决策和下一步。");
    assert.equal(mockBody.store, false);
    assert.equal(mockBody.stream, true);
    assert.equal(mockBody.model, "gpt-6.1-sol");
    assert.equal(result.usage.input_tokens, 60);
    console.log("Mock streaming Responses parser: PASS");
    await assert.rejects(
      summarize("fake", "test".repeat(20), "invalid-model"),
      /未配置/,
    );
    console.log("Model allowlist: PASS");
  } finally {
    globalThis.fetch = savedFetch;
  }
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
