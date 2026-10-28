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

/** Independent historical evidence quality; not active-context availability. */
export function historyEvidenceNote(summary: ChatGptHistorySummary): string {
  if (summary.totalRounds === 0) {
    return "数据质量：暂无可读取聊天轮次，不能根据参考百分比判断上下文风险。";
  }
  if (!summary.isFullBreakdown) {
    return (
      "数据质量：明细仅覆盖 " +
      summary.visibleRounds +
      "/" +
      summary.totalRounds +
      " 轮，早期逐轮数据可能缺失；建议提前保存交接摘要。"
    );
  }
  if (!summary.isConsistent) {
    return "数据质量：逐轮估算与历史累计数值不一致，请检查刷新结果并考虑保存交接摘要。";
  }
  return "数据质量：已读取轮次和累计估算相互吻合；附件及隐藏内容仍可能缺失。";
}

/** Distinguish readable dialogue from tools without excluding tool tokens.
 * The breakdown can be interpreted only when all displayed rounds reconcile.
 * This is NEVER a measure of the model's live effective context.
 */
export interface HistoryComposition {
  breakdown: string;
  advice: string;
  toolHeavy: boolean;
}

export function describeHistoryComposition(
  summary: ChatGptHistorySummary,
): HistoryComposition {
  if (summary.totalRounds === 0) {
    return {
      breakdown: "普通对话 / 工具文本：暂无可用数据。",
      advice: "当前有效上下文未知，无法评估聊天长度风险。",
      toolHeavy: false,
    };
  }
  if (!summary.isFullBreakdown || !summary.isConsistent) {
    return {
      breakdown:
        "普通对话 / 工具文本：历史明细不完整或与总量不一致，暂不提供全量拆分。",
      advice:
        "建议先核对数据并保存关键结论；不应根据单一历史比例判断是否迁移。",
      toolHeavy: false,
    };
  }
  const dialogueTokens = summary.promptTokens + summary.answerTokens;
  const share = summary.toolShare ?? 0;
  const toolHeavy = summary.toolTokens > 0 && share >= 0.5;
  return {
    breakdown:
      "可读历史文本：普通对话 " +
      dialogueTokens.toLocaleString() +
      " · 工具 " +
      summary.toolTokens.toLocaleString() +
      "（" +
      (share * 100).toFixed(1) +
      "%）",
    advice: toolHeavy
      ? "工具文本占比较高；历史比例可能主要反映文件分析等工具输出的累计。建议先保存关键分析结论，不应仅凭该比例判断必须迁移聊天。"
      : "历史比例仅用于长度参考；模型实际保留的上下文未知，建议定期保存重要决定与结论。",
    toolHeavy,
  };
}

/** Compact tool-heavy presentation. Numbers remain estimates of historic text,
 * never tokens actually retained by the active model or its available budget.
 * Only use when the visible rounds reconcile with the historical total.
 */
export function toolDominantReminder(
  summary: ChatGptHistorySummary,
  historicalTokens: number,
  referenceTokens: number,
): { headline: string; details: string; badge: string } | null {
  if (
    !summary.isFullBreakdown ||
    !summary.isConsistent ||
    summary.totalRounds === 0 ||
    summary.toolTokens <= 0 ||
    (summary.toolShare ?? 0) < 0.5 ||
    !Number.isFinite(referenceTokens) ||
    referenceTokens <= 0
  ) {
    return null;
  }
  const dialogueTokens = summary.promptTokens + summary.answerTokens;
  const toolShare = ((summary.toolShare ?? 0) * 100).toFixed(1);
  const historyRatio = ((historicalTokens / referenceTokens) * 100).toFixed(1);
  return {
    headline:
      "普通对话历史：" +
      dialogueTokens.toLocaleString() +
      " Token · 工具文本占 " +
      toolShare +
      "%",
    details:
      "工具文本 " +
      summary.toolTokens.toLocaleString() +
      " Token · 全部历史 " +
      historicalTokens.toLocaleString() +
      " / 参考量 " +
      referenceTokens.toLocaleString() +
      " = " +
      historyRatio +
      "%（仅历史文本对比，非模型上下文占用）",
    badge: dialogueTokens / referenceTokens >= 0.95 ? "对话长" : "工具多",
  };
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
