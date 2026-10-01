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
- 开放图库将 `source/wallpapers/data/open-images.json` 的已验证目录与最近成功缓存合并；每次打开分类仍会尝试更新，无需逐张人工维护。成功查到的文件如果许可或尺寸不再合格，会从合并结果移除。网络错误、限流或服务忙时，每页最多尝试三次；请求时间上限同时覆盖响应正文。遵循不超过十秒的 `Retry-After`，服务要求等待更久时留待下次构建。第一页失败时保留旧目录及游标；中途失败则保存已经验证的页面及最后有效游标，下次继续。其他分类仍可更新，外部缩略图和原图仍依赖 Wikimedia 服务及用户网络。
- 另外接入两个独立官方来源：Pepper&Carrot 的 David Revoy 场景壁纸与原创插画（CC BY 4.0）和大都会艺术博物馆公开领域风景画（CC0）。初始化目录收录 Pepper&Carrot 90 张（44 张壁纸、46 张插画）与 Met 24 张，不再只依赖 Commons 的动漫插画分类。图源筛选可以查看每个来源当前可用的数量，并与内容、设备方向和搜索组合。
- `scripts/refresh-wallpaper-feeds.cjs` 在现有 GitHub Pages 每日构建中运行，更新 `source/wallpapers/data/official-feeds.json` 后再生成页面。只输出作者、许可、尺寸及官方图片链接，不把图片加入 Git 仓库，也不需要 API 密钥。Pepper 目录缺少跨域支持，采用构建时同步；新增壁纸通过读取最多 256 KiB 的 JPEG 头部取得真实尺寸，既有文件复用已验证尺寸。Met 使用新的 `/v1.1/search` 分页接口，每天轮换前六页，每次最多 32 个作品；逐张读取详情并明确过滤 `isPublicDomain=true` 和绘画类型，再检查原图尺寸。
- Pepper&Carrot 的壁纸目录与正式插画目录分别更新；一个目录请求失败时保留该部分已有图片，另一个仍可更新。插画最多三路并发读取作品页，每次重新核对 David Revoy 作者署名、该作品的 CC BY 4.0 声明和同名高清/预览文件。新图再读取实际尺寸；已有相同原图链接的尺寸可以复用。来源页暂时不可访问时保留已验证记录，成功读到的页面若不再满足许可要求则移除；完整目录中消失的插画也移除。与壁纸同题的版本去重，比较时忽略日期、大小写、连字符和下划线，优先保留壁纸版本。
- Morevna Project 官方动漫画廊的图片集合声明为 CC BY 4.0。同步先核对该声明，再通过官方 WordPress REST API 完整读取正式插画和场景两个分类，绑定每件作品的作者、作品页、特色图片及预览版本；不收录练习、草稿、概念表、缺少作者或尺寸不足的作品。初次实际读取 34 件作品，26 件通过尺寸与作者验证，其中插画 22 张、场景 4 张、竖屏 6 张，作者为 Anastasia Mayzhegisheva 和 Nikolai Mamashev。许可依据是官方画廊集合声明，API 没有逐图许可字段，因此不能推及网站上的其他图片或动画源文件。
- Morevna 新增或修改作品最多三路并发读取原始 JPEG/PNG/WebP 头部取得真实尺寸，预览选用官方不裁切的缩小版本。只有 API 明确提供 `original_image` 时才使用该原图文件，不猜测更高清的地址。作品修改时间、媒体 ID、原图链接及展示尺寸均不变时复用已验证尺寸；修改时间不是图片内容摘要。分页不完整、画廊许可或分类变化时保留上次目录和时间；已成功完整读取的目录中缺失、缺少作者或不再满足许可/尺寸要求的图片移除。原图暂时无法读取时保留相同原图链接的已验证记录。
- 一个来源同步失败时，另一个仍会更新；失败来源保留已有目录及上次记录时间。CI 通过 Actions cache 在同一分支的每日构建间保存目录，不自动提交回仓库。缓存被清理或过期时回退到仓库内的初始目录；它不是永久云端档案。页面另保存浏览器缓存，目录请求失败时仍可使用。此流程要在改动发布到默认分支后才开始运行。
- CI 恢复缓存前保存提交中的官方图源初始目录，再按各来源最后成功更新时间选择较新的已验证目录，避免旧缓存覆盖本次新增图源。较新的空目录仍然保留，不用旧初始图片恢复上游已删除的作品。此合并行为已通过模拟缓存与断网测试，实际 Actions 执行尚待发布后验证。
- 新增三个作者发布的壁纸仓库：LibrePixels（AI 风景、幻想和动漫风场景，CC0）、Folium Creations（3D、抽象、自然摄影，CC BY 4.0）、metaory/Midjourney（AI 赛博朋克、像素城市等，CC0）。首轮实际收录分别为 107、30、146 张；网络超时或尺寸不合格的文件不计入。每次同步先核对图片许可声明，再完整读取目录；保留作者和文件页，并检查真实 JPEG、PNG、WebP 尺寸。图库只保存元数据，GitHub 仓库原图通过 jsDelivr 访问，失败时尝试 Fastly CDN 上的同一文件；GitLab 原图通过官方文件 API 访问。首次同步以三路并发检查，之后用 Git blob 摘要判断文件是否变化；相同摘要图片去重。LibrePixels 只收录 `_librepixels_` 作者文件，并排除目前识别到的路飞和马里奥角色文件及显式成人关键词。此筛选依赖作者声明和文件命名，不能证明所有未声明的第三方权利均已清除。
- 各仓库支持自动同步新增图片，但不保证上游每天上传。来源网络失败或尺寸无法读取时保留已验证目录；成功读到空的完整目录时移除该来源旧图片，避免把已经删除的文件持续展示。
- Wallpapers.com 目前仅作为原站推荐入口，提供二次元、自然风景、4K、手机和电脑分类。在对应分类或设备筛选旁可直接打开原站，在全部内容下可跳到推荐区。其官方 API 示例及实测响应未给出可核验的逐张开放许可字段，详情页的 `Free / Attribution required` 不自动视为 CC0 或 CC BY，因此不接入自动图片采集，不载入它的缩略图、原图或脚本，也不计入站内图库数量。预览、许可查看及下载在原站完成；以后只有核实到明确允许展示的许可才可加入站内目录。

## 下载与来源

原创 SVG 由本项目生成，发布为 CC0。浏览器本地渲染并导出 PNG，支持 3840×2160、2560×1440、1920×1080 和 2160×3840，不依赖图片服务器。艺术作品提供作品页、CC0 链接和原图入口；外部原图在新标签打开，由浏览器保存，不依赖跨域下载权限。手机锁屏是示意预览。

外部图源仍受网络、API 和博物馆图像服务可用性影响。艺术馆不是实时上新承诺：轮换的是馆藏搜索页。源标签基于提供方的授权数据，不是独立的版权核查。

外部作品保留标题、作者、来源页和具体许可，不统一标为 CC0。提供复制署名信息按钮，CC BY 提示署名，CC BY-SA 同时提示相同方式共享；下载入口打开未修改原图。桌面与手机的裁切只用于效果示意。

## 浏览体验

- 三个壁纸仓库的画廊、首屏推荐和弹窗优先使用构建生成的 WebP 预览；最长边 1280 像素，保留完整画面、比例及透明区域。高清下载继续打开作者原图，作者、许可和来源页保持不变。预览不可用时依次尝试原图和备用 CDN。
- Pepper&Carrot 的新增插画使用作者提供的低清 JPEG 预览，高清入口指向同一作品的原始 JPEG；保留原作比例、逐图来源页和 CC BY 4.0 署名信息。
- Morevna 使用官方同名图片的缩小版本预览，画廊和高清入口保留作品原始比例；作品作者及 `Morevna and Pepper` 的 David Revoy 角色署名也保留。
- 画廊保留横竖屏的原始比例，桌面四列、平板三列、手机两列；各来源按当天日期确定性轮换并交错推荐，每次显示 24 张，再按需加载更多。相同文件在画廊只出现一次，分类和标签会合并，使同时属于风景与城市的图片仍可从任一分类找到。新增分类可与图源、设备、搜索组合筛选；首屏推荐从已收录图片中挑选横竖屏作品，加载失败回退到原创图案。
- 可按设备、主题、配色和关键字组合筛选，按名称或分辨率排序。主题与配色适用于原创；艺术馆隐藏这两项。
- 首屏的山野、柔光、夜色、艺术馆入口直接应用对应筛选；支持随机挑选和一键清除筛选。
- 收藏无需重新加载画廊，并提供撤销；收藏在浏览器本地保存，旧日期和批次的作品仍可恢复。
- 预览支持上一张、下一张、左右方向键、F 收藏、Esc 关闭；搜索框支持 `/` 聚焦，输入时不触发预览快捷键。手机支持横向轻扫切图。
- 可以看完整壁纸，也可以切换桌面和锁屏示意。原创切换设备时同步下载比例；下载尺寸变更会同步示意设备。艺术作品示意可能裁切，高清原图始终保持原作。
- 手机预览的下载和收藏固定在底部，提示与撤销保持可操作。动效遵循系统减少动态效果设置。

## 自动生成预览

`scripts/build-wallpaper-previews.cjs` 在每日图源同步之后运行，将已收录仓库图片缩小为 WebP。先验证完整原图的 Git blob 摘要，避免把 CDN 旧版本误当作新文件。每次最多处理 120 张尚未缓存的图片，三路并发；未完成部分在后续构建继续。已有预览只有在文件存在、格式、尺寸与记录一致时才复用；缺失或损坏时重建。已退出图库的预览会清理。

生成的 `source/wallpapers/previews/` 和 `source/wallpapers/data/previews.json` 不进入 Git，通过 Actions cache 跨构建复用，并随 Hexo 页面一起发布到 GitHub Pages。缓存丢失时自动重新生成；单张处理失败仍可浏览来源图片。浏览器不需要 API Key，也不需要人工上传。初次生成会下载原图；每张限 32 MiB、6000 万像素、25 秒请求时间，以限制构建资源消耗。

在本地初次启动或要补齐预览时，运行 `node scripts/build-wallpaper-previews.cjs`；已有生成结果会复用。每天的站点构建已配置该命令，实际 GitHub Actions 和 Pages 效果仍需发布后验证。

## 验证

```sh
node --test --experimental-test-coverage test/wallpapers.test.cjs test/wallpapers.commons.test.cjs test/wallpapers.commons.collector.test.cjs test/wallpapers.feeds.test.cjs test/wallpapers.repositories.test.cjs test/wallpapers.previews.test.cjs test/wallpapers.pepper-artworks.test.cjs test/wallpapers.morevna.test.cjs
node test/wallpapers.browser.cjs
node test/wallpapers.ux.cjs
node test/wallpapers.categories.browser.cjs
node test/wallpapers.feeds.browser.cjs
node scripts/refresh-wallpaper-feeds.cjs
node scripts/refresh-wallpaper-commons.cjs
node scripts/build-wallpaper-previews.cjs
npm run build -- --config _config.yml,_config.flatpaper.yml
npm run server -- --config _config.yml,_config.flatpaper.yml --port 4011
```

测试覆盖日期边界、生成一致性、组合筛选、来源许可验证、图片头部尺寸、分页续传、移除失效文件、缓存去重、存储故障、请求错误和超时回退；插画测试覆盖逐图作者与许可、文件绑定、标题去重、尺寸缓存、三路并发、许可撤回及部分目录失败。预览生成测试使用真实 Sharp 编码验证横竖屏比例、透明度、完整构图、摘要核验、缺失或损坏重建与处理预算。浏览器验收包括 PNG 实际尺寸、收藏恢复与撤销、分页、预览导航、设备比例、手机固定操作和轻扫切图。页面路径被 `skip_render` 排除，因此 Hexo 会原样复制 HTML/JS/CSS/WebP。

2026-10-02 的本机预览增量验证：51 项测试通过，所加载模块行覆盖率 97.10%；三个仓库的 283 张预览全部实际生成，总计 21,515,884 字节，平均约 76 KB。`Green Glass Sheets` 原图 9,592,263 字节，预览 34,768 字节；体积降低不等同于已测得相同比例的访问提速。浏览器已验证画廊和弹窗使用本地预览，高清入口仍保留原始 3840×2160 文件；隔离测试页对一个预览返回 404 时，卡片与弹窗均成功显示来源原图。新增预览流程尚未在实际 GitHub Actions/Pages 环境验证，本轮未新增手机实机验收。

浏览器验收脚本需先启动 4011 端口服务，使用本机 Chrome 和 Codex 内置 Playwright；可通过 `WALLPAPER_PLAYWRIGHT` 指定其他 Playwright 模块路径。

来源文档：<https://openaccess-api.clevelandart.org/>；许可说明：<https://www.clevelandart.org/open-access>。

Commons API：<https://www.mediawiki.org/wiki/API:Imageinfo>；跨域请求：<https://www.mediawiki.org/wiki/API:Cross-site_requests>；使用说明：<https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>。初始目录的每张文件都有自身的文件页及许可链接。

Pepper&Carrot 官方壁纸：<https://www.peppercarrot.com/en/wallpapers/index.html>；正式插画：<https://www.peppercarrot.com/en/artworks/artworks.html>；逐图作者、许可及原图示例：<https://www.peppercarrot.com/en/viewer/artworks__2025-03-26_Enchanted-Pages_by-David-Revoy.html>；作者与 CC BY 4.0：<https://www.peppercarrot.com/en/about/index.html#license>；Met API：<https://metmuseum.github.io/>；开放获取政策：<https://www.metmuseum.org/hubs/open-access>。

Morevna 官方画廊与集合许可：<https://morevnaproject.org/anime/gallery/>；正式插画：<https://morevnaproject.org/anime/gallery/artworks/>；场景：<https://morevnaproject.org/anime/gallery/backgrounds/>；作品与作者示例：<https://morevnaproject.org/artwork/sister-priestess-wind/>；结构化目录：<https://morevnaproject.org/wp-json/wp/v2/artwork>。WordPress REST 媒体结构：<https://developer.wordpress.org/rest-api/reference/media/>。

Wallpapers.com API 与逐图许可要求：<https://wallpapers.com/api/>；个人及非商业许可说明：<https://wallpapers.com/faq/licensing-and-help/can-i-use-wallpaperscom-wallpapers-commercially/>。原站入口不代表其中全部图片为开放授权。

仓库图源：<https://gitlab.com/librepixels/ia.Wallpapers>；<https://github.com/FoliumCreations/Wallpapers>；<https://github.com/metaory/midjourney>。许可声明分别位于 LibrePixels README/LICENCE、Folium README/CC:BY 4.0 Licence、metaory LICENSE。

## 目标与剩余缺口

目标是博客内内容丰富、二次元足够充实、体验好且持续自动更新的壁纸站。新增小型开放仓库只是推进步骤，不能据此宣称目标完成。还需扩大具有明确图片许可的动漫内容、解决大型图库的可靠接入，并验证实际 Pages 环境的预览覆盖率、访问速度与默认分支上的每日更新。原站链接不计入站内图库数量。

2026-10-02 已接入 [Pepper&Carrot 官方插画画廊](https://www.peppercarrot.com/en/artworks/artworks.html)。实际读取到 58 件作品，按日期、大小写、连字符和下划线归一后的文件标题识别出 12 件已有壁纸版本，剩余 46 件全部通过真实作品页作者/许可/文件绑定核对及高清 JPEG 尺寸读取，已写入本站目录。Pepper&Carrot 合计 90 张，其中 15 张为竖屏；这仍集中于同一原创世界，不能据此宣称已经具备大型壁纸站的动漫种类。

本次插画增量后共 64 项测试通过，所加载模块行覆盖率 97.49%，Hexo 构建通过且发布目录中的脚本与图源 JSON 与源文件一致。本机浏览器载入艺术馆结果和 Commons 分类缓存后显示合计 1,338 张，二次元筛选 115 张，Pepper&Carrot 筛选 90 张、其中手机方向 15 张。已实际验证 `Enchanted Pages` 的 1701×1080 作者预览成功解码、2500×1587 高清入口与逐图署名信息正确、收藏在刷新后恢复；`A Dreamer s Lake` 的 871×1080 竖屏预览和锁屏示意成功显示，高清入口保留 2800×3472 原图。该锁屏示意是在桌面浏览器验证，本轮没有新增手机实机验收或 GitHub Actions/Pages 发布验证。

2026-10-02 的 Morevna 增量实际验证了 26 张原始图片的 JPEG/PNG 尺寸，长边范围 1605–7550 像素；未计入作者缺失的两件场景及尺寸不足的六件作品。77 项测试通过，所加载模块行覆盖率 97.51%，新图源模块行覆盖率 100%；Hexo 构建通过，发布目录中的新增脚本和图源 JSON 与源文件一致。本机浏览器在加载 Commons 二次元分类缓存后显示合计 1364 张、二次元 141 张、Morevna 26 张，其中竖屏 6 张。已验证 `Sunset Wallpaper` 的 1024×576 作者预览成功解码、3555×2000 高清入口与署名许可正确、收藏刷新后恢复；另一位作者的 `Laboratory` 1536×862 预览及 4698×2638 原图入口也验证通过。没有新增手机实机验收，也尚未验证实际 Actions/Pages 发布。以上数量会随实时图库缓存及加载失败变化。

2026-10-02 真实同步已收录 Commons 分类记录 875 条，按文件 ID 去重后为 862 张图片。各分类记录数为风景 498、城市 258、星空 100、动物 10、二次元 9，一张图片可以属于多个分类。城市分类在第六页之后遭遇 HTTP 429，已保存这些页面和续传游标；二次元分类本轮连接失败，保留已有目录。不能把未读取的后续页面计入图库，也不保证上游图片服务持续可用。新增恢复和分类合并逻辑后共 55 项测试通过；请求重试、正文超时、部分进度保存及游标续传有模拟测试，部分进度保存也已经在真实城市目录上验证。浏览器已验证 Commons 风景筛选为 498 张，与已验证的目录一致。仓库图片的首次同步和预览生成已实际执行。浏览器加载数量可能随艺术馆实时结果、已有缓存和加载失败而变化。
