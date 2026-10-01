# 壁纸站

入口：`/wallpapers/`。纯静态 HTML/CSS/JS，与音乐站的 FlatPaper 风格一致，可随现有 Hexo GitHub Pages 一起部署。前端没有服务端或 API Key；公开图源通过每日构建自动同步，无需逐张人工上传。

## 日常更新

- 每次打开，按北京时间当天日期确定性生成 24 张原创壁纸，涵盖山野、柔光、轨道、几何六种配色，横竖屏各 12 张。
- 「换一组原创」增加当天批次，同一个日期和批次生成相同作品。
- 页面持续打开时，每分钟检查是否跨天；后台标签恢复显示时也检查。当天没有访客时不执行任务，下次打开直接生成当天内容。
- 艺术馆自动调用克利夫兰艺术博物馆公开 API，筛选 `share_license_status === 'CC0'`、官方图片 CDN 地址、长边至少 1600 且短边至少 800 的风景绘画作品。每天从搜索结果的前四页轮换一页，最多请求 48 条，去重后展示。
- 每个浏览器每天成功请求一次后使用 localStorage 缓存；10 秒超时或接口失败时保留上次成功结果。本次页面会隐藏加载失败的图片，不删除用户收藏。
- 原创图案每日轮换，收藏在当前浏览器保存，包括旧日期和旧批次的作品。开放图片另有构建时目录，Met 的轮换分页结果会累积去重；仓库图源同步当前完整目录并移除已删除的文件。清理浏览器数据会清空收藏。
- 内容分类独立于来源，包括二次元、插画、风景、城市、星空、动物、极简、抽象、幻想、赛博朋克、像素、汽车和艺术。分类以作品标签和文件目录为依据；插画也包含非动漫作品。动物的 Commons 分类目前为猫科精选图片。
- 二次元、风景照片、城市、星空和动物由 `scripts/refresh-wallpaper-commons.cjs` 在构建时分页同步精选分类，每页 50 个文件，每类每次最多 30 页；未读完时保存游标，下次继续。页面初始化就载入已收录目录，选择分类时再请求最新 40 个文件并合并，不会用这 40 个覆盖完整图库。每个浏览器每天成功加载后缓存。二次元开放图片较少，不承诺热门动漫 IP 或持续每天上新。
- Commons 仅接收逐张标注为 CC0、Public domain、CC BY 或 CC BY-SA 且符合尺寸的 JPEG/PNG/WebP。CC BY 系列需要作者和与许可版本一致的链接；待审许可、删除请求和显式成人内容标签会排除。这依赖提供方的文件元数据，未声明的内容或错误授权仍需提供方处理。
- 开放图库将 `source/wallpapers/data/open-images.json` 的已验证目录与最近成功缓存合并；每次打开分类仍会尝试更新，无需逐张人工维护。成功查到的文件如果许可或尺寸不再合格，会从合并结果移除。单个分类同步失败时保留旧目录和分页游标，其他分类继续更新。外部缩略图和原图仍依赖 Wikimedia 服务及用户网络。
- 另外接入两个独立官方来源：Pepper&Carrot 的 David Revoy 场景壁纸（CC BY 4.0）和大都会艺术博物馆公开领域风景画（CC0）。初始化目录收录 44 张与 24 张，不再只依赖 Commons 的动漫插画分类。图源筛选可以查看每个来源当前可用的数量，并与内容、设备方向和搜索组合。
- `scripts/refresh-wallpaper-feeds.cjs` 在现有 GitHub Pages 每日构建中运行，更新 `source/wallpapers/data/official-feeds.json` 后再生成页面。只输出作者、许可、尺寸及官方图片链接，不把图片加入 Git 仓库，也不需要 API 密钥。Pepper 目录缺少跨域支持，采用构建时同步；新增壁纸通过读取最多 256 KiB 的 JPEG 头部取得真实尺寸，既有文件复用已验证尺寸。Met 使用新的 `/v1.1/search` 分页接口，每天轮换前六页，每次最多 32 个作品；逐张读取详情并明确过滤 `isPublicDomain=true` 和绘画类型，再检查原图尺寸。
- 一个来源同步失败时，另一个仍会更新；失败来源保留已有目录及上次记录时间。CI 通过 Actions cache 在同一分支的每日构建间保存目录，不自动提交回仓库。缓存被清理或过期时回退到仓库内的初始目录；它不是永久云端档案。页面另保存浏览器缓存，目录请求失败时仍可使用。此流程要在改动发布到默认分支后才开始运行。
- 新增三个作者发布的壁纸仓库：LibrePixels（AI 风景、幻想和动漫风场景，CC0）、Folium Creations（3D、抽象、自然摄影，CC BY 4.0）、metaory/Midjourney（AI 赛博朋克、像素城市等，CC0）。首轮实际收录分别为 107、30、146 张；网络超时或尺寸不合格的文件不计入。每次同步先核对图片许可声明，再完整读取目录；保留作者和文件页，并检查真实 JPEG、PNG、WebP 尺寸。图库只保存元数据，GitHub 仓库原图通过 jsDelivr 访问，失败时尝试 Fastly CDN 上的同一文件；GitLab 原图通过官方文件 API 访问。首次同步以三路并发检查，之后用 Git blob 摘要判断文件是否变化；相同摘要图片去重。LibrePixels 只收录 `_librepixels_` 作者文件，并排除目前识别到的路飞和马里奥角色文件及显式成人关键词。此筛选依赖作者声明和文件命名，不能证明所有未声明的第三方权利均已清除。
- 各仓库支持自动同步新增图片，但不保证上游每天上传。来源网络失败或尺寸无法读取时保留已验证目录；成功读到空的完整目录时移除该来源旧图片，避免把已经删除的文件持续展示。
- Wallpapers.com 目前仅作为原站推荐入口，提供二次元、自然风景、4K、手机和电脑分类。在对应分类或设备筛选旁可直接打开原站，在全部内容下可跳到推荐区。其官方 API 示例及实测响应未给出可核验的逐张开放许可字段，详情页的 `Free / Attribution required` 不自动视为 CC0 或 CC BY，因此不接入自动图片采集，不载入它的缩略图、原图或脚本，也不计入站内图库数量。预览、许可查看及下载在原站完成；以后只有核实到明确允许展示的许可才可加入站内目录。

## 下载与来源

原创 SVG 由本项目生成，发布为 CC0。浏览器本地渲染并导出 PNG，支持 3840×2160、2560×1440、1920×1080 和 2160×3840，不依赖图片服务器。艺术作品提供作品页、CC0 链接和原图入口；外部原图在新标签打开，由浏览器保存，不依赖跨域下载权限。手机锁屏是示意预览。

外部图源仍受网络、API 和博物馆图像服务可用性影响。艺术馆不是实时上新承诺：轮换的是馆藏搜索页。源标签基于提供方的授权数据，不是独立的版权核查。

外部作品保留标题、作者、来源页和具体许可，不统一标为 CC0。提供复制署名信息按钮，CC BY 提示署名，CC BY-SA 同时提示相同方式共享；下载入口打开未修改原图。桌面与手机的裁切只用于效果示意。

## 浏览体验

- 画廊保留横竖屏的原始比例，桌面四列、平板三列、手机两列；各来源按当天日期确定性轮换并交错推荐，每次显示 24 张，再按需加载更多。新增分类可与图源、设备、搜索组合筛选；首屏推荐从已收录图片中挑选横竖屏作品，加载失败回退到原创图案。
- 可按设备、主题、配色和关键字组合筛选，按名称或分辨率排序。主题与配色适用于原创；艺术馆隐藏这两项。
- 首屏的山野、柔光、夜色、艺术馆入口直接应用对应筛选；支持随机挑选和一键清除筛选。
- 收藏无需重新加载画廊，并提供撤销；收藏在浏览器本地保存，旧日期和批次的作品仍可恢复。
- 预览支持上一张、下一张、左右方向键、F 收藏、Esc 关闭；搜索框支持 `/` 聚焦，输入时不触发预览快捷键。手机支持横向轻扫切图。
- 可以看完整壁纸，也可以切换桌面和锁屏示意。原创切换设备时同步下载比例；下载尺寸变更会同步示意设备。艺术作品示意可能裁切，高清原图始终保持原作。
- 手机预览的下载和收藏固定在底部，提示与撤销保持可操作。动效遵循系统减少动态效果设置。

## 验证

```sh
node --test --experimental-test-coverage test/wallpapers.test.cjs test/wallpapers.commons.test.cjs test/wallpapers.commons.collector.test.cjs test/wallpapers.feeds.test.cjs test/wallpapers.repositories.test.cjs
node test/wallpapers.browser.cjs
node test/wallpapers.ux.cjs
node test/wallpapers.categories.browser.cjs
node test/wallpapers.feeds.browser.cjs
node scripts/refresh-wallpaper-feeds.cjs
node scripts/refresh-wallpaper-commons.cjs
npm run build -- --config _config.yml,_config.flatpaper.yml
npm run server -- --config _config.yml,_config.flatpaper.yml --port 4011
```

测试覆盖日期边界、生成一致性、组合筛选、来源许可验证、图片头部尺寸、分页续传、移除失效文件、缓存去重、存储故障、请求错误和超时回退；浏览器验收包括 PNG 实际尺寸、收藏恢复与撤销、分页、预览导航、设备比例、手机固定操作和轻扫切图。页面路径被 `skip_render` 排除，因此 Hexo 会原样复制 HTML/JS/CSS。

浏览器验收脚本需先启动 4011 端口服务，使用本机 Chrome 和 Codex 内置 Playwright；可通过 `WALLPAPER_PLAYWRIGHT` 指定其他 Playwright 模块路径。

来源文档：<https://openaccess-api.clevelandart.org/>；许可说明：<https://www.clevelandart.org/open-access>。

Commons API：<https://www.mediawiki.org/wiki/API:Imageinfo>；跨域请求：<https://www.mediawiki.org/wiki/API:Cross-site_requests>；使用说明：<https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>。初始目录的每张文件都有自身的文件页及许可链接。

Pepper&Carrot 官方壁纸：<https://www.peppercarrot.com/en/wallpapers/index.html>；作者与 CC BY 4.0：<https://www.peppercarrot.com/en/about/index.html#license>；Met API：<https://metmuseum.github.io/>；开放获取政策：<https://www.metmuseum.org/hubs/open-access>。

Wallpapers.com API 与逐图许可要求：<https://wallpapers.com/api/>；个人及非商业许可说明：<https://wallpapers.com/faq/licensing-and-help/can-i-use-wallpaperscom-wallpapers-commercially/>。原站入口不代表其中全部图片为开放授权。

仓库图源：<https://gitlab.com/librepixels/ia.Wallpapers>；<https://github.com/FoliumCreations/Wallpapers>；<https://github.com/metaory/midjourney>。许可声明分别位于 LibrePixels README/LICENCE、Folium README/CC:BY 4.0 Licence、metaory LICENSE。

## 目标与剩余缺口

目标是博客内内容丰富、二次元足够充实、体验好且持续自动更新的壁纸站。新增小型开放仓库只是推进步骤，不能据此宣称目标完成。还需扩大具有明确图片许可的动漫内容、解决大型图库的可靠接入、降低原图加载成本，并验证默认分支上的每日更新与 Pages 部署。原站链接不计入站内图库数量。

本机首轮 Commons 分页同步因网络连接失败保留了 29 张初始图片；分页逻辑已有模拟测试，但本机未验证完整精选目录的规模。仓库图片的首次同步已实际执行。浏览器加载数量可能随艺术馆实时结果、已有缓存和加载失败而变化。
