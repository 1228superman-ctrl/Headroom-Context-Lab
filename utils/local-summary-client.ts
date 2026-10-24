/**
 * Only a preapproved loopback companion; never send data to arbitrary URLs.
 * The extension sends no chat text until the user presses the confirmation button.
 */
export const COMPANION_URL = "http://127.0.0.1:18763";

export interface CompanionStatus {
  ok: true;
  apiKeySaved: boolean;
  planAuthorized: boolean;
  account: string | null;
  modelChoices: string[];
  authFailure?: string | null;
}
export interface CompanionResult {
  ok: true;
  summary: string;
  model: string;
  provider: "api" | "plan";
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}
export async function callCompanion<T>(
  endpoint:
    | "/status"
    | "/api-key"
    | "/api-key/clear"
    | "/oauth/start"
    | "/oauth/disconnect"
    | "/summarize",
  payload?: Record<string, unknown>,
): Promise<T> {
  const extensionId = browser?.runtime?.id;
  if (!extensionId)
    throw new Error("无法获取当前 Chrome 插件 ID，请重新加载扩展");
  let response: Response;
  try {
    response = await fetch(COMPANION_URL + endpoint, {
      method: payload ? "POST" : "GET",
      headers: {
        "X-Headroom-Extension": extensionId,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(endpoint === "/summarize" ? 180000 : 18000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    throw new Error(
      "本机服务连接失败：" +
        reason +
        "。请检查本机辅助服务和 Chrome 的本地访问权限。",
      { cause: error },
    );
  }
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("本机服务返回的数据格式不正确");
  }
  if (!response.ok || data.ok === false) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "本机服务 HTTP " + response.status,
    );
  }
  return data as T;
}
