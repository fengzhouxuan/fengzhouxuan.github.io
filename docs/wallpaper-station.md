# 壁纸站

入口：`/wallpapers/`。纯静态 HTML/CSS/JS，与音乐站的 FlatPaper 风格一致，可随现有 Hexo GitHub Pages 一起部署。前端没有服务端或 API Key；公开图源通过每日构建自动同步，无需逐张人工上传。

## 日常更新

- ESO 官方天文观测图库补充星云、星系和星团。采集器每次重新检查 ESO 的 CC BY 4.0 图片规则及网站/CDN 访问规则，串行请求默认至少间隔一秒；每日最多核对 30 件作品，三个分类分别保存分页位置，下次续读，完成一轮后重新检查。只接收作品页标注为 Observation 的图片，排除明确标注的图表、注释版、比较图和插画；特殊授权或尺寸不合格的作品不收录。目录总数是候选数量，不等于可用壁纸数量，也不保证每日出现新图。
- ESO 下载只使用作品页明确提供的 Publication JPEG，缺少该版本时采用同页 Large JPEG，检查该文件和 Screensize JPEG 的真实尺寸及完整画面比例。文件修改时间与链接绑定预览版本，已验证尺寸可复用；不猜测更高清地址，也不将 JPEG 称为最大的 TIFF 原始文件。本站生成等比例 WebP，下载保留官方 JPEG 入口；这批图片可随 Pages 构建自动更新，无需把大图写入 Git。署名完整保存在目录中，卡片、预览以及选中 ESO 图片的首页推荐均可见，作者原有链接保持可点击，复制署名也包含这些链接。故障保留既有作品；限流保存进度并遵循 Retry-After，成功确认不再符合许可或尺寸要求的作品移除。未完整扫描的页面不据此批量删除旧记录。
- 2026-10-02 实际新增 ESO 40 张，静态目录达到 19 个来源、1473 张；原有 18 个来源的记录、更新时间和续传状态逐项确认未变。首次采用 60 件检查预算收录 37 张，补齐旧格式署名中的隐藏输入及换行解析后，重新核对三个分类各四件，最终增加至 40 张，并从对应位置续读。40 个等比例 WebP 合计 10,469,748 字节；最终发布检查通过：87 张同站原图、1449 张预览、无待生成预览。219 项测试和 Hexo 构建在 Node 22 通过，ESO 模块及采集器行覆盖率均为 100%。
- 本机浏览器确认 ESO 来源显示 40 张，星云作品的完整署名、作者链接、CC BY 4.0 与官方 JPEG 尺寸可见；收藏刷新后恢复，测试收藏随后清理。390×844 视口无横向溢出，下载按钮完整可见，检查后恢复默认视口。页面实际下载 `eso0934a.jpg` 为 4000×2290、4,194,401 字节，SHA-256 为 `738b17ba4741051a5cf379a5aa2fde6c496736817893aa0c22bcc1325d9e67f2`，完整解码并与独立读取的官方 Publication JPEG 逐字节一致。另用只包含一张横屏和一张竖屏 ESO 作品的隔离页面验证首页两处推荐署名和作者链接，不将隔离页当作正式全站目录。截图为忽略 Git 的 `test-results/wallpaper-eso-preview.png`、`test-results/wallpaper-eso-mobile.png` 和 `test-results/wallpaper-eso-hero-fixture.png`。本轮未推送，实际 Actions/Pages 每日续读仍待上线验证；这批扩展星空，不据此宣称大型动漫图库已补齐。

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
- AyomiArt 作者画廊补充 AI 动漫角色插画，采用 CC BY-NC-ND 4.0。这是附带非商业与不可改作条件的共享许可，不能称为允许任意用途的开源素材。首次实际验证并收录 213 张，竖屏 196 张、横屏 17 张；长边范围 1536–2919 像素，常见尺寸为 1024×1536。该来源要求短边至少 1024、长边至少 1536，页面保留原始尺寸，不标为 4K 或人为放大。逐图绑定作者 AyomiCat、版权声明、许可、原图地址和目录中的可见图片；根目录中缺少逐图许可数据的独立图片不收录。排除已识别到的 Pikachu/Pokemon、Kanade/Beast Tamer、Arona/Blue Archive 等现成角色名称、非动漫目录和显式成人关键词。作者称作品为原创，但目录中发现了现成角色名称，因此不能将其声明直接当作全部作品已清除第三方权利的证明。这仍依赖作者声明、结构化元数据与文本筛选，不是独立的逐像素权利或内容核查。
- Ayomi 同步使用串行请求，两次请求至少间隔 1.5 秒；每次构建最多 150 次请求、30 个目录，HTML 与原图/预览头部共用预算。未读完时将待处理目录写入同一官方目录 JSON 的 `continuation.ayomi`，下次构建继续；原图和官方预览地址、修改时间不变时复用已经验证的尺寸。遇到 HTTP 429 立即停止本轮请求，保存已验证图片及待处理目录，遵循 `Retry-After` 的冷却时间，无有效值时至少等待一小时再尝试。只有完整读取并检查了一个目录才能移除该目录旧图片；未访问的目录和暂时故障的目录保留。顶层完整分页确认已删除的目录可以移除其旧图片。全部目录读完后，下轮再重新核对顶层目录；因此不承诺每天扫描完整图库或每天有新图。初次请求因限流只得到部分图库，已保存 168 个待处理目录；源站首页作品总数不是本站收录量。
- OpenGameArt 首批补充经核对的五件作者发布作品：rubberduck 的绘画风格风景包、Eon Cire 的概念场景包、donte 的水下场景、Gariot 的城市剪影、leyren 的星云。逐作品核对作者身份、CC0 标签及对应 Creative Commons 链接，只接收该作品下载字段中的正式文件。素材包授权覆盖包内文件，不将整个 OpenGameArt 网站或收藏夹视为统一 CC0。首次实际下载检查了两个包的 53 个图片文件，40 张绘画风景与 4 张幻想场景通过尺寸筛选，再加 3 张独立场景，共 47 张，横屏 46、竖屏 1。排除低分辨率图、缩略拼图、草稿、透明素材及未验证的作品。风景包作者说明它们由自己的摄影经过 GIMP 滤镜处理，概念包作者说明为手工作画；不将这批混入二次元分类。
- 新增 Kutejnikov 发布的 [Manga-style background](https://opengameart.org/content/manga-style-background)，作品页明确采用 CC0，包内说明另署名 Pavel Kutejnikov 并声明 CC0。作者说明使用 Blender grease pencil 绘制；实际素材包包含十张 1920×1080 的黑白城市漫画场景 PNG，归入二次元、插画和城市，拼图及说明文件不收录。这是漫画风格场景，不以作品页描述推断热门角色授权或独立的逐像素创作方式核查。
- OpenGameArt 另补充 Oyasumi 的日式水墨背景和 DasBilligeAlien 的视觉小说办公室背景，两件作品均单独核对作者与 CC0。水墨作品提供三个独立的 1920×1080 PNG，画面为竹林、樱花和鸟居，归入风景、插画和极简，不因日式主题就计入二次元。办公室为 2484×1200 的完整 PNG，作者说明在 Krita 中制作，归入二次元与插画；ZIP 内的人物透明素材及 Krita 工程不收录。展示标题使用场景中文名，下载保留原始文件字节和比例。
- OpenGameArt 继续补充三个作者的六张完整场景：[LisadiKaprio 的晴空](https://opengameart.org/content/sunny-sky) 为 CC BY 4.0、1800×1350 PNG；[frances 的礼堂](https://opengameart.org/content/visual-novel-background-auditorium) 为 CC BY 3.0、1920×1080 PNG，保留额外署名 Frances Calceta；[queenofzan 的视觉小说场景包](https://opengameart.org/content/visual-novel-style-backgrounds) 为 CC BY 3.0，实际包含四张 4000×3000 PNG，画面为夜间后门、酒吧休息区、化妆间和后台休息室。晴空与礼堂归入二次元和插画，四张绘画场景归入插画和城市，不将所有视觉小说素材都计为二次元。素材包只提取已检查的四个完整场景文件，保留 4:3 比例，不裁为宽屏。
- LisadiKaprio 的 [走廊昼夜背景](https://opengameart.org/content/hallway-daynight-background-for-visual-novels) 和 [雨天空](https://opengameart.org/content/rainy-sky) 均明确采用 CC BY 4.0。正式文件实际为两张 2000×1124 PNG 和一张 1800×1350 PNG；走廊作品页写为 2000×1224，本站按实际文件显示 2000×1124。画面已确认没有对话框、菜单或人物拼图，归入二次元和插画，雨天空另归入风景。文件名中的连字符保留用于中文标题匹配，作者文件编号后缀不影响白昼玄关、夜间玄关和雨天云层的名称。
- `scripts/collect-opengameart.cjs` 每次构建先读取原站 `robots.txt`，串行请求并遵守当前 10 秒间隔；首次五件作品的完整同步使用 11 次请求，漫画场景单独同步使用 3 次请求。每日重新检查配置的十三件作品各自的作者、具体许可与下载列表；新增作品采用 CC BY 3.0 或 4.0，原有作品仍要求各自的 CC0 声明。读取原始文件，核对目录中的文件大小及实际图片格式、尺寸、方向、透明区域，完整解码并保存每张原图的 SHA-256。素材包新增或替换的合格文件自动更新；不承诺全站扫描、每天新增或热门角色。作品结构或文件读取失败时保留该作品旧记录，健康作品继续同步；已成功读到的许可撤回或空文件列表移除旧记录。HTTP 429/503 停止该来源后续请求，按 `Retry-After` 保存冷却时间，缺少有效值时至少等待一小时；其他来源仍可处理。
- 漫画场景的 7z 由固定版本 `7z-wasm@1.2.0` 在构建时读取，网页不加载该依赖，也不需要 API 密钥。解码在独立 worker 的内存文件系统内运行，不挂载主机目录或执行包内文件，默认 25 秒超时后终止。先检查 LZMA2 字典不超过 64 MiB、压缩包不超过 32 MiB、最多 250 个条目、单文件不超过 32 MiB、总展开大小不超过 128 MiB，再只展开配置的场景 PNG；拒绝路径穿越、重复路径、加密及链接，并核对实际解码大小。worker 设置 JavaScript 堆上限，但这不是包含 WASM 内存的整体内存上限。格式变化或解码失败沿用原有故障保留规则。
- OpenGameArt 原始单图按原始字节缓存到 `source/wallpapers/originals/opengameart/`，文件名包含 SHA-256；下载打开同站单图，作者作品页保留为来源入口。ZIP 和 7z 仅用于构建时读取，不在用户下载流程暴露素材包。原图不加入 Git，随 Actions cache 跨构建保留并随 Hexo 发布。初次或缓存丢失时必须重新成功同步才有原图；源站故障且本地缓存缺失时，旧元数据不能恢复原文件。该来源可以补充漫画场景、绘画、幻想、城市和星空风格，尚不能补齐大规模动漫角色图库。
- 一个来源同步失败时，另一个仍会更新；失败来源保留已有目录及上次记录时间。CI 通过 Actions cache 在同一分支的每日构建间保存目录，不自动提交回仓库。缓存被清理或过期时回退到仓库内的初始目录；它不是永久云端档案。页面另保存浏览器缓存，目录请求失败时仍可使用。此流程要在改动发布到默认分支后才开始运行。
- CI 恢复缓存前保存提交中的官方图源初始目录，再按各来源最后成功更新时间选择较新的已验证目录，避免旧缓存覆盖本次新增图源。较新的空目录仍然保留，不用旧初始图片恢复上游已删除的作品。此合并行为已通过模拟缓存与断网测试，实际 Actions 执行尚待发布后验证。
- 指定单个图源更新时，其他已验证来源的目录、最后更新时间及续传状态一并保留；不会因为部分刷新漏掉整个旧图库。保留前仍按原图源规则重新校验元数据。
- 新增三个作者发布的壁纸仓库：LibrePixels（AI 风景、幻想和动漫风场景，CC0）、Folium Creations（3D、抽象、自然摄影，CC BY 4.0）、metaory/Midjourney（AI 赛博朋克、像素城市等，CC0）。首轮实际收录分别为 107、30、146 张；网络超时或尺寸不合格的文件不计入。每次同步先核对图片许可声明，再完整读取目录；保留作者和文件页，并检查真实 JPEG、PNG、WebP 尺寸。图库只保存元数据，GitHub 仓库原图通过 jsDelivr 访问，失败时尝试 Fastly CDN 上的同一文件；GitLab 原图通过官方文件 API 访问。首次同步以三路并发检查，之后用 Git blob 摘要判断文件是否变化；相同摘要图片去重。LibrePixels 只收录 `_librepixels_` 作者文件，并排除目前识别到的路飞和马里奥角色文件及显式成人关键词。此筛选依赖作者声明和文件命名，不能证明所有未声明的第三方权利均已清除。
- Agundur 的作者仓库补充 22 张实际尺寸为 3840×2160 的壁纸，21 张 CC BY 4.0、1 张 CC BY-SA 4.0。每次同步从作者 README 的每个作品段落分别绑定文件、标题和许可链接，再与完整 Git 文件目录及内容摘要绑定；不把图片许可扩展到仓库中的其他文件，预览目录也不计作新壁纸。尺寸不足的文件、缺少逐图许可的新增文件和含糊的许可段落不收录；读取失败保留原目录，完整读取后已退出许可列表的图片移除。动漫旅人、城市和幻想场景按作品名称与作者说明分类；作者未明确说明创作方式，因此页面标注“创作方式未注明”，不宣称手绘或无 AI。许可及原始水印保留，预览仅等比例缩小为 WebP，高清入口仍是作者原 PNG；有相同方式共享要求的图片保留该许可。
- AOSC 社区的 WallColle 仓库补充城市、山川、植物与星空照片。同步先取得当前提交版本，再读取该版本的完整文件树与 `contributors/<uname>/me.json`；核对清单的 Git blob 摘要，将每张图片编号、文件、作者、标签和许可绑定到同一提交。仅接受逐图 CC BY 4.0、CC BY-SA 4.0、CC BY-NC 4.0 或 Public Domain 声明；仓库程序的 GPLv2 不作为图片许可。缺少实际文件、缺少许可、超过 32 MiB 或 6000 万像素处理上限的图片不收录。首次实际通过 23 张，其中 15 张非商业许可；逐图署名与使用条件可见，预览等比例转为 WebP，原图入口固定到已经验证的提交版本。清单或网络失败保留旧目录，成功读到的许可撤回或文件下架会移除。仓库已在 2024-01-31 归档，自动同步可以核对现有内容，但不承诺持续上新。
- Sermoris 的两个作者图库分别声明 AI 图片采用 CC0 和 CC BY-NC-SA 4.0，分为独立来源显示。同步先固定提交，再核对该提交完整文件树、README 的作者创作及图片许可声明和 LICENSE；许可文本通过 Git blob SHA-1 校验，声明版本和原图摘要写入目录。原图、备用 CDN 与来源页均固定到同一提交，不以程序许可推断图片许可。首次实际读取 207 个候选文件的尺寸，按作品文件名去掉重复的分辨率版本并保留像素最多的合格版本，最终 CC0 157 张、非商业 34 张。每张实际尺寸须与原文件名一致、长边至少 1600、短边至少 800，原文件最多 32 MiB、6000 万像素；没有人为放大或把较小图片标为 4K。
- Sermor 同步每次重新核对图片声明；声明、目录结构或网络暂时无法验证时保留上次固定提交的目录，已完整读到的文件下架则移除。新版本原图暂时不可读取时保留已验证的旧版本，其他作品继续更新。预览阶段完整读取原始 PNG，核对文件摘要、格式与实际尺寸后等比例缩小为最长边 1280 的 WebP；高清入口保留原 PNG。作者、AI 标记、非商业及相同方式共享条件、预览修改说明均保留。分类依照文件名，只有明确含 Anime 的作品归入二次元；这批以风景、幻想、人物和赛博风格为主，不能全部计为动漫作品。作者声明与文件名过滤不是独立的逐像素权利或内容核查，也不保证每日上新。
- Sermor 的高清下载使用固定提交的 GitHub Raw 原文件，图片读取以 jsDelivr 为首选、GitHub Raw 为备用；不把同一 CDN 的另一个节点当作独立的容量保障。真实读取 `GirlinACity_6144x4096.png` 时 jsDelivr 返回 HTTP 403 并注明文件超过 20 MB，Raw 地址仍能读取 PNG。此回退和高清链接覆盖源文件大小上限以内、超出 CDN 单文件限制的图片；正常网络故障仍可能暂时影响外部原图访问。
- Raw 备用请求指定从首字节开始、最多 32 MiB 的字节范围，并在实际完整读取后核对 Git blob 摘要；分段返回或截断文件无法通过核对，不生成预览。首次真实同步中的最后一张大图经该方式成功读取并生成预览，同样的请求方式已加入每日构建，无需人工补图。
- David Revoy 的 Misc 画廊单独作为原创绘画图源，不与 Pepper&Carrot 正式角色插画混为同一分类。同步先发现官方作品页，再逐图核对 David Revoy 署名、作品标题、CC BY 4.0 或 CC BY-SA 4.0 以及相互对应的原图和作者预览。按文件名与标题过滤文章配图、漫画条、教程、标志、贴纸、明确成人内容及已识别的其他作品角色；这不是独立的逐像素内容与权利核查。仅收录长边至少 1600、短边至少 800 的图片，并确认作者预览不放大且比例一致。与正式插画区同名同日期的已验证作者文件去重，优先保留既有来源；不同日期的其他版本不凭短标题合并。每次同步读取原图与预览的 HTTP 修改时间；未改变时复用尺寸，改变时重新读取图片头部。目录中的版本签名是地址和修改时间的 SHA-256，不是原图内容摘要。预览先核对作者 JPEG 格式及实际尺寸，再等比例缩小到长边不超过 1280 并转为 WebP，保留原许可和修改方式说明；缓存另有实际 WebP 字节的 SHA-256 校验，原图下载入口仍是作者原文件。作品退出完整目录或成功读到的作品页不再具备许可时移除；暂时无法读取时保留已验证记录，429 / 503 停止本轮并保留上次目录。图源没有保证每日新增作品。
- 钛山（Tyson Tan）的作者站补充「电子之心」「灵兽化身」与「开源吉祥物」三个原创画廊。网站明确将自身内容及外部副本按 CC BY-SA 4.0 与木兰开放作品许可双重授权，并保留“另有声明除外”；这不是把绘画软件的开源许可推及用户作品。同步通过公开 WordPress API 核对作者身份、正式分类、完整分页及每篇文章的第一幅主插画，只使用该幅图注中的正式 Fullsize 链接。其他作品同人分类、草稿、教程、设计参考、透明素材、明确成人关键词，以及另行标注 MIT / CC0 等许可的文章排除；不将文章中的过程图和后续示例当成新的壁纸。每篇作品的公开页面重新核对作者版权声明、具体 CC BY-SA 4.0 链接、原图/预览绑定和 canonical 地址。许可依据是作者对网站内容的默认授权与例外筛选，不能表述为作者逐图设置了单独许可字段。
- `scripts/collect-tyson.cjs` 串行同步，两次请求至少间隔 500 毫秒，完整读取前三个原创分类后检查主插画。原图长边至少 1600、短边至少 800，实际读取原图与预览头部确认尺寸且比例一致、不放大。版本签名绑定作品修改时间、文件地址及两个文件的 HTTP 修改时间，未变化时复用尺寸；该签名不是原图字节摘要。目录或作品读取失败时保留已有记录，完整目录中消失或成功查到许可不符合的作品移除；HTTP 429 / 503 停止该来源本轮同步并保留上次目录。预览在本站等比例缩小并转为 WebP，保留作者版权声明、相同方式共享要求及修改方式，缓存核对实际字节 SHA-256；原图下载继续指向作者正式文件，预览限流时停止本轮该来源的后续请求。一次同步不代表作者每天创作新作品。
- HDWallpapers.org 由 `scripts/collect-hdwallpapers.cjs` 同步动漫分类。先核对当前公开访问规则与图片使用条款，再串行完整读取每页 16 件作品的目录，核对分类页总数及跨页重复，支持作品 URL 中的旧版大小写命名。逐件绑定官方作品页、站方作者名、明确的 `Public Domain CC0` 声明、AI 标记和最高分辨率下载字段；通用页脚或 JSON 中的服务条款链接不视为图片许可。只收录站方署名的 CC0 AI 作品，跳过已识别的热门 IP、成人主题、作者不符或授权不明的作品；筛选不能表述为独立核查了所有潜在第三方权利。
- HDWallpapers 原始单图按源站提供的完整文件字节缓存，核对实际 JPEG 格式、尺寸及 SHA-256，下载使用本站单图；这是图源提供的最高分辨率版本，不承诺生成模型原始像素或作者未处理文件。每次请求至少间隔一秒，HTTP 429 / 503 保存已验证进度与冷却时间；目录故障保留旧目录，单件作品临时故障保留旧记录，已完整读取目录中消失或成功读到许可不合格的作品移除。HTTP 修改时间与 ETag 未变化且本地字节摘要正确时复用原图，否则重新读取。原图与预览不进入 Git，随 Actions cache 保留并随 Hexo 发布；缓存丢失时重新读取正式文件，不需要密钥或逐张人工上传。
- Blender Studio 由 `scripts/collect-blender.cjs` 同步已配置的 Wing It! 和 Spring 官方免费电影画面包。每次重新核对项目 CC BY 4.0 再分发声明、Press 目录、逐素材编号、发布者、Free 状态和素材自身的许可，再读取正式 ZIP；只提取约定命名的 JPEG/PNG 单图，完整解码核对尺寸、原文件字节及 SHA-256。首次实际收录 9 张 1920×1080 JPEG 和 5 张 2048×858 PNG，归入原创插画、幻想与自然题材，不统一当作日式二次元或 4K。
- Blender 原文件缓存于忽略 Git 的 `originals/blender/`，随 Actions cache 与 Hexo 发布保留；预览等比例缩为 WebP，用户从本站打开单张未改动的高清原图，无需下载素材包。串行请求间隔至少一秒，遵循公开访问规则和限流冷却；单项目结构或网络故障保留已验证记录，成功确认素材移除、锁定或逐素材许可不符则移除该项目记录。授权页结构变化会保留旧版本而暂停新增；每日同步只核对已配置的发布包，不承诺每天有新图，也不会自动采集全部 Blender 工程或会员内容。
- [Pop!_OS 壁纸仓库](https://github.com/pop-os/wallpapers) 仅同步 README 中 Kate Hazen 与 Nick Nazzaro 两个作者段落明确列出的 CC BY-SA 4.0 PNG，首次收录 17 张。每轮固定提交，核对完整文件树、README 的 Git blob 摘要、作者声明、许可链接及文件名；来源页、原图和备用图片均绑定同一提交。仓库中的 Unsplash 段落没有采用同样的明确许可，未收录。17 张涵盖原创插画、幻想、自然、抽象与星空，不统一标为二次元或 AI。预览阶段核对完整原文件摘要和实际像素，再等比例生成 WebP；下载保留远程原 PNG，不把原文件加入 Git。
- [Unicorn Creates 的 Shopping Backgrounds](https://unicorncreates.itch.io/shopping-backgrounds) 明确采用 CC BY 4.0，并标注手绘、No AI。仅接入已检查的商场扶梯与服装店两张 1920×1080 作者公开 JPEG，归入二次元与插画。人物演示图和拼图不收录，素材包的 4K PNG 是独立版本，不能将当前两张 JPEG 标为 4K。
- `scripts/collect-unicorn.cjs` 每次重新核对作者、描述中的许可、素材许可栏与已配置的展示文件，再完整解码 JPEG，验证尺寸和 SHA-256。串行请求间隔至少一秒，遵循来源与图片域名的公开 robots 规则；不请求平台的下载流程。网络或页面结构故障保留已验证目录，完整页面确认文件消失或许可不符时移除，429 / 503 保存冷却时间。原始字节缓存于忽略 Git 的 `originals/unicorn/`，随 Actions cache 与 Hexo 发布，用户下载本站单图；本地摘要不符时拒绝生成预览。这里只自动核对这两张已配置作品，不自动收录作者画廊中的其他文件，也不承诺每天有新作品。
- 各仓库支持自动同步新增图片，但不保证上游每天上传。来源网络失败或尺寸无法读取时保留已验证目录；成功读到空的完整目录时移除该来源旧图片，避免把已经删除的文件持续展示。
- Wallpapers.com 目前仅作为原站推荐入口，提供二次元、自然风景、4K、手机和电脑分类。在对应分类或设备筛选旁可直接打开原站，在全部内容下可跳到推荐区。其官方 API 示例及实测响应未给出可核验的逐张开放许可字段，详情页的 `Free / Attribution required` 不自动视为 CC0 或 CC BY，因此不接入自动图片采集，不载入它的缩略图、原图或脚本，也不计入站内图库数量。预览、许可查看及下载在原站完成；以后只有核实到明确允许展示的许可才可加入站内目录。

## 下载与来源

原创 SVG 由本项目生成，发布为 CC0。浏览器本地渲染并导出 PNG，支持 3840×2160、2560×1440、1920×1080 和 2160×3840，不依赖图片服务器。艺术作品提供作品页、CC0 链接和原图入口；外部原图在新标签打开，由浏览器保存，不依赖跨域下载权限。手机锁屏是示意预览。

外部图源仍受网络、API 和博物馆图像服务可用性影响。艺术馆不是实时上新承诺：轮换的是馆藏搜索页。源标签基于提供方的授权数据，不是独立的版权核查。

外部作品保留标题、作者、来源页和具体许可，不统一标为 CC0。提供复制署名信息按钮，CC BY 提示署名，CC BY-SA 同时提示相同方式共享；CC BY-NC-ND 提示署名、非商业及不可改作，复制信息也保留作者提供的版权声明。下载入口打开未修改原图。桌面与手机的裁切只用于效果示意。

## 浏览体验

- 三个壁纸仓库的画廊、首屏推荐和弹窗优先使用构建生成的 WebP 预览；最长边 1280 像素，保留完整画面、比例及透明区域。高清下载继续打开作者原图，作者、许可和来源页保持不变。预览不可用时依次尝试原图和备用 CDN。
- Pepper&Carrot 的壁纸与插画在构建时读取作者原始 JPEG，核对实际格式、尺寸后等比例缩小并转为 WebP，最长边 1280 像素。部分官方壁纸缩略图为 900×400 等裁切版本，因此本站不再用这些缩略图作为完整画面预览；缓存不可用时打开作者原图。原图 URL 和尺寸构成缓存版本签名，该签名不是图片内容摘要。由于该目录没有逐图修改时间，已有预览每七天重新读取原图；暂时失败或当轮预算不足时保留已验证的旧预览，下轮继续，不能把待重新验证数理解为缺失图片数。格式或尺寸不再符合时不会覆盖旧预览，原图变化仍需目录同步先更新尺寸。
- Morevna 在构建时读取官方同名图片的未裁切缩小版本，核对真实格式、尺寸后等比例转为 WebP；超过 1280 像素时缩小，较小图片不放大。按原图路径与官方作品修改时间缓存，修改时间不是内容摘要。两站预览均记录并校验 WebP 字节的 SHA-256，画廊与高清入口保留原作比例，署名信息注明预览修改方式。下载仍指向作者原始文件；作品作者及 `Morevna and Pepper` 的 David Revoy 角色署名也保留。
- Ayomi 图片响应有 `Cross-Origin-Resource-Policy: same-origin`，原站图片无法直接嵌入博客。构建时将作者提供的预览按原始字节缓存到本站，核对格式、尺寸和 SHA-256 摘要；不裁切、重编码或生成改作。预览优先使用本站缓存，下载入口继续打开作者原始 PNG/JPEG/WebP。标签和图源名称明确标注 AI 插画。该来源只可用于符合许可的非商业展示，未来启用广告或其他商业用途前需重新处理该来源。
- 画廊保留横竖屏的原始比例，桌面四列、平板三列、手机两列；各来源按当天日期确定性轮换并交错推荐，每次显示 24 张，再按需加载更多。相同文件在画廊只出现一次，分类和标签会合并，使同时属于风景与城市的图片仍可从任一分类找到。新增分类可与图源、设备、搜索组合筛选；首屏推荐从已收录图片中挑选横竖屏作品，加载失败回退到原创图案。
- 可按设备、主题、配色和关键字组合筛选，按名称或分辨率排序。主题与配色适用于原创；艺术馆隐藏这两项。
- 搜索支持用猫耳、狐耳、少女、教室、壁炉、读书、摩天轮、抱猫、海边、森林、山川、夜景、雨夜、夕阳、樱花、雪景、星空、神社、咖啡馆等中文词匹配来源标题和标签中的对应英文词。猫耳也匹配 Nekomimi；读书同时需要阅读和书本两个词，抱猫同时需要持抱动作和猫或小猫，不把“猫耳少女拿着手机”误当成抱猫。按空格输入多个词时取交集，例如“猫耳 教室”；每个词也可直接匹配原始标题、标签或作者。匹配不会翻译或改写原始署名，也不根据作者姓名推断画面主题；只依赖现有来源文字，因此未描述的主题不会凭空补标签。
- 首屏的山野、柔光、夜色、艺术馆入口直接应用对应筛选；支持随机挑选和一键清除筛选。
- 收藏无需重新加载画廊，并提供撤销；收藏在浏览器本地保存，旧日期和批次的作品仍可恢复。
- 预览支持上一张、下一张、左右方向键、F 收藏、Esc 关闭；搜索框支持 `/` 聚焦，输入时不触发预览快捷键。手机支持横向轻扫切图。
- 可以看完整壁纸，也可以切换桌面和锁屏示意。原创切换设备时同步下载比例；下载尺寸变更会同步示意设备。艺术作品示意可能裁切，高清原图始终保持原作。
- 手机预览的下载和收藏固定在底部，提示与撤销保持可操作。动效遵循系统减少动态效果设置。

## 自动生成预览

`scripts/build-wallpaper-previews.cjs` 在每日图源同步之后运行，处理已验证的仓库图片及作者预览。仓库原图先验证 Git blob 摘要，避免把 CDN 旧版本误当作新文件。每次最多处理 120 张需要生成或重新验证的图片，除 Ayomi 外最多三路并发；未完成部分在后续构建继续。已有预览只有在文件存在、格式、尺寸与记录一致时才复用；需要字节摘要的来源还核对 SHA-256，缺失或损坏时重建。已退出图库的预览会清理，其他文件保留。Pepper 和 Morevna 共用此预算，遇到 HTTP 429 / 503 停止当轮该来源的后续请求，其他来源继续。

预览缓存为空或部分缺失时，根据仍待处理的其他来源数量为它们预留生成预算，避免串行处理的 Ayomi 先占满整轮 120 张。其他来源仍按已有轮换次序混排，Ayomi 保留单路请求与 1.5 秒间隔；只有 Ayomi 待处理时可以使用整个预算，其他来源只有少量图片时也不会无故空置剩余预算。整体新增请求仍受同一个上限约束，限流及冷却规则保持生效。缓存完全丢失后仍可能需要多轮每日构建补齐全部图片，这不等同于首次部署就具备所有本地预览。

生成的 `source/wallpapers/previews/` 和 `source/wallpapers/data/previews.json` 不进入 Git，通过 Actions cache 跨构建复用，并随 Hexo 页面一起发布到 GitHub Pages。缓存丢失时自动重新生成；仓库单张处理失败仍可浏览来源图片。浏览器不需要 API Key，也不需要人工上传。仓库初次生成会下载原图；每张限 32 MiB、6000 万像素，默认 25 秒请求时间。Sermor 的 GitHub Raw 备用原图请求最多 45 秒，以覆盖超过 CDN 单文件限制的大图；仍共用每轮 120 张的处理预算。

命令行构建启用首次恢复模式：逐文件核对后，若没有任何可复用预览，本轮处理上限提高到 2000 张；已有可复用文件时仍按每天最多 120 张增量处理。复用前完整解码缓存图片，不能只凭正确的文件头、尺寸和字节数复用损坏的像素数据；无效文件会重新生成。这个较大预算用于首次上线或全部缓存丢失，不保证一次完成整个上游图库；单图大小、尺寸、超时、串行间隔、429 停止与作者冷却规则仍然生效。显式零预算不会发起请求。

OpenGameArt 预览使用已经同步到本站、按各作品 CC0 或 CC BY 许可核对的原文件，不重复请求原站；先核对 SHA-256，再按相同的 1280 像素完整画面规则生成 WebP，计入每次 120 张的总预算。CC BY 预览保留署名、具体许可与缩小转 WebP 的说明，下载提供未改动原图。原图与素材包分别不超过 32 MiB，素材包最多 250 个条目、展开总大小不超过 128 MiB，拒绝目录穿越及重复路径；只读取配置中的图片成员，不执行压缩包内容。原站请求时间上限 85 秒，包含串行请求间隔；因此这项构建并非无限制下载。

HDWallpapers 的预览同样使用已核对 SHA-256 的本地原文件，不重复请求源站，等比例转为最长边 1280 像素的 WebP；下载继续使用原始单图，AI 标签、作者、具体作品页与 CC0 保留。原图最多 32 MiB、6000 万像素，预览最多 2 MiB，与其他来源共用每轮 120 张预算。目录记录不包含图片字节；Actions 原图缓存丢失且源站暂时不可访问时，无法仅凭记录恢复原图和新预览，需后续成功同步恢复。

该构建脚本也缓存 Ayomi 作者提供的预览，采用单路请求、1.5 秒间隔，与仓库预览共用每次 120 张的新文件预算。缓存保留作者发布的原始字节，最多 8 MiB、6000 万像素和 25 秒；没有作者缩小预览时只能按未修改原图尝试，不转码。文件按作者原始目录和作品修改时间保存，清理退出图库的已管理文件时保留其他文件。已有缓存每次检查格式、尺寸、字节数和 SHA-256；许可、链接或修改时间变化时重新读取。遇到 HTTP 429 立即停止该来源的缓存请求并把冷却时间写入预览 JSON，其他来源仍可处理。目录同步和图片缓存会读取彼此保存的冷却时间，采用较晚的有效时间，避免一项刚被限流而另一项立即继续请求。缓存丢失或首次构建时可能需要多次每日构建补齐，缺少缓存的 Ayomi 卡片可能无法显示，原图入口仍可在原站打开；不能承诺未缓存图片也能跨站嵌入。

在本地初次启动或要补齐预览时，运行 `node scripts/build-wallpaper-previews.cjs`；已有生成结果会复用。每天的站点构建已配置该命令，实际 GitHub Actions 和 Pages 效果仍需发布后验证。

## 验证

2026-10-02 本轮 Ayomi 读取剩余 22 个目录，新增 83 张 AI 插画，其中竖屏 80 张、横屏 3 张，来源从 593 增至 676 张；静态目录达到 19 个来源、1665 张，其中二次元 881 张。既有 593 张 Ayomi 图片全部保留，其他 18 个来源的记录、更新时间及续传状态逐项确认未变。本轮仍限定最多 300 次请求、60 个目录、至少 1800 ms 间隔，没有改变每日默认预算。续传队列已读到空，`continuation.ayomi` 为 `null`，后续同步会重新核对根目录；先前分页异常目录的所有文件仍未验证，不能把上游候选数量当作本站收录量。

新增 83 张作者原版预览共 5,527,242 字节，复用已有 1558 张，失败和待处理均为零；1641 张本地预览合计 119,054,956 字节。219 项测试在本机 Node 22 通过，所加载模块行覆盖率 99.45%、分支覆盖率 96.90%；Hexo 构建通过，实际发布检查通过：1665 条记录、87 张同站原图、1641 张预览，无待生成预览。目录、预览清单和相关前端文件与源文件字节一致。本机页面二次元分类显示 898 张，包含静态目录的 881 张及本轮实时 Commons 分类结果的 17 张；这个浏览器结果会随缓存和实时接口变化。1280 像素视口无横向溢出，当前可见七张图片均成功加载。

新增 `Neko with Orange Hair Wears Strawberry Shirt and Collar Necklace` 的本地作者预览为 640×427，原图入口保留 1536×1024，作者 AyomiCat、AI、CC BY-NC-ND 4.0 及署名、非商业、不可改作条件可见。页面实际下载 PNG 为 2,854,996 字节，SHA-256 为 `1524b094cc10832393714967f183f8e3677403da2a3efdc1d88468cd91647ce4`，完整解码并与独立读取的作者原文件逐字节一致。390×844 视口下预览无横向溢出，下载按钮底部为 y=832，检查后恢复默认视口；收藏未修改。截图为忽略 Git 的 `test-results/wallpaper-anime-complete-gallery.png`、`test-results/wallpaper-ayomi-sweep-preview.png` 及 `test-results/wallpaper-ayomi-sweep-mobile.png`。本轮未推送，实际线上覆盖、速度与每日自动续读仍未完成验证。

2026-10-02 的 Ayomi 后续续传新增 109 张 AI 插画，其中竖屏 99 张、横屏 10 张，来源从 484 增至 593 张，静态目录达到 19 个来源、1582 张。本轮使用 300 次请求、60 个目录及至少 1800 ms 间隔的初始化预算，未改变每日默认预算；达到请求上限后正常保存进度，待处理目录从 54 减至 22，无限流冷却。所有旧图片保留，其他 18 个来源的记录、更新时间和续传状态逐项确认未变。Nina 与 Weapon 目录分页信息不一致，未放宽结构检查或将未验证文件计入图库。

中文搜索新增“校服、卫衣、湖边、天台、日落、雨天”，仅根据作品标题与标签匹配，不从作者名推断画面；多个词以空格分隔，仍与图源、分类和方向条件组合。当前 Ayomi 目录分别匹配 120、63、8、5、71、24 张。219 项测试在本机 Node 22 通过，所加载模块行覆盖率 99.45%，搜索模块函数覆盖率 100%；新增回归覆盖英文同义词、单词边界、作者名误匹配、组合筛选及“日落”与“夕阳”结果一致。

新增 109 张作者预览合计 7,594,158 字节，保留作者发布的原始字节并复用已有 1449 张，无失败或待处理项。Hexo 构建通过，实际发布检查通过：1582 条记录、87 张同站原图、1558 张预览，无待生成预览；目录、预览清单及相关前端文件与源文件字节一致。本机浏览器六个中文搜索结果与目录相同，“猫耳 卫衣”加手机方向显示 58 张；390×844 视口下图库无横向溢出，当前可见预览均成功加载本地文件，新增作品的下载按钮完整位于视口内。截图保存在忽略 Git 的 `test-results/wallpaper-ayomi-hoodie-mobile.png` 和 `test-results/wallpaper-ayomi-new-preview.png`，检查后已恢复默认视口。

页面实际下载 `nekomimi-girl-pink-hoodie-white-tail-cherry-blossoms.png` 为 1024×1536、4,728,261 字节，SHA-256 为 `35835abd51e63a52210706d30d9766a4f60e7bf8e493254b0b20bcb0e37cdd39`，完整解码并与独立读取的作者原文件逐字节一致。作者 AyomiCat、AI 标记、原始尺寸及 CC BY-NC-ND 4.0 的署名、非商业、不可改作条件可见。本轮未修改收藏，未推送；真实 Actions/Pages 的每日续读与手机实机仍未验证。

构建完成后运行 `node scripts/verify-wallpaper-release.cjs`，检查实际 `public/wallpapers/` 内的目录和图片。每张同站高清下载必须存在，且字节数、SHA-256、格式、实际尺寸和完整解码与已验证记录一致；预览目录声称已生成的文件也必须实际存在并通过解码、尺寸、大小及已有摘要检查。缺失的可选预览仍保留原图源回退，不把它冒充已经生成的本地文件；缺失或损坏的同站原图、错误的预览记录及无效目录会阻止上传 Pages 制品。检查只读取发布目录，不下载图片或改写图库。

Pages 工作流增加面向 `main` 的 PR 构建检查，可复用主分支缓存；不同 Git 引用使用独立的并发组。构建作业只有读取仓库的权限，上传 Pages 制品和部署仅允许 `main` 的非 PR 运行，部署权限只授予部署作业。测试、构建、发布文件检查通过后才上传。PR 检查本身不证明已经上线；实际 Actions、Pages 和默认分支定时同步仍需在获准推送后验证。

2026-10-02 的发布预检增量在本机 Node 22 通过 207 项测试，所加载模块行覆盖率 99.41%，新增发布检查模块行覆盖率 100%。回归覆盖空缓存、文件丢失后的恢复、每日预算、零预算、冷却保留、四类同站原图缺失、字节及尺寸不符、原图完整解码、预览缺失、无效或重复目录与外站回退。实际构造了一张尺寸与字节数仍然正确但像素数据无法解码的 WebP，确认其不再被当作有效缓存，并能从已验证来源自动重建。

另外使用隔离的空预览目录，实际重新读取 121 张 Ayomi 作者预览，并从本地已验证原图生成 OpenGameArt、HDWallpapers、Blender、Unicorn 各一张预览；125 张全部生成，失败及待处理均为零。121 张作者预览与此前已核对的本地文件逐字节一致，125 张预览和四张同站原图均通过新的发布检查。这验证了超过默认 120 张的空预览缓存恢复；四张原图使用已有缓存，未将此次样本当作整个原图缓存同时为空的 Actions 首次运行。

最终日常预览构建完整解码并复用 1409 个已有文件，新增、失败和待处理均为零。Hexo 构建后的实际发布目录通过检查：18 个来源、1433 条记录、87 张同站原图、1409 张预览，无待生成预览。工作流 YAML、PR 触发、读取权限、检查与上传顺序，以及主分支上传和部署条件通过本地结构校验；真实 GitHub 作业执行、Pages 公开下载和每日调度仍待获准推送后验证，本轮没有推送。

2026-10-02 的后续增量通过正式采集器新增三张 CC BY 4.0 手绘场景及 64 张 Ayomi AI 动漫插画。OpenGameArt 从 67 增至 70 张，Ayomi 从 420 增至 484 张，静态目录从 1366 增至 1433 张；原有全部 1366 张记录及其内容逐条确认保留，其他 16 个来源的记录、更新时间与续传状态未变。Ayomi 本轮限定 150 次请求、30 个目录、至少 1800 ms 间隔，达到请求预算后正常保存进度，待处理目录从 71 减至 54，无限流冷却。64 张新增原图尺寸为 1024×1536、1536×1024、1920×2880 或 1600×2400，AI 标记及 CC BY-NC-ND 4.0 条件保留。三张手绘原 PNG 合计 3,801,155 字节，完整解码并与独立读取的作者文件逐字节一致。

新增 67 个预览、复用 1342 个，失败和待处理均为零；新增预览合计 3,579,538 字节，全站 1409 个预览合计 95,463,808 字节。全部预览的格式、尺寸、字节数、已有摘要及源文件与发布文件一致性检查通过，新增 67 个预览另完整解码；目录、预览目录及相关前端文件发布字节一致。197 项测试在本机 Node 22 通过，OpenGameArt 来源与采集器行覆盖率均为 100%，新增回归覆盖连字符文件名的中文标题、实际尺寸、两张独立原图、文件撤回及无关作品保留。同步最新博客主分支 `dfb87f3` 后，解决两个配置冲突并同时保留壁纸、视频入口及两个静态目录；视频相关的 25 个源文件与主分支逐字节一致。壁纸页面同步增加视频入口，390 像素视口的五个导航链接完整可见，没有横向溢出。Hexo 构建通过。

浏览器来源筛选显示 OpenGameArt 70 张、Ayomi 484 张；“玄关”检索两张，“雨天”检索一张，三张本地预览成功解码，走廊为 1280×719、雨天空为 1280×960。白昼玄关的作者、CC BY 4.0、实际 2000×1124 尺寸、缩小转 WebP 说明及未修改单图入口可见；页面实际下载 PNG 为 1,210,159 字节，SHA-256 为 `ec9494c649996e91d7bfc0fc1f522ba3ffe6d46911a616e7f7e6887db8fef498`，与作者原文件一致。新增 `Pink Haired Neko Girl in Sailor Uniform Under Cherry Trees` 的 640×960 本地预览、AI 标记、作者及非商业不可改作条件正确。首次直接保存外站原图的 30 秒等待超时；随后从页面正常打开原图，浏览器显示完整 1920×2880 图片，再保存 PNG 成功，实际为 16,618,870 字节，SHA-256 为 `8ea8d79da137e90692b782dfa0c5951575b0cb772a115a39ca16a77017890e8b`，完整解码通过。390×844 视口下下载按钮完整可见，之后恢复默认视口，未新增收藏。截图为忽略 Git 的 `test-results/wallpaper-oga-hallway-preview.png`、`test-results/wallpaper-ayomi-cherry-preview.png` 和 `test-results/wallpaper-ayomi-cherry-mobile.png`。实际 Actions/Pages 定时同步仍待发布后验证，本轮没有推送。

2026-10-02 的 OpenGameArt 手绘增量通过正式采集器收录三位作者的六张 PNG：晴空、礼堂和四张视觉小说绘画场景，来源从 61 增至 67 张，静态目录从 1360 增至 1366 张。既有 61 张 OpenGameArt 记录及其他 17 个来源的记录、更新时间和续传状态逐项确认未变。新原图合计 4,808,146 字节，均与独立读取的作者文件或 ZIP 对应成员逐字节一致；六个等比例 WebP 共 122,704 字节，4:3 场景为 1280×960，礼堂为 1280×720。全部 1342 个预览合计 91,884,270 字节，尺寸、字节数、已有摘要及源文件与发布文件一致性检查通过；新原图和预览另完整解码，前端脚本及两份目录发布字节一致。195 项测试在本机 Node 22 通过，OpenGameArt 图源与采集器行覆盖率均为 100%；回归覆盖逐作品许可版本、原有 CC0 不被放宽、额外作者署名、包内文件范围、截断图片、许可撤回和冷却保留。Hexo 构建通过。

浏览器来源筛选显示 67 张，中文“手绘”显示新增五张，“礼堂”显示另一张，六个本站预览均成功显示。两种 CC BY 许可的作者、作品页、版本链接与预览缩小转 WebP 说明可见，礼堂另保留 Frances Calceta 的指定署名。从页面实际下载的晴空 PNG 为 1800×1350、1,546,692 字节，SHA-256 为 `7d69a5da3f10071585433c9749520a1f360b73b83156b980ff2e9531590fa507`；礼堂 PNG 为 1920×1080、1,621,875 字节，SHA-256 为 `ed2a5d17202d5d3c70cb17f941bd61979b64f6619acd5b72b77d41bab05286eb`，均与作者文件一致。390×844 浏览器视口无横向溢出，下载按钮完整可见，随后恢复默认视口，未新增收藏。截图保存于忽略 Git 的 `test-results/wallpaper-oga-sunny-preview.png`、`test-results/wallpaper-oga-auditorium-preview.png` 和 `test-results/wallpaper-oga-auditorium-mobile.png`。这批补充手绘场景，不能据此宣称大型动漫图库已完成；未推送，实际 Actions/Pages 每日同步仍待发布后验证。

2026-10-02 的 Ayomi 后续同步沿用串行限速与续传，限定 100 次请求、至少 1800 ms 间隔、最多 30 个目录。实际读到 43 张新图后，抽样发现来源明确标注为 Text Overlay 的文字梗图；新自动筛选规则在新目录和旧缓存中均排除这类图片，保留普通书本、服装文字，不做像素 OCR 或宣称检测全部图片上的文字。最终新增合格图片 41 张、移除旧文字覆盖图 3 张，来源从 382 增至 420 张，新增原图均为 1024×1536；待处理队列从 83 减至 71 个目录。其他 17 个来源的记录、更新时间与续传状态逐项确认未变，所有保留的 Ayomi 旧记录也逐条一致；静态目录合计 1360 张。

41 个新作者预览保留原始字节，共 2,362,286 字节；清理五张被筛除的新旧图预览后，全站本地预览合计 1336 个、91,761,566 字节，实际解码、尺寸、字节数、已有摘要及全部发布文件一致性检查通过。193 项测试与 Hexo 构建在本机 Node 22 通过。浏览器 Ayomi 显示 420 张，中文壁炉搜索由 0 增至 6 张，读书 7 张、摩天轮 2 张、抱猫 15 张；猫耳加壁炉交集为 5 张，六张壁炉预览均为 640×960 并成功解码。`Anime Girl with Cat Ears Tending to Fireplace in Cozy Room` 的作者、AI 标识、非商业与不可改作许可可见；从页面实际下载 PNG 为 1024×1536、2,054,086 字节，SHA-256 为 `86cd108551795f8e7ea9467869a66f7fd31b0ff9b440f347081bb2b49e95cf9c`，与作者文件逐字节一致。390×844 浏览器视口没有横向溢出，下载入口完整处于视口内，之后恢复默认视口；未新增收藏。截图为 `test-results/wallpaper-ayomi-fireplace.png` 和 `test-results/wallpaper-ayomi-fireplace-mobile.png`。这是本机浏览器响应式验证，未推送，也未验证实际 Actions/Pages 或手机实机。

2026-10-02 的 Pop!_OS 与 Unicorn 增量通过正式采集器收录 17 张原创插画和两张手绘场景，官方静态目录由 1303 增至 1322 张、来源由 16 增至 18 个。其他 16 个来源的记录、更新时间和续传状态逐项确认未变。新增 19 张 WebP 预览共 1,204,744 字节，全部 1298 个本地预览共 89,555,102 字节，实际解码、尺寸、字节数、已有摘要和全部发布文件一致性检查通过；两张 Unicorn 原文件共 2,210,027 字节，原始字节、SHA-256 及发布文件一致。192 项测试与 Hexo 构建在本机 Node 22.23.3 通过，新增图源模块、Unicorn 采集器和共享请求规则模块行覆盖率均为 100%；测试覆盖许可变化、逐文件绑定、尺寸与完整解码、故障保留、下架、限流冷却、缓存摘要及其他来源保留。

本机浏览器两个来源分别显示 17 与 2 张；Unicorn 的二次元分类与中文“商场”搜索正确，商场扶梯和 Pop!_OS 的 Bedroom 均使用 1280×720 完整构图预览，作者、具体许可、原始尺寸及预览修改说明可见。商场扶梯从页面实际下载 JPEG 为 1920×1080、1,079,157 字节，SHA-256 为 `c713bb7437d49940e2a6cc76c5c88754eabaf7c306011592c3c4bccb5dfda4c2`，与已验证原文件一致；收藏刷新后恢复，测试收藏随后清理。Pop!_OS 原文件在构建时已成功读取并核对，但本轮浏览器下载其远程 GitHub Raw 文件超时，不能记为浏览器下载通过。截图为忽略 Git 的 `test-results/wallpaper-pop-unicorn-preview.png`。这是本机 Node 22 与桌面浏览器验证，未推送、未验证真实 Actions/Pages 定时发布或手机实机；大型动漫角色图库仍有缺口。

2026-10-02 的 Blender 增量通过正式采集器新增 14 张，官方静态目录由 1289 增至 1303 张、来源由 15 增至 16 个；其他 15 个来源的记录、更新时间和续传状态逐项确认未变。14 张原文件与官方包内单图逐字节一致，SHA-256、真实尺寸及发布文件一致性均通过；新增 WebP 预览共 606,876 字节，全站本地预览缓存合计 1279 个、88,350,358 字节，所有源文件与发布文件字节一致。180 项测试通过，所加载模块行覆盖率 98.78%，Blender 模块与采集器行覆盖率 100%，共享 ZIP 提取模块行、分支与函数覆盖率均为 100%。Hexo 构建通过；本机为 Node 24，尚未验证实际 Node 22 Actions 运行。

本机浏览器验证 Blender 来源 14 张、Spring 电影名搜索与幻想分类交集 5 张。Spring 的完整构图预览为 1280×536，Wing It! 为 1280×720；项目署名、素材发布者、CC BY 4.0、预览修改说明和单图下载入口可见。收藏刷新后恢复，测试收藏随后清理。页面入口实际下载 Spring PNG 为 2048×858、3,369,672 字节，SHA-256 为 `738484e63f80d6ec4e5c5b9effc14e43f8261a7b69e2ba5d33f3a2227648e96c`；Wing It! JPEG 为 1920×1080、191,253 字节，SHA-256 为 `b35cef58c50e8b281b125c044c17ea81235bec0c32154a80d188bdc570ff740f`，均与官方包内原文件一致。截图为项目工作区上层的 `wallpaper-blender-preview.png`。本轮未推送、未验证线上定时发布或手机实机，也不能据 14 张原创动画画面宣称大型二次元图库已补齐。

```sh
node --test --experimental-test-coverage test/wallpapers*.test.cjs
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

AyomiArt 作者与 AI 说明、默认非商业共享许可：<https://oc.nekosia.cat/>；作者图库：<https://oc.nekosia.cat/gallery?page=1>；逐图许可数据示例：<https://oc.nekosia.cat/gallery/anime-catgirl-black-dress-red-bow?page=1>；许可条件：<https://creativecommons.org/licenses/by-nc-nd/4.0/>。Creative Commons 的集合与改作说明：<https://creativecommons.org/faq/>。未接入聚合其他作者作品的 Nekosia 通用动漫 API，也未使用付费下载许可。

OpenGameArt 已核对的作者作品页：<https://opengameart.org/content/40-game-backgrounds-1-painted-style-and-photorealistic>、<https://opengameart.org/content/concept-art-studies-bundle-1>、<https://opengameart.org/content/underwater-background-2>、<https://opengameart.org/content/simple-city-silhouetteskyline-with-clouds>、<https://opengameart.org/content/starsspace-background>、<https://opengameart.org/content/manga-style-background>、<https://opengameart.org/content/japanese-style-simple-backgrounds>、<https://opengameart.org/content/visual-novel-tutorial-set>。原站请求规则：<https://opengameart.org/robots.txt>。收藏夹中的其他作品没有自动获得上述作品的许可，尚未进行全站自动发现。HachiStudio 的 <https://opengameart.org/content/japanese-room> 虽标为 CC0，但实际文件为 1280×905 且有透明区域，不符合本站壁纸条件，未接入。

Unicorn Creates 的购物场景现已接入两张 1920×1080 作者公开 JPEG，实际下载与预览验证见上文：<https://unicorncreates.itch.io/shopping-backgrounds>；独立 4K 素材包尚未取得。Suzana Assets 的住宅场景（作者页声明 CC BY-NC 4.0，1920×1080，No AI）：<https://suzana-assets.itch.io/house-visual-novel-backgrounds>，以及 Iletora 的学校走廊（CC0，1920×1080，早晚两个版本）：<https://iletora.itch.io/school-hallway>，仍为未接入的候选，不能把页面尺寸声明当作已验证文件。仓库开源、提供下载 API 或只写免费，均不能替代图片本身允许再分发的授权。

继续核对的作者来源：Agundur 的逐图许可及正式图片位于 <https://github.com/Agundur-KDE/Wallpapers>，已实际接入。Unicorn Creates 的 <https://unicorncreates.itch.io/sky-backgrounds> 声明三张 1920×1080 数字绘画天空采用 CC BY 4.0，但实际读取的三个作者公开 JPEG 均为 1280×720，未通过本站高清门槛；正式素材包尚未取得，不计入图库。Clifton Lambert 的 <https://prismshard77.itch.io/handpainted-visual-novel-backgrounds> 声明三张手绘扫描场景为 1920×1080、CC0，实际公开 PNG 为 1675×936，全部包含游戏对话框和按钮；单独画廊 PNG 与正文首张文件摘要相同。已排除这些演示截图，没有裁去界面后当成作者干净原图；正常浏览器下载流程因连接重置未取得正式背景文件，仍不计入图库。Screaming Brain Studios 的下载页明确声明所有公开素材包为 CC0，并允许重新分发：<https://screamingbrainstudios.com/downloads/>；尚未把其中的材质、贴图或素材组件当成完整壁纸收录。

David Revoy 的作者 Misc 画廊：<https://www.peppercarrot.com/en/artworks/misc.html>；历史绘画重新开放的作者说明：<https://www.davidrevoy.com/article1074/releasing-my-vintage-artwork-as-cc-by-with-source>；逐作品许可示例：<https://www.peppercarrot.com/en/viewer/misc__2026-07-12_The-Scythe-Mage-Between-Worlds_by-David-Revoy.html>。本轮实际读取社区插画区的 194 个作品页，只有 4 件标注 CC 许可，其余 190 件明确要求另行取得作者许可，未按整库接入；保留公开展示许可不能推及博客壁纸下载图库。作者 Misc 区实际读取 246 个作品页，193 件标注 CC BY 4.0、33 件 CC BY-SA 4.0、20 件未标注开放许可。这些数量是来源页核对结果，不等于尺寸、内容与署名筛选后的收录量。

钛山作者站的内容许可：<https://tysontan.com/> 页脚明确覆盖网站内容及外部副本，另有声明除外；对应许可为 <https://creativecommons.org/licenses/by-sa/4.0/>。正式作品示例：<https://tysontan.com/gallery/gallery-mascots/kiki-splash-2026/>，主插画的图注提供作者原始 PNG 下载，并说明绘画过程。Krita 官方另确认钛山创作的 Kiki 及相关插画采用 CC BY-SA 4.0 / GPL 授权：<https://krita.org/en/about/mascot/>，该声明不能推及社区其他作者作品。本次接入采用作者站适用的 CC BY-SA 4.0，未把软件的 GPL 作为图库授权。实际检查过 <https://tysontan.com/robots.txt>，未发现对上述公开页面、API 和图片路径的限制；当前采集器尚未逐次重新读取 robots.txt。

新增待接入候选 BudgetPixel：<https://budgetpixel.com/images/tag/anime> 本轮实际查到 119 张 AI 动漫场景，整个公开图片库声明为 CC BY 4.0：<https://budgetpixel.com/license>。作品页分别列出作者、许可、真实尺寸和正式文件，如 <https://budgetpixel.com/images/anime-rolling-grassland-hills-0b3e0041> 的 2016×864 JPG；不把总条数当作本站已验证高清壁纸数。<https://budgetpixel.com/terms> 第 5 节要求自动访问获得书面许可，不能据图片许可直接批量抓取网页。官方 <https://docs.budgetpixel.com/stock-images> 明确提供用于检索此图库的接口，免费计划也可用，但需要 API 密钥；成功搜索每次 10 积分、最多 20 张，分页另计一次搜索。免费计划当前每月 300 积分，每月最多可作 30 次这样的检索（未计其他积分消费），可采用月度预算限制。接口要求把返回文件下载后自行提供，不能在生产网页热链原图。尚未配置账户密钥、实际调用接口或接入本站，不计入图库数量。

继续搜索发现 Wallpapers UHD 的自有图片采用 CC BY 4.0，但其 <https://www.wallpapersuhd.net/licenses> 明确禁止批量自动采集和把整个或大部分目录复制成另一壁纸站，不能作为免人工维护的直接批量图源。HDWallpapers.org 的 <https://www.hdwallpapers.org/terms-of-service/> 要求遵循具体作品的许可，<https://www.hdwallpapers.org/robots.txt> 当前允许读取公开页面；访问规则不替代图片授权。已完整读取动漫分类五页共 80 件作品，只有一件通过站方作者署名、逐图 CC0、AI、内容与真实文件校验，已接入每日同步。<https://www.hdwallpapers.org/wallpaper/anime/anime-girl-black-kitty-rain-umbrella-ai/3xx/> 标为 Public Domain CC0，实际核对其提供的最高分辨率 JPEG 为 3840×2194；先前读到的 2880×1800 是另一个尺寸页面，不能当作最高分辨率。另行复查的 <https://www.hdwallpapers.org/wallpaper/anime/anime-girl-dark-fantasy-world-ai-art/MV5/>、<https://www.hdwallpapers.org/wallpaper/anime/anime-girl-tattoo-katana-ai-art/mgr/>、<https://www.hdwallpapers.org/wallpaper/anime/anime-girl-mask-katana-sword-ai-art/gNG/> 分别署名未知或第三方作者，标为 Personal Use，均未收录。这个来源可以继续自动跟踪后续合格作品，目前不能作为大型开放动漫图库。

动漫大图库候选 <https://huggingface.co/datasets/alfredplpl/anime-with-caption-cc0> 的发布者声明 15,000 张原创提示词生成的 AI 插画并放弃版权，标签为 CC0；实际读取前五张的官方数据 API，均标为 1024×1024，尚未下载整个数据集或独立验证全部图片。不能把总条数当成符合高清尺寸的壁纸数量。其他来源中，Spiral Atlas 的住宅包虽然在 OpenGameArt 标为 CC BY 3.0，但其当前作者页及作者答复明确禁止重新分发原图片：<https://spiralatlas.itch.io/house-visual-novel-backgrounds>，存在许可说明冲突，未接入。NoranekoGames 的动漫场景使用自定规则并限制与 AI 的相关使用，没有按统一开放许可接入：<https://noranekogames.itch.io/yumebackground>。

Wallpapers.com API 与逐图许可要求：<https://wallpapers.com/api/>；个人及非商业许可说明：<https://wallpapers.com/faq/licensing-and-help/can-i-use-wallpaperscom-wallpapers-commercially/>。原站入口不代表其中全部图片为开放授权。

2026-10-02 继续核对的大型动漫候选：<https://huggingface.co/datasets/alfredplpl/anime-with-caption-cc0> 的发布者声明 15,000 张 Emi 2 生成图片采用 CC0，并说明使用随机原创提示词、避免已有角色。官方行接口确认 train 共 15,000 条；在首、中、尾分别读取五条记录，提供的图片尺寸均为 1024×1024，实际下载并解码其中三张，确认是同尺寸 JPEG。它们是平台提供的 JPEG 文件，不能描述为生成器的未转换原文件。数据卡明确提醒 prompt 字段常与图片不符，自动生成的 caption 也不能充当独立的内容或第三方权利核验。当前尚未接入，不计入本站图库；保留现有高清门槛，等待用户对低分辨率图片是否单独收录的偏好。完整原始数据包约 20.9 GB，不适合直接加入 Pages；行接口的图片地址还带有效期签名，后续若接入需要限定预算并缓存实际文件，不能把临时链接直接写入长期目录。

<https://github.com/AOSC-Archive/WallColle> 共有七位贡献者的 40 条逐图声明。实际文件树包含 39 个贡献者 JPEG 和一个演示 PNG；明确支持当前预览方式的许可候选有 24 张，其中一张超过 6000 万像素，因此收录 23 张。其 README 明确将程序 GPLv2 和图片的各自许可分开；图片作者及许可位于各贡献者的 `me.json`，不是给整个仓库套一个统一许可证。

2026-10-02 新核对并接入 <https://github.com/Sermoris/sermor-ai-wallpapers> 与 <https://github.com/Sermoris/sermor-ai-generated-wallpapers>。作者的 README 分别明确将其 AI 图片按 CC0 和 CC BY-NC-SA 4.0 发布，LICENSE 内容也对应，非商业图库不描述为可任意使用的开源图片。实际收录的原始 PNG 尺寸为 1920×1080、3072×1728、4096×2304 或 6144×4096；同名尺寸版本去重后共 191 张，文件摘要全部不同，也没有与既有仓库图片的相同摘要。这是文件级去重，不是逐像素相似画面检索。文件名明确含 Anime 的作品仅一张，不把 191 张全部算成二次元；这是增加风景、幻想与赛博内容的作者来源。

2026-10-02 新核对的 Blender Studio 原创动画来源：<https://studio.blender.org/projects/wing-it/pages/licensing/> 和 <https://studio.blender.org/projects/spring/pages/about/> 分别明确把项目发布内容按 CC BY 4.0 授权，允许署名再分发；标志、商标及非项目制作的第三方材料除外。<https://studio.blender.org/remixing/> 要求按每个素材的具体许可判断，因此不能把所有 Blender 项目统一视为 CC BY 4.0。公开图库同时包含工程、草稿、模型、视频和会员素材，尚未整体接入本站。

实际通过 Wing It 的 Press 目录 <https://studio.blender.org/projects/wing-it/3c402f7c9ab362/> 和 Spring 的 Press 目录 <https://studio.blender.org/projects/spring/5ca60d7ff6c1380028000924/> 发现官方详情入口。素材 `7037`（Wing It - Shot Frames）和 `889`（Frames Selection）的详情分别绑定 Beau Gerbrands、Francesco Siddi、Free 标记、CC BY 4.0 链接及正式 ZIP 下载入口。匿名下载完整包后，实际检查到 9 张 1920×1080 JPEG 和 5 张 2048×858 PNG，共 14 张完整电影画面；Spring 的描述称七张，但实际当前包只有五张有效图片，排除 `__MACOSX` 辅助文件。两个包分别为 2,307,730 和 16,674,144 字节。现已通过正式采集器接入上述 14 张，每张保存未改动原文件并提供单图入口；原图合计 18,986,955 字节，新增 WebP 合计 606,876 字节。保留项目署名、素材发布者和预览修改说明。中文画面标题对应已查看的首批文件，后续新增文件可自动使用电影名与帧编号，不要求逐张人工维护。

Wing It 的免费概念画 `6310`（Cockpit Interior）单独标明 Vivien Lulkowski、CC BY 4.0 和 2318×1249，存在正式 JPEG 下载入口；该尺寸目前来自作品页，尚未下载这个文件独立验证。Spring 的概念画 `347` 明确显示锁定及 Login to Download，仅有公开缩略图，未绕过会员限制。另有免费角色测试 `6392` 为 725×545，不符合本站尺寸条件。免费、授权和适合壁纸三个条件需分别核对；原创三维动画画面可补充动画电影与幻想题材，不能都归为日式二次元。

新增作者壁纸候选 <https://le-pigeon-baladeur.itch.io/wallpapers-lowpoly>：作者明确声明自己生成并提供的 AI 壁纸为 CC0，允许使用、修改与分享；页面列出 1920×1080 与新增 3072×1728 版本，当前提供 116 MB 的 `WallpapersV4.zip`。尚未下载整个包、核对独立作品数或接入每日同步，不能把更新日志里的新增数量当作已验证收录量。The Outlander 的 <https://the-outlander.itch.io/free-japanese-backgrounds> 明确标为 CC0，但声明尺寸为 1536×1024；抽查其村庄、森林与角斗场包为 1536×1536，恐怖室内包为 1024×955，均不符合本站当前长边至少 1600 的门槛，未降低门槛收录。

更贴近视觉小说场景的候选为 Uncle Mugen：原作者主帖 <https://lemmasoft.renai.us/forums/viewtopic.php?t=17302> 允许自由用途、商业与免费项目及修改，并在 2025 年的新教室、公寓帖子重复宽松使用声明；这是作者自定授权，不能改标 CC0。原作者主帖指向 Alte 整理的背景资源。<https://alte.itch.io/uncle-mugens-backgrounds> 列出 354 和 173 张两个包，共 527 张，题材包含校园、实验室、自然、城镇、公园、咖啡馆和住宅；这些是发布页声明的数量，尚未检查包内重复、分辨率、内容和具体来源。<https://alte.itch.io/uncle-mugens-20> 声明另有 62 张统一 1920×1080 的 JPEG，且约一半与 WebP 包重复，不能相加当作独立作品数。本机浏览器下载按钮两次均未取得 ZIP；读取页面公开的四个 `original` 图片入口，实际文件全为 1280×720 的示例图，未当作高清原图收录。原作者论坛的本机 HTTP 请求返回 403，未绕过防护，也未编写把论坛全帖自动搬运的采集器。

Lornn 的 <https://lornn.itch.io/backgrounds-magic-school>、<https://lornn.itch.io/backgrounds-homes> 等包具有大量 AI 生成后编辑的动漫场景，页面声明 2432×1664，允许用于个人及商业项目；当前读到的许可没有明确允许将原始文件作为另一素材／壁纸图库提供下载，未按 CC0 或开放再分发来源接入。宽松项目使用说明不能直接解决本站提供壁纸单图下载的许可条件。

桌面环境的官方壁纸仓库也是后续候选。<https://github.com/KDE/plasma-workspace-wallpapers> 在提交 `b55e5ad9af39d1c0b54dc5f97bc56d2c3a9f5f5e` 的完整目录中有 257 个不同尺寸及预览文件，不能当作 257 张独立作品；实际核对 38 个主题的元数据，18 个声明 CC BY-SA 4.0、20 个声明 LGPLv3。抽样 Altai 原图为 5120×2880。尚未接入，不计入本站数量；后续需按主题绑定作者、具体许可、最高分辨率文件，并处理不同于 Creative Commons 的许可规则，不能将整个仓库统一标为 CC0。

另外排除的候选：<https://vizardio.com/en/free/license> 的免费 AI 图片集合声明为 CC0，但 <https://vizardio.com/en/terms-of-service> 第 9.1 节禁止未经书面许可的自动访问，未编写自动采集。<https://github.com/1nexoravel/inex-gpt-image-2> 虽然仓库采用 CC BY 4.0，主要提供提示词及示例，部分示例明确依赖外部角色参考图，不能把仓库许可当作底层角色素材的权利证明。Unicorn 购物场景的早期连接失败已被后续正式单图读取解决，现已收录两张公开 JPEG；未把尚未取得的独立素材包计入图库。

2026-10-02 另核对 [XCVG 的 See Who I Am Art Pack](https://opengameart.org/content/see-who-i-am-art-pack)：作品页提供 CC BY 3.0 与 4.0 等许可，并要求保留 XCVG / XCVG Systems 署名。实际下载正式 4,638,735 字节 ZIP，22 张 `bg/` 场景全部为 1280×720，未达到本站长边 1600、短边 800 的门槛；透明角色、UI 和动画序列也未当作壁纸收录。[Mouse-Drawn Backdrops](https://opengameart.org/content/mouse-drawn-backdrops) 作品页声明 CC0、提供约 29 MB 的正式包，但本轮读取超时，文件内容与尺寸尚未验证，未接入。LisadiKaprio 的 [4 Expression Backgrounds](https://opengameart.org/content/4-expression-backgrounds) 实际两张气泡为 800×600，另外两张 1800×1350 为情绪色块；已查看画面，本轮优先接入走廊和雨天空，没有把该候选四张全部计入动漫场景。

继续追溯 <https://huggingface.co/datasets/deepghs/anime-bg> 的 4600 张动漫背景：数据卡虽标为 CC0，但明确引用 <https://huggingface.co/datasets/skytnt/anime-segmentation>；后者引用的 <https://github.com/ShuhongChen/bizarre-pose-estimator> 说明背景来自 Danbooru 与 Pixiv，未提供每张原作作者的再分发授权。因此没有将下游 CC0 标签当作原始图片许可，也没有下载或收录这批图片。另核对 <https://www.summerengine.com/asset-store/vn-background-school-rooftop-day-2561b957>，作品页与结构化数据绑定作者、Grok Imagine、CC0 和未附变换参数的正式 PNG 地址；实际读取原图为 1280×720，未通过本站门槛。平台 <https://www.summerengine.com/llms-asset-store.txt> 与 <https://www.summerengine.com/agent-catalog.json> 提供公开目录入口，并要求优先使用素材包目录、避免批量遍历详情和私有 API；未编写绕过此规则的采集器，也没有将目录总数计入本站。

2026-10-03 继续核对 Commons 的 [Anime illustrations](https://commons.wikimedia.org/wiki/Category:Anime_illustrations) 子分类。现有采集器只读取顶层文件；子分类也包含视频、角色素材、展会及商品照片，不能将分类文件总数当作合格壁纸数。[Liminal Space Girl](https://commons.wikimedia.org/wiki/File:Liminal_Space_Girl.png) 由虫塚虫蔵声明为自制、CC0，作品页提供 2816×2048；[Winter Canal Town 的 Seedream 4.5 版本](https://commons.wikimedia.org/wiki/File:It's_Dark,_It's_Cold,_It's_Winter_Canal_Town_(Seedream_4.5).webp) 由 VulcanSphere 声明为 CC BY 4.0，作品页提供 2560×1440，并注明使用两张起始图片的图生图流程。这两张 Commons 文件尚未下载解码，起始图片权利也未独立核实。本机直接连接 Commons API 超时，浏览器尝试也未取得接口响应；未增加未经实际验证的分类或递归采集逻辑。

同轮从 Commons 作品页追到作者的 [VulcanSphere AI Art 原始作品集](https://archive.org/details/vulcansphere-ai-art)。集合明确署名 VulcanSphere、采用 CC BY 4.0，包含文生图及图生图后编辑作品；这是作者的许可声明，不是对所有输入素材的独立权利核查。实际通过 [官方 Metadata API](https://archive.org/developers/md-read.html) 读取到 13 个原始图片文件，排除平台缩略图和集合封面；逐个读取文件头，12 个满足长边至少 1600、短边至少 800，其中两张 8000×8000 超过本站 6000 万像素上限，最终 10 个同时满足这两项条件。这是尺寸候选数，尚未完成全部内容与重复画面检查。完整下载并解码 `Full_Moon_Lighthouse_(AnimagineXL_3.0).jpg` 和冬日小镇 Seedream 4.0 WebP，分别为 2688×1536、467,738 字节及 2560×1440、247,370 字节，SHA-1 与官方目录一致；实际查看均为完整横屏场景。请求使用可识别的工具/模型 User-Agent 并串行间隔至少 1.1 秒，依据 [官方自动访问规则](https://archive.org/developers/bots.html)。集合规模较小，尚未接入每日同步，不计入本站图库；核查结果与两个文件保存在 `/tmp/wallpaper-vulcansphere-*`，临时文件不是持久发布产物。

仓库图源：<https://gitlab.com/librepixels/ia.Wallpapers>；<https://github.com/FoliumCreations/Wallpapers>；<https://github.com/metaory/midjourney>。许可声明分别位于 LibrePixels README/LICENCE、Folium README/CC:BY 4.0 Licence、metaory LICENSE。

## 目标与剩余缺口

目标是博客内内容丰富、二次元足够充实、体验好且持续自动更新的壁纸站。新增小型开放仓库只是推进步骤，不能据此宣称目标完成。还需扩大具有明确图片许可的动漫内容、解决大型图库的可靠接入，并验证实际 Pages 环境的预览覆盖率、访问速度与默认分支上的每日更新。原站链接不计入站内图库数量。

2026-10-03 重新用前端规范化逻辑核对构建目录：19 个图源、1665 张，其中二次元 881 张，竖屏 675、横屏 206。这不包含 Commons、克利夫兰实时结果和程序生成图，也不包含本轮候选。数量增加仍主要来自 Ayomi 人物插画，不能据此宣称不同画风与场景已经足够丰富。本轮只补充图源核查记录，没有修改运行代码、图库目录或发布配置，未重跑上一轮通过的测试与构建，也未推送。

2026-10-02 本轮只读核对线上状态：远端默认分支为 `main`，最新读取到的提交为 `153a6075c05f5a7d411e1ff258ebb31eeef75cee`；对应 [Actions 构建](https://github.com/fengzhouxuan/fengzhouxuan.github.io/actions/runs/37020391622) 成功，但该分支的 `pages.yml` 尚无壁纸目录同步、预览生成和发布文件检查命令。公开 `/wallpapers/` 地址返回 HTTP 404，不能把博客其他功能的构建绿灯当作壁纸已上线。线上预览覆盖率、访问速度与每日续读仍没有完成证据。从此前合并的 `dfb87f3` 至该提交的四个新提交仅涉及六个视频文件，未改动壁纸实现；本轮未改动这些视频文件或博客主分支工作区。

2026-10-03 更新上线审阅核查：通过公开 GitHub 接口及只读拉取取得当前 `main` 为 `a8bce604c386042311ee5d0af9f20cf4954dcb35`，公开壁纸页仍为 HTTP 404。从壁纸分支至当前 `main` 有六个新的视频提交。使用 `git merge-tree --write-tree` 模拟合并，没有冲突；合并结果只增加本分支的 64 个文件改动，当前 `main` 的视频文件逐项保持一致，没有改动实际工作区或主分支。审阅范围包括壁纸前端、逐源采集/预览/发布检查、测试、两份初始目录、导航与静态渲染配置、四个依赖及每日构建配置；PR 构建不发布，只有默认分支构建才上传和部署 Pages。当前重新运行发布检查通过：1665 张、87 张同站原图、1641 张预览、无待生成项；20 个前端及目录文件的源文件与 `public/wallpapers` 发布字节一致。运行代码、配置和测试相对 `ad72fe1` 未变，上一轮 Node 22 的 219 项测试通过记录继续适用，本轮未重复运行全套测试。已整理本地审阅说明，尚未获得新的推送、创建 PR 或发布授权，没有执行这些外部操作；丰富动漫画风、线上性能与实际每日更新仍未全部完成。

2026-10-02 的 Sermor 增量实际收录 CC0 图库 157 张、CC BY-NC-SA 4.0 图库 34 张，分别固定在提交 `09687d16844a2eaf929f8783686736b07648fca9` 与 `f339dd852b729e2a77299ebd47a8f7c77b808d47`。已有 13 个来源的记录、更新时间及续传状态逐项确认未变，构建目录从 1098 增至 1289 张、15 个来源。191 个原始 PNG 均在预览阶段完整读取并核对 Git blob 摘要、真实格式和尺寸；同名分辨率版本只保留最大合格版本。新增 191 个 WebP 共 14,152,506 字节；全部 1265 个本地预览共 87,743,482 字节，逐文件核对格式、尺寸、字节数、已有摘要及源文件与发布文件一致性，九个相关页面、脚本、样式和目录文件的发布字节也一致，无缺失或待处理预览。

本次全部 170 项测试通过，所加载模块行覆盖率 98.67%、分支 95.76%、函数 95.98%，仓库图源模块行与函数均为 100%；回归覆盖原作者图片声明与 LICENSE 绑定、文件摘要、固定提交地址、分辨率版本去重、实际尺寸不符、完整目录检查、旧图保留与下架、CDN 20 MB 限制、Raw 字节范围回退、截断文件拒绝及预览缓存。Hexo 构建通过。本机浏览器两个图源筛选分别显示 157 与 34 张；`Ethereal Anime Girl` 和 `Cherry Dream` 均使用本站 1280×720 WebP，原图入口保留 4096×2304，作者 Sermoris、AI 标记、CC0 或非商业及相同方式共享条件可见。截图为项目工作区上层的 `wallpaper-sermor-cc0-preview.png` 与 `wallpaper-sermor-nc-preview.png`。

从页面分别通过 CDN 与 GitHub Raw 触发下载 `EtherealAnimeGirl_4096x2304.png`，自动化的完成事件等待超时，但两个实际落盘的文件均为完整 PNG、12,843,105 字节、4096×2304；Git blob SHA-1 均为目录记录的 `bd042331e8e6f135fce105ec0615ce370b3aaac2`，SHA-256 均为 `f08dec1c84c78bc7d8cf6506c46307ed6c68e6b6f95491923b0b9df074cd87ba`。此前遇到 CDN 大小限制的 `Girlin ACity` 在最终构建后也实际使用本站 1280×853 WebP，原图入口保留 6144×4096。本轮没有增加测试收藏，浏览器保留新图源图库。这批主要增加风景、幻想与赛博内容，不能据此宣称大型动漫内容已补齐。验证使用本机 Node 24 和本地浏览器，未推送，也未新增真实 Node 22 Actions/Pages、线上定时更新或手机实机验收。

2026-10-02 已接入 [Pepper&Carrot 官方插画画廊](https://www.peppercarrot.com/en/artworks/artworks.html)。实际读取到 58 件作品，按日期、大小写、连字符和下划线归一后的文件标题识别出 12 件已有壁纸版本，剩余 46 件全部通过真实作品页作者/许可/文件绑定核对及高清 JPEG 尺寸读取，已写入本站目录。Pepper&Carrot 合计 90 张，其中 15 张为竖屏；这仍集中于同一原创世界，不能据此宣称已经具备大型壁纸站的动漫种类。

本次插画增量后共 64 项测试通过，所加载模块行覆盖率 97.49%，Hexo 构建通过且发布目录中的脚本与图源 JSON 与源文件一致。本机浏览器载入艺术馆结果和 Commons 分类缓存后显示合计 1,338 张，二次元筛选 115 张，Pepper&Carrot 筛选 90 张、其中手机方向 15 张。已实际验证 `Enchanted Pages` 的 1701×1080 作者预览成功解码、2500×1587 高清入口与逐图署名信息正确、收藏在刷新后恢复；`A Dreamer s Lake` 的 871×1080 竖屏预览和锁屏示意成功显示，高清入口保留 2800×3472 原图。该锁屏示意是在桌面浏览器验证，本轮没有新增手机实机验收或 GitHub Actions/Pages 发布验证。

2026-10-02 的 Morevna 增量实际验证了 26 张原始图片的 JPEG/PNG 尺寸，长边范围 1605–7550 像素；未计入作者缺失的两件场景及尺寸不足的六件作品。77 项测试通过，所加载模块行覆盖率 97.51%，新图源模块行覆盖率 100%；Hexo 构建通过，发布目录中的新增脚本和图源 JSON 与源文件一致。本机浏览器在加载 Commons 二次元分类缓存后显示合计 1364 张、二次元 141 张、Morevna 26 张，其中竖屏 6 张。已验证 `Sunset Wallpaper` 的 1024×576 作者预览成功解码、3555×2000 高清入口与署名许可正确、收藏刷新后恢复；另一位作者的 `Laboratory` 1536×862 预览及 4698×2638 原图入口也验证通过。没有新增手机实机验收，也尚未验证实际 Actions/Pages 发布。以上数量会随实时图库缓存及加载失败变化。

2026-10-02 的 Ayomi 增量先实际验证了 216 张原图和预览的文件尺寸，最终目录核查排除 Arona/Blue Archive 的三张同人候选，收录 213 张。213 个作者预览按原始字节实际缓存完成，总计 13,551,874 字节；与三个仓库原有的 283 个预览合计 496 个文件。重新构建后核对了所有 Ayomi 缓存的 SHA-256、源文件与发布文件字节一致性，以及七个相关脚本/目录文件的构建一致性。限速后的真实目录同步使用 20 次请求后正确停止，保存 168 个待处理目录；该待处理数量不能当作尚未收录的图片数。102 项测试通过，所加载模块行覆盖率 97.74%，新图源和目录同步模块行覆盖率均为 100%。本机浏览器二次元筛选显示 354 张，Ayomi 为 213 张，竖屏 196、横屏 17；已验证本地预览成功显示、AI 标签、真实 1024×1536 原图入口、署名/非商业/不可改作提示及作者版权声明。收藏刷新后恢复，测试收藏随后清理。没有新增手机实机验收，也没有推送或验证真实 Actions/Pages 发布。

2026-10-02 的 OpenGameArt 增量实际同步 47 张，长边范围 1600–3300 像素，原图合计 30,116,123 字节；新增 WebP 预览合计 2,305,006 字节，与既有来源合计 543 张本地预览。逐文件核对了 47 个原图的 SHA-256、47 个预览的原作比例、源文件与发布文件字节一致性，以及六个相关脚本/目录文件的构建一致性。111 项测试通过，所加载模块行覆盖率 98.03%，新增图源与同步模块行覆盖率均为 100%。本机浏览器显示 OpenGameArt 47 张，幻想筛选为 4 张；四张预览实际解码为 1280×960 或 1280×989，作者、CC0 及原始尺寸可见。`cloud farm` 从页面高清入口实际下载为原始 JPEG，3264×2448、2,157,267 字节，摘要与已验证文件一致；收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-opengameart-scenes.png`。没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布。

2026-10-02 的 Agundur 增量实际同步 22 张，全部读取原图头部确认 3840×2160。新增 22 张等比例 WebP 预览，总计 1,655,498 字节，与既有来源合计 565 张本地预览；全部新预览为 1280×720，源文件与发布文件字节一致。115 项测试通过，所加载模块行覆盖率 98.07%，仓库图源模块行及函数覆盖率均为 100%，Hexo 构建通过。本机浏览器显示该图源 22 张、二次元分类 3 张，三张预览实际解码成功；已核对 CC BY 与 CC BY-SA 的逐图许可、作者署名及预览修改说明。`Sunset Dreamer` 从页面高清入口实际下载为 3840×2160 PNG，11,750,118 字节，Git blob SHA-1 与已验证目录一致；收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-agundur-anime.png`。实际像素尺寸不能证明未经放大，作者也未明确说明是否使用 AI。没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布。

2026-10-02 的 David Revoy Misc 增量实际同步并去重后收录 138 张，136 张 CC BY 4.0、2 张 CC BY-SA 4.0，原图长边范围 1662–7000 像素；其中竖屏 37 张，按名称分类为二次元 10 张、幻想 15 张。全部 138 张作者预览等比例压缩为 WebP，总计 10,730,374 字节，比压缩前的 53,659,387 字节减少约 80%，与既有来源合计 703 张本地预览；逐文件核对格式、尺寸、比例、实际 WebP SHA-256，以及源文件与发布文件字节一致性。123 项测试通过，所加载模块行覆盖率 98.21%，新增图源模块行与函数覆盖率均为 100%，Hexo 构建通过，六个相关脚本与目录文件的发布字节一致。本机浏览器显示图源 138 张，幻想加横屏筛选为 9 张，这九张本地 WebP 均成功解码；`Fantasy Landscape` 从页面高清入口实际下载为 3948×2000 JPEG，3,047,128 字节，收藏刷新后恢复，测试收藏随后清理。另核对了 `Owl princess` 的 2500×3452 原图入口、CC BY-SA 4.0、署名及预览修改说明。截图为项目工作区上层的 `wallpaper-revoy-fantasy.png`。名称分类不能替代图像内容核查，预览体积减少也不等同于已测得相同比例的访问提速。没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布。

2026-10-02 的钛山增量从三个原创画廊实际读取 63 篇作品文章，按主插画、明确的 Fullsize 入口、许可例外和真实尺寸筛选后收录 48 张，全部采用 CC BY-SA 4.0；其中开源吉祥物 24 张、电子之心 14 张、灵兽化身 10 张，竖屏 23 张。原图长边范围 1852–26290 像素，作者注明的裁切版本与缩放原图按其实际文件尺寸保留，不能据此承诺所有作品均为完整最高分辨率版本。全部新预览转为等比例 WebP，合计 2,351,332 字节，与既有来源合计 751 张本地预览；逐文件核对尺寸、格式、比例与字节摘要，以及所有 751 个预览和六个相关脚本/目录文件的源文件与发布字节一致性。修复了指定单个来源刷新时漏掉其他目录的问题，并增加保留其他来源目录、更新时间、续传状态及元数据校验的回归测试。132 项测试通过，所加载模块行覆盖率 98.34%，新增图源和采集器模块行覆盖率均为 100%，Hexo 构建通过。

本机浏览器的钛山来源筛选显示 48 张，手机方向 23 张，全图源二次元筛选显示 415 张；实际在线数量可能随 Commons 刷新及已有缓存变化。`Kiki Paints Over the Waves` 的 1024×512 本地预览成功解码，10000×5000 作者原图入口、作者署名、CC BY-SA 4.0 与预览修改说明正确，收藏刷新后恢复，测试收藏随后清理。`Kiki’s Unplanned Canvas Expansion (Splash Crop)` 从页面实际下载为 3840×2160 PNG，2,171,335 字节；`Kiki the Cyber Squirrel Boy Version (2017)` 的 822×1024 竖屏预览成功解码，原图入口为 1960×2442。截图为项目工作区上层的 `wallpaper-tyson-kiki.png`。Ayomi 本轮继续实际读取 30 个目录，已有 213 张图片不变，待处理队列由 168 个目录变为 147 个；队列数字不能当作图片数。没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布，完整目标仍需继续扩大内容种类并验证线上自动更新。

2026-10-02 的空预览缓存恢复增量：从八个现有来源各选三张已经验证的真实图片，使用隔离的空预览目录和每轮八张预算。第一轮实际新增八张，每个来源各一张；第二轮复用这八张并新增八张，每个来源各累计两张，两轮都没有图片读取或编码失败。OpenGameArt 使用已验证的本地原图，另外七个来源实际重新读取远程文件；这验证的是预览缓存恢复，不能推及所有原图缓存也同时为空的首次构建。模拟测试还覆盖每来源预算、全局上限、缓存续传、单一来源及仅少量其他来源的情况。133 项测试通过，所加载模块行覆盖率 98.35%。实际 Actions/Pages 发布仍未验证。

同轮 Ayomi 在既有 150 次请求预算内继续读取目录，新增 49 张实际尺寸为 1024×1536 或 1536×1024 的 AI 插画，其中竖屏 45 张、横屏 4 张；图源合计 262 张，其他十个来源和 Ayomi 已有 213 张记录均保持不变。待处理队列从 147 个目录变为 126 个，下次继续，目录数不代表图片数。49 个作者预览按原始字节缓存，共 2,643,442 字节；复用已有 751 个预览后合计 800 个文件、54,753,410 字节，无失败或待补预览。目录变动后另行通过 29 项许可、续传及完整目录验证，Hexo 构建通过；实际核对了 800 个预览的尺寸、字节数、已有摘要和源文件与发布文件一致性。

本机浏览器已显示 Ayomi 262 张。新增 `Catgirl in Orange Hoodie Using Laptop and Drinking Beverage` 的 640×960 本地预览成功解码，AI 标识、作者署名和 CC BY-NC-ND 4.0 的非商业、不可改作条件可见；从页面高清入口实际下载为 1024×1536 PNG、2,468,084 字节。截图为项目工作区上层的 `wallpaper-ayomi-laptop.png`。BudgetPixel 仍只是已核对公开许可与官方 API 规则的候选，尚无账户密钥或真实接口结果，不计入本站数量。本轮没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布。

2026-10-02 的漫画场景增量正式同步了十张 1920×1080 原始 PNG，合计 14,409,664 字节，逐张与作者素材包中的文件比较，字节与 SHA-256 均一致；OpenGameArt 合计从 47 张增至 57 张。新增十张 1280×720 WebP 预览共 925,262 字节。同轮 Ayomi 继续在既有请求预算内同步，新增 64 张竖屏 AI 插画，实际尺寸为 1024×1536 或 1920×2880，合计从 262 张增至 326 张；待处理队列从 126 个目录减至 106 个，目录数不代表图片数。其他九个来源和这两个来源的已有记录保持不变。

本轮新增 74 个预览并复用已有 800 个，合计 874 个文件、58,998,082 字节，无失败或待补预览。逐文件核对全部预览的尺寸、字节数、已有摘要和源文件与发布文件一致性，十张新增原图的发布字节及相关脚本、目录文件也一致。136 项测试通过，所加载模块行覆盖率 98.42%，新 7z 辅助模块、采集器及图源模块行覆盖率均为 100%；友好标题调整后另有 22 项图源及目录测试通过，Hexo 构建通过。真实 7z 测试覆盖原始字节保留、内容变更自动同步、文件筛选、损坏包、异常目录、大小上限和超时，外部网络在测试中模拟。

本机浏览器的二次元加 OpenGameArt 筛选显示十张漫画场景，全部本地预览成功解码；全图源二次元筛选当时显示 538 张，实际数量随 Commons 等实时目录与缓存变化。`黑白漫画场景 · 01` 的作者署名、CC0、1920×1080 原始尺寸及同站单图入口正确，从页面实际下载为 1,436,862 字节 PNG，SHA-256 为 `0ef477947fa90d6f541937a0624769e4e55862f44d290547cf7c68282bef600b`，与已验证原图一致。收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-manga-scenes.png`。本轮没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布，完整目标仍需扩大内容种类并验证线上自动更新；BudgetPixel 仍为待配置官方接口的候选，不计入本站数量。

2026-10-02 的日式场景增量由正式采集器收录三张水墨图和一张视觉小说办公室背景，原图合计 2,180,728 字节；逐张与作者独立文件或素材包中对应 PNG 的字节及 SHA-256 比较，均一致，OpenGameArt 合计从 57 张增至 61 张。四张 WebP 预览共 87,770 字节，水墨为 1280×720，办公室为 1280×618，均保留完整构图与原作比例。新增两件作品沿用现有作者身份、CC0、文件字段、请求限速、异常保留和原图缓存规则，默认每日构建包含它们，无需密钥或人工上传。

同轮 Ayomi 读取 30 个目录，新增 42 张实际尺寸为 1024×1536 或 1536×1024 的 AI 插画，其中竖屏 40、横屏 2，来源合计从 326 张增至 368 张。四个目录因分页信息不一致保留已有图片，其余目录继续处理；待处理队列从 106 个目录变为 90 个，目录数不代表图片数。两次同步完成后按来源更新时间合并目录，逐条核对这两个来源的所有旧记录及其他九个来源的目录、更新时间均保持不变，并保留 Ayomi 最新续传状态。

本轮新增 46 个预览并复用已有 874 个，合计 920 个文件、61,902,444 字节，无失败或待补预览。逐文件核对全部预览的尺寸、字节数、已有摘要及源文件与发布文件一致性，四张新增原图和五个相关脚本、目录文件的发布字节也一致。138 项测试通过，所加载模块行覆盖率 98.42%，OpenGameArt 采集器及图源模块行覆盖率均为 100%；目录合并后另行通过 24 项图源及目录测试，Hexo 构建通过。新增回归测试覆盖三个独立文件与中文场景名、作者及许可绑定、原始字节保留、素材包只提取背景、排除人物与工程文件以及许可撤回。

本机浏览器验证日式水墨搜索和极简分类均显示三张图片，实际本地预览全部成功解码；二次元加办公室搜索显示一张，作者 DasBilligeAlien、CC0、2484×1200 原始尺寸及单图入口正确。从页面实际下载的 PNG 为 839,909 字节，SHA-256 为 `da6e9bb9bce0957330d166ddb255033ed72d029247c6ccba9882dc3f67912ad1`，与作者原图一致。收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-office-scene.png`。浏览器全图库当时显示 1993–2001 张，差异来自 Commons 实时目录及缓存，不据此承诺固定数量。没有新增手机实机验收，也未推送或验证真实 Actions/Pages 发布；完整目标仍需扩大内容种类、提高各来源的预览覆盖率，并验证线上速度与定时更新。

2026-10-02 的预览覆盖增量实际生成 Pepper 全部 90 张和 Morevna 全部 26 张预览，新增 116 个 WebP 共 8,264,128 字节；复用其他来源已有 920 个文件，无失败或待处理项。本地预览达到十个来源、1036 个文件、70,166,572 字节，图库图片数量没有因生成预览而增加。逐文件核对全部预览的格式、尺寸、比例、字节数、已有摘要以及源文件与发布文件字节一致性，另核对五个前端脚本和目录文件的发布字节。144 项测试通过，所加载模块行覆盖率 98.45%，预览映射模块行与函数覆盖率均为 100%；新增测试验证未裁切原图、实际尺寸变化、错误格式、缓存摘要修复、每周重读、临时失败或零预算保留旧文件、修改时间变化及只清理管理文件。Hexo 构建通过。

2026-10-02 的 HDWallpapers 增量完整读取动漫分类 80 件作品后新增一张站方署名的 CC0 AI 壁纸。原始 JPEG 为 3840×2194、1,590,796 字节，SHA-256 为 `51843f7ddee09419e7d4a1b5873d019ce9fd1fac84ac5c2214d1773d975b2eb4`；等比例 WebP 预览为 1280×731、147,062 字节。已有 11 个来源的原始记录、更新时间与续传状态逐项确认未变化，官方目录合计 12 个来源、1061 张。预览生成新增一张、复用 1036 张，无失败或待处理项；全部 1037 个预览共 70,313,634 字节，格式、尺寸、比例、字节数、已有摘要及源文件与发布文件字节一致性核对通过。新原图的源文件、发布文件、研究样本与浏览器实际下载文件四份字节摘要相同，七个相关脚本和目录文件的发布字节一致。

本次全部 155 项测试通过，所加载模块行覆盖率 98.57%，新增前端图源和同步模块行覆盖率均为 100%；测试覆盖分页变化、混合大小写作品 URL、许可空白、通用条款不能充当逐图许可、原图版本变化、缓存丢失或损坏、作品下架、临时故障、429 / 503 冷却、实际像素与格式不符，以及本地原图生成预览。Hexo 构建通过。本机浏览器新图源筛选显示一张，完整预览成功解码，AI、作者、CC0 与原始尺寸可见；从页面实际下载上述原图，收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-hdwallpapers-anime.png`。这是本机 Node 24 的测试与本地浏览器验证，没有推送或验证真实 Node 22 Actions/Pages 发布；大型动漫图库与线上自动更新仍是剩余目标。

2026-10-02 的 WallColle 增量在提交 `dc3179f089c0c17284b49ff7d99ecc88b0bfd280` 实际收录 23 张：15 张 CC BY-NC 4.0、5 张 CC BY 4.0、2 张 CC BY-SA 4.0、1 张 Public domain。全部实际读取原图头部取得尺寸，另在预览阶段完整下载并核对每张原图的 Git blob SHA-1、真实解码尺寸与方向；超过像素上限的 St. Mary Lake 未收录。既有 12 个来源的记录、更新时间和续传状态逐项确认未变，官方目录合计 13 个来源、1084 张。新增 23 张等比例 WebP 共 2,528,770 字节，复用 1037 张，无失败或待处理项；全部 1060 个本地预览共 72,842,404 字节，格式、尺寸、比例、字节数与发布文件一致性核对通过，六个相关脚本和目录的发布字节一致。

本次全部 162 项测试通过，所加载模块行覆盖率 98.62%，仓库图源模块行与函数覆盖率均为 100%；新增测试覆盖贡献者命名空间、逐图许可、清单摘要、固定提交链接、缺失或超大原图、目录结构变化、许可撤回、临时失败保留、原图尺寸不符、缓存复用与仅清理管理文件。Hexo 构建通过。本机浏览器 AOSC 图源显示 23 张，全部本地预览成功解码；`Mountain Range` 的作者 Zhimin Lin、CC BY-NC 4.0 非商业条件与修改说明可见。从页面实际下载 JPEG 为 4608×3072、4,719,400 字节，Git blob SHA-1 为 `7c952bde1f313f3a5b0cc7c9bda61296a261be9c`，与已验证目录一致，SHA-256 为 `446d982ef6da34f32b15b5b4cd109f77151fbeb1833ae4719df0ebafcef5d584`。收藏刷新后恢复，测试收藏随后清理。截图为项目工作区上层的 `wallpaper-wallcolle-preview.png`。这批照片没有增加动漫内容；大型动漫图库、线上自动更新和手机实机体验仍未完成，没有推送或验证真实 Node 22 Actions/Pages 发布。

2026-10-02 的后续增量继续执行现有 Ayomi 续传，限定 40 次请求、每次间隔 1800 ms、最多读取 12 个目录；新增 14 张，Ayomi 从 368 增至 382 张，实际原图尺寸为 1024×1536 或 1536×1024。三个目录因结构不一致、超时或连接失败而保留已验证记录，预算耗尽后正常保存进度，待处理目录从 90 变为 83；目录数不能当作未收录图片数。其他 12 个图源的记录、更新时间，以及 OpenGameArt/HDWallpapers 续传状态逐项确认未变。官方目录合计 1098 张；新增 14 张作者原始预览共 748,572 字节，复用 1060 张，无失败或待处理预览项。全部 1074 个预览共 73,590,976 字节，已有摘要、格式、尺寸、字节数和全部发布文件一致性核对通过，五个相关脚本、HTML 与目录文件字节一致。

同时修复中文关键词搜索：改动前在 Ayomi 手机图筛选中搜索“猫耳”实际显示 0 张；改动后官方已验证目录中“猫耳”匹配 248 张，“狐耳”44 张，“猫耳 教室”7 张。全部 163 项测试通过，所加载模块行覆盖率 98.64%，测试覆盖中文别名、组合条件、英文及作者查询、单词边界、雨夜两个条件、带重音的 Café、不凭作者名字推断画面、空作者与特殊属性名。Hexo 构建通过。本机浏览器在 390×844 视口下验证双列图库没有横向溢出，中文组合搜索显示七张且全部预览成功解码；弹窗下载栏位于 y=774、宽 390、高 70，完整处于视口内。截图为项目工作区上层的 `wallpaper-chinese-search-mobile.png`，这是桌面浏览器的响应式视口验证，未新增手机实机验收。新增 `Blue Haired Neko Girl in White Robe Sits at Beach Sunset Scene` 的作者、AI 与 CC BY-NC-ND 4.0 条件可见，页面入口实际下载 PNG 为 1024×1536、1,829,368 字节，下载文件 SHA-256 为 `5364cf111aceafcf257d4550231523b74b94b8205165c494553f259136d1f472`。测试未新增收藏，浏览器已恢复默认视口；未推送或验证真实 Actions/Pages 发布。丰富高清动漫种类与线上每日更新仍是完整目标的剩余缺口。

本机浏览器验证 `Episode 38 The Healer landscape` 使用 1280×800 本地完整画面预览，原图为 4200×2625；此前官方目录缩略图为 900×400 的裁切版本。从页面实际下载作者 JPEG 为 2,181,409 字节、4200×2625，SHA-256 为 `3badaea591acb4069e07c6c5d3a6f6791cfb3cad37f038b1d2ac9aea578505db`。Morevna 的 `Inner Light` 使用 1024×846 本地预览，原图入口为 2169×1792；两站署名、CC BY 4.0、原图入口及预览修改说明均正确。截图分别为项目工作区上层的 `wallpaper-pepper-full-frame.png` 与 `wallpaper-morevna-preview.png`。Commons、Met 和克利夫兰仍依赖外站预览，不能把十个来源的缓存描述成全站离线可用。本轮未推送，也未验证真实 Actions/Pages、线上速度或手机实机。

2026-10-02 真实同步已收录 Commons 分类记录 875 条，按文件 ID 去重后为 862 张图片。各分类记录数为风景 498、城市 258、星空 100、动物 10、二次元 9，一张图片可以属于多个分类。城市分类在第六页之后遭遇 HTTP 429，已保存这些页面和续传游标；二次元分类本轮连接失败，保留已有目录。不能把未读取的后续页面计入图库，也不保证上游图片服务持续可用。新增恢复和分类合并逻辑后共 55 项测试通过；请求重试、正文超时、部分进度保存及游标续传有模拟测试，部分进度保存也已经在真实城市目录上验证。浏览器已验证 Commons 风景筛选为 498 张，与已验证的目录一致。仓库图片的首次同步和预览生成已实际执行。浏览器加载数量可能随艺术馆实时结果、已有缓存和加载失败而变化。
