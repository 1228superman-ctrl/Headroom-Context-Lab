/* global process */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const PORT = 18763;
export const ROOT = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "HeadroomContextLab",
);
const SETTINGS = path.join(ROOT, "local-config.json");

export function writeSettings(extensionId) {
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new Error("Chrome 扩展 ID 应为 32 位 a-p 字符");
  fs.mkdirSync(ROOT, { recursive: true });
  const previous = fs.existsSync(SETTINGS)
    ? JSON.parse(fs.readFileSync(SETTINGS, "utf8"))
    : {};
  const value = {
    extensionId,
    hostId: previous.hostId || "urn:uuid:" + randomUUID(),
  };
  fs.writeFileSync(SETTINGS, JSON.stringify(value, null, 2));
  return value;
}
export function settings() {
  if (!fs.existsSync(SETTINGS))
    throw new Error("请先通过 setup.mjs 配置扩展 ID");
  const value = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  if (
    !/^[a-p]{32}$/.test(value.extensionId) ||
    !/^urn:uuid:[0-9a-f-]{36}$/i.test(value.hostId)
  )
    throw new Error("本地配置无效");
  return value;
}
function storePath(name) {
  if (!["api", "oauth", "registration", "selftest"].includes(name))
    throw new Error("Credential type not allowed");
  return path.join(ROOT, name + ".dpapi");
}
function powershell(script, input, secretPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, HEADROOM_SECRET_PATH: secretPath },
      },
    );
    let stdout = "";
    child.stdout.on("data", (buffer) => {
      stdout += buffer.toString("utf8");
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error("Windows DPAPI 加密或解密失败")),
    );
    child.stdin.end(input ?? "");
  });
}
export async function saveSecret(name, text) {
  fs.mkdirSync(ROOT, { recursive: true });
  const script = [
    "$ErrorActionPreference='Stop'",
    "$plain=[Console]::In.ReadToEnd()",
    "$secure=ConvertTo-SecureString -String $plain -AsPlainText -Force",
    "$encrypted=ConvertFrom-SecureString -SecureString $secure",
    "$target=$env:HEADROOM_SECRET_PATH",
    "$tmp=$target+'.tmp'",
    "[IO.File]::WriteAllText($tmp,$encrypted)",
    "if([IO.File]::Exists($target)) { [IO.File]::Delete($target) }",
    "[IO.File]::Move($tmp,$target)",
  ].join(";");
  await powershell(script, text, storePath(name));
}
export async function loadSecret(name) {
  const loc = storePath(name);
  if (!fs.existsSync(loc)) return null;
  const script = [
    "$ErrorActionPreference='Stop'",
    "$s=ConvertTo-SecureString -String ([IO.File]::ReadAllText($env:HEADROOM_SECRET_PATH))",
    "$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)",
    "try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }",
  ].join(";");
  return powershell(script, null, loc);
}
export function deleteSecret(name) {
  try {
    fs.unlinkSync(storePath(name));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}
export function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .slice(0, 220)
    .replace(
      /sk-[A-Za-z0-9_-]{10,}|Bearer\s+\S+|eyJ[\w.-]{30,}/g,
      "[REDACTED]",
    );
}
