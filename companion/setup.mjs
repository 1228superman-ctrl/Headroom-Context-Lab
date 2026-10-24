/* global process, console */
import { writeSettings, ROOT, PORT } from "./security.mjs";
const id = process.argv[2];
if (!id) {
  console.error("Usage: node companion/setup.mjs <chrome-extension-id>");
  process.exitCode = 1;
} else {
  const cfg = writeSettings(id);
  console.log("已保存插件 ID: " + cfg.extensionId);
  console.log("本机授权回调端口: 127.0.0.1:" + PORT);
  console.log("敏感令牌将由 Windows 用户级 DPAPI 加密，保存在 " + ROOT);
}
