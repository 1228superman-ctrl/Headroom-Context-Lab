/** ChatGPT estimated-history reminders. This is NOT a model context budget. */
export const CHAT_REMINDERS_KEY = "headroom:chatgpt-history-reminders:v1";
export const DEFAULT_CHAT_REMINDERS: ReminderConfig = {
  enabled: true,
  browserNotifications: false,
  referenceTokens: 200000,
  stages: [70, 85, 95],
};
export type ReminderStage = 0 | 1 | 2 | 3;
export type ReminderConfig = {
  enabled: boolean;
  browserNotifications: boolean;
  /** User-selected reference for historical text estimate only. */
  referenceTokens: number;
  stages: [number, number, number];
};
export function safeReminderConfig(value: unknown): ReminderConfig {
  if (!value || typeof value !== "object")
    return {
      ...DEFAULT_CHAT_REMINDERS,
      stages: [...DEFAULT_CHAT_REMINDERS.stages],
    };
  const v = value as Record<string, unknown>;
  const r = v.referenceTokens;
  const stages = v.stages;
  const referenceTokens =
    typeof r === "number" && Number.isInteger(r) && r >= 10000 && r <= 2000000
      ? r
      : DEFAULT_CHAT_REMINDERS.referenceTokens;
  const thresholds: [number, number, number] =
    Array.isArray(stages) &&
    stages.length === 3 &&
    stages.every((n) => typeof n === "number" && Number.isInteger(n)) &&
    stages[0] >= 1 &&
    stages[0] < stages[1] &&
    stages[1] < stages[2] &&
    stages[2] <= 100
      ? [stages[0], stages[1], stages[2]]
      : [...DEFAULT_CHAT_REMINDERS.stages];
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    browserNotifications: v.browserNotifications === true,
    referenceTokens,
    stages: thresholds,
  };
}
export function referenceRatio(tokens: number, config: ReminderConfig): number {
  if (!config.enabled || !Number.isFinite(tokens) || tokens <= 0) return 0;
  return (tokens / config.referenceTokens) * 100;
}
/** True estimated history / user reference, rounded for a limited 4-character browser badge. */
export function reminderBadge(tokens: number, config: ReminderConfig): string {
  if (!config.enabled || !Number.isFinite(tokens) || tokens <= 0) return "";
  const ratio = Math.round(referenceRatio(tokens, config));
  return ratio > 999 ? "999+" : ratio + "%";
}

export function reminderStage(
  tokens: number,
  config: ReminderConfig,
): ReminderStage {
  const percent = referenceRatio(tokens, config);
  if (percent >= config.stages[2]) return 3;
  if (percent >= config.stages[1]) return 2;
  if (percent >= config.stages[0]) return 1;
  return 0;
}
export const REMINDER_TITLES: Record<1 | 2 | 3, string> = {
  1: "关注对话长度",
  2: "建议整理交接摘要",
  3: "建议考虑新聊天",
};
/** Config version scope prevents stale dedup state after editing thresholds. */
export function reminderDedupKey(
  conversationId: string,
  config: ReminderConfig,
): string {
  return (
    "headroom:reminded:" +
    conversationId +
    ":" +
    [config.referenceTokens, ...config.stages].join("-")
  );
}
export function shouldNotifyStage(
  previous: number,
  current: ReminderStage,
): boolean {
  return current > 0 && current > previous;
}