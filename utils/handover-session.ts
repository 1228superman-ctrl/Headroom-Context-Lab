/** Session-only handovers, namespaced by their original ChatGPT conversation. */
export const HANDOVER_EXPIRES_MS = 6 * 60 * 60 * 1000;

export function handoverKey(conversationId: string): string {
  return "headroom:handover:session:" + conversationId;
}

/** Data from extension session storage is untrusted until checked. */
export function restorableHandover(
  value: unknown,
  now = Date.now(),
): value is { text: string; updatedAt: number } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.text === "string" &&
    typeof item.updatedAt === "number" &&
    Number.isFinite(item.updatedAt) &&
    item.updatedAt <= now &&
    now - item.updatedAt <= HANDOVER_EXPIRES_MS
  );
}

export function isSourceChat(
  sourceChatId: string,
  activeChatId: string | null,
): boolean {
  return sourceChatId === activeChatId;
}