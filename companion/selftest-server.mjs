/* global console, fetch */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PORT, ROOT, settings, writeSettings } from "./security.mjs";
import { startServer } from "./server.mjs";

const loc = path.join(ROOT, "local-config.json");
const preexisting = fs.existsSync(loc);
if (!preexisting) writeSettings("a".repeat(32));
const origin = "chrome-extension://" + settings().extensionId;
const server = startServer();
try {
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + PORT;
  const unauthorized = await fetch(base + "/status", {
    headers: { Origin: "https://example.com" },
  });
  assert.equal(unauthorized.status, 403);
  const status = await fetch(base + "/status", {
    headers: { Origin: origin, "X-Headroom-Extension": settings().extensionId },
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).ok, true);
  const options = await fetch(base + "/summarize", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-headroom-extension",
    },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), origin);
  const missing = await fetch(base + "/summarize", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Headroom-Extension": settings().extensionId,
    },
    body: JSON.stringify({
      provider: "bad",
      model: "gpt-6.1-sol",
      prompt: "X".repeat(200),
    }),
  });
  assert.equal(missing.status, 400);
  const safeHeaders = {
    Origin: origin,
    "X-Headroom-Extension": settings().extensionId,
  };
  const unknownJob = await fetch(base + "/jobs/" + "0".repeat(36), {
    headers: safeHeaders,
  });
  assert.equal(unknownJob.status, 404);
  const invalidId = await fetch(base + "/jobs", {
    method: "POST",
    headers: { ...safeHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "api",
      model: "gpt-6.1-sol",
      prompt: "X".repeat(200),
      jobId: "invalid-id",
    }),
  });
  assert.equal(invalidId.status, 400);
  const rejectedOrigin = await fetch(base + "/jobs/" + "0".repeat(36), {
    headers: {
      Origin: "https://example.com",
      "X-Headroom-Extension": settings().extensionId,
    },
  });
  assert.equal(rejectedOrigin.status, 403);
  console.log("Origin allowlist, CORS, async job validation: PASS");
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (!preexisting) fs.unlinkSync(loc);
}