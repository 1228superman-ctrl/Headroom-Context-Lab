/* global fetch, URLSearchParams, AbortSignal, Buffer, URL */
import { randomBytes, createHash, createPublicKey, verify } from "node:crypto";
import {
  PORT,
  settings,
  loadSecret,
  saveSecret,
  deleteSecret,
} from "./security.mjs";

const AUTH = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const REDIRECT = "http://127.0.0.1:" + PORT + "/auth/callback";
let pending = null;
let pendingRefresh = null;
const random = () => randomBytes(32).toString("base64url");
async function oauthPost(fields) {
  const reply = await fetch(AUTH + "/api/accounts/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(25000),
  });
  if (!reply.ok) {
    let code = "unknown";
    try {
      const errorBody = await reply.json();
      if (
        typeof errorBody.error === "string" &&
        /^[a-z_]{2,60}$/.test(errorBody.error)
      )
        code = errorBody.error;
    } catch {
      /* never log error descriptions, authorization codes, or tokens */
    }
    throw new Error(
      "ChatGPT OAuth 令牌请求失败 HTTP " + reply.status + " (" + code + ")",
    );
  }
  return reply.json();
}
export async function validateIdentity(
  token,
  clientId,
  nonce,
  previousSubject,
) {
  if (typeof token !== "string") throw new Error("缺少 ID token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("ID token 格式错误");
  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw new Error("ID token 签名算法不受支持");
  const jwksReply = await fetch(AUTH + "/.well-known/jwks.json", {
    signal: AbortSignal.timeout(15000),
  });
  if (!jwksReply.ok) throw new Error("无法获得官方签名公钥");
  const jwks = await jwksReply.json();
  const jwk = jwks.keys?.find(
    (key) => key.kid === header.kid && key.kty === "RSA",
  );
  if (
    !jwk ||
    !verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  ) {
    throw new Error("ID token 签名验证失败");
  }
  const now = Math.floor(Date.now() / 1000);
  const audience =
    typeof claims.aud === "string"
      ? [claims.aud]
      : Array.isArray(claims.aud) &&
          claims.aud.every((v) => typeof v === "string")
        ? claims.aud
        : [];
  // OIDC aud may be a string or an array. Never weaken the issuer,
  // signature, nonce, token lifetime, or returning-account checks.
  if (claims.iss !== AUTH)
    throw new Error("ChatGPT OAuth 身份校验失败：签发方不匹配");
  if (!audience.includes(clientId))
    throw new Error("ChatGPT OAuth 身份校验失败：客户端接收方不匹配");
  if (claims.azp !== undefined && claims.azp !== clientId)
    throw new Error("ChatGPT OAuth 身份校验失败：授权方不匹配");
  if (claims.nonce !== nonce)
    throw new Error("ChatGPT OAuth 身份校验失败：随机数不匹配");
  if (typeof claims.sub !== "string" || !claims.sub)
    throw new Error("ChatGPT OAuth 身份校验失败：缺少账户标识");
  if (typeof claims.exp !== "number" || claims.exp < now - 5)
    throw new Error("ChatGPT OAuth 身份校验失败：令牌已过期");
  if (typeof claims.iat !== "number" || claims.iat > now + 60)
    throw new Error("ChatGPT OAuth 身份校验失败：签发时间无效");
  if (
    claims.nbf !== undefined &&
    (typeof claims.nbf !== "number" || claims.nbf > now + 5)
  )
    throw new Error("ChatGPT OAuth 身份校验失败：令牌尚未生效");
  if (previousSubject && claims.sub !== previousSubject)
    throw new Error("ChatGPT OAuth 身份校验失败：与原授权账号不符");
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
}
export async function readSession() {
  const value = await loadSecret("oauth");
  return value ? JSON.parse(value) : null;
}
async function readRegistration() {
  const value = await loadSecret("registration");
  return value ? JSON.parse(value) : null;
}
export async function beginLogin() {
  // Reuse an ongoing attempt instead of invalidating its state/PKCE verifier.
  if (pending && Date.now() - pending.time < 10 * 60 * 1000) {
    return { url: pending.authorizationUrl };
  }
  const old = await readSession();
  const registered = old ? null : await readRegistration();
  const issuedClient = old?.client_id || registered?.client_id || null;
  const cfg = settings();
  const state = random(),
    nonce = random(),
    verifier = random();
  pending = { state, nonce, verifier, old, issuedClient, time: Date.now() };
  const url = new URL(AUTH + "/api/accounts/authorize");
  const params = {
    client_id: issuedClient || "dynamic_agent_client",
    response_type: "code",
    redirect_uri: REDIRECT,
    scope:
      "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource: RESOURCE,
    state,
    nonce,
    ext_agent_host_id: cfg.hostId,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  if (issuedClient) {
    if (old?.id_token) url.searchParams.set("id_token_hint", old.id_token);
  } else url.searchParams.set("agent_name_hint", "Headroom Context Lab");
  pending.authorizationUrl = url.toString();
  return { url: pending.authorizationUrl };
}
export async function finishLogin(callback) {
  const attempt = pending;
  pending = null;
  if (
    !attempt ||
    Date.now() - attempt.time > 10 * 60 * 1000 ||
    callback.searchParams.get("state") !== attempt.state
  ) {
    throw new Error("授权状态已失效");
  }
  if (callback.searchParams.get("error")) throw new Error("用户拒绝了授权");
  const code = callback.searchParams.get("code");
  const sentClient = callback.searchParams.get("client_id");
  const clientId = attempt.issuedClient || sentClient;
  if (
    !code ||
    !clientId ||
    clientId === "dynamic_agent_client" ||
    (sentClient && clientId !== sentClient)
  ) {
    throw new Error("首次注册未返回有效的 client_id");
  }
  // Persist the issued client ID before exchanging the one-time code.
  await saveSecret("registration", JSON.stringify({ client_id: clientId }));
  const tokens = await oauthPost({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: REDIRECT,
    resource: RESOURCE,
  });
  const scopes = String(tokens.scope || "").split(" ");
  if (
    !scopes.includes("chatgpt.tokens.use.direct") ||
    !tokens.refresh_token ||
    !tokens.access_token
  ) {
    throw new Error("未获得 ChatGPT 套餐使用授权");
  }
  const identity = await validateIdentity(
    tokens.id_token,
    clientId,
    attempt.nonce,
    attempt.old?.subject,
  );
  const session = {
    client_id: clientId,
    subject: identity.subject,
    email: identity.email,
    scope: tokens.scope,
    id_token: tokens.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  };
  await saveSecret("oauth", JSON.stringify(session));
}
export async function accessToken() {
  let session = await readSession();
  if (!session) throw new Error("请先通过官方 ChatGPT 登录授权使用套餐额度");
  if (session.expires_at > Date.now() + 60000) return session.access_token;
  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      const fresh = await oauthPost({
        grant_type: "refresh_token",
        client_id: session.client_id,
        refresh_token: session.refresh_token,
        resource: RESOURCE,
      });
      if (
        !fresh.access_token ||
        !fresh.refresh_token ||
        !String(fresh.scope || session.scope)
          .split(" ")
          .includes("chatgpt.tokens.use.direct")
      ) {
        throw new Error("套餐授权续期失败，请重新登录");
      }
      session = {
        ...session,
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
        id_token: session.id_token, // Keep previously verified identity; refresh response is not a new user consent.
        scope: fresh.scope || session.scope,
        expires_at: Date.now() + Number(fresh.expires_in || 3600) * 1000,
      };
      await saveSecret("oauth", JSON.stringify(session));
      return session.access_token;
    })().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}
export async function disconnect() {
  const session = await readSession();
  let remoteRevoked = false;
  if (session?.refresh_token) {
    try {
      const discoveryResponse = await fetch(
        AUTH + "/.well-known/openid-configuration",
        {
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!discoveryResponse.ok) throw new Error("无法查询 OAuth 撤销端点");
      const discovery = await discoveryResponse.json();
      if (
        typeof discovery.revocation_endpoint !== "string" ||
        !discovery.revocation_endpoint.startsWith(AUTH + "/")
      ) {
        throw new Error("OAuth 撤销端点未通过验证");
      }
      const response = await fetch(discovery.revocation_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: session.client_id,
          token: session.refresh_token,
          token_type_hint: "refresh_token",
        }),
        signal: AbortSignal.timeout(12000),
      });
      remoteRevoked = response.ok;
    } catch {
      /* best-effort remote revocation; local removal proceeds */
    }
  }
  deleteSecret("oauth");
  return { ok: true, remoteRevoked };
}
