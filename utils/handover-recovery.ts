import type { HistoryRound } from "./platform-adapter";

export type HandoverHistoryStage =
  | "session-http"
  | "session-token"
  | "history-http"
  | "history-network"
  | "history-shape"
  | "history-empty";

export function handoverFailureMessage(
  stage: HandoverHistoryStage,
  status?: number,
): string {
  if (stage === "session-http")
    return (
      "ChatGPT 登录会话接口无法读取（HTTP " +
      (status ?? "未知") +
      "）。请确认当前聊天页面已登录，必要时重新打开此聊天。"
    );
  if (stage === "session-token")
    return "ChatGPT 会话没有提供历史读取所需的令牌。聊天页面能显示不代表插件可访问历史接口；请重新加载插件或检查登录状态。";
  if (stage === "history-http")
    return (
      "当前聊天历史接口返回 HTTP " +
      (status ?? "未知") +
      "。可能是 ChatGPT 接口更新、暂时限制或聊天访问权限问题。"
    );
  if (stage === "history-network")
    return "读取聊天历史时发生网络异常；可能是请求被拦截、暂时断线或接口超时。";
  if (stage === "history-shape")
    return "聊天接口返回了数据，但没有可识别的 mapping 结构；需要更新插件的解析器。";
  return "聊天接口已返回，但解析出的用户和助手对话为 0 轮；可能是聊天尚未保存或消息格式发生变化。";
}

/**
 * Read only explicitly visible user messages and assistant Markdown, never
 * the full container with tool panels, file previews, hidden state or scripts.
 * DOM virtualization makes this a PARTIAL fallback, never a full transcript.
 */
export function visibleChatGptRounds(
  doc: Pick<Document, "querySelectorAll">,
): HistoryRound[] {
  const nodes = doc.querySelectorAll(
    '[data-message-author-role="user"], [data-message-author-role="assistant"]',
  );
  const rounds: HistoryRound[] = [];
  let pendingUser = "";
  let order = 0;
  for (const node of nodes) {
    const el = node as HTMLElement;
    const role = el.getAttribute("data-message-author-role");
    if (role === "user") {
      const textNode =
        el.querySelector("[data-message-content]") ??
        el.querySelector(".whitespace-pre-wrap") ??
        el;
      const text = (textNode as HTMLElement).innerText?.trim() ?? "";
      if (text) pendingUser = text.slice(0, 15000);
      continue;
    }
    if (role === "assistant") {
      const text = Array.from(el.querySelectorAll(".markdown"))
        .map((part) => (part as HTMLElement).innerText?.trim() ?? "")
        .filter(Boolean)
        .join("\n")
        .slice(0, 20000);
      if (!pendingUser || !text) continue;
      rounds.push({
        messageId: "visible-" + ++order,
        order,
        promptText: pendingUser,
        answerText: text,
      });
      pendingUser = "";
    }
  }
  return rounds.slice(-30);
}
