import type { HistoryRound } from "../utils/platform-adapter";

type Node = {
  message?: {
    author?: { role?: string };
    recipient?: string;
    content?: {
      content_type?: string;
      parts?: unknown[];
      text?: string;
      result?: string;
      summary?: string;
      content?: string;
    };
    metadata?: { is_visually_hidden_from_conversation?: boolean };
    create_time?: number;
  } | null;
  parent?: string | null;
};

/** Extract only strings; structured non-text attachments are not measurable. */
function textOf(message: NonNullable<Node["message"]>): string {
  const content = message.content;
  if (!content) return "";
  const parts = Array.isArray(content.parts)
    ? content.parts.filter((v): v is string => typeof v === "string")
    : [];
  return (
    parts.join("\n").trim() ||
    (typeof content.text === "string" ? content.text.trim() : "") ||
    (typeof content.result === "string" ? content.result.trim() : "") ||
    (typeof content.summary === "string" ? content.summary.trim() : "") ||
    (typeof content.content === "string" ? content.content.trim() : "")
  );
}

function decodeUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function duplicatedSearchCall(code: string, prompt: string): boolean {
  const match = code.match(/^search\("(.*)"\)$/s);
  if (!match) return false;
  const normalize = (s: string) => s.trim().replace(/^@\S*\s*/, "");
  return normalize(match[1] || "") === normalize(prompt);
}

/**
 * Read the active current_node -> parent path only, not every regeneration.
 * Collect public assistant text segments in each user turn, and visible tool
 * traffic separately. It does NOT infer the model's server-side context.
 */
export function parseActiveChatGptBranch(
  mapping: Record<string, Node>,
  currentNode: string,
): HistoryRound[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = currentNode;
  while (cursor && !visited.has(cursor) && mapping[cursor]) {
    visited.add(cursor);
    path.push(cursor);
    cursor = mapping[cursor]?.parent ?? null;
  }
  path.reverse();

  type Pending = {
    promptText: string;
    answerSegments: string[];
    toolSegments: string[];
    firstAssistantId: string | null;
    createdAtSec: number;
  };
  const rounds: HistoryRound[] = [];
  let pending: Pending | null = null;
  const flush = () => {
    if (!pending?.firstAssistantId) return;
    rounds.push({
      messageId: pending.firstAssistantId,
      order: pending.createdAtSec,
      createdAt:
        pending.createdAtSec > 0 ? pending.createdAtSec * 1000 : undefined,
      promptText: pending.promptText,
      answerText: pending.answerSegments.join("\n\n"),
      toolText: pending.toolSegments.length
        ? pending.toolSegments.join("\n")
        : undefined,
    });
  };

  for (const id of path) {
    const msg = mapping[id]?.message;
    if (!msg) continue;
    const role = msg.author?.role;
    if (role === "user") {
      flush();
      const promptText = textOf(msg);
      pending = promptText
        ? {
            promptText,
            answerSegments: [],
            toolSegments: [],
            firstAssistantId: null,
            createdAtSec: 0,
          }
        : null;
      continue;
    }
    if (!pending || msg.metadata?.is_visually_hidden_from_conversation)
      continue;

    const contentText = textOf(msg);
    if (role === "tool") {
      if (contentText) pending.toolSegments.push(contentText);
      continue;
    }
    if (role !== "assistant") continue;

    if (msg.recipient && msg.recipient !== "all") {
      const decoded = decodeUnicode(contentText);
      if (
        decoded &&
        !duplicatedSearchCall(decoded, decodeUnicode(pending.promptText))
      ) {
        pending.toolSegments.push(decoded);
      }
      continue;
    }
    if (msg.content?.content_type === "text" && contentText) {
      if (!pending.firstAssistantId) {
        pending.firstAssistantId = id;
        pending.createdAtSec =
          typeof msg.create_time === "number" ? msg.create_time : 0;
      }
      pending.answerSegments.push(contentText);
    }
  }
  flush();
  return rounds;
}
