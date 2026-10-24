import type { UsageState } from "./messages";

/**
 * Summarize only the available per-round text estimates.
 * Historical cumulative tokens are NOT the model's current context usage.
 * The record may retain only the newest 200 rounds. Never claim that a
 * partial breakdown covers the entire historical lifetime.
 */
export interface ChatGptHistorySummary {
  visibleRounds: number;
  totalRounds: number;
  promptTokens: number;
  answerTokens: number;
  toolTokens: number;
  breakdownTokens: number;
  toolRounds: number;
  toolShare: number | null;
  isFullBreakdown: boolean;
  isConsistent: boolean;
}

export function summarizeChatGptHistory(
  state: Pick<UsageState, "rounds" | "roundCount" | "totalTokens">,
): ChatGptHistorySummary {
  const visibleRounds = state.rounds.length;
  let promptTokens = 0;
  let answerTokens = 0;
  let toolTokens = 0;
  let toolRounds = 0;
  for (const round of state.rounds) {
    promptTokens += Math.max(0, round.promptTokens);
    answerTokens += Math.max(0, round.answerTokens);
    const tool = Math.max(0, round.toolTokens ?? 0);
    toolTokens += tool;
    if (tool > 0) toolRounds++;
  }
  const breakdownTokens = promptTokens + answerTokens + toolTokens;
  const isFullBreakdown = state.roundCount === visibleRounds;
  return {
    visibleRounds,
    totalRounds: state.roundCount,
    promptTokens,
    answerTokens,
    toolTokens,
    breakdownTokens,
    toolRounds,
    toolShare: breakdownTokens > 0 ? toolTokens / breakdownTokens : null,
    isFullBreakdown,
    isConsistent:
      isFullBreakdown && Math.abs(breakdownTokens - state.totalTokens) <= 1,
  };
}
