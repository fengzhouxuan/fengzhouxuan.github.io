# 壁纸站

入口：`/wallpapers/`。纯静态 HTML/CSS/JS，与音乐站的 FlatPaper 风格一致，可随现有 Hexo GitHub Pages 一起部署。没有服务端、API Key、人工上传或定时构建依赖。

## 日常更新

- 每次打开，按北京时间当天日期确定性生成 24 张原创壁纸，涵盖山野、柔光、轨道、几何六种配色，横竖屏各 12 张。
- 「换一组原创」增加当天批次，同一个日期和批次生成相同作品。
- 页面持续打开时，每分钟检查是否跨天；后台标签恢复显示时也检查。当天没有访客时不执行任务，下次打开直接生成当天内容。
- 艺术馆自动调用克利夫兰艺术博物馆公开 API，筛选 `share_license_status === 'CC0'`、官方图片 CDN 地址、长边至少 1600 且短边至少 800 的风景绘画作品。每天从搜索结果的前四页轮换一页，最多请求 48 条，去重后展示。
- 每个浏览器每天成功请求一次后使用 localStorage 缓存；10 秒超时或接口失败时保留上次成功结果。本次页面会隐藏加载失败的图片，不删除用户收藏。
- 这不是持续积累的云端图库：原创每日轮换，收藏在当前浏览器保存，包括旧日期和旧批次的作品。清理浏览器数据会清空收藏。
- 内容分类独立于来源，包括二次元、插画、风景、城市、星空、动物、极简和艺术。二次元与插画目前共享同一组动漫插画；动物图源目前为猫科精选图片。极简来自原创图案，艺术来自开放馆藏。
- 二次元、风景照片、城市、星空和动物按需从 Wikimedia Commons 分类加载，每类最多请求 40 个文件；每个浏览器每天成功加载后缓存。二次元开放图片较少，不承诺热门动漫 IP 或持续每天上新。
- Commons 仅接收逐张标注为 CC0、Public domain、CC BY 或 CC BY-SA 且符合尺寸的 JPEG/PNG/WebP。CC BY 系列需要作者和与许可版本一致的链接；待审许可、删除请求和显式成人内容标签会排除。这依赖提供方的文件元数据，未声明的内容或错误授权仍需提供方处理。
- 开放图库失败时优先使用上次成功缓存，再使用 `source/wallpapers/data/open-images.json` 的已验证初始目录；每次打开分类仍会尝试更新，无需逐张人工维护。外部缩略图和原图仍依赖 Wikimedia 服务及用户网络。
- 另外接入两个独立官方来源：Pepper&Carrot 的 David Revoy 场景壁纸（CC BY 4.0）和大都会艺术博物馆公开领域风景画（CC0）。初始化目录收录 44 张与 24 张，不再只依赖 Commons 的动漫插画分类。图源筛选可以查看每个来源当前可用的数量，并与内容、设备方向和搜索组合。
- `scripts/refresh-wallpaper-feeds.cjs` 在现有 GitHub Pages 每日构建中运行，更新 `source/wallpapers/data/official-feeds.json` 后再生成页面。只输出作者、许可、尺寸及官方图片链接，不把图片加入 Git 仓库，也不需要 API 密钥。Pepper 目录缺少跨域支持，采用构建时同步；新增壁纸通过读取最多 256 KiB 的 JPEG 头部取得真实尺寸，既有文件复用已验证尺寸。Met 使用新的 `/v1.1/search` 分页接口，每天轮换前六页，每次最多 32 个作品；逐张读取详情并明确过滤 `isPublicDomain=true` 和绘画类型，再检查原图尺寸。
- 一个来源同步失败时，另一个仍会更新；失败来源保留仓库内已验证的初始目录及上次记录时间，不把错误页或空结果覆盖到目录。CI 生成的目录随 Pages 构建产物发布，不自动提交回仓库，因此不能保证保留上一次部署新发现的文件。页面另保存浏览器缓存，目录请求失败时仍可使用。此流程要在改动发布到默认分支后才开始运行。
- Wallpapers.com 目前仅作为原站推荐入口，提供二次元、自然风景、4K、手机和电脑分类。在对应分类或设备筛选旁可直接打开原站，在全部内容下可跳到推荐区。其官方 API 示例及实测响应未给出可核验的逐张开放许可字段，详情页的 `Free / Attribution required` 不自动视为 CC0 或 CC BY，因此不接入自动图片采集，不载入它的缩略图、原图或脚本，也不计入站内图库数量。预览、许可查看及下载在原站完成；以后只有核实到明确允许展示的许可才可加入站内目录。

## 下载与来源

原创 SVG 由本项目生成，发布为 CC0。浏览器本地渲染并导出 PNG，支持 3840×2160、2560×1440、1920×1080 和 2160×3840，不依赖图片服务器。艺术作品提供作品页、CC0 链接和原图入口；外部原图在新标签打开，由浏览器保存，不依赖跨域下载权限。手机锁屏是示意预览。

外部图源仍受网络、API 和博物馆图像服务可用性影响。艺术馆不是实时上新承诺：轮换的是馆藏搜索页。源标签基于提供方的授权数据，不是独立的版权核查。

外部作品保留标题、作者、来源页和具体许可，不统一标为 CC0。提供复制署名信息按钮，CC BY 提示署名，CC BY-SA 同时提示相同方式共享；下载入口打开未修改原图。桌面与手机的裁切只用于效果示意。

## 浏览体验

- 画廊保留横竖屏的原始比例，桌面四列、平板三列、手机两列；原创和艺术作品交错推荐，每次显示 24 张，再按需加载更多。
- 可按设备、主题、配色和关键字组合筛选，按名称或分辨率排序。主题与配色适用于原创；艺术馆隐藏这两项。
- 首屏的山野、柔光、夜色、艺术馆入口直接应用对应筛选；支持随机挑选和一键清除筛选。
- 收藏无需重新加载画廊，并提供撤销；收藏在浏览器本地保存，旧日期和批次的作品仍可恢复。
- 预览支持上一张、下一张、左右方向键、F 收藏、Esc 关闭；搜索框支持 `/` 聚焦，输入时不触发预览快捷键。手机支持横向轻扫切图。
- 可以看完整壁纸，也可以切换桌面和锁屏示意。原创切换设备时同步下载比例；下载尺寸变更会同步示意设备。艺术作品示意可能裁切，高清原图始终保持原作。
- 手机预览的下载和收藏固定在底部，提示与撤销保持可操作。动效遵循系统减少动态效果设置。

## 验证

```sh
node --test --experimental-test-coverage test/wallpapers.test.cjs test/wallpapers.commons.test.cjs test/wallpapers.feeds.test.cjs
node test/wallpapers.browser.cjs
node test/wallpapers.ux.cjs
node test/wallpapers.categories.browser.cjs
node test/wallpapers.feeds.browser.cjs
node scripts/refresh-wallpaper-feeds.cjs
npm run build -- --config _config.yml,_config.flatpaper.yml
npm run server -- --config _config.yml,_config.flatpaper.yml --port 4011
```

测试覆盖日期边界、生成一致性、组合筛选、来源数据验证、缓存去重、存储故障、请求错误和超时回退；浏览器验收包括 PNG 实际尺寸、收藏恢复与撤销、分页、预览导航、设备比例、手机固定操作和轻扫切图。页面路径被 `skip_render` 排除，因此 Hexo 会原样复制 HTML/JS/CSS。

浏览器验收脚本需先启动 4011 端口服务，使用本机 Chrome 和 Codex 内置 Playwright；可通过 `WALLPAPER_PLAYWRIGHT` 指定其他 Playwright 模块路径。

来源文档：<https://openaccess-api.clevelandart.org/>；许可说明：<https://www.clevelandart.org/open-access>。

Commons API：<https://www.mediawiki.org/wiki/API:Imageinfo>；跨域请求：<https://www.mediawiki.org/wiki/API:Cross-site_requests>；使用说明：<https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>。初始目录的每张文件都有自身的文件页及许可链接。

Pepper&Carrot 官方壁纸：<https://www.peppercarrot.com/en/wallpapers/index.html>；作者与 CC BY 4.0：<https://www.peppercarrot.com/en/about/index.html#license>；Met API：<https://metmuseum.github.io/>；开放获取政策：<https://www.metmuseum.org/hubs/open-access>。

Wallpapers.com API 与逐图许可要求：<https://wallpapers.com/api/>；个人及非商业许可说明：<https://wallpapers.com/faq/licensing-and-help/can-i-use-wallpaperscom-wallpapers-commercially/>。原站入口不代表其中全部图片为开放授权。
