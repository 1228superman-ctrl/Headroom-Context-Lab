/* global Response, URL, URLSearchParams, Buffer, process, console */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { writeSettings, loadSecret, ROOT } from "./security.mjs";
import {
  beginLogin,
  finishLogin,
  readSession,
  validateIdentity,
} from "./oauth.mjs";

/* Must always run with USERPROFILE set to an isolated disposable directory. */
if (
  !process.env.USERPROFILE?.includes("headroom-isolated-oauth-test") ||
  !ROOT.includes("headroom-isolated-oauth-test")
) {
  throw new Error("OAuth test requires isolated disposable USERPROFILE");
}
writeSettings("a".repeat(32));
const realFetch = globalThis.fetch;
let stage = "first-fails";
const clientId = "oaiapp_mock_client";
let expectedNonce = "";
const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = keys.publicKey.export({ format: "jwk" });
jwk.kid = "test-key";
function token(nonce, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: "https://auth.openai.com",
      aud: [clientId],
      azp: clientId,
      sub: "user_mock",
      nonce,
      iat: now,
      exp: now + 1200,
      email: "mock@example.invalid",
      ...overrides,
    }),
  ).toString("base64url");
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(head + "." + claims), keys.privateKey)
    .toString("base64url");
  return head + "." + claims + "." + signature;
}
globalThis.fetch = async (url, _opts) => {
  const s = String(url);
  if (s.endsWith("/oauth/token")) {
    if (stage === "first-fails") {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        access_token: "access-mock",
        refresh_token: "refresh-mock",
        id_token: token(expectedNonce),
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (s.endsWith("/jwks.json")) {
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error("Unexpected external request blocked");
};
try {
  const first = await beginLogin();
  assert.equal(
    first.url,
    (await beginLogin()).url,
    "Repeated click must not overwrite state",
  );
  const u1 = new URL(first.url);
  assert.equal(u1.searchParams.get("client_id"), "dynamic_agent_client");
  await assert.rejects(
    finishLogin(
      new URL(
        "http://127.0.0.1:18763/auth/callback?" +
          new URLSearchParams({
            code: "fictional-code",
            state: u1.searchParams.get("state"),
            client_id: clientId,
          }).toString(),
      ),
    ),
    /invalid_grant/,
  );
  const registration = JSON.parse(await loadSecret("registration"));
  assert.equal(
    registration.client_id,
    clientId,
    "Issued client id persisted even after failed exchange",
  );
  const retry = await beginLogin();
  const u2 = new URL(retry.url);
  assert.equal(
    u2.searchParams.get("client_id"),
    clientId,
    "Retry uses issued client",
  );
  assert.equal(u2.searchParams.get("agent_name_hint"), null);
  expectedNonce = u2.searchParams.get("nonce");
  stage = "success";
  await finishLogin(
    new URL(
      "http://127.0.0.1:18763/auth/callback?" +
        new URLSearchParams({
          code: "fictional-code2",
          state: u2.searchParams.get("state"),
          client_id: clientId,
        }).toString(),
    ),
  );
  const saved = await readSession();
  assert.equal(saved.client_id, clientId);
  assert.equal(saved.subject, "user_mock");
  assert.equal(saved.email, "mock@example.invalid");
  assert.equal(
    (
      await validateIdentity(
        token(expectedNonce),
        clientId,
        expectedNonce,
        null,
      )
    ).subject,
    "user_mock",
    "OIDC audience array with matching azp must be accepted",
  );
  assert.equal(
    (
      await validateIdentity(
        token(expectedNonce, { aud: clientId, azp: undefined }),
        clientId,
        expectedNonce,
        null,
      )
    ).subject,
    "user_mock",
    "OIDC string audience remains valid",
  );
  await assert.rejects(
    validateIdentity(token(expectedNonce), clientId, "different-nonce", null),
    /随机数不匹配/,
  );
  await assert.rejects(
    validateIdentity(
      token(expectedNonce, { aud: ["someone_else"], azp: undefined }),
      clientId,
      expectedNonce,
      null,
    ),
    /客户端接收方不匹配/,
  );
  await assert.rejects(
    validateIdentity(
      token(expectedNonce, { exp: Math.floor(Date.now() / 1000) - 300 }),
      clientId,
      expectedNonce,
      null,
    ),
    /令牌已过期/,
  );
  await assert.rejects(
    validateIdentity(
      token(expectedNonce, { sub: "different-account" }),
      clientId,
      expectedNonce,
      "user_mock",
    ),
    /与原授权账号不符/,
  );
  const forged = token(expectedNonce);
  await assert.rejects(
    validateIdentity(
      forged.slice(0, -5) + "xxxxx",
      clientId,
      expectedNonce,
      null,
    ),
    /签名验证失败/,
  );
  console.log(
    "Identity strict checks: audience string and array, nonce, expiry, account, signature: PASS",
  );
  console.log(
    "OAuth dynamic client, failed code exchange, retry, signature verification: PASS",
  );
} finally {
  globalThis.fetch = realFetch;
}
