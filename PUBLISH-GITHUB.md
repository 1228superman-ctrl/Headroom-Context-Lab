# GitHub 发布操作（首次新建仓库）

本地公开发布版已准备好，分支为 `main`，所有公开文件已提交。

仓库所有者：`1228superman-ctrl`
建议仓库名称：`Headroom-Context-Lab`
仓库可见性：**Public**

1. 点击预填信息的 [GitHub 新建仓库页面](https://github.com/new?owner=1228superman-ctrl&name=Headroom-Context-Lab&description=Chat%20history%20token%20estimates%20and%20structured%20handover%20summaries%20for%20Chrome&visibility=public)。
2. 点击 **Create repository**。不要勾选初始化 README、.gitignore 或 LICENSE，因为本地已经包含这些文件。
3. 回到本地发布目录，双击 `Publish-To-GitHub.cmd`，脚本会执行 `git push -u origin main`。如 GitHub 或 Git Credential Manager 要求授权，在浏览器中完成登录。
4. 刷新 GitHub 仓库页面，确认 README、LICENSE、NOTICE、PRIVACY 等文件均可见，并检查 Actions 构建结果。

推荐随后在 GitHub Releases 中发布 `release` 文件夹内的两个 ZIP：
- `Headroom-Context-Lab-Chrome-v0.6.9.zip`：解压后在 Chrome 加载包含 manifest.json 的目录。
- `Headroom-Context-Lab-Windows-Companion-v0.6.9.zip`：解压后双击 `companion/Install-Headroom.cmd`。

**不要**上传本机 `%LOCALAPPDATA%\HeadroomContextLab`、浏览器配置文件、旧版工作备份或原始聊天截图。本仓库本身不包含这些数据。