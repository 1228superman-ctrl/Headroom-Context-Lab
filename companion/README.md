# Windows 本机 AI 总结助手（可选）

仅在使用 **OpenAI API 自动总结**或**符合资格的 ChatGPT 套餐授权总结**时需要安装。纯本地草稿及手动 ChatGPT 提示词无需此组件。

## 运行条件

Windows 10/11、Node.js 24+、已构建并在 Chrome 中加载 Headroom Context Lab 测试扩展。

## 安装

1. 从本仓库构建 Chrome 插件并先用 `chrome://extensions` 加载。
2. 双击 `companion/Install-Headroom.cmd`。这会把 Node 本机助手安装到当前用户的 `%LOCALAPPDATA%\HeadroomContextLab\app`，注册当前用户登录自启；不需要管理员权限，也不会修改代理设置。
3. 安装程序会尽可能识别扩展 ID；无法识别时，从 `chrome://extensions` 复制 32 位 ID 输入一次。
4. 返回 Chrome 侧边栏，点击「检查本机服务」。按需要自行保存 API Key 或通过官方 ChatGPT 授权页面登录。
5. 选择总结模型和 Markdown/JSON 格式，检查并编辑摘录，然后点击**「生成交接摘要」**。这会向 OpenAI 发送经你确认的摘录，**不会向新聊天窗口发消息**。核对输出并手动复制。

再次运行安装脚本可升级本机助手并保留原有当前用户设置；升级之前建议自行确认备份。安装或升级时请关闭正在使用此助手的其他窗口，避免影响进行中的总结请求。

## 停止与卸载

- 临时停止：结束专属 Headroom Context Lab 本机服务 Node 进程；下次 Windows 登录时会自动启动。
- 关闭自启：在 Windows 「启动应用」中停用 Headroom Context Lab Summary。
- 卸载：双击 `companion/Uninstall-Headroom.cmd` 并确认，卸载当前用户服务及本机加密凭据。Chrome 扩展须另行移除。

## 安全与数据

- 监听地址：`127.0.0.1:18763`，只用于同一电脑上的 Chrome 扩展。
- 扩展访问需匹配当前设置的扩展 ID；此限制**不能**抵御运行在同一 Windows 用户权限下的恶意本地程序。
- OpenAI API Key 和 OAuth 凭据以 Windows DPAPI 绑定当前用户存储，不包含在项目源码或 ZIP 安装包中。
- 手动提示词模式不调用 API；自动总结模式需要用户明确确认，可能消耗 API 费用或 ChatGPT 套餐额度。
- 符合资格、可用模型、授权权限和费用由 OpenAI 官方控制，开发者不保证特定模型或额度一定可用。
- 不采集浏览器内未进入摘要输入框的工具文件、附件或隐藏消息。长对话中不能保证历史内容完整。

## 自检

在源码项目根目录执行：

```powershell
node companion/selftest.mjs
node companion/selftest-oauth.mjs
node companion/selftest-origin.mjs
node companion/selftest-server.mjs
```

这些是模拟与边界测试，不会代替真实账户授权与总结验收。官方接入文档：[Sign in with ChatGPT — open-source clients](https://developers.openai.com/siwc/token-sharing-open-source)。