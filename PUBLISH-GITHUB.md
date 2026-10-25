# GitHub 开源发布说明

公开仓库：https://github.com/1228superman-ctrl/Headroom-Context-Lab

- 完整源码位于 main 分支。
- GitHub Actions CI 对源码更新执行 TypeScript、Lint、单元测试、Chrome 构建及隔离助手测试。
- .github/workflows/release.yml 在推送 v0.6.9 标签时，自动重新构建两个 ZIP 并创建 GitHub Release。
- 本地 release 目录仅供本机使用，不进入 git。

发布首个标签的命令：

~~~sh
git tag -a v0.6.9 -m "Headroom Context Lab v0.6.9 open-source beta"
git push origin v0.6.9
~~~

发布结果：https://github.com/1228superman-ctrl/Headroom-Context-Lab/releases

**安全提醒：** 不公开上传历史 backups、本机凭据、OAuth 回调链接、浏览器用户数据及聊天正文。
