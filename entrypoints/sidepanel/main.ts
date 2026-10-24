import "./style.css";
import type {
  HeadroomMessage,
  HandoverDraftResponse,
  UsageState,
} from "../../utils/messages";
import { summarizeChatGptHistory } from "../../utils/chatgpt-history-summary";
import { automaticSummaryPreflight } from "../../utils/summary-preflight";
import {
  normalizeHandoverResult,
  type HandoverFormat,
} from "../../utils/handover-format";
import {
  refreshIdentity,
  isSameRefreshTarget,
} from "../../utils/manual-refresh";
import {
  callCompanion,
  type CompanionStatus,
  type CompanionResult,
} from "../../utils/local-summary-client";
import {
  DEFAULT_THRESHOLDS,
  levelFromRatio,
  pctToRatio,
  type Level,
  type Thresholds,
} from "../../utils/thresholds";
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  STORAGE_KEY,
  type ContextLimits,
  type Language,
  type Settings,
} from "../../utils/settings";
import { ADAPTERS, platformDisplayName } from "../../adapters";
import {
  setCloudSettings,
  toCloudSettings,
  pullCloudSettings,
} from "../../utils/cloud-settings";
import type { UpstashCreds } from "../../utils/upstash";
import {
  DEFAULT_COEFFICIENTS,
  type TokenCoefficients,
} from "../../utils/estimate";

// Platform logo imports (SVGs from brand/ and icon/ directories).
import defaultIcon from "../../brand/blue.svg";
import chatgptIcon from "../../icon/openai.svg";
import deepseekIcon from "../../icon/deepseek.svg";
import doubaoIcon from "../../icon/doubao.svg";
import geminiIcon from "../../icon/gemini.svg";
import kimiIcon from "../../icon/kimi.svg";
import qianwenIcon from "../../icon/qianwen.svg";
import qwenIcon from "../../icon/qwen.svg";

const PLATFORM_ICON: Record<string, string> = {
  chatgpt: chatgptIcon,
  deepseek: deepseekIcon,
  doubao: doubaoIcon,
  gemini: geminiIcon,
  kimi: kimiIcon,
  qianwen: qianwenIcon,
  qwen: qwenIcon,
};

function platformIconImg(platformId: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = PLATFORM_ICON[platformId] ?? defaultIcon;
  img.className = "hd-platform-icon";
  img.width = 16;
  img.height = 16;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  return img;
}

/**
 * Raw browser-locale lookup. WXT types `browser.i18n.getMessage` to accept
 * only literal message names (it generates the union from messages.json);
 * `t()` below needs a string-typed entry point, so alias it here.
 */
const getMessage = browser.i18n.getMessage as (messageName: string) => string;
// WXT types getURL's arg as a generated PublicPath union; we fetch a locale
// file by an arbitrary string, so alias it to `string`.
const getURL = browser.runtime.getURL as (path: string) => string;

const STATUS_KEYS: Record<Level, string> = {
  idle: "statusIdle",
  green: "statusGreen",
  yellow: "statusYellow",
  red: "statusRed",
};

const IDLE_STATE: UsageState = {
  platformId: null,
  dialogueId: null,
  dialogueTitle: null,
  contextLimit: null,
  totalTokens: 0,
  lastRoundTokens: null,
  roundCount: 0,
  rounds: [],
};

const els = {
  viewMain: document.querySelector<HTMLElement>("#view-main")!,
  viewSettings: document.querySelector<HTMLElement>("#view-settings")!,
  modelName: document.querySelector<HTMLElement>("#model-name")!,
  contextLimit: document.querySelector<HTMLElement>("#context-limit")!,
  dialogueIdentity: document.querySelector<HTMLElement>("#dialogue-identity")!,
  dialogueTitle: document.querySelector<HTMLElement>("#dialogue-title")!,
  dialogueId: document.querySelector<HTMLElement>("#dialogue-id")!,
  statsRefreshRow: document.querySelector<HTMLElement>("#stats-refresh-row")!,
  statsRefresh: document.querySelector<HTMLButtonElement>("#stats-refresh")!,
  statsRefreshStatus: document.querySelector<HTMLElement>(
    "#stats-refresh-status",
  )!,
  percent: document.querySelector<HTMLElement>("#percent")!,
  usageLabel: document.querySelector<HTMLElement>("#usage-label")!,
  usageBar: document.querySelector<HTMLElement>("#usage-bar")!,
  usageHelp: document.querySelector<HTMLElement>("#usage-help")!,
  tokenSep: document.querySelector<HTMLElement>("#token-sep")!,
  tokensUnit: document.querySelector<HTMLElement>("#tokens-unit")!,
  chatgptSummary: document.querySelector<HTMLElement>("#chatgpt-summary")!,
  chatgptToolTokens: document.querySelector<HTMLElement>("#cg-tool-tokens")!,
  chatgptToolShare: document.querySelector<HTMLElement>("#cg-tool-share")!,
  chatgptToolRounds: document.querySelector<HTMLElement>("#cg-tool-rounds")!,
  chatgptCoverage: document.querySelector<HTMLElement>("#cg-coverage")!,
  chatgptIntegrity: document.querySelector<HTMLElement>("#cg-integrity")!,
  roundTotalHeader: document.querySelector<HTMLElement>("#round-total-header")!,
  roundsLegend: document.querySelector<HTMLElement>("#rounds-legend")!,
  barFill: document.querySelector<HTMLElement>("#bar-fill")!,
  tokenUsed: document.querySelector<HTMLElement>("#token-used")!,
  tokenLimit: document.querySelector<HTMLElement>("#token-limit")!,
  statusDot: document.querySelector<HTMLElement>("#status-dot")!,
  statusText: document.querySelector<HTMLElement>("#status-text")!,
  roundCount: document.querySelector<HTMLElement>("#round-count")!,
  lastRound: document.querySelector<HTMLElement>("#last-round")!,
  settingsBtn: document.querySelector<HTMLButtonElement>("#settings-btn")!,
  settingsBack: document.querySelector<HTMLButtonElement>("#settings-back")!,
  thrYellow: document.querySelector<HTMLInputElement>("#thr-yellow")!,
  thrYellowVal: document.querySelector<HTMLOutputElement>("#thr-yellow-val")!,
  thrRed: document.querySelector<HTMLInputElement>("#thr-red")!,
  thrRedVal: document.querySelector<HTMLOutputElement>("#thr-red-val")!,
  thrReset: document.querySelector<HTMLButtonElement>("#thr-reset")!,
  thrBar: document.querySelector<HTMLElement>("#thr-bar")!,
  langSelect: document.querySelector<HTMLSelectElement>("#lang-select")!,
  upstashUrl: document.querySelector<HTMLInputElement>("#upstash-url")!,
  upstashToken: document.querySelector<HTMLInputElement>("#upstash-token")!,
  upstashToggle: document.querySelector<HTMLButtonElement>("#upstash-toggle")!,
  upstashTest: document.querySelector<HTMLButtonElement>("#upstash-test")!,
  upstashPull: document.querySelector<HTMLButtonElement>("#upstash-pull")!,
  upstashClear: document.querySelector<HTMLButtonElement>("#upstash-clear")!,
  upstashStatus: document.querySelector<HTMLElement>("#upstash-status")!,
  settingsSave: document.querySelector<HTMLButtonElement>("#settings-save")!,
  ctxReset: document.querySelector<HTMLButtonElement>("#ctx-reset")!,
  coeffResetAll: document.querySelector<HTMLButtonElement>("#coeff-reset-all")!,
  coeffHint: document.querySelector<HTMLOutputElement>("#coeff-hint")!,
  roundsList: document.querySelector<HTMLElement>("#rounds-list")!,
  handoverSection: document.querySelector<HTMLElement>("#handover-section")!,
  handoverGenerate:
    document.querySelector<HTMLButtonElement>("#handover-generate")!,
  handoverAiGenerate: document.querySelector<HTMLButtonElement>(
    "#handover-ai-generate",
  )!,
  handoverStatus: document.querySelector<HTMLElement>("#handover-status")!,
  handoverEditor: document.querySelector<HTMLElement>("#handover-editor")!,
  handoverText: document.querySelector<HTMLTextAreaElement>("#handover-text")!,
  handoverFormat:
    document.querySelector<HTMLSelectElement>("#handover-format")!,
  handoverCopy: document.querySelector<HTMLButtonElement>("#handover-copy")!,
  handoverClear: document.querySelector<HTMLButtonElement>("#handover-clear")!,
  handoverApiPrepare: document.querySelector<HTMLButtonElement>(
    "#handover-api-prepare",
  )!,
  handoverPlanPrepare: document.querySelector<HTMLButtonElement>(
    "#handover-plan-prepare",
  )!,
  handoverModel: document.querySelector<HTMLSelectElement>("#handover-model")!,
  handoverLocalCheck: document.querySelector<HTMLButtonElement>(
    "#handover-local-check",
  )!,
  handoverPlanConnect: document.querySelector<HTMLButtonElement>(
    "#handover-plan-connect",
  )!,
  handoverPlanDisconnect: document.querySelector<HTMLButtonElement>(
    "#handover-plan-disconnect",
  )!,
  handoverApiKey:
    document.querySelector<HTMLInputElement>("#handover-api-key")!,
  handoverApiSave:
    document.querySelector<HTMLButtonElement>("#handover-api-save")!,
  handoverApiClear: document.querySelector<HTMLButtonElement>(
    "#handover-api-clear",
  )!,
  handoverRemoteStatus: document.querySelector<HTMLElement>(
    "#handover-remote-status",
  )!,
  handoverSendConfirm: document.querySelector<HTMLButtonElement>(
    "#handover-send-confirm",
  )!,
  handoverSendStatus: document.querySelector<HTMLElement>(
    "#handover-send-status",
  )!,
};

// Authoritative in-memory working copies. Settings are explicit-save now:
// every input mutates these copies (thresholds preview the main view live),
// and the bottom "Save" button persists all of them as one write.
let currentThresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
let currentState: UsageState = IDLE_STATE;
let currentLanguage: Language = "auto";
let currentUpstash: UpstashCreds = { url: "", token: "" };
let currentContextLimits: ContextLimits = { ...DEFAULT_SETTINGS.contextLimits };
let currentTokenCoefficients: Record<string, Partial<TokenCoefficients>> = {};

/** Loaded message tables for a manual locale override. "auto" uses browser i18n. */
const localeTables: Partial<
  Record<Exclude<Language, "auto">, Record<string, string>>
> = {};

async function loadLocaleTable(lang: Exclude<Language, "auto">): Promise<void> {
  if (localeTables[lang]) return;
  try {
    const res = await fetch(getURL(`_locales/${lang}/messages.json`));
    const raw = (await res.json()) as Record<string, { message: string }>;
    localeTables[lang] = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v.message]),
    );
  } catch {
    // Table load failed — `t()` falls back to browser i18n for this locale.
  }
}

/** Override-aware translator: manual language → in-memory table; else browser locale. */
function t(key: string): string {
  if (currentLanguage !== "auto") {
    const msg = localeTables[currentLanguage]?.[key];
    if (msg != null) return msg;
    // Key missing in the selected locale — fall back to English explicitly.
    // browser.i18n.getMessage would use the BROWSER locale, which can be a
    // third language (e.g. browser is zh_CN, user selected de → would return
    // Chinese instead of English). We want en for any untranslated key.
    const enFallback = localeTables["en"]?.[key];
    if (enFallback != null) return enFallback;
  }
  return getMessage(key);
}

function statusText(level: Level): string {
  return t(STATUS_KEYS[level]);
}

/** Localize every [data-i18n] element/attr from messages. */
function applyI18n(root: ParentNode = document.body): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    // Don't overwrite the "Saved ✓" flash on the save button — it resets
    // itself after the animation completes.
    if (el.classList.contains("hd-btn--saved")) return;
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel!));
  });
  // Variant for strings that render a bold leading dash (round table legend).
  // The dash is translated text, so bold it at render time via innerHTML —
  // escape first, then wrap the leading "-" in <b>.
  root.querySelectorAll<HTMLElement>("[data-i18n-dash]").forEach((el) => {
    const text = t(el.dataset.i18nDash!)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    el.innerHTML = text.replace(/^-/, "<b>-</b>");
  });
}

// ---------- main view rendering ----------

/** Format a context limit: 1M+ → "1M context", else "NK context" (binary K/M). */
function formatContext(limit: number): string {
  const suffix = t("contextSuffix");
  if (limit >= 1_048_576) {
    const m = limit / 1_048_576;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M ${suffix}`;
  }
  return `${Math.round(limit / 1024)}K ${suffix}`;
}

function render(state: UsageState, th: Thresholds): void {
  const limit = state.contextLimit ?? 0;
  const used = state.totalTokens;
  const ratio = limit > 0 ? used / limit : 0;
  const level: Level = limit > 0 ? levelFromRatio(ratio, th) : "idle";
  const isChatGpt = state.platformId === "chatgpt";

  els.modelName.textContent = state.platformId
    ? platformDisplayName(state.platformId)
    : t("detectingPlatform");
  els.contextLimit.textContent = isChatGpt
    ? "当前聊天 · 非整个项目"
    : limit > 0
      ? formatContext(limit)
      : t("noContext");

  if (state.dialogueId) {
    els.dialogueIdentity.hidden = false;
    els.dialogueTitle.textContent =
      state.dialogueTitle ?? t("untitledDialogue");
    els.dialogueId.textContent = state.dialogueId;
    els.dialogueId.title = state.dialogueId;
  } else {
    els.dialogueIdentity.hidden = true;
  }

  els.usageLabel.hidden = !isChatGpt;
  els.usageBar.hidden = isChatGpt;
  els.usageHelp.hidden = !isChatGpt;
  els.chatgptSummary.hidden = !isChatGpt;
  els.tokenSep.hidden = isChatGpt;
  els.tokenLimit.hidden = isChatGpt;
  els.tokensUnit.hidden = isChatGpt;

  if (isChatGpt) {
    // Historical text totals are not the model's current effective context.
    els.percent.textContent = used.toLocaleString();
    els.statusDot.dataset.level = "idle";
    els.statusText.textContent = "仅历史文本估算";
    els.tokenUsed.textContent = "当前有效上下文：未知";
    const summary = summarizeChatGptHistory(state);
    els.chatgptToolTokens.textContent = summary.toolTokens.toLocaleString();
    els.chatgptToolShare.textContent =
      summary.toolShare === null
        ? "—"
        : (summary.toolShare * 100).toFixed(1) + "%";
    els.chatgptToolRounds.textContent = String(summary.toolRounds);
    els.chatgptCoverage.textContent = summary.isFullBreakdown
      ? "明细覆盖 " +
        summary.visibleRounds +
        " / " +
        summary.totalRounds +
        " 轮"
      : "仅列出最近 " +
        summary.visibleRounds +
        " / " +
        summary.totalRounds +
        " 轮；工具占比只针对这些明细";
    els.chatgptIntegrity.textContent = summary.isConsistent
      ? "可见轮次加总与历史累计一致；不代表实际上下文完整。"
      : "明细与历史累计未完全对应；可能存在较早轮次、省略内容或缓存差异。";
    els.roundTotalHeader.textContent = "本轮合计";
    els.roundsLegend.textContent =
      "“-”表示未检测到该轮的工具文本，不代表实际没有工具调用。";
  } else {
    els.percent.textContent = (ratio * 100).toFixed(1) + "%";
    els.barFill.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    els.barFill.dataset.level = level;
    els.tokenUsed.textContent = used.toLocaleString();
    els.tokenLimit.textContent = limit > 0 ? limit.toLocaleString() : "-";
    els.statusDot.dataset.level = level;
    els.statusText.textContent = statusText(level);
    els.roundTotalHeader.textContent = t("roundHeaderCumulative");
    els.roundsLegend.textContent = t("roundToolLegend");
  }
  els.roundCount.textContent = String(state.roundCount);
  els.lastRound.textContent =
    state.lastRoundTokens != null
      ? state.lastRoundTokens.toLocaleString()
      : "-";
  renderRounds(state.rounds);
  syncRefreshScope(state);
  syncHandoverScope(state);
}

// Background updates remain event-driven. This button explicitly re-reads the
// active chat history instead of reloading the ChatGPT webpage.
const AUTO_REFRESH_NOTE = "自动：打开、切换对话或回复结束后同步";
let refreshShownTarget: string | null = null;
let pendingManualRefresh: {
  target: string;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function cancelPendingManualRefresh(): void {
  if (pendingManualRefresh) clearTimeout(pendingManualRefresh.timer);
  pendingManualRefresh = null;
}

function syncRefreshScope(state: UsageState): void {
  const target = refreshIdentity(state);
  els.statsRefreshRow.hidden = target === null;
  if (refreshShownTarget === target) return;
  cancelPendingManualRefresh();
  refreshShownTarget = target;
  els.statsRefresh.disabled = false;
  els.statsRefreshStatus.textContent = target ? AUTO_REFRESH_NOTE : "";
}

els.statsRefresh.addEventListener("click", () => {
  void (async () => {
    const target = refreshIdentity(currentState);
    if (!target || pendingManualRefresh) return;
    const platformId = currentState.platformId;
    const dialogueId = currentState.dialogueId;
    const adapter = ADAPTERS.find((a) => a.platformId === platformId);
    els.statsRefresh.disabled = true;
    els.statsRefreshStatus.textContent = "正在重新读取当前聊天统计…";
    try {
      const [active] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        active?.id == null ||
        !active.url ||
        !adapter?.dialogueIdFromUrl ||
        adapter.dialogueIdFromUrl(active.url) !== dialogueId ||
        !isSameRefreshTarget(target, currentState)
      ) {
        throw new Error("当前标签页不是该对话，请切回聊天后重试");
      }
      // Do not fetch the cached GET_STATE only: this tells the existing
      // content script to fetch the real conversation history again.
      const timer = setTimeout(() => {
        if (pendingManualRefresh?.target !== target) return;
        cancelPendingManualRefresh();
        els.statsRefresh.disabled = false;
        els.statsRefreshStatus.textContent =
          "尚未收到新的统计结果；请检查网络或稍后重试。";
      }, 15000);
      pendingManualRefresh = { target, timer };
      const ack = (await browser.tabs.sendMessage(active.id, {
        type: "REFRESH_HISTORY",
      } satisfies HeadroomMessage)) as { accepted?: boolean } | undefined;
      if (!ack?.accepted) {
        throw new Error("当前聊天未能启动历史读取，请稍后重试");
      }
    } catch (error) {
      if (!isSameRefreshTarget(target, currentState)) return;
      cancelPendingManualRefresh();
      els.statsRefresh.disabled = false;
      els.statsRefreshStatus.textContent =
        "刷新未成功：" +
        (error instanceof Error ? error.message : "请确认插件已重新加载");
    }
  })();
});

function finishManualRefreshOnStateUpdate(state: UsageState): void {
  const request = pendingManualRefresh;
  if (!request || !isSameRefreshTarget(request.target, state)) return;
  cancelPendingManualRefresh();
  els.statsRefresh.disabled = false;
  els.statsRefreshStatus.textContent =
    "已同步 " +
    new Date().toLocaleTimeString() +
    "（历史文本估算，不代表模型剩余上下文）";
}

// A generated draft stays only in the side panel's memory. Changing the chat
// invalidates it and any in-flight request so it cannot leak between windows.
let handoverScopeId: string | null = null;
let handoverGeneration = 0;
let isAiHandoverPrompt = false;
let preparedRemote: "api" | "plan" | null = null;
let preparedSummaryFormat: HandoverFormat = "markdown";
let sendingRemote = false;

function showSendStatus(text: string): void {
  els.handoverSendStatus.textContent = text;
  els.handoverSendStatus.hidden = !text;
}

function clearHandoverEditor(): void {
  showSendStatus("");
  preparedRemote = null;
  preparedSummaryFormat = "markdown";
  els.handoverSendConfirm.hidden = true;
  isAiHandoverPrompt = false;
  els.handoverCopy.textContent = "复制已编辑草稿";
  els.handoverText.value = "";
  els.handoverEditor.hidden = true;
  els.handoverStatus.textContent = "";
}

function syncHandoverScope(state: UsageState): void {
  const id = state.platformId === "chatgpt" ? state.dialogueId : null;
  els.handoverSection.hidden = !id;
  if (id === handoverScopeId) return;
  handoverScopeId = id;
  handoverGeneration++;
  els.handoverGenerate.disabled = false;
  els.handoverAiGenerate.disabled = false;
  clearHandoverEditor();
}

function generateHandover(
  mode: "local" | "ai-prompt",
  remote: "api" | "plan" | null = null,
): void {
  void (async () => {
    const id =
      currentState.platformId === "chatgpt" ? currentState.dialogueId : null;
    if (!id) return;
    const seq = ++handoverGeneration;
    const format: HandoverFormat =
      els.handoverFormat.value === "json" ? "json" : "markdown";
    clearHandoverEditor();
    isAiHandoverPrompt = mode === "ai-prompt";
    els.handoverCopy.textContent =
      mode === "ai-prompt" ? "复制 AI 总结提示词" : "复制已编辑草稿";
    els.handoverGenerate.disabled = true;
    els.handoverAiGenerate.disabled = true;
    els.handoverStatus.textContent = "正在从当前聊天生成本地交接草稿…";
    try {
      const [active] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const chatgptAdapter = ADAPTERS.find((a) => a.platformId === "chatgpt");
      if (
        active?.id == null ||
        !active.url ||
        chatgptAdapter?.dialogueIdFromUrl?.(active.url) !== id
      )
        throw new Error("当前标签页不是所选聊天，请切回 ChatGPT 后重试");

      const result = (await browser.tabs.sendMessage(active.id, {
        type: "GET_HANDOVER_DRAFT",
        dialogueId: id,
        mode,
        format,
      } satisfies HeadroomMessage)) as HandoverDraftResponse | undefined;

      if (seq !== handoverGeneration || handoverScopeId !== id) return;
      const [stillActive] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        stillActive?.id !== active.id ||
        !stillActive.url ||
        chatgptAdapter?.dialogueIdFromUrl?.(stillActive.url) !== id
      )
        throw new Error("读取期间切换了聊天窗口，请重新生成");

      if (!result?.ok || result.dialogueId !== id || !result.markdown) {
        throw new Error(result?.error ?? "没有读到可供迁移的文本");
      }
      els.handoverText.value = result.markdown;
      els.handoverEditor.hidden = false;
      if (remote) {
        preparedRemote = remote;
        preparedSummaryFormat = format;
        els.handoverSendConfirm.hidden = false;
        showSendStatus(
          "生成前会检查 API Key 或 ChatGPT 套餐授权。点击后仅将已核对的内容交给 OpenAI 总结，不会自动发到聊天窗口。",
        );
        els.handoverCopy.textContent = "复制 AI 提示词";
        els.handoverStatus.textContent =
          "请检查原文并删除敏感内容，然后点击“生成交接摘要”。摘要只在插件里显示，需手动复制到新聊天窗口。";
        return;
      }
      if (mode === "ai-prompt") {
        els.handoverStatus.textContent =
          "AI 提示词已准备：" +
          (result.roundCount ?? 0) +
          " 轮证据摘录" +
          (result.sourceTruncated ? "（部分内容已省略）" : "") +
          "。请检查敏感信息后复制，手动粘贴给 ChatGPT 总结。";
        return;
      }
      els.handoverStatus.textContent =
        "已生成 " +
        (result.roundCount ?? 0) +
        " 轮候选草稿" +
        (result.sourceTruncated ? "（篇幅已截断）" : "") +
        "。请核对并编辑，然后点击复制。";
    } catch (err) {
      if (seq === handoverGeneration && handoverScopeId === id) {
        els.handoverStatus.textContent =
          "生成失败：" +
          (err instanceof Error ? err.message : "请刷新聊天重试");
      }
    } finally {
      if (seq === handoverGeneration) {
        els.handoverGenerate.disabled = false;
        els.handoverAiGenerate.disabled = false;
      }
    }
  })();
}

els.handoverGenerate.addEventListener("click", () => generateHandover("local"));
els.handoverAiGenerate.addEventListener("click", () =>
  generateHandover("ai-prompt"),
);

els.handoverCopy.addEventListener("click", () => {
  void (async () => {
    const value = els.handoverText.value.trim();
    if (!value) {
      els.handoverStatus.textContent = "草稿为空，请先生成或编辑内容。";
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      els.handoverStatus.textContent = isAiHandoverPrompt
        ? "已复制 AI 总结提示词，请手动粘贴给 ChatGPT。获得摘要后再复制到新工作窗口。"
        : "已复制编辑后的草稿。请自行粘贴到新聊天。";
    } catch {
      els.handoverText.focus();
      els.handoverText.select();
      els.handoverStatus.textContent =
        "浏览器未允许自动复制，文本已选中，请按 Ctrl+C。";
    }
  })();
});

els.handoverClear.addEventListener("click", () => {
  handoverGeneration++;
  els.handoverGenerate.disabled = false;
  els.handoverAiGenerate.disabled = false;
  clearHandoverEditor();
});

// -------- Automatic summary: separate local companion, no browser-stored keys --------
function remoteError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "本机辅助服务不可用，请检查 Windows 后台服务是否正常运行";
}
async function remoteStatus(): Promise<void> {
  try {
    const status = await callCompanion<CompanionStatus>("/status");
    els.handoverRemoteStatus.textContent =
      "本机服务已连接。API Key：" +
      (status.apiKeySaved ? "已保存" : "未配置") +
      "；ChatGPT 套餐：" +
      (status.planAuthorized ? "已授权" : "未授权") +
      (status.account ? "（" + status.account + "）" : "") +
      (status.authFailure ? "；上次授权失败：" + status.authFailure : "");
  } catch (error) {
    els.handoverRemoteStatus.textContent =
      "无法连接本机总结服务：" +
      remoteError(error) +
      "。已安装服务的情况下无需重复授权。";
  }
}

els.handoverLocalCheck.addEventListener("click", () => {
  void remoteStatus();
});
els.handoverApiPrepare.addEventListener("click", () => {
  generateHandover("ai-prompt", "api");
});
els.handoverPlanPrepare.addEventListener("click", () => {
  generateHandover("ai-prompt", "plan");
});
els.handoverApiSave.addEventListener("click", () => {
  void (async () => {
    const key = els.handoverApiKey.value.trim();
    if (!key) {
      els.handoverRemoteStatus.textContent = "请先输入 API Key";
      return;
    }
    try {
      await callCompanion<{ ok: true }>("/api-key", { key });
      els.handoverApiKey.value = "";
      els.handoverRemoteStatus.textContent =
        "已由本机服务使用 Windows DPAPI 加密保存 API Key，插件不保存该密钥。";
      await remoteStatus();
    } catch (error) {
      els.handoverRemoteStatus.textContent = "保存失败：" + remoteError(error);
    }
  })();
});
els.handoverApiClear.addEventListener("click", () => {
  void (async () => {
    try {
      await callCompanion<{ ok: true }>("/api-key/clear", {});
      els.handoverApiKey.value = "";
      await remoteStatus();
    } catch (error) {
      els.handoverRemoteStatus.textContent = "删除失败：" + remoteError(error);
    }
  })();
});
els.handoverPlanConnect.addEventListener("click", () => {
  void (async () => {
    try {
      const result = await callCompanion<{ url: string }>("/oauth/start", {});
      if (
        !result.url.startsWith(
          "https://auth.openai.com/api/accounts/authorize?",
        )
      ) {
        throw new Error("授权链接无效");
      }
      await browser.tabs.create({ url: result.url });
      els.handoverRemoteStatus.textContent =
        "已打开 OpenAI 官方授权页面。请在浏览器确认是否允许使用 ChatGPT 套餐额度，再返回当前聊天。";
    } catch (error) {
      els.handoverRemoteStatus.textContent =
        "无法开始官方授权：" + remoteError(error);
    }
  })();
});
els.handoverPlanDisconnect.addEventListener("click", () => {
  void (async () => {
    try {
      const result = await callCompanion<{ ok: true; remoteRevoked: boolean }>(
        "/oauth/disconnect",
        {},
      );
      els.handoverRemoteStatus.textContent = result.remoteRevoked
        ? "ChatGPT 套餐授权已撤销。"
        : "本地授权已清除；远程撤销尚未确认，可在 ChatGPT 设置中检查。";
    } catch (error) {
      els.handoverRemoteStatus.textContent = remoteError(error);
    }
  })();
});

els.handoverSendConfirm.addEventListener("click", () => {
  void (async () => {
    const provider = preparedRemote;
    const id = handoverScopeId;
    const prompt = els.handoverText.value.trim();
    if (sendingRemote) return;
    if (!provider || !id) {
      showSendStatus(
        "尚未选择有效的自动总结方式。请点击上方 API 自动总结或使用 Work/Codex 套餐额度，重新准备内容。",
      );
      return;
    }
    if (prompt.length < 50 || prompt.length > 50000) {
      showSendStatus("请输入 50～50000 字的待总结文本。");
      return;
    }
    // Click is explicit consent; send ONLY the user-visible, editable text.
    sendingRemote = true;
    els.handoverSendConfirm.disabled = true;
    const seq = handoverGeneration;
    showSendStatus("正在检查本机服务和授权状态…");
    try {
      const status = await callCompanion<CompanionStatus>("/status");
      const missingCredential = automaticSummaryPreflight(provider, status);
      if (missingCredential) throw new Error(missingCredential);
      if (seq !== handoverGeneration || handoverScopeId !== id) return;
      showSendStatus(
        "AI 正在生成交接摘要（不会自动发送到聊天窗口），请勿切换当前聊天。",
      );
      const selectedModel = els.handoverModel.value;
      const result = await callCompanion<CompanionResult>("/summarize", {
        provider,
        model: selectedModel,
        prompt,
      });
      if (seq !== handoverGeneration || handoverScopeId !== id) return;
      const [active] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const adapter = ADAPTERS.find((a) => a.platformId === "chatgpt");
      if (!active?.url || adapter?.dialogueIdFromUrl?.(active.url) !== id) {
        throw new Error("总结期间切换了聊天窗口，请回原窗口重新生成");
      }
      const normalized = normalizeHandoverResult(
        result.summary,
        preparedSummaryFormat,
      );
      els.handoverText.value = normalized.text;
      els.handoverCopy.textContent = "复制交接摘要（用于新聊天）";
      els.handoverSendConfirm.hidden = true;
      preparedRemote = null;
      isAiHandoverPrompt = false;
      showSendStatus(
        normalized.warning ??
          "交接摘要已生成，未发送到任何聊天窗口。请核对内容，点击复制后手动粘贴到新聊天。",
      );
      els.handoverStatus.textContent =
        "已生成摘要（" +
        result.model +
        "，" +
        (provider === "api"
          ? "按 API 用量计费"
          : "按 ChatGPT Work/Codex 套餐用量计入") +
        "）。请核对所有重要结论，尤其是任务完成状态，然后复制到新窗口。";
    } catch (error) {
      if (seq === handoverGeneration && handoverScopeId === id) {
        showSendStatus("自动总结失败：" + remoteError(error));
        els.handoverStatus.textContent = "自动总结失败：" + remoteError(error);
      }
    } finally {
      sendingRemote = false;
      els.handoverSendConfirm.disabled = false;
    }
  })();
});

/** Render the per-round input/output breakdown (↑prompt / ⌘tool / ↓answer tokens + cumulative). */
function renderRounds(rounds: UsageState["rounds"]): void {
  const tbody = els.roundsList;
  tbody.replaceChildren();
  for (const r of rounds) {
    const tr = document.createElement("tr");
    const n = document.createElement("td");
    n.className = "hd-round-n";
    n.textContent = `#${r.n}`;
    const pin = document.createElement("td");
    pin.className = "hd-round-in";
    pin.textContent = `↑${r.promptTokens.toLocaleString()}`;
    // Search/tool tokens (spec 005) — "-" when 0 so old rounds keep a clean
    // row (hyphen matches the legend's bolded dash glyph, main.ts data-i18n-dash).
    const ptool = document.createElement("td");
    ptool.className = "hd-round-tool";
    ptool.textContent =
      (r.toolTokens ?? 0) > 0
        ? `⌘${(r.toolTokens ?? 0).toLocaleString()}`
        : "-";
    const pout = document.createElement("td");
    pout.className = "hd-round-out";
    pout.textContent = `↓${r.answerTokens.toLocaleString()}`;
    const cum = document.createElement("td");
    cum.className = "hd-round-cum";
    // Cumulative = prompt + tool + answer, computed locally — no extra Upstash field.
    cum.textContent = (
      r.promptTokens +
      (r.toolTokens ?? 0) +
      r.answerTokens
    ).toLocaleString();
    tr.append(n, pin, ptool, pout, cum);
    tbody.append(tr);
  }
}

// ---------- view switching (main ↔ settings) ----------

function showView(view: "main" | "settings"): void {
  els.viewMain.hidden = view !== "main";
  els.viewSettings.hidden = view !== "settings";
}

els.settingsBtn.addEventListener("click", () => showView("settings"));

/** Apply a full Settings object to the working copies + rebuild the settings UI. */
function adoptSettingsToUi(settings: Settings): void {
  currentThresholds = settings.thresholds;
  currentLanguage = settings.language;
  currentUpstash = settings.upstash;
  currentContextLimits = settings.contextLimits;
  currentTokenCoefficients = settings.tokenCoefficients;
  els.langSelect.value = currentLanguage;
  els.upstashUrl.value = currentUpstash.url;
  els.upstashToken.value = currentUpstash.token;
  renderTokenToggle();
  buildContextLimitRows();
  coeffInputs = buildCoefficientRows();
  buildPlatformReference();
  buildEstimationGuide();
  buildAbout();
  applyThresholdsToSliders(currentThresholds);
  applyI18n();
  render(currentState, currentThresholds);
}

/** Reload settings from storage and reset every input to the last-saved values. */
async function discardSettingsChanges(): Promise<void> {
  els.upstashToken.type = "password";
  setUpstashStatus(null, "");
  els.coeffHint.hidden = true;
  adoptSettingsToUi(await getSettings());
}

// Back discards unsaved working-copy edits (no confirm) — fine while there's
// a single writer; revisit (dirty check) if a second writer ever appears.
els.settingsBack.addEventListener("click", () => {
  void discardSettingsChanges().then(() => showView("main"));
});

// ---------- thresholds ----------

function applyThresholdsToSliders(th: Thresholds): void {
  const y = Math.round(th.yellow * 100);
  const r = Math.round(th.red * 100);
  els.thrYellow.value = String(y);
  els.thrRed.value = String(r);
  els.thrYellowVal.value = `${y}%`;
  els.thrRedVal.value = `${r}%`;
  // Drive the 3-zone gradient so the colored bands line up under each thumb.
  els.thrBar.style.setProperty("--thr-yellow", `${y}%`);
  els.thrBar.style.setProperty("--thr-red", `${r}%`);
}

// Only the dragged thumb is clamped (keep yellow < red). The two thumbs share
// one track; never rescale the other — just clamp the one being dragged.
// Dragging updates the working copy + previews the main view; nothing
// persists until the global "Save" button is pressed.
function syncThresholdsFromInputs(dragged: "yellow" | "red"): void {
  let y = Number(els.thrYellow.value);
  let r = Number(els.thrRed.value);
  if (dragged === "yellow" && y >= r) {
    y = r - 1;
    els.thrYellow.value = String(y);
  } else if (dragged === "red" && r <= y) {
    r = y + 1;
    els.thrRed.value = String(r);
  }
  els.thrYellowVal.value = `${y}%`;
  els.thrRedVal.value = `${r}%`;
  els.thrBar.style.setProperty("--thr-yellow", `${y}%`);
  els.thrBar.style.setProperty("--thr-red", `${r}%`);
  currentThresholds = { yellow: pctToRatio(y), red: pctToRatio(r) };
  render(currentState, currentThresholds);
}

els.thrYellow.addEventListener("input", () =>
  syncThresholdsFromInputs("yellow"),
);
els.thrRed.addEventListener("input", () => syncThresholdsFromInputs("red"));

els.thrReset.addEventListener("click", () => {
  currentThresholds = { ...DEFAULT_SETTINGS.thresholds };
  applyThresholdsToSliders(currentThresholds);
  render(currentState, currentThresholds);
});

// ---------- language ----------

// Switching the language just updates the working copy + re-localizes;
// persisting happens on the global "Save".
els.langSelect.addEventListener("change", () => {
  currentLanguage = els.langSelect.value as Language;
  applyI18n();
  // Rebuild programmatically-localized sections so labels, units, and
  // descriptions reflect the new language.
  buildContextLimitRows();
  coeffInputs = buildCoefficientRows();
  buildPlatformReference();
  buildEstimationGuide();
  buildAbout();
  render(currentState, currentThresholds);
});

// ---------- context limits (per-platform override of the auto-detected limit) ----------

const ctxInputs: Record<string, HTMLInputElement> = {};

// Context limits are authored in K tokens (1K = 1024) — the unit shown beside
// each input; the stored value is raw tokens, so convert on display and on edit.
const toKilo = (tokens: number): number => Math.round(tokens / 1024);
const fromKilo = (k: number): number => Math.round(k * 1024);

/**
 * Render one number-input row per adapter, seeded from currentContextLimits.
 * Defaults come from each adapter's contextLimit; the user overrides here.
 */
function buildContextLimitRows(): void {
  const list = document.querySelector<HTMLElement>("#context-limits-list");
  if (!list) return;
  list.innerHTML = "";
  for (const a of ADAPTERS) {
    const id = `ctx-${a.platformId}`;
    const row = document.createElement("div");
    row.className = "hd-settings-row hd-settings-row--field";
    const label = document.createElement("label");
    label.className = "hd-settings-label";
    label.htmlFor = id;
    label.append(
      platformIconImg(a.platformId),
      Object.assign(document.createElement("span"), {
        textContent: a.displayName,
      }),
    );
    const input = document.createElement("input");
    input.className = "hd-input hd-input--num";
    input.id = id;
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = String(
      toKilo(currentContextLimits[a.platformId] ?? a.contextLimit),
    );
    const errSpan = document.createElement("span");
    errSpan.className = "hd-input-err";
    errSpan.textContent = t("ctxLimitInvalid");
    errSpan.hidden = true;
    const syncSave = () => {
      const anyInvalid = Object.values(ctxInputs).some(
        (inp) => inp.dataset.invalid,
      );
      if (anyInvalid) {
        els.settingsSave.classList.add("hd-btn--has-errors");
      } else {
        els.settingsSave.classList.remove("hd-btn--has-errors");
      }
    };
    const markInvalid = () => {
      input.dataset.invalid = "true";
      errSpan.hidden = false;
      syncSave();
    };
    const clearInvalid = () => {
      delete input.dataset.invalid;
      errSpan.hidden = true;
      syncSave();
    };
    input.addEventListener("input", () => {
      const n = Number(input.value);
      if (Number.isFinite(n) && n > 0) {
        currentContextLimits[a.platformId] = fromKilo(n);
        clearInvalid();
      } else {
        markInvalid();
      }
    });
    const field = document.createElement("span");
    field.className = "hd-input-field";
    field.append(input, errSpan);
    const unit = document.createElement("span");
    unit.className = "hd-context-unit";
    unit.textContent = "K tokens";
    row.append(label, field, unit);
    list.append(row);
    if (a.platformId === "chatgpt") {
      // ChatGPT web caps context per plan (openai.com pricing) — one-line
      // footnote under the row, dot-marked, translated in all 10 locales
      // (settings strings are user-visible UI).
      const note = document.createElement("p");
      note.className = "hd-hint hd-hint--sm";
      note.textContent = t("chatgptContextLimitNote");
      list.append(note);
    }
    ctxInputs[a.platformId] = input;
  }
}

els.ctxReset.addEventListener("click", () => {
  currentContextLimits = { ...DEFAULT_SETTINGS.contextLimits };
  for (const a of ADAPTERS) {
    const inp = ctxInputs[a.platformId];
    if (inp)
      inp.value = String(
        toKilo(currentContextLimits[a.platformId] ?? a.contextLimit),
      );
  }
});

/** Delta model (spec 001 data model): only entries that differ from the
 *  adapter's built-in default are persisted — same as coefficient overrides.
 *  Editing a value back to the default un-overrides it. Unknown platform ids
 *  (removed/renamed adapters) pass through verbatim. */
function readContextLimitOverrides(): ContextLimits {
  const result: ContextLimits = {};
  for (const [id, val] of Object.entries(currentContextLimits)) {
    const def = ADAPTERS.find((a) => a.platformId === id)?.contextLimit;
    if (Number.isFinite(val) && val > 0 && val !== def) {
      result[id] = val;
    }
  }
  return result;
}

// ---------- token coefficients (spec 004 — Advanced Settings) ----------

const COEFF_KEYS: (keyof TokenCoefficients)[] = [
  "cjk",
  "kana",
  "hangul",
  "cyrillic",
  "arabic",
  "latin",
];

const COEFF_I18N: Record<
  keyof TokenCoefficients,
  { label: string; unit: string }
> = {
  cjk: { label: "coeffCjk", unit: "coeffUnitChar" },
  kana: { label: "coeffKana", unit: "coeffUnitChar" },
  hangul: { label: "coeffHangul", unit: "coeffUnitChar" },
  cyrillic: { label: "coeffCyrillic", unit: "coeffUnitWord" },
  arabic: { label: "coeffArabic", unit: "coeffUnitWord" },
  latin: { label: "coeffLatin", unit: "coeffUnitWord" },
};

/** Per-platform coefficient input elements, keyed as `${platformId}:${field}`.
 *  Owned by the caller — buildCoefficientRows returns a fresh map each call. */
let coeffInputs: Record<string, HTMLInputElement> = {};

function coeffInputKey(
  platformId: string,
  field: keyof TokenCoefficients,
): string {
  return `${platformId}:${field}`;
}

/** Build the coefficient-rows DOM for every platform, seeded from currentTokenCoefficients.
 *  Returns a fresh input-element map — the caller owns it. */
function buildCoefficientRows(): Record<string, HTMLInputElement> {
  const list = document.querySelector<HTMLElement>("#coeff-list");
  if (!list) return {};
  const inputs: Record<string, HTMLInputElement> = {};
  list.innerHTML = "";

  // Section-level description: what the numbers mean
  const desc = document.createElement("p");
  desc.className = "hd-coeff-desc";
  desc.textContent = t("coeffDescription");
  list.append(desc);

  for (const a of ADAPTERS) {
    const defaults = a.tokenCoefficients;
    const overrides = currentTokenCoefficients[a.platformId] ?? {};

    const details = document.createElement("details");
    details.className = "hd-platform-coeff";

    const summary = document.createElement("summary");
    summary.append(
      platformIconImg(a.platformId),
      Object.assign(document.createElement("span"), {
        textContent: a.displayName,
      }),
    );
    details.append(summary);

    const fields = document.createElement("div");
    fields.className = "hd-coeff-fields";

    for (const f of COEFF_KEYS) {
      const field = document.createElement("div");
      field.className = "hd-coeff-field";

      const label = document.createElement("label");
      label.textContent = t(COEFF_I18N[f].label) || COEFF_I18N[f].label;

      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.01";
      input.inputMode = "decimal";
      const val =
        overrides[f] !== undefined
          ? overrides[f]
          : (defaults[f] ?? DEFAULT_COEFFICIENTS[f]);
      input.value = String(val);

      const unit = document.createElement("span");
      unit.className = "hd-coeff-unit";
      unit.textContent = t(COEFF_I18N[f].unit);

      const key = coeffInputKey(a.platformId, f);
      inputs[key] = input;

      field.append(label, input, unit);
      fields.append(field);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "hd-coeff-reset";
    resetBtn.type = "button";
    resetBtn.textContent = t("coeffReset");
    resetBtn.addEventListener("click", () => {
      for (const f of COEFF_KEYS) {
        const inp = inputs[coeffInputKey(a.platformId, f)];
        if (inp) inp.value = String(defaults[f] ?? DEFAULT_COEFFICIENTS[f]);
      }
      delete currentTokenCoefficients[a.platformId];
    });

    const rowEnd = document.createElement("div");
    rowEnd.className = "hd-coeff-row-end";
    rowEnd.append(resetBtn);
    fields.append(rowEnd);
    details.append(fields);
    list.append(details);
  }
  return inputs;
}

/** Read coefficient overrides from the DOM. Only stores values that differ from defaults. */
function readCoefficientOverrides(): Record<
  string,
  Partial<TokenCoefficients>
> {
  const result: Record<string, Partial<TokenCoefficients>> = {};
  for (const a of ADAPTERS) {
    const defaults = a.tokenCoefficients;
    const override: Partial<TokenCoefficients> = {};
    for (const f of COEFF_KEYS) {
      const inp = coeffInputs[coeffInputKey(a.platformId, f)];
      if (!inp) continue;
      const val = Number(inp.value);
      if (
        Number.isFinite(val) &&
        val > 0 &&
        Math.abs(val - (defaults[f] ?? DEFAULT_COEFFICIENTS[f])) > 0.001
      ) {
        override[f] = val;
      }
    }
    if (Object.keys(override).length > 0) {
      result[a.platformId] = override;
    }
  }
  return result;
}

els.coeffResetAll.addEventListener("click", () => {
  for (const a of ADAPTERS) {
    const defaults = a.tokenCoefficients;
    for (const f of COEFF_KEYS) {
      const inp = coeffInputs[coeffInputKey(a.platformId, f)];
      if (inp) inp.value = String(defaults[f] ?? DEFAULT_COEFFICIENTS[f]);
    }
  }
  currentTokenCoefficients = {};
});

// ---------- platform reference ----------

interface PlatformInfo {
  platformId: string;
  model: string;
  tokenizer: string;
  tokenizerNote: string;
}

const PLATFORM_REF: PlatformInfo[] = [
  {
    platformId: "deepseek",
    model: "DeepSeek V4 (Flash / Pro)",
    tokenizer: "BPE (open-source)",
    tokenizerNote: "platformRefNoteDeepseek",
  },
  {
    platformId: "chatgpt",
    model: "GPT-5.6 (Luna / Sol)",
    tokenizer: "o200k_base (tiktoken)",
    tokenizerNote: "platformRefNoteChatgpt",
  },
  {
    platformId: "gemini",
    model: "Gemini 3.6 Flash",
    tokenizer: "SentencePiece (Gemma-family)",
    tokenizerNote: "platformRefNoteGemini",
  },
  {
    platformId: "kimi",
    model: "Kimi K3",
    tokenizer: "tiktoken-format BPE (open-source)",
    tokenizerNote: "platformRefNoteKimi",
  },
  {
    platformId: "qwen",
    model: "Qwen 3.8 Max",
    tokenizer: "BBPE (Qwen2Tokenizer lineage)",
    tokenizerNote: "platformRefNoteQwen",
  },
  {
    platformId: "qianwen",
    model: "Qwen 3.8 Max",
    tokenizer: "BBPE (Qwen2Tokenizer lineage)",
    tokenizerNote: "platformRefNoteQianwen",
  },
  {
    platformId: "doubao",
    model: "Doubao 2.1",
    tokenizer: "BPE (closed; Seed-OSS proxy)",
    tokenizerNote: "platformRefNoteDoubao",
  },
];

function lookupPlatformInfo(id: string): PlatformInfo | undefined {
  return PLATFORM_REF.find((p) => p.platformId === id);
}

function buildPlatformReference(): void {
  const list = document.querySelector<HTMLElement>("#platform-ref-list");
  if (!list) return;
  list.innerHTML = "";

  for (const a of ADAPTERS) {
    const info = lookupPlatformInfo(a.platformId);
    const card = document.createElement("div");
    card.className = "hd-platform-ref-card";

    const header = document.createElement("div");
    header.className = "hd-ref-header";
    header.append(
      platformIconImg(a.platformId),
      Object.assign(document.createElement("span"), {
        className: "hd-ref-name",
        textContent: a.displayName,
      }),
    );

    const dl = document.createElement("dl");
    dl.className = "hd-ref-dl";
    const addRow = (labelKey: string, value: string) => {
      const dt = document.createElement("dt");
      dt.textContent = t(labelKey);
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.append(dt, dd);
    };
    const ctxLimit = a.contextLimit;
    const ctx =
      ctxLimit >= 1_048_576
        ? `${ctxLimit / 1_048_576}M`
        : `${ctxLimit / 1024}K`;
    addRow("platformRefModel", info?.model ?? "-");
    addRow("platformRefContext", `${ctx} tokens`);
    addRow("platformRefTokenizer", info?.tokenizer ?? "-");

    if (info?.tokenizerNote) {
      const note = document.createElement("p");
      note.className = "hd-ref-note";
      note.textContent = t(info.tokenizerNote);
      dl.append(note);
    }

    card.append(header, dl);
    list.append(card);
  }
}

function buildEstimationGuide(): void {
  const guide = document.querySelector<HTMLElement>("#estimation-guide");
  if (!guide) return;
  guide.innerHTML = "";

  const title = document.createElement("h4");
  title.className = "hd-info-subtitle";
  title.textContent = t("estimationGuideTitle");

  const text = document.createElement("p");
  text.className = "hd-ref-note";
  text.textContent = t("estimationGuideText");

  guide.append(title, text);
}

function buildAbout(): void {
  const body = document.querySelector<HTMLElement>("#about-body");
  if (!body) return;
  body.innerHTML = "";

  const name = document.createElement("p");
  name.className = "hd-about-name";
  name.textContent = `Headroom v${browser.runtime.getManifest().version}`;

  const desc = document.createElement("p");
  desc.className = "hd-ref-note";
  desc.textContent = t("extDescription");

  const copyright = document.createElement("p");
  copyright.className = "hd-ref-note";
  const thisYear = new Date().getFullYear();
  copyright.textContent = `© 2026${
    thisYear > 2026 ? `–${thisYear}` : ""
  } ZM-BAD. Apache-2.0 License.`;

  const stack = document.createElement("p");
  stack.className = "hd-ref-note";
  stack.textContent = t("aboutStack");

  const repo = document.createElement("p");
  repo.className = "hd-ref-note";
  const repoUrl = "https://github.com/ZM-BAD/headroom";
  const link = (href: string, text: string) =>
    `<a href="${href}" class="hd-link" target="_blank" rel="noopener">${text}</a>`;
  repo.innerHTML = `${t("aboutContribute")} ${link(repoUrl, repoUrl)}`;
  // Linkify "issue" and "pull request" in the contribute text
  repo.innerHTML = repo.innerHTML
    .replace("issue", link(`${repoUrl}/issues`, "issue"))
    .replace("pull request", link(`${repoUrl}/pulls`, "pull request"));

  body.append(name, desc, copyright, stack, repo);
}

// ---------- upstash (BYOK REST API) ----------

/** Read + normalize the Upstash fields straight from the inputs (testable pre-save). */
function readUpstashFromInputs(): UpstashCreds {
  return {
    url: els.upstashUrl.value.trim().replace(/\/+$/, ""),
    token: els.upstashToken.value,
  };
}

function setUpstashStatus(
  state: "ok" | "err" | "busy" | null,
  text: string,
): void {
  els.upstashStatus.textContent = text;
  if (state) els.upstashStatus.dataset.state = state;
  else delete els.upstashStatus.dataset.state;
}

// Stroke-based eye / eye-off icons (currentColor) replace the 👁 emoji so the
// toggle renders crisp and consistent across platforms instead of the bulky
// OS emoji. Eye = token hidden (click to reveal); eye-off = token shown.
const EYE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

/** Sync the toggle's icon + aria-label to the token field's reveal state. */
function renderTokenToggle(): void {
  const shown = els.upstashToken.type === "text";
  els.upstashToggle.innerHTML = shown ? EYE_OFF_SVG : EYE_SVG;
  const key = shown ? "hideToken" : "showToken";
  els.upstashToggle.dataset.i18nAriaLabel = key;
  els.upstashToggle.setAttribute("aria-label", t(key));
}

/**
 * Verify Upstash REST credentials with a PING. The Upstash REST API is
 * CORS-permissive (the @upstash/redis SDK runs in browsers), so the side
 * panel can fetch it directly with no host permission. Returns a localized
 * verdict rather than throwing.
 *
 * Fallback if CORS ever blocks at runtime: move this fetch into the
 * background service worker + add optional_host_permissions and request()
 * on Save (the explicit-save button provides the user gesture).
 */
async function testUpstashConnection(
  url: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  if (!url || !token) return { ok: false, message: t("upstashErrMissing") };
  if (!url.startsWith("https://")) {
    return { ok: false, message: t("upstashErrNotHttps") };
  }
  try {
    const res = await fetch(`${url}/PING`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: t("upstashErrAuth") };
    }
    if (!res.ok) {
      return { ok: false, message: `${t("upstashErrStatus")} (${res.status})` };
    }
    const data = (await res.json()) as { result?: unknown };
    return data.result === "PONG"
      ? { ok: true, message: t("upstashOk") }
      : { ok: false, message: t("upstashErrUnexpected") };
  } catch (err) {
    return {
      ok: false,
      message: `${t("upstashErrNetwork")} (${(err as Error).message})`,
    };
  }
}

// Editing either field updates the working copy and clears any stale result.
for (const input of [els.upstashUrl, els.upstashToken]) {
  input.addEventListener("input", () => {
    currentUpstash = readUpstashFromInputs();
    setUpstashStatus(null, "");
  });
}

// Show / hide the token. renderTokenToggle() also mirrors the choice into
// data-i18n-aria-label so a later applyI18n() (e.g. language switch) keeps
// the correct label + icon.
els.upstashToggle.addEventListener("click", () => {
  els.upstashToken.type =
    els.upstashToken.type === "text" ? "password" : "text";
  renderTokenToggle();
});

// Test uses the current input values (not yet saved) so the user can verify
// before committing.
els.upstashTest.addEventListener("click", () => {
  void (async () => {
    const cfg = readUpstashFromInputs();
    els.upstashTest.disabled = true;
    setUpstashStatus("busy", t("testingConnection"));
    const { ok, message } = await testUpstashConnection(cfg.url, cfg.token);
    setUpstashStatus(ok ? "ok" : "err", message);
    els.upstashTest.disabled = false;
    if (!ok) return;
    // Settings pull on verified creds (spec 003): the creds are proven but
    // not yet saved, so a newer cloud snapshot is adopted into the WORKING
    // COPY only — the user's Save persists it (and pushes it back up with a
    // fresh timestamp). First connect on a new device: local updatedAt is 0,
    // so any cloud record wins.
    const pulled = await pullCloudSettings({
      ...(await getSettings()),
      upstash: cfg,
    });
    if (pulled.outcome === "adopted") adoptSettingsToUi(pulled.settings);
  })();
});

// Explicit pull — git-pull semantics: fetch the cloud snapshot and apply it
// locally NOW ("I just saved on device A and want it on B" without reopening
// the panel). Uses SAVED credentials — a pull that persists must not depend
// on unsaved input (that's what "Test connection" covers). Unlike the silent
// pull paths (panel open / test success), every outcome is reported.
els.upstashPull.addEventListener("click", () => {
  void (async () => {
    els.upstashPull.disabled = true;
    setUpstashStatus("busy", t("pullingSettings"));
    const pulled = await pullCloudSettings(await getSettings());
    els.upstashPull.disabled = false;
    switch (pulled.outcome) {
      case "no-creds":
        setUpstashStatus("err", t("upstashErrMissing"));
        return;
      case "error":
        setUpstashStatus("err", t("pullFailed"));
        return;
      case "not-newer":
        setUpstashStatus("ok", t("pullUpToDate"));
        return;
      case "adopted":
        await saveSettings(pulled.settings);
        adoptSettingsToUi(pulled.settings);
        await refreshStateFromBackground();
        // After adoption t() may speak a new language — status text included.
        setUpstashStatus("ok", t("pullAdopted"));
    }
  })();
});

// Clear wipes the URL + Token inputs and the working copy (re-masked). Like
// the threshold reset, it is working-copy only — it persists on global Save.
els.upstashClear.addEventListener("click", () => {
  els.upstashUrl.value = "";
  els.upstashToken.value = "";
  els.upstashToken.type = "password";
  currentUpstash = { url: "", token: "" };
  setUpstashStatus(null, "");
  renderTokenToggle();
});

// Paint the initial eye icon synchronously (token is password by default).
renderTokenToggle();

// ---------- save (whole settings page) ----------

/** Ask the background for the active tab's state and re-render the gauge. */
async function refreshStateFromBackground(): Promise<void> {
  try {
    const state = (await browser.runtime.sendMessage({
      type: "GET_STATE",
    } satisfies HeadroomMessage)) as UsageState | undefined;
    if (state) {
      currentState = state;
      render(currentState, currentThresholds);
    }
  } catch {
    // Background asleep — the next PAGE_READY/round will refresh.
  }
}

/** Brief "Saved ✓" flash on the save button to confirm the write landed. */
function flashSaved(): void {
  const btn = els.settingsSave;
  btn.textContent = `${t("settingsSaved")} ✓`;
  btn.classList.add("hd-btn--saved");
  // Let the green linger briefly, then remove the class so the CSS transition
  // fades back to the primary colour. Restore the original label after the
  // transition completes.
  window.setTimeout(() => {
    btn.classList.remove("hd-btn--saved");
  }, 1200);
  window.setTimeout(() => {
    btn.textContent = t("saveSettings");
  }, 1400);
}

els.settingsSave.addEventListener("click", () => {
  void (async () => {
    currentUpstash = readUpstashFromInputs();
    // Refuse to persist a non-https Upstash URL — the REST token must never go
    // over http. Empty URL is fine (Upstash is optional). Mirrors the C-layer
    // guard in upstash.ts; this gives the user a visible reason.
    if (currentUpstash.url && !currentUpstash.url.startsWith("https://")) {
      setUpstashStatus("err", t("upstashErrNotHttps"));
      return;
    }
    // Refuse to save if any context-limit input is still invalid — flash the
    // save button red so the user sees why nothing happened.
    for (const inp of Object.values(ctxInputs)) {
      if (inp.dataset.invalid) {
        els.settingsSave.classList.add("hd-btn--error-flash");
        window.setTimeout(
          () => els.settingsSave.classList.remove("hd-btn--error-flash"),
          600,
        );
        return;
      }
    }
    const coeffOverrides = readCoefficientOverrides();
    const coeffChanged =
      JSON.stringify(coeffOverrides) !==
      JSON.stringify(currentTokenCoefficients);
    currentTokenCoefficients = coeffOverrides;
    // Same delta model for context limits: entries equal to the adapter
    // default (including legacy baked-in full maps) drop out on save.
    currentContextLimits = readContextLimitOverrides();

    const now = Date.now();
    const settings: Settings = {
      thresholds: currentThresholds,
      language: currentLanguage,
      upstash: currentUpstash,
      contextLimits: currentContextLimits,
      tokenCoefficients: currentTokenCoefficients,
      // Same timestamp locally and in the cloud push below, so LWW compares
      // consistently across devices (spec 003 settings pull).
      updatedAt: now,
    };
    await saveSettings(settings);
    flashSaved();
    if (coeffChanged) {
      els.coeffHint.textContent = t("coeffRefreshHint");
      els.coeffHint.hidden = false;
    }
    // Push a credentials-stripped snapshot to Upstash so settings follow the
    // user across devices. Best-effort, AFTER the local write + UI flash so a
    // slow Upstash never blocks the "Saved ✓" feedback. Offline buffering is a
    // 003 concern; here a failure just logs.
    if (settings.upstash.url && settings.upstash.token) {
      try {
        await setCloudSettings(
          settings.upstash,
          toCloudSettings(settings, now),
        );
      } catch (err) {
        console.warn("[Headroom] settings cloud sync skipped:", err);
      }
    }
    // Refresh the main view so the gauge re-scales to the (possibly new) limit.
    await refreshStateFromBackground();
  })();
});

// ---------- init ----------

/**
 * Settings pull on panel open (spec 003): best-effort read of the cloud
 * snapshot; adopt + persist only when it is newer than local (LWW). This is
 * how a change saved on device A reaches device B — B just reopens the panel.
 * Fire-and-forget: a slow / absent / unconfigured cloud never blocks the UI.
 */
async function pullCloudSettingsOnOpen(): Promise<void> {
  const pulled = await pullCloudSettings(await getSettings());
  if (pulled.outcome !== "adopted") return;
  await saveSettings(pulled.settings);
  adoptSettingsToUi(pulled.settings);
  // Re-project so the gauge picks up a possibly-changed context limit.
  await refreshStateFromBackground();
}

// Instant first paint with defaults (browser locale), refined once settings load.
applyI18n();
render(currentState, currentThresholds);

void (async () => {
  const settings = await getSettings();
  currentThresholds = settings.thresholds;
  currentLanguage = settings.language;
  currentUpstash = settings.upstash;
  currentContextLimits = settings.contextLimits;
  currentTokenCoefficients = settings.tokenCoefficients;
  els.langSelect.value = currentLanguage;
  els.upstashUrl.value = currentUpstash.url;
  els.upstashToken.value = currentUpstash.token;
  // Preload tables for all supported locales so manual override is instant.
  // MUST run before build*() calls — they use t() which needs localeTables
  // populated, otherwise t() falls through to browser.i18n.getMessage which
  // returns the browser UI locale's text (≠ the user's selected language).
  await Promise.all(
    (
      [
        "en",
        "zh_CN",
        "ja",
        "ko",
        "ru",
        "es",
        "pt_BR",
        "fr",
        "de",
        "id",
      ] as const
    ).map((l) => loadLocaleTable(l)),
  );
  buildContextLimitRows();
  coeffInputs = buildCoefficientRows();
  buildPlatformReference();
  buildEstimationGuide();
  buildAbout();
  applyI18n();
  applyThresholdsToSliders(currentThresholds);
  render(currentState, currentThresholds);
  // Cloud settings pull AFTER the local-first paint (spec 003, same
  // display-first-then-sync order as the gauge itself).
  void pullCloudSettingsOnOpen();
})();

// Phase 2+: live usage updates from the background.
browser.runtime.onMessage.addListener((message: HeadroomMessage) => {
  if (message.type === "STATE_UPDATE") {
    const completesManual =
      pendingManualRefresh !== null &&
      isSameRefreshTarget(pendingManualRefresh.target, message.state);
    currentState = message.state;
    render(currentState, currentThresholds);
    if (completesManual) {
      finishManualRefreshOnStateUpdate(currentState);
    } else if (!pendingManualRefresh && refreshIdentity(currentState)) {
      els.statsRefreshStatus.textContent =
        "最近自动更新：" + new Date().toLocaleTimeString();
    }
  }
});

// Keep settings in sync if changed in another context (e.g. a future options page).
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const next = (changes[STORAGE_KEY]?.newValue ?? undefined) as
    Partial<Settings> | undefined;
  if (!next) return;
  if (next.thresholds) {
    currentThresholds = {
      yellow: next.thresholds.yellow ?? DEFAULT_THRESHOLDS.yellow,
      red: next.thresholds.red ?? DEFAULT_THRESHOLDS.red,
    };
    applyThresholdsToSliders(currentThresholds);
  }
  if (next.language) {
    currentLanguage = next.language;
    els.langSelect.value = currentLanguage;
    applyI18n();
  }
  if (next.upstash) {
    currentUpstash = {
      url: next.upstash.url ?? "",
      token: next.upstash.token ?? "",
    };
    els.upstashUrl.value = currentUpstash.url;
    els.upstashToken.value = currentUpstash.token;
  }
  if (next.contextLimits) {
    currentContextLimits = {
      ...DEFAULT_SETTINGS.contextLimits,
      ...next.contextLimits,
    };
    for (const a of ADAPTERS) {
      const inp = ctxInputs[a.platformId];
      if (inp)
        inp.value = String(
          toKilo(currentContextLimits[a.platformId] ?? a.contextLimit),
        );
    }
  }
  if (next.tokenCoefficients) {
    currentTokenCoefficients = next.tokenCoefficients;
    coeffInputs = buildCoefficientRows();
  }
  render(currentState, currentThresholds);
});

// Ask the background for the current state when the panel opens.
void (async () => {
  try {
    const state = (await browser.runtime.sendMessage({
      type: "GET_STATE",
    } satisfies HeadroomMessage)) as UsageState | undefined;
    if (state) {
      currentState = state;
      render(currentState, currentThresholds);
    }
  } catch {
    // Background service worker may be asleep; the idle render already shows.
  }
})();
