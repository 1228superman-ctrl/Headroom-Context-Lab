// Preflight scan for obvious private data in this repository.
// This is a conservative automated check, not a guarantee of zero secrets.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const omitted = new Set([".git", ".wxt", ".output", "node_modules", "release", "backups", "coverage"]);
const suspiciousNames = /(?:^|[./\\])(local-config\.json|auth\.json|credentials\.json|api\.dpapi|oauth\.dpapi|registration\.dpapi|\.env\.local|id_rsa|id_ed25519)$/i;
const checks = [
  ["private-key", /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ["github-token", /\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}/],
  ["oauth-callback", /\boaistb_ac_[A-Za-z0-9_-]{20,}/],
  ["local-device", /\b(?:BF-\d{12}|DESKTOP-[A-Z0-9]{8})\b/i],
  ["absolute-personal-path", /C:\\Users\\Administrator\\/i],
  ["secret-query", /[?&](?:access_token|refresh_token|api_key)=([A-Za-z0-9._-]{20,})/i],
];
const faults = [];
let count = 0;
function walk(folder) {
  for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
    if (omitted.has(e.name)) continue;
    const full = path.join(folder, e.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (e.isDirectory()) { walk(full); continue; }
    if (suspiciousNames.test(relative)) { faults.push([relative, "sensitive filename"]); continue; }
    if (!e.isFile()) continue;
    count++;
    if (fs.statSync(full).size > 2_000_000) { faults.push([relative, "oversized unreviewed file"]); continue; }
    const buffer = fs.readFileSync(full);
    if (buffer.includes(0)) {
      const png = relative.startsWith("public/icon/") && relative.endsWith(".png") && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!png) faults.push([relative, "binary file requires review"]);
      continue;
    }
    const text = buffer.toString("utf8");
    for (const [kind, re] of checks) if (re.test(text)) faults.push([relative, kind]);
  }
}
walk(root);
console.log("Publication files scanned:", count);
for (const [file, reason] of faults) console.error("CHECK:", file, reason);
if (faults.length) process.exitCode = 1;
else console.log("Preliminary publication scan: PASS (not a substitute for a full secret scan)");
