# 视频查询与收藏同步服务

博客视频页由 GitHub Pages 托管，查询接口在 Cloudflare Workers 运行：

`https://rabbit-hole-video-api.fengzhouxuan.workers.dev`

公开接口为 `GET /api/vod`、`GET /api/play`、`GET /healthz`。查询只访问 core.js 配置的六个来源，验证影片身份、分类与页码，并设置 10 秒超时、响应大小限制和最多 200 条缓存。视频流由浏览器直接读取，服务不转发媒体分片。healthz 只检查服务运行，不代表上游状态。

`/api/play` 参数为 `source`、`id`、`ref`、`name`。剧集编号和名称必须同时匹配当前目录；目录排序变化不改变请求身份，删除或复用编号返回 404。仅传旧数组下标的请求返回 400，要求刷新页面后重试，避免播放其他集。HTML 来源保留实际分页数，由前端限制每次查询的范围。

需要 Node.js 22 或更新版本，测试不需要安装依赖：

```sh
cd services/video
npm run check
npx --yes wrangler@4.146.0 login
npm run deploy
```

Wrangler 使用账号的本地登录状态；凭证不保存到仓库。生产跨站权限只允许 wrangler.jsonc 中列出的博客和本机开发地址。更换服务地址后，同步 source/video/config.js 的 apiBase，发布博客 main 分支。

本目录是独立视频站的后端副本，位于 Hexo source 之外。维护时同步查询、账号模块、数据库迁移、wrangler.jsonc 和 tests；部署前运行独立测试，并从博客页面实测首页、搜索、返回、详情与播放。

独立视频站的 `sync:blog` 命令同时同步公开文件、服务与回归测试。博客根目录执行 `npm run test:video` 会测试实际发布目录中的前端模块、页面续播和保存函数，再运行本目录检查；Pages 发布流程在构建前执行同一检查。测试和实验资料位于公开 source 之外。

账号使用 GitHub OAuth，仅读取公开身份，默认邀请制、上限10个账号。`VIDEO_DB` 绑定 D1，首次部署先执行 `npx --yes wrangler@4.146.0 d1 migrations apply video-accounts --remote`。OAuth 主页为博客的 `/video/`，回调为本服务的 `/api/account/callback`。

`VIDEO_GITHUB_CLIENT_ID`、`VIDEO_GITHUB_CLIENT_SECRET` 和 `VIDEO_GITHUB_ALLOWLIST` 通过 Workers Secret 设置，不写入文件或提交历史。邀请名单为逗号分隔的 GitHub 用户名，不区分大小写。配置缺失时账号入口显示准备中，查询和本机收藏仍正常工作。

`/api/account/*` 提供登录、一次性票据兑换、收藏读取与版本校验写入、退出。随机 state、PKCE 和浏览器证明共同校验登录；服务器保存30天会话的摘要，GitHub 令牌不落库。不同账号与未登录收藏分别保存，本机收藏需主动导入，观看记录与媒体地址不上传。同步失败保留本机增删，恢复后合并；版本冲突不会直接覆盖另一浏览器的修改。

后端限额错误可能没有 CORS 响应头。前端 `resilience.js` 区分明确1027错误与普通不可用，暂停重复请求；量子可尝试浏览器直连，其他来源读取同一查询页的缓存，最多24份、约1MB文本、24小时有效。没有缓存时明确失败，不显示成完整空结果。`/api/play` 和账号请求不进入目录缓存，收藏同步失败不会退出账号或清空片单。缓存目录并不能保证所有视频可播放。

2026-10-02：量子、如意、Auete、ZIP0 的查询样本正常；片库要求验证，非凡在 Workers 查询中暂时失败。各来源单独降级，不自动通过验证或执行上游脚本。
