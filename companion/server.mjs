/* global URL, console, process, Buffer */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PORT,
  settings,
  saveSecret,
  loadSecret,
  deleteSecret,
  redactError,
} from "./security.mjs";
import {
  beginLogin,
  finishLogin,
  readSession,
  accessToken,
  disconnect,
} from "./oauth.mjs";
import { summarize, MODELS } from "./response.mjs";
import {
  allowedExtensionRequest,
  allowedPreflight,
} from "./origin-security.mjs";

let activeJob = false;
// Only the explicit, already approved AI request is queued. Results stay in
// this user's localhost process memory for up to one hour, not on disk.
const handoverJobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
function cleanHandoverJobs() {
  const now = Date.now();
  for (const [id, job] of handoverJobs) {
    if (now - job.createdAt > JOB_TTL_MS) handoverJobs.delete(id);
  }
}
let lastAuthFailure = null;
function htmlSafe(value) {
  return String(value).replace(
    /[&<>"\x27]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "\x27": "&#39;",
      })[c],
  );
}
const MAX_BYTES = 100000;
function json(res, status, data, origin = null) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}
async function readJson(req) {
  let bytes = 0;
  const parts = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > MAX_BYTES) throw new Error("请求长度超过上限");
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8") || "{}");
}
async function handle(req, res) {
  if (req.headers.host !== "127.0.0.1:" + PORT) {
    json(res, 403, { error: "Host not allowed" });
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1:" + PORT);
  if (req.method === "GET" && url.pathname === "/auth/callback") {
    try {
      await finishLogin(url);
      lastAuthFailure = null;
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>授权成功</title><p>ChatGPT 套餐授权成功，可以关闭页面，返回 Headroom Context Lab。</p>",
      );
    } catch (error) {
      // Never echo the authorization code, state, PKCE verifier, or tokens.
      lastAuthFailure = redactError(error);
      res.writeHead(400, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>授权失败</title><p>授权未完成：" +
          htmlSafe(lastAuthFailure) +
          "</p><p>请返回 Headroom 插件检查连接状态，然后重新授权。</p>",
      );
    }
    return;
  }
  const extensionId = settings().extensionId;
  const expected = "chrome-extension://" + extensionId;
  const sameOrigin = "http://127.0.0.1:" + PORT;
  // Chrome host-permitted extension requests may carry no Origin or the target
  // origin. Never accept arbitrary web-page origins. A non-simple header binds
  // every real request to the configured extension ID.
  const acceptedOrigin =
    req.headers.origin === expected || req.headers.origin === sameOrigin
      ? req.headers.origin
      : null;
  if (req.method === "OPTIONS") {
    if (!allowedPreflight(req.headers, extensionId, PORT)) {
      json(res, 403, { error: "Extension preflight rejected" });
      return;
    }
    res.writeHead(204, {
      "access-control-allow-origin": acceptedOrigin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-headroom-extension",
      "access-control-max-age": "600",
      "cache-control": "no-store",
    });
    res.end();
    return;
  }
  if (!allowedExtensionRequest(req.headers, extensionId, PORT)) {
    json(res, 403, { error: "Untrusted extension request" }, acceptedOrigin);
    return;
  }
  try {
    if (req.method === "GET" && url.pathname === "/status") {
      const account = await readSession();
      return json(
        res,
        200,
        {
          ok: true,
          apiKeySaved: !!(await loadSecret("api")),
          planAuthorized: !!account,
          account: account?.email || null,
          modelChoices: MODELS,
          authFailure: lastAuthFailure,
        },
        acceptedOrigin,
      );
    }
    // Polling remains safe after the side panel is closed. Invalid or unknown
    // IDs must never reveal another user's data.
    const jobMatch = /^\/jobs\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (req.method === "GET" && jobMatch) {
      cleanHandoverJobs();
      const job = handoverJobs.get(jobMatch[1]);
      return json(
        res,
        job ? 200 : 404,
        job
          ? { ok: true, ...job }
          : { error: "Summary job not found or expired" },
        acceptedOrigin,
      );
    }
    if (req.method !== "POST")
      return json(res, 404, { error: "Not found" }, acceptedOrigin);
    const body = await readJson(req);
    if (url.pathname === "/jobs") {
      cleanHandoverJobs();
      // The client saves its opaque ID before sending. A lost HTTP response
      // can be recovered without creating a second paid inference request.
      if (
        body.jobId !== undefined &&
        (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/.test(body.jobId))
      )
        return json(
          res,
          400,
          { error: "Invalid summary job ID" },
          acceptedOrigin,
        );
      const id = body.jobId || randomUUID();
      const existing = handoverJobs.get(id);
      if (existing)
        return json(
          res,
          202,
          { ok: true, id, state: existing.state },
          acceptedOrigin,
        );
      if (activeJob)
        return json(
          res,
          409,
          { error: "已有一个 AI 总结任务正在进行，请返回原聊天查看结果" },
          acceptedOrigin,
        );
      if (
        !["api", "plan"].includes(body.provider) ||
        !MODELS.includes(body.model)
      )
        return json(
          res,
          400,
          { error: "Unsupported AI provider or model" },
          acceptedOrigin,
        );
      if (
        typeof body.prompt !== "string" ||
        body.prompt.length < 50 ||
        body.prompt.length > 50000
      )
        return json(
          res,
          400,
          { error: "Summary text length is invalid" },
          acceptedOrigin,
        );
      // Check account capability BEFORE marking a job active or charging usage.
      const token =
        body.provider === "api" ? await loadSecret("api") : await accessToken();
      if (!token)
        return json(
          res,
          400,
          { error: "缺少 API Key 或 ChatGPT 套餐授权" },
          acceptedOrigin,
        );
      const createdAt = Date.now();
      const base = { createdAt, provider: body.provider, model: body.model };
      handoverJobs.set(id, { ...base, state: "running" });
      activeJob = true;
      // No dependency on the initiating HTTP connection or the side panel.
      void (async () => {
        try {
          const result = await summarize(token, body.prompt, body.model);
          handoverJobs.set(id, { ...base, state: "done", ...result });
        } catch (error) {
          handoverJobs.set(id, {
            ...base,
            state: "failed",
            error: redactError(error),
          });
        } finally {
          activeJob = false;
        }
      })();
      return json(res, 202, { ok: true, id, state: "running" }, acceptedOrigin);
    }
    if (url.pathname === "/api-key") {
      if (
        typeof body.key !== "string" ||
        !/^sk-[\w-]{12,390}$/.test(body.key)
      ) {
        throw new Error("请输入有效的 OpenAI API Key");
      }
      await saveSecret("api", body.key);
      return json(res, 200, { ok: true }, acceptedOrigin);
    }
    if (url.pathname === "/api-key/clear") {
      deleteSecret("api");
      return json(res, 200, { ok: true }, acceptedOrigin);
    }
    if (url.pathname === "/oauth/start") {
      const authorization = await beginLogin();
      lastAuthFailure = null;
      return json(res, 200, authorization, acceptedOrigin);
    }
    if (url.pathname === "/oauth/disconnect") {
      return json(res, 200, await disconnect(), acceptedOrigin);
    }
    if (url.pathname === "/summarize") {
      if (activeJob)
        return json(res, 409, { error: "另一项总结正在进行" }, acceptedOrigin);
      activeJob = true;
      try {
        if (!["api", "plan"].includes(body.provider))
          throw new Error("不支持的用量来源");
        if (!MODELS.includes(body.model)) throw new Error("不支持的模型");
        if (
          typeof body.prompt !== "string" ||
          body.prompt.length < 50 ||
          body.prompt.length > 50000
        )
          throw new Error("总结内容长度不符合限制");
        const token =
          body.provider === "api"
            ? await loadSecret("api")
            : await accessToken();
        if (!token) throw new Error("请先配置本机 API Key 或授权 ChatGPT 套餐");
        activeJob = true;
        try {
          const result = await summarize(token, body.prompt, body.model);
          return json(
            res,
            200,
            { ok: true, ...result, provider: body.provider, model: body.model },
            acceptedOrigin,
          );
        } finally {
          activeJob = false;
        }
      } finally {
        activeJob = false;
      }
    }
    return json(res, 404, { error: "Not found" }, acceptedOrigin);
  } catch (err) {
    return json(res, 400, { error: redactError(err) }, acceptedOrigin);
  }
}
export function startServer() {
  const cfg = settings();
  const server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      if (!res.headersSent) json(res, 500, { error: "本地服务出错" });
      else res.end();
      console.error("Local handler error:", redactError(err));
    });
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log("Headroom Summary Companion ready on 127.0.0.1:" + PORT);
    console.log("Allowlisted Chrome extension: " + cfg.extensionId);
    console.log(
      "No key or token will be logged. Close this terminal to stop the local service.",
    );
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startServer();
}