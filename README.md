# Headroom Context Lab

**Chrome 聊天历史 Token 估算与上下文交接助手** | [English](README_EN.md)

基于 [ZM-BAD/headroom](https://github.com/ZM-BAD/headroom) 的独立开源改造版本，遵循上游 Apache-2.0 许可证。**不是 Headroom 官方版本，也不是 OpenAI 官方产品。**

## 核心功能

- 在侧边栏查看**当前单个聊天**的可读取历史累计 Token **估算**，以及用户／助手／工具文本的估算拆分。
- 可手动刷新统计。历史累计量**不等于当前有效上下文占用，也不代表剩余上下文额度**。
- ChatGPT 聊天交接：本地规则草稿、手动复制 AI 总结提示词，以及可选的 OpenAI API / ChatGPT 套餐授权总结。
- AI 摘要提供 **Markdown（默认）** 和 **JSON（可选）**；明确要求区分已验证、仅报告完成及待验证事项。
- 生成摘要后在插件中检查并**手动复制**到新聊天，不会自动打开新聊天或发送消息。
- 本机自动总结服务为可选 Windows 组件；不需要后台云端账号或开发者托管服务。

## 安装（Chrome，源码构建）

要求：Windows 10/11（使用可选总结助手时）、近期版本 Chrome、Node.js **24 或以上**，以及 npm。

```powershell
npm ci
npm run build:chrome
```

打开 `chrome://extensions` → 启用「开发者模式」→「加载已解压的扩展程序」→ 选择项目里的 `.output/chrome-mv3` 文件夹。打开一个已有的 ChatGPT 聊天，点击扩展按钮查看侧边栏。

**不要与原版 Headroom 同时对同一聊天重复运行**，否则显示内容可能造成混淆。该源码仓库不代表 Chrome 商店发布版。

## 三种总结方式

| 方式 | 额外组件 | 处理方式 |
| --- | --- | --- |
| 手动 ChatGPT 提示词 | 无 | 生成并复制提示词，手动提交给 ChatGPT |
| OpenAI API | Windows 本机助手及自有 API Key | 检查材料并确认后，按 API 计费调用 |
| ChatGPT 套餐模式 | Windows 本机助手及账户授权 | 检查材料并确认后，**仅在账户、授权范围及额度支持时**调用 |

**Windows 本机助手（可选）：**

1. 先在 Chrome 中加载此扩展，以便获得扩展 ID。
2. 在项目 `companion` 文件夹中双击 `Install-Headroom.cmd`。仅为当前 Windows 用户安装，默认在用户登录后自动启动。
3. 如自动发现扩展 ID 失败，按提示从 `chrome://extensions` 复制该扩展 ID。
4. 回到侧边栏点击「检查本机服务」，再按需要配置个人 API Key 或通过 ChatGPT 登录授权。
5. 不再需要时，双击 `companion/Uninstall-Headroom.cmd` 卸载本机助手及其加密凭据。

详见 [本机助手文档](companion/README.md)。总结时用户可先编辑原文摘录，确认后才向 OpenAI 发送；摘要不会自动发送到聊天窗口。**套餐订阅不等于普通 API 余额**；能否使用取决于官方开放的开源客户端登录流程、用户计划、授权范围和使用限额。参见 [OpenAI 开源客户端文档](https://developers.openai.com/siwc/token-sharing-open-source)。

## 功能边界与隐私

- ChatGPT 历史接口变更、分页、权限限制或页面仅部分渲染时，插件可能只能读取部分轮次，**会提示部分历史**。即使接口成功，长聊天也可能按字数预算筛选或截短。
- 自动总结只是分析已提取文本，**不会**核对真实电脑文件、GitHub 状态或未收集的工具日志。
- 可选的 Upstash 云同步继承自上游，为**用户自行配置**，主要同步估算计数及设置；开发者无中央存储服务。
- API Key 和 ChatGPT OAuth 凭据由本机辅助服务保存在当前 Windows 用户的 DPAPI 加密目录，不打包进本仓库。
- **不要公开发布原始聊天摘录、个人访问凭据或已经安装的本机助手数据目录。** 详见 [PRIVACY.md](PRIVACY.md)。

## 开发与测试

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run build:chrome
node companion/selftest.mjs
node companion/selftest-origin.mjs
node companion/selftest-oauth.mjs
node companion/selftest-server.mjs
```

自动化测试和构建通过**不等于**所有账号、所有长聊天和两条远程模型调用路径已经逐一完成真实端到端验收。本项目目前是公开测试版，请先测试自己的聊天并校验输出。

## 源项目与许可证

本项目为衍生作品，不附带上游开发者认可或 OpenAI 认可。原始 Headroom 版权所有归其贡献者，项目保留完整 [Apache-2.0](LICENSE) 许可证及 [NOTICE](NOTICE.md) 署名信息。图标及上游原有资源沿用原许可要求；如进行商业重分发，请自行复核第三方素材许可。

使用与安全问题请阅读 [SECURITY.md](SECURITY.md)。