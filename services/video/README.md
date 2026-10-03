# 视频查询服务

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

本目录是独立视频站的后端副本，位于 Hexo source 之外。维护时同步 core.js、adapters.js、query.js、worker.js、wrangler.jsonc 和 tests；部署前运行独立测试，并从博客页面实测首页、搜索、返回、详情与播放。

独立视频站的 `sync:blog` 命令同时同步公开文件、服务与回归测试。博客根目录执行 `npm run test:video` 会测试实际发布目录中的前端模块、页面续播和保存函数，再运行本目录检查；Pages 发布流程在构建前执行同一检查。测试和实验资料位于公开 source 之外。

2026-10-02：量子、如意、Auete、ZIP0 的查询样本正常；片库要求验证，非凡在 Workers 查询中暂时失败。各来源单独降级，不自动通过验证或执行上游脚本。
