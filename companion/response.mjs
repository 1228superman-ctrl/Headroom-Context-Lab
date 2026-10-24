/* global fetch, AbortSignal, TextDecoder */
export const MODELS = ["gpt-6.1-sol", "gpt-6-luna"];

/** Official Responses API. OAuth plan usage requires store:false and stream:true. */
export async function summarize(accessToken, prompt, model) {
  if (!MODELS.includes(model)) throw new Error("未配置该模型");
  if (typeof prompt !== "string" || prompt.length < 50 || prompt.length > 50000)
    throw new Error("总结文本超出允许范围");
  const reply = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer " + accessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: prompt }],
      store: false,
      stream: true,
      max_output_tokens: 6500,
    }),
    signal: AbortSignal.timeout(165000),
  });
  if (!reply.ok)
    throw new Error(
      "模型请求失败 HTTP " +
        reply.status +
        (reply.status === 401
          ? "（授权过期）"
          : reply.status === 429
            ? "（额度不足或频率限制）"
            : ""),
    );
  const decoder = new TextDecoder();
  let buffer = "",
    summary = "",
    usage = null,
    completed = false;
  let responseId = null;
  for await (const piece of reply.body) {
    buffer += decoder.decode(piece, { stream: true });
    if (buffer.length > 500000) throw new Error("AI 响应异常过长");
    while (buffer.includes("\n")) {
      const split = buffer.indexOf("\n");
      const line = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 1);
      if (!line.startsWith("data:")) continue;
      const value = line.slice(5).trim();
      if (!value || value === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(value);
      } catch {
        continue;
      }
      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        summary += event.delta;
        if (summary.length > 26000) throw new Error("模型回复过长");
      }
      if (event.type === "response.completed") {
        completed = true;
        usage = event.response?.usage ?? null;
        responseId = event.response?.id ?? null;
        if (!summary.trim()) {
          summary = (event.response?.output ?? [])
            .flatMap((item) =>
              (item.content ?? []).map((part) =>
                part.type === "output_text" ? part.text : "",
              ),
            )
            .join("");
        }
      }
      if (event.type === "response.failed" || event.type === "error") {
        throw new Error("模型返回失败事件，可能需要检查权限或余额");
      }
    }
  }
  if (!completed || !summary.trim())
    throw new Error("模型未完整返回总结，不能将部分文本视为完成");
  return { summary: summary.trim(), usage, responseId };
}
