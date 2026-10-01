# 壁纸站

入口：`/wallpapers/`。纯静态 HTML/CSS/JS，与音乐站的 FlatPaper 风格一致，可随现有 Hexo GitHub Pages 一起部署。没有服务端、API Key、人工上传或定时构建依赖。

## 日常更新

- 每次打开，按北京时间当天日期确定性生成 24 张原创壁纸，涵盖山野、柔光、轨道、几何六种配色，横竖屏各 12 张。
- 「换一组原创」增加当天批次，同一个日期和批次生成相同作品。
- 页面持续打开时，每分钟检查是否跨天；后台标签恢复显示时也检查。当天没有访客时不执行任务，下次打开直接生成当天内容。
- 艺术馆自动调用克利夫兰艺术博物馆公开 API，筛选 `share_license_status === 'CC0'`、官方图片 CDN 地址、长边至少 1600 且短边至少 800 的风景绘画作品。每天从搜索结果的前四页轮换一页，最多请求 48 条，去重后展示。
- 每个浏览器每天成功请求一次后使用 localStorage 缓存；10 秒超时或接口失败时保留上次成功结果。本次页面会隐藏加载失败的图片，不删除用户收藏。
- 这不是持续积累的云端图库：原创每日轮换，收藏在当前浏览器保存，包括旧日期和旧批次的作品。清理浏览器数据会清空收藏。

## 下载与来源

原创 SVG 由本项目生成，发布为 CC0。浏览器本地渲染并导出 PNG，支持 3840×2160、2560×1440、1920×1080 和 2160×3840，不依赖图片服务器。艺术作品提供作品页、CC0 链接和原图入口；外部原图在新标签打开，由浏览器保存，不依赖跨域下载权限。手机锁屏是示意预览。

外部图源仍受网络、API 和博物馆图像服务可用性影响。艺术馆不是实时上新承诺：轮换的是馆藏搜索页。源标签基于提供方的授权数据，不是独立的版权核查。

## 验证

```sh
node --test --experimental-test-coverage test/wallpapers.test.cjs
node test/wallpapers.browser.cjs
npm run build -- --config _config.yml,_config.flatpaper.yml
npm run server -- --config _config.yml,_config.flatpaper.yml --port 4011
```

测试覆盖日期边界、生成一致性、方向和搜索筛选、来源数据验证、缓存去重、存储故障、请求错误和超时回退。页面路径被 `skip_render` 排除，因此 Hexo 会原样复制 HTML/JS/CSS。

浏览器验收脚本需先启动 4011 端口服务，使用本机 Chrome 和 Codex 内置 Playwright；可通过 `WALLPAPER_PLAYWRIGHT` 指定其他 Playwright 模块路径。

来源文档：<https://openaccess-api.clevelandart.org/>；许可说明：<https://www.clevelandart.org/open-access>。
