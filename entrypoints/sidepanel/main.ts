import "./style.css";
import type {
  HeadroomMessage,
  HandoverDraftResponse,
  UsageState,
} from "../../utils/messages";
import {
  describeHistoryComposition,
  toolDominantReminder,
  historyEvidenceNote,
  summarizeChatGptHistory,
} from "../../utils/chatgpt-history-summary";
import {
  handoverKey,
  restorableHandover,
  isSourceChat,
} from "../../utils/handover-session";
import {
  scrollStorageKey,
  validScrollY,
  shouldRecordScroll,
} from "../../utils/handover-scroll";
import {
  withContentReceiverRecovery,
  isMissingContentReceiver,
} from "../../utils/content-script-recovery";
import {
  CHAT_REMINDERS_KEY,
  CHATGPT_REFERENCE_PRESETS,
  referencePresetValue,
  DEFAULT_CHAT_REMINDERS,
  safeReminderConfig,
  reminderStage,
  referenceRatio,
  REMINDER_TITLES,
  type ReminderConfig,
} from "../../utils/chatgpt-reminders";
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
  reminderCard: document.querySelector<HTMLElement>("#chatgpt-reminder-card")!,
  reminderPreset: document.querySelector<HTMLSelectElement>(
    "#cg-reminder-preset",
  )!,
  reminderQuality: document.querySelector<HTMLElement>("#cg-reminder-quality")!,
  reminderComposition: document.querySelector<HTMLElement>(
    "#cg-reminder-composition",
  )!,
  reminderAdvice: document.querySelector<HTMLElement>("#cg-reminder-advice")!,
  reminderCurrent: document.querySelector<HTMLElement>("#cg-reminder-current")!,
  reminderEnabled: document.querySelector<HTMLInputElement>(
    "#cg-reminder-enabled",
  )!,
  reminderReference: document.querySelector<HTMLInputElement>(
    "#cg-reminder-reference",
  )!,
  reminderOne: document.querySelector<HTMLInputElement>("#cg-reminder-one")!,
  reminderTwo: document.querySelector<HTMLInputElement>("#cg-reminder-two")!,
  reminderThree:
    document.querySelector<HTMLInputElement>("#cg-reminder-three")!,
  reminderPopup:
    document.querySelector<HTMLInputElement>("#cg-reminder-popup")!,
  reminderSave: document.querySelector<HTMLButtonElement>("#cg-reminder-save")!,
  reminderSettingStatus: document.querySelector<HTMLElement>(
    "#cg-reminder-setting-status",
  )!,
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
  handoverTextLabel: document.querySelector<HTMLElement>(
    "#handover-text-label",
  )!,
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
  handoverProgress: document.querySelector<HTMLElement>("#handover-progress")!,
  handoverProgressTitle: document.querySelector<HTMLElement>(
    "#handover-progress-title",
  )!,
  handoverProgressDetail: document.querySelector<HTMLElement>(
    "#handover-progress-detail",
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

// Keep the side panel's last ChatGPT view mounted while another website is
// active. Destroying the section collapsed the document and zeroed scrollY.
const viewPausedNote = document.createElement("div");
viewPausedNote.className = "hd-handover-pause-note";
viewPausedNote.hidden = true;
viewPausedNote.setAttribute("role", "status");
viewPausedNote.textContent =
  "当前已切换到其他网页。交接草稿与生成状态仍保留，返回原 ChatGPT 聊天后继续。";
els.handoverSection.parentElement?.insertBefore(
  viewPausedNote,
  els.handoverSection,
);
const activeDraftReads = new Set<string>();
function freezeChatView(): void {
  viewPausedNote.hidden = false;
  els.handoverGenerate.disabled = true;
  els.handoverAiGenerate.disabled = true;
  els.handoverApiPrepare.disabled = true;
  els.handoverPlanPrepare.disabled = true;
  els.handoverSendConfirm.disabled = true;
  // Keep the previous DOM height, scroll position, and pending state intact.
}
function unfreezeChatView(id: string): void {
  viewPausedNote.hidden = true;
  const hasRemote = !!handoverByChat.get(id)?.jobId;
  const busy = hasRemote || activeDraftReads.has(id);
  els.handoverGenerate.disabled = busy;
  els.handoverAiGenerate.disabled = busy;
  els.handoverApiPrepare.disabled = busy;
  els.handoverPlanPrepare.disabled = busy;
  els.handoverSendConfirm.disabled = busy;
}
for (const preset of CHATGPT_REFERENCE_PRESETS) {
  const option = document.createElement("option");
  option.value = String(preset.tokens);
  option.textContent = preset.label;
  els.reminderPreset.append(option);
}
els.reminderPreset.addEventListener("change", () => {
  if (els.reminderPreset.value !== "custom") {
    els.reminderReference.value = els.reminderPreset.value;
  }
  els.reminderSettingStatus.textContent = "参考设置尚未保存";
});
els.reminderReference.addEventListener("input", () => {
  els.reminderPreset.value = referencePresetValue(
    Number(els.reminderReference.value),
  );
  els.reminderSettingStatus.textContent = "参考设置尚未保存";
});
let reminderConfig: ReminderConfig = {
  ...DEFAULT_CHAT_REMINDERS,
  stages: [...DEFAULT_CHAT_REMINDERS.stages],
};
function renderReminder(state: UsageState): void {
  const active = state.platformId === "chatgpt";
  els.reminderCard.hidden = !active;
  if (!active) return;
  const stage = reminderStage(state.totalTokens, reminderConfig);
  const ratio = referenceRatio(state.totalTokens, reminderConfig);
  const summary = summarizeChatGptHistory(state);
  const composition = describeHistoryComposition(summary);
  const toolReminder = reminderConfig.enabled
    ? toolDominantReminder(
        summary,
        state.totalTokens,
        reminderConfig.referenceTokens,
      )
    : null;
  els.reminderQuality.textContent = historyEvidenceNote(summary);
  els.reminderComposition.textContent =
    toolReminder?.details ?? composition.breakdown;
  els.reminderAdvice.textContent = composition.advice;
  // Tool-heavy chats display the dialogue/tool split prominently. The total
  // history/reference ratio stays available as an explanatory secondary line.
  els.reminderCurrent.dataset.stage = String(toolReminder ? 0 : stage);
  els.reminderCurrent.dataset.kind = toolReminder ? "tool-heavy" : "normal";
  const adviceTitle =
    stage === 0
      ? ""
      : stage === 3 && composition.toolHeavy
        ? "建议先保存关键分析结论"
        : REMINDER_TITLES[stage];
  els.reminderCurrent.textContent = !reminderConfig.enabled
    ? "历史估算提醒已关闭"
    : toolReminder
      ? toolReminder.headline
      : stage === 0
        ? `历史累计 / 手动参考量：${ratio.toFixed(1)}% · 未达到关注阈值`
        : ratio > 100
          ? `历史累计 / 手动参考量：${ratio.toFixed(1)}% · 已超过参考量 · ${adviceTitle}`
          : `历史累计 / 手动参考量：${ratio.toFixed(1)}% · ${adviceTitle}`;
}
function adoptReminderConfig(value: ReminderConfig): void {
  reminderConfig = value;
  els.reminderEnabled.checked = value.enabled;
  els.reminderReference.value = String(value.referenceTokens);
  els.reminderPreset.value = referencePresetValue(value.referenceTokens);
  els.reminderOne.value = String(value.stages[0]);
  els.reminderTwo.value = String(value.stages[1]);
  els.reminderThree.value = String(value.stages[2]);
  els.reminderPopup.checked = value.browserNotifications;
  renderReminder(currentState);
}
els.reminderSave.addEventListener("click", () => {
  void (async () => {
    const referenceTokens = Number(els.reminderReference.value);
    const stages = [
      Number(els.reminderOne.value),
      Number(els.reminderTwo.value),
      Number(els.reminderThree.value),
    ];
    if (
      !Number.isInteger(referenceTokens) ||
      referenceTokens < 10000 ||
      referenceTokens > 2000000 ||
      stages.some((v) => !Number.isInteger(v)) ||
      !(
        (stages[0] ?? 0) >= 1 &&
        (stages[0] ?? 0) < (stages[1] ?? 0) &&
        (stages[1] ?? 0) < (stages[2] ?? 0) &&
        (stages[2] ?? 999) <= 100
      )
    ) {
      els.reminderSettingStatus.textContent =
        "请检查参考量（1万～200万）和递增百分比";
      return;
    }
    const chosen = safeReminderConfig({
      enabled: els.reminderEnabled.checked,
      browserNotifications: els.reminderPopup.checked,
      referenceTokens,
      stages,
    });
    await browser.storage.local.set({ [CHAT_REMINDERS_KEY]: chosen });
    adoptReminderConfig(chosen);
    els.reminderSettingStatus.textContent = "设置已保存";
  })().catch(() => {
    els.reminderSettingStatus.textContent = "保存失败";
  });
});
void browser.storage.local
  .get(CHAT_REMINDERS_KEY)
  .then((data) => {
    adoptReminderConfig(safeReminderConfig(data[CHAT_REMINDERS_KEY]));
  })
  .catch(() => {});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CHAT_REMINDERS_KEY])
    adoptReminderConfig(
      safeReminderConfig(changes[CHAT_REMINDERS_KEY].newValue),
    );
});

function render(state: UsageState, th: Thresholds): void {
  // Unsupported tabs must not hide the chat's long handover section.
  // The active page still changes; the visible view is explicitly marked
  // as a paused snapshot, not misleadingly labeled a live measurement.
  if (handoverScopeId && state.platformId !== "chatgpt") {
    freezeChatView();
    return;
  }
  if (
    handoverScopeId &&
    state.platformId === "chatgpt" &&
    state.dialogueId === handoverScopeId
  ) {
    unfreezeChatView(handoverScopeId);
  }
  const lastChatId = handoverScopeId;
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
  renderReminder(state);
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
  // Even with the same chat ID, a table re-render can collapse the scroll
  // height. Restore after every redraw, not only when the chat ID changes.
  const nextChatId = state.platformId === "chatgpt" ? state.dialogueId : null;
  if (nextChatId && nextChatId === lastChatId && scrollByChat.has(nextChatId)) {
    restoreChatScroll(nextChatId);
  }
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

// Handover state belongs to the source chat. Never display it in other chats.
// Review text lives in extension session memory (not synced or kept on disk).
let handoverScopeId: string | null = null;
// Independent generation counter per chat: requesting a draft for chat B must
// not discard a still-running draft request for chat A.
const handoverGenerations = new Map<string, number>();
function nextHandoverGeneration(id: string): number {
  const next = (handoverGenerations.get(id) ?? 0) + 1;
  handoverGenerations.set(id, next);
  return next;
}
function currentHandoverGeneration(id: string, seq: number): boolean {
  return handoverGenerations.get(id) === seq;
}
let isAiHandoverPrompt = false;
let preparedRemote: "api" | "plan" | null = null;
let preparedSummaryFormat: HandoverFormat = "markdown";
let sendingRemote = false;

type SavedHandover = {
  text: string;
  status: string;
  sendStatus: string;
  copyLabel: string;
  remote: "api" | "plan" | null;
  format: HandoverFormat;
  isAiPrompt: boolean;
  updatedAt: number;
  jobId?: string;
  editorScrollTop?: number;
};

const handoverByChat = new Map<string, SavedHandover>();
const activePollers = new Set<string>();
const scrollByChat = new Map<string, number>();
let restoringScroll = false;
let scrollRestoreSequence = 0;
let pendingScrollSave: ReturnType<typeof setTimeout> | undefined;
// Browser-driven layout clamping can emit scroll events during a tab switch.
// Only a recent, explicit input gesture is permitted to change the saved y.
let lastUserScrollIntentAt = 0;
function markUserScrollIntent(): void {
  lastUserScrollIntentAt = Date.now();
}
function hasRecentUserScrollIntent(now = Date.now()): boolean {
  return now - lastUserScrollIntentAt < 1800;
}

/** The side panel scrolls its HTML root, not #app or the summary textarea. */
function panelScroller(): Element {
  return document.scrollingElement ?? document.documentElement;
}
function panelScrollPosition(): number {
  return Math.max(0, Math.round(panelScroller().scrollTop));
}
function persistChatScroll(id: string, y: number): void {
  void browser.storage.session
    .set({ [scrollStorageKey(id)]: y })
    .catch(() => {});
}
/** Keep the last real scroll point when a tab change collapses the panel's DOM. */
function captureVisibleScroll(): void {
  if (
    restoringScroll ||
    !handoverScopeId ||
    els.handoverSection.hidden ||
    !hasRecentUserScrollIntent()
  )
    return;
  const element = panelScroller();
  const position = panelScrollPosition();
  const max = Math.max(0, element.scrollHeight - element.clientHeight);
  const previous = scrollByChat.get(handoverScopeId);
  if (!shouldRecordScroll(previous, position, max)) return;
  scrollByChat.set(handoverScopeId, position);
}

// Mark real gestures BEFORE scroll events fire. Ctrl+Tab/Alt+Tab is not a
// scroll gesture; switching browser tabs must never overwrite the last y.
window.addEventListener("wheel", markUserScrollIntent, { passive: true });
window.addEventListener("touchstart", markUserScrollIntent, { passive: true });
window.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
window.addEventListener(
  "pointermove",
  (event) => {
    if (event.buttons & 1) markUserScrollIntent();
  },
  { passive: true },
);
window.addEventListener(
  "keydown",
  (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ].includes(event.key)
    )
      markUserScrollIntent();
  },
  { passive: true },
);

// Flush the last position if Chromium suspends this panel during a tab change.
function flushCurrentScroll(): void {
  if (handoverScopeId) {
    const lastY = scrollByChat.get(handoverScopeId);
    if (lastY !== undefined) persistChatScroll(handoverScopeId, lastY);
  }
}
window.addEventListener("pagehide", flushCurrentScroll);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushCurrentScroll();
});

window.addEventListener(
  "scroll",
  () => {
    if (restoringScroll || !handoverScopeId || els.handoverSection.hidden)
      return;
    captureVisibleScroll();
    if (pendingScrollSave) clearTimeout(pendingScrollSave);
    const id = handoverScopeId;
    pendingScrollSave = setTimeout(() => {
      const y = scrollByChat.get(id);
      if (y !== undefined) persistChatScroll(id, y);
    }, 180);
  },
  { passive: true },
);

/** Do not pull the panel back down if its user has resumed manual scrolling. */
for (const kind of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
  window.addEventListener(
    kind,
    () => {
      if (!restoringScroll) return;
      scrollRestoreSequence++;
      restoringScroll = false;
    },
    { passive: true },
  );
}

function restoreChatScroll(id: string): void {
  const ticket = ++scrollRestoreSequence;
  restoringScroll = true;
  const release = () => {
    if (ticket === scrollRestoreSequence) restoringScroll = false;
  };
  const apply = (pos: number): void => {
    if (handoverScopeId !== id || ticket !== scrollRestoreSequence) {
      release();
      return;
    }
    // Repainting the rounds table briefly reduces scrollHeight. Retry until
    // it grows back, rather than letting the browser clamp the desired y to 0.
    let attempts = 0;
    const step = (): void => {
      if (handoverScopeId !== id || ticket !== scrollRestoreSequence) {
        release();
        return;
      }
      const scroller = panelScroller();
      const maximum = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight,
      );
      scroller.scrollTop = Math.min(pos, maximum);
      attempts++;
      if (maximum + 2 >= pos || attempts >= 40) {
        // One more post-layout check protects against a late STATE_UPDATE.
        setTimeout(() => {
          if (ticket === scrollRestoreSequence && handoverScopeId === id) {
            const root = panelScroller();
            if (
              Math.abs(
                root.scrollTop -
                  Math.min(
                    pos,
                    Math.max(0, root.scrollHeight - root.clientHeight),
                  ),
              ) > 3
            ) {
              root.scrollTop = Math.min(
                pos,
                Math.max(0, root.scrollHeight - root.clientHeight),
              );
            }
          }
          release();
        }, 120);
        return;
      }
      setTimeout(step, 75);
    };
    requestAnimationFrame(() => requestAnimationFrame(step));
  };
  const known = scrollByChat.get(id);
  if (known !== undefined) {
    apply(known);
    return;
  }
  void browser.storage.session
    .get(scrollStorageKey(id))
    .then((data) => {
      if (ticket !== scrollRestoreSequence) return;
      const value = data[scrollStorageKey(id)];
      if (validScrollY(value)) {
        scrollByChat.set(id, value);
        apply(value);
      } else {
        release();
      }
    })
    .catch(release);
}
function showProgress(
  state: "running" | "complete" | "warning" | "idle",
  title: string,
  detail = "",
): void {
  els.handoverProgress.hidden = state === "idle";
  els.handoverProgress.dataset.state = state;
  els.handoverProgressTitle.textContent = title;
  els.handoverProgressDetail.textContent = detail;
}
// Serialize session writes so a late, smaller draft does not overwrite a
// newer finished result, and an explicit clear cannot race with regeneration.
const handoverWrites = new Map<string, Promise<void>>();
function queueHandoverWrite(id: string, action: () => Promise<void>): void {
  const prior = handoverWrites.get(id) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(action)
    .catch(() => {});
  handoverWrites.set(id, next);
}
function captureHandover(): SavedHandover {
  return {
    text: els.handoverText.value,
    status: els.handoverStatus.textContent || "",
    sendStatus: els.handoverSendStatus.textContent || "",
    copyLabel: els.handoverCopy.textContent || "复制已编辑草稿",
    remote: preparedRemote,
    format: preparedSummaryFormat,
    isAiPrompt: isAiHandoverPrompt,
    updatedAt: Date.now(),
    editorScrollTop: els.handoverText.scrollTop,
  };
}

function storeHandover(id: string, value: SavedHandover): void {
  handoverByChat.set(id, value);
  queueHandoverWrite(id, () =>
    browser.storage.session.set({ [handoverKey(id)]: value }),
  );
}

function showHandover(value: SavedHandover): void {
  els.handoverText.value = value.text;
  els.handoverEditor.hidden = false;
  els.handoverText.scrollTop = value.editorScrollTop ?? 0;
  els.handoverFormat.value = value.format;
  els.handoverStatus.textContent = value.status;
  els.handoverCopy.textContent = value.copyLabel;
  preparedRemote = value.remote;
  preparedSummaryFormat = value.format;
  isAiHandoverPrompt = value.isAiPrompt;
  const running = !!value.jobId;
  els.handoverTextLabel.textContent = running
    ? "正在总结的原始输入（非摘要）"
    : value.copyLabel.includes("交接摘要")
      ? "交接摘要结果（可修改后复制）"
      : value.remote
        ? "待提交的总结材料（可检查和编辑）"
        : "交接草稿（可编辑）";
  els.handoverSendConfirm.hidden = !value.remote || running;
  els.handoverGenerate.disabled = running;
  els.handoverAiGenerate.disabled = running;
  els.handoverApiPrepare.disabled = running;
  els.handoverPlanPrepare.disabled = running;
  els.handoverClear.disabled = running;
  els.handoverCopy.textContent = running
    ? "复制原始输入（非摘要）"
    : value.copyLabel;
  if (running && /查询失败|超时|未知|不明确/.test(value.status))
    showProgress("warning", "任务状态尚未确认", value.status);
  else if (running)
    showProgress(
      "running",
      "AI 正在生成交接摘要",
      value.status || "结果会在完成后自动恢复到原聊天。",
    );
  else if (value.status.includes("失败") || value.status.includes("错误"))
    showProgress("warning", "处理遇到问题", value.status);
  else if (value.copyLabel.includes("交接摘要"))
    showProgress("complete", "交接摘要已生成，可以复制", value.status);
  else if (value.remote) showProgress("idle", "");
  else showProgress("idle", "");
  showSendStatus(value.sendStatus);
}

function saveVisibleHandover(): void {
  if (!handoverScopeId || els.handoverEditor.hidden) return;
  const latest = handoverByChat.get(handoverScopeId);
  storeHandover(handoverScopeId, {
    ...captureHandover(),
    jobId: latest?.jobId,
  });
}

function restoreHandover(id: string): void {
  const cached = handoverByChat.get(id);
  if (cached) {
    showHandover(cached);
    if (cached.jobId) void pollSummaryJob(id, cached.jobId);
    restoreChatScroll(id);
    return;
  }
  void browser.storage.session
    .get(handoverKey(id))
    .then((result) => {
      const candidate = result[handoverKey(id)] as SavedHandover | undefined;
      if (!restorableHandover(candidate) || handoverByChat.has(id)) return;
      handoverByChat.set(id, candidate);
      if (isSourceChat(id, handoverScopeId)) {
        showHandover(candidate);
        restoreChatScroll(id);
      }
      if (candidate.jobId) void pollSummaryJob(id, candidate.jobId);
    })
    .catch(() => {});
}

function clearSavedHandover(id: string): void {
  handoverByChat.delete(id);
  queueHandoverWrite(id, () => browser.storage.session.remove(handoverKey(id)));
}

function commitHandover(id: string, value: SavedHandover): void {
  storeHandover(id, value);
  if (isSourceChat(id, handoverScopeId)) showHandover(value);
}

function showSendStatus(text: string): void {
  els.handoverSendStatus.textContent = text;
  els.handoverSendStatus.hidden = !text;
}

function clearHandoverEditor(): void {
  showProgress("idle", "");
  els.handoverGenerate.disabled = false;
  els.handoverAiGenerate.disabled = false;
  els.handoverApiPrepare.disabled = false;
  els.handoverPlanPrepare.disabled = false;
  els.handoverClear.disabled = false;
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
  if (handoverScopeId) {
    const y = scrollByChat.get(handoverScopeId);
    if (y !== undefined) persistChatScroll(handoverScopeId, y);
  }
  saveVisibleHandover();
  handoverScopeId = id;
  // A tab switch must not invalidate a pending request for another chat.
  els.handoverGenerate.disabled = false;
  els.handoverAiGenerate.disabled = false;
  clearHandoverEditor();
  if (id) {
    restoreHandover(id);
    restoreChatScroll(id);
  }
}

function generateHandover(
  mode: "local" | "ai-prompt",
  remote: "api" | "plan" | null = null,
): void {
  void (async () => {
    const id =
      currentState.platformId === "chatgpt" ? currentState.dialogueId : null;
    if (!id) return;
    if (handoverByChat.get(id)?.jobId) {
      showProgress(
        "running",
        "AI 总结仍在进行",
        "请不要重复提交或覆盖原任务，完成后即可复制。",
      );
      return;
    }
    const seq = nextHandoverGeneration(id);
    activeDraftReads.add(id);
    // Keep any previously reviewed draft until the next one is successful.
    const previousDraft = handoverByChat.get(id);
    const format: HandoverFormat =
      els.handoverFormat.value === "json" ? "json" : "markdown";
    clearHandoverEditor();
    isAiHandoverPrompt = mode === "ai-prompt";
    els.handoverCopy.textContent =
      mode === "ai-prompt" ? "复制 AI 总结提示词" : "复制已编辑草稿";
    els.handoverGenerate.disabled = true;
    els.handoverAiGenerate.disabled = true;
    els.handoverStatus.textContent = "正在从当前聊天生成本地交接草稿…";
    showProgress(
      "running",
      "正在读取聊天内容",
      "提取内容后会出现在下方，可检查和复制。",
    );
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

      const originalMessage = {
        type: "GET_HANDOVER_DRAFT" as const,
        dialogueId: id,
        mode,
        format,
      } satisfies HeadroomMessage;
      const result = (await withContentReceiverRecovery(
        () => browser.tabs.sendMessage(active.id!, originalMessage),
        async () => {
          // After an extension reload, open tabs may still hold an invalidated
          // old content script. Reinstate only the already-declared matching
          // extension content script, without reloading the user's chat.
          const tab = await browser.tabs.get(active.id!);
          if (!tab.url || chatgptAdapter?.dialogueIdFromUrl?.(tab.url) !== id)
            throw new Error("聊天标签页已发生变化，请返回原聊天后重试");
          await browser.scripting.executeScript({
            target: { tabId: active.id! },
            files: ["/content-scripts/platform.js"],
          });
        },
      )) as HandoverDraftResponse | undefined;

      if (!currentHandoverGeneration(id, seq)) return;
      // The request belongs to active.id captured at its start. Tab changes
      // later must not invalidate the result or make it appear in another chat.

      if (!result?.ok || result.dialogueId !== id || !result.markdown) {
        throw new Error(result?.error ?? "没有读到可供迁移的文本");
      }
      commitHandover(id, {
        text: result.markdown,
        status: remote
          ? "请检查原文并删除敏感内容，然后点击“生成交接摘要”。摘要不会自动发到新聊天。"
          : mode === "ai-prompt"
            ? "AI 提示词已准备：" +
              (result.roundCount ?? 0) +
              " 轮证据摘录" +
              (result.sourceTruncated ? "（部分内容已省略）" : "") +
              "。请检查后复制。"
            : "已生成 " +
              (result.roundCount ?? 0) +
              " 轮候选草稿" +
              (result.sourceTruncated ? "（篇幅已截断）" : "") +
              "。请核对并编辑后复制。",
        sendStatus: remote
          ? "确认提交时，只有你核对后的摘要输入会发送至 OpenAI；切换网页不再丢失进度。"
          : "",
        copyLabel: remote
          ? "复制 AI 提示词"
          : mode === "ai-prompt"
            ? "复制 AI 总结提示词"
            : "复制已编辑草稿",
        remote,
        format,
        isAiPrompt: mode === "ai-prompt",
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (currentHandoverGeneration(id, seq)) {
        const needsReconnect = isMissingContentReceiver(err);
        const hint = needsReconnect
          ? "网页连接未恢复。请在原 ChatGPT 标签页刷新一次，再点击生成；不必重新授权或安装。"
          : "请确认网络和当前聊天状态后重试。之前的草稿不会被覆盖。";
        const message =
          "读取失败：" +
          (err instanceof Error ? err.message : "请刷新聊天重试");
        if (previousDraft) {
          commitHandover(id, {
            ...previousDraft,
            status: "新草稿生成失败，已恢复之前的内容。" + hint,
            sendStatus: message,
            updatedAt: Date.now(),
          });
        } else if (handoverScopeId === id) {
          els.handoverStatus.textContent = message;
        }
        if (handoverScopeId === id)
          showProgress("warning", "读取聊天失败", hint);
      }
    } finally {
      activeDraftReads.delete(id);
      if (
        currentHandoverGeneration(id, seq) &&
        currentState.platformId === "chatgpt" &&
        currentState.dialogueId === id
      ) {
        unfreezeChatView(id);
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
      els.handoverStatus.textContent = handoverByChat.get(handoverScopeId ?? "")
        ?.jobId
        ? "已复制原始输入（不是生成的摘要），AI 仍在总结中。"
        : els.handoverCopy.textContent.includes("交接摘要")
          ? "已复制交接摘要，请手动粘贴到新聊天。"
          : isAiHandoverPrompt
            ? "已复制 AI 提示词，请手动粘贴给 ChatGPT。"
            : "已复制编辑后的草稿，请手动粘贴到新聊天。";
    } catch {
      els.handoverText.focus();
      els.handoverText.select();
      els.handoverStatus.textContent =
        "浏览器未允许自动复制，文本已选中，请按 Ctrl+C。";
    }
  })();
});

els.handoverClear.addEventListener("click", () => {
  if (handoverScopeId && handoverByChat.get(handoverScopeId)?.jobId) {
    showProgress(
      "running",
      "AI 仍在生成摘要",
      "为防止丢失任务编号，完成前暂时不能清空。",
    );
    return;
  }
  if (handoverScopeId) {
    nextHandoverGeneration(handoverScopeId);
    clearSavedHandover(handoverScopeId);
  }
  els.handoverGenerate.disabled = false;
  els.handoverAiGenerate.disabled = false;
  clearHandoverEditor();
});
els.handoverText.addEventListener("input", () => saveVisibleHandover());
let pendingEditorScrollSave: ReturnType<typeof setTimeout> | undefined;
els.handoverText.addEventListener("scroll", () => {
  if (pendingEditorScrollSave) clearTimeout(pendingEditorScrollSave);
  pendingEditorScrollSave = setTimeout(() => saveVisibleHandover(), 180);
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

/** Results remain in the localhost service for up to an hour, even if this
 * panel closes. Poll by opaque job id and display only under its source chat. */
async function pollSummaryJob(id: string, jobId: string): Promise<void> {
  const marker = id + ":" + jobId;
  if (activePollers.has(marker)) return;
  activePollers.add(marker);
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const current = handoverByChat.get(id);
      if (!current || current.jobId !== jobId) return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      let result: {
        state: "running" | "done" | "failed";
        summary?: string;
        model?: string;
        error?: string;
      };
      try {
        result = await callCompanion(`/jobs/${jobId}`);
      } catch (error) {
        const errorMessage = remoteError(error);
        // A definite 404 means the helper no longer holds this job. Keep the
        // original prompt, unlock the UI, and require another explicit click
        // before any new (possibly billable) request.
        if (errorMessage.includes("Summary job not found or expired")) {
          commitHandover(id, {
            ...current,
            jobId: undefined,
            status:
              "原摘要任务已失效（本机服务重启或任务过期）。原始输入已保留，可检查后手动重新生成。",
            sendStatus:
              "已解除任务锁定；不会自动重新提交或消耗额度。重新生成需要再次确认。",
            updatedAt: Date.now(),
          });
          return;
        }
        // Connection might briefly drop; do not lose the accepted job id.
        if (attempt < 5) continue;
        commitHandover(id, {
          ...current,
          status:
            "查询摘要失败：" +
            errorMessage +
            "。原任务可能仍在运行；请先检查本机服务，不要立即重复提交。",
          sendStatus: "任务编号已保留，重新打开原聊天可继续检查。",
          updatedAt: Date.now(),
        });
        return;
      }
      if (result.state === "running") continue;
      if (result.state === "failed") {
        commitHandover(id, {
          ...current,
          jobId: undefined,
          status: "自动总结失败：" + (result.error || "未知错误"),
          sendStatus: "失败原因已保留；可修正后重新发起。",
          updatedAt: Date.now(),
        });
        return;
      }
      if (result.state === "done" && typeof result.summary === "string") {
        const normalized = normalizeHandoverResult(
          result.summary,
          current.format,
        );
        commitHandover(id, {
          text: normalized.text,
          status:
            "摘要生成完成（" +
            (result.model || "所选模型") +
            "）。请核对完成状态并手动复制到新聊天。",
          sendStatus:
            normalized.warning ??
            "摘要已保留在原聊天的临时交接区，切换标签不会清空。",
          copyLabel: "复制交接摘要（用于新聊天）",
          remote: null,
          format: current.format,
          isAiPrompt: false,
          updatedAt: Date.now(),
        });
        return;
      }
    }
    const current = handoverByChat.get(id);
    if (current?.jobId === jobId)
      commitHandover(id, {
        ...current,
        status:
          "摘要查询超时，任务可能仍在运行。切回原聊天检查后再决定是否重新提交。",
        updatedAt: Date.now(),
      });
  } finally {
    activePollers.delete(marker);
  }
}

els.handoverSendConfirm.addEventListener("click", () => {
  void (async () => {
    const provider = preparedRemote;
    const id = handoverScopeId;
    const prompt = els.handoverText.value.trim();
    if (sendingRemote) return;
    if (!provider || !id) {
      showSendStatus(
        "请先点击 API 自动总结或使用 Work/Codex 套餐额度准备摘要。",
      );
      return;
    }
    if (prompt.length < 50 || prompt.length > 50000) {
      showSendStatus("请输入 50～50000 字的待总结文本。");
      return;
    }
    sendingRemote = true;
    els.handoverSendConfirm.disabled = true;
    const format = preparedSummaryFormat;
    const selectedModel = els.handoverModel.value;
    const original = captureHandover();
    let proposedJobId: string | null = null;
    saveVisibleHandover();
    showSendStatus("正在向本机服务提交任务，完成后切回原聊天即可恢复。");
    try {
      const status = await callCompanion<CompanionStatus>("/status");
      const missing = automaticSummaryPreflight(provider, status);
      if (missing) throw new Error(missing);
      // Store the ID BEFORE making a possibly billable HTTP request. On a
      // disconnected panel, restore can query this ID without resubmitting.
      proposedJobId = crypto.randomUUID();
      commitHandover(id, {
        ...original,
        jobId: proposedJobId,
        format,
        remote: provider,
        status: "正在提交 AI 总结任务。可切换网页，进度属于原聊天。",
        sendStatus: "任务编号已保存在浏览器临时会话中。",
        updatedAt: Date.now(),
      });
      await handoverWrites.get(id);
      const start = await callCompanion<{
        ok: true;
        id: string;
        state: string;
      }>("/jobs", {
        provider,
        model: selectedModel,
        prompt,
        jobId: proposedJobId,
      });
      if (start.id !== proposedJobId)
        throw new Error("服务返回了不同的任务编号");
      const current = handoverByChat.get(id) ?? original;
      commitHandover(id, {
        ...current,
        jobId: proposedJobId,
        format,
        remote: provider,
        status: "AI 正在生成摘要。可切换网页，回原聊天自动显示结果。",
        sendStatus: "任务已由本机服务接收；关闭侧边栏也不会取消已提交的任务。",
        updatedAt: Date.now(),
      });
      void pollSummaryJob(id, proposedJobId);
    } catch (error) {
      if (proposedJobId) {
        const current = handoverByChat.get(id) ?? original;
        commitHandover(id, {
          ...current,
          remote: provider,
          jobId: proposedJobId,
          status: "任务提交状态尚不明确：" + remoteError(error),
          sendStatus: "将先根据任务编号查询是否已接收；不要重复点击生成。",
          updatedAt: Date.now(),
        });
        void pollSummaryJob(id, proposedJobId);
      } else {
        commitHandover(id, {
          ...original,
          remote: provider,
          status: "提交失败：" + remoteError(error),
          sendStatus: "请检查本机服务或授权状态，修正后可重试。",
          updatedAt: Date.now(),
        });
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
