import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callCompanion, COMPANION_URL } from "./local-summary-client";

beforeEach(() => vi.stubGlobal("browser", { runtime: { id: "a".repeat(32) } }));
afterEach(() => vi.unstubAllGlobals());

describe("local companion client", () => {
  it("only uses the fixed loopback endpoint for reading status", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        apiKeySaved: false,
        planAuthorized: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const status = await callCompanion<{ apiKeySaved: boolean }>("/status");
    expect(status.apiKeySaved).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      COMPANION_URL + "/status",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "error",
      }),
    );
  });
  it("sends prompt only as a JSON body on an explicit call", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
      ok: true,
      json: async () => ({ ok: true, summary: "已整理" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await callCompanion("/summarize", {
      provider: "plan",
      model: "gpt-6-luna",
      prompt: "已核对的文本",
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(
      (options.headers as Record<string, string>)["X-Headroom-Extension"],
    ).toBe("a".repeat(32));
    expect(JSON.parse(options.body as string)).toEqual({
      provider: "plan",
      model: "gpt-6-luna",
      prompt: "已核对的文本",
    });
    expect(options.redirect).toBe("error");
  });
  it("surfaces quota and authorization errors without falsely marking success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "模型请求失败 HTTP 429（额度不足）" }),
      })),
    );
    await expect(
      callCompanion("/summarize", { provider: "plan" }),
    ).rejects.toThrow("额度不足");
  });
});
