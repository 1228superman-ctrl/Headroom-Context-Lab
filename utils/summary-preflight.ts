import type { CompanionStatus } from "./local-summary-client";

/** Never submit a paid / plan request when its selected credential is absent. */
export function automaticSummaryPreflight(
  provider: "api" | "plan",
  status: CompanionStatus,
): string | null {
  if (provider === "api" && !status.apiKeySaved) {
    return "API Key 尚未配置。请在上方输入 Key 并点击『在本机保存 Key』，或改用 ChatGPT 套餐授权模式。";
  }
  if (provider === "plan" && !status.planAuthorized) {
    return "ChatGPT/Codex 套餐尚未授权。请先点击上方『授权 ChatGPT 套餐』，在官方页面完成登录授权。";
  }
  return null;
}
