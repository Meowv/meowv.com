# 仓库协作指南

## 适用范围与信息来源

本文件适用于根目录及 `blog/`、`studio/`、`wallpapers/`、`livewall/`。除 `wallpapers/README.md`、`livewall/README.md` 外，子项目不单独维护 `AGENTS.md` 或 `README.md`：

- 根目录 `README.md` 记录项目概览、环境、命令、端口和产物映射；`wallpapers/README.md` 记录采集器的 CLI、数据库和发布细节，`livewall/README.md` 记录 macOS 视频壁纸的定位、构建方式与实测基线。
- 本文件记录修改边界、项目约定、验证和交付要求。
- 实际脚本、`package.json`、锁文件与源码配置是可执行行为的最终依据；发现文档不一致时，应在任务范围内同步修正。
- 同一事实只在一处维护：需要重复提及时，另一处只写指针链接，不复述内容。新增或修改文档前先判断归属，避免两份文档各存一份副本后逐渐漂移。

四个目录是同一 Git 仓库中的独立项目，不是统一 workspace。执行命令前先进入目标目录，并使用该项目现有的包管理器、运行时和代码风格。`blog/`、`studio/` 是 Web 项目（Node/pnpm），`wallpapers/` 是 Python 项目，`livewall/` 是原生 Swift 项目，三者运行时互不相干。

## 通用协作原则

- 默认使用简体中文沟通；代码、命令、路径、API 名称和原始报错保持原文。
- 先确认任务所属项目，只修改明确范围内的文件；不顺带处理其他项目。
- 修改前检查工作区状态和相关差异，不覆盖、撤销或格式化用户已有的无关改动。
- 优先最小改动，复用相邻组件、工具函数、配置和实现模式，避免无关重构、重复实现和过度抽象。
- 注释只在有解释价值时添加，新增或修改的注释默认使用中文。
- 未经明确要求，不提交、不推送、不创建版本、不部署，也不修改生产环境。
- 新增生产依赖、外部服务、上传能力、远程转换、遥测或权限变更前，先说明必要性和影响并取得同意。

涉及链接、Canonical、Sitemap、分享信息或跨站导航时，保持以下线上地址：

- Blog：`https://meowv.com`
- Studio：`https://studio.meowv.com`
- Zitie：`https://studio.meowv.com/zitie/`

不得自行推断 `www` 跳转、证书覆盖、Nginx 路由或生产目录；部署前检查实际环境。

## 安全与清理

- 不输出或提交真实 API 密钥、令牌、密码、证书、个人文件内容或其他敏感信息；示例使用环境变量或明确占位符。
- 本机敏感配置包括根目录 `.deploy.env`（部署凭据）和 `.wallpaper-key`（壁纸加密密钥）。两者均不提交 Git，不要在源码、日志或文档中写入其内容，也不要引入新的密钥材料。
- 不提交 `node_modules/`、构建目录、测试报告、覆盖率目录、`*.tsbuildinfo`、`.DS_Store` 或 `.gitignore` 已排除的内容。
- 不提交 Wallpapers 的 `*.db`、`.venv/`、`__pycache__/`、`.pytest_cache/`，也不手工修改生成的 Studio 壁纸 catalog、bootstrap、manifest 或加密 `.bin` 文件。
- 清理前先区分源码、配置、依赖、缓存、构建产物和用户本地数据；列出拟删除目标及依据，不确定用途时先查引用和 Git 历史。
- 批量删除、覆盖重要文件、强制推送、改写历史、生产部署、远程资源删除等操作，执行前必须再次确认范围、影响和恢复方式。

下列内容由依赖安装、开发或构建过程生成，不应手工修改或提交（`.gitignore` 已逐项排除）：

- 通用：`node_modules/`、`.DS_Store`、根目录 `build/`、暂存目录与备份目录。
- Blog：`public/`、`db.json`。
- Studio：`dist/`、`dist/zitie/hanzi-data/`、`public/data/wallpapers.catalog.json`、`public/data/wallpapers.catalog.*.json`、`public/data/wallpapers.catalog.*.bin` 与 `public/data/livewall/`（整目录）。
- Wallpapers：`wallpapers.db`、Python 缓存和 `.venv/`。
- livewall：`build/` 与 `.build/`。

## 根目录脚本约定

- `run.sh` 和 `build.sh` 必须同时支持无参数、独占的 `all`、一个或多个项目参数，以及 `blog`/`b`、`studio`/`s`、`livewall`/`lw` 简写。
- `run.sh` 的 `wallpapers`/`w` 分支执行 Wallpapers CLI，默认子命令为 `crawl`；支持 `crawl`、`publish`、`stats`、`check`，其余参数原样传递。
- 固定开发端口为 Blog `4000`、Studio `4001`；Zitie 由 Studio 的 `/zitie/` 多页面入口提供，不另启端口。
- `run.sh` 并行启动多个项目，并统一处理退出；修改端口清理逻辑时，不得扩大终止进程的范围。
- `build.sh` 按参数顺序构建。全量构建必须全部成功后再替换 `build/`；指定项目构建只替换对应域名目录。
- 汇总目录固定为 `build/meowv.com/`、`build/studio.meowv.com/`、`build/livewall/`。Studio 产物包含 `dist/zitie/`；livewall 产物为 `build/livewall/LiveWall.app/`。
- 保持 macOS Bash 3.2 兼容性，不使用 `mapfile`、关联数组等 4.0+ 特性。Bash 3.2 在 `set -u` 下展开空数组会报 `unbound variable`，遍历前先使用 `${SELECTED_PROJECTS[*]:-}` 防护。
- 所有 shell 脚本中，变量后紧跟中文或全角字符时一律写成 `${VAR}`。非 `C` locale 下 bash 会把紧随其后的多字节字符首字节并入变量名（`$APP（` 被解析为变量名 `APP\xef`），`set -u` 下直接报 `unbound variable` 并使脚本中断。`LC_ALL=C` 的环境（例如某些沙箱）测不出这个问题，本地跑通不代表对用户的终端成立。
  **适用范围是仓库内所有 shell 脚本，包括 `livewall/` 等子项目** —— 标题里的「根目录」只是这一节所在的位置，不是适用范围。2026-09-18 新写的 `livewall/make-dmg.sh` 就因为按标题把它理解成「只管根目录」而漏掉这条、重新踩了一次（`$DMG_PATH（` / `$SIZE）` / `$APP_BUNDLE（` 三处）。**新写或改动脚本后跑一遍扫描器与多 locale 运行器**（技能 `shell-locale-safety` 里有：`scan_dollar_nonascii.py <目录>` 与 `run_under_locales.sh <脚本>`）—— `bash -n` 查不出这个问题。
- `build/`、暂存目录和备份目录均为可替换生成内容，不提交 Git。
- `build.sh wallpapers` 只生成并加密 Studio 壁纸目录，不构建项目；`./build.sh studio --with-wallpapers` 仅允许与 `studio` 一起使用，并在 Studio 构建前生成目录数据。两者都会同时生成供 livewall 使用的未加密清单目录 `studio/public/data/livewall/`，并同步到 `build/studio.meowv.com/data/livewall/`。
- `./build.sh livewall --with-dmg`（别名同样支持 `lw`）仅允许与 `livewall` 一起使用：在 `.app` 打完后跑 `livewall/make-dmg.sh --no-build`。`build/livewall/` **只放 `LiveWall.app`**；DMG 与 `version.json` 由 `install_livewall_update_feed` 在**发布之后**写进 `build/studio.meowv.com/data/livewall/` —— 客户端的 `fileURL` 指向 `https://studio.meowv.com/data/livewall/`，而 `deploy.sh` 只上传 `build/studio.meowv.com/`，放 `build/livewall/` 等于发不出去。
  - 版本号、文件名、sha256、fileURL 全部由 `make-dmg.sh` 从 `Info.plist` 生成，根目录 `build.sh` 只搬运（清旧 → 拷贝 → 核一遍 `version.json` 的 `fileURL` 与 dmg 文件名一致），**不另生成一份**。
  - 两条坑：① DMG 必须在 `publish_*` **之后**才装，否则会被整体替换掉的目录覆盖；② 清 `build/studio.meowv.com/data/livewall/` 时只能删 `catalog.json` / `category.*.json`，`version.json` 是分发产物不能跟着删。
  - 只跑 `./build.sh studio` 也不会丢分发产物：`preserve_livewall_update_feed` 在 studio 产物拷进暂存区**之后**，把现有 `data/livewall/` 里的 dmg 与 `version.json` 一起带过去（顺序反了会被 `cp -R` 覆盖）。带 `--with-dmg` 时不冲突 —— `install_livewall_update_feed` 稍后清掉旧 dmg 再放新的。
- 修改脚本时，同步检查参数帮助、项目数组、别名、端口、依赖检查、启动或构建分支、源目录和目标目录，避免只更新其中一处。

## Blog 约定

### 代码结构

- `source/_posts/`：文章。
- `source/_data/`：站点共享数据。
- `source/tools/<slug>/index.md`：Labs 工具入口页。
- `themes/hexo-theme-matery/layout/`：EJS 模板。
- `themes/hexo-theme-matery/source/`：主题 CSS、JavaScript、图片和第三方资源。
- `source/games/`：跳过 Hexo 渲染的独立静态应用。

### 约定与验证

- 常规 Labs 工具应同时维护入口 Markdown、同名 EJS 模板和 `source/_data/tools.json` 注册项。工具 slug 与文件名使用小写短横线。
- 修改文章、Front Matter、主题配置或模板时，检查 YAML、JSON、EJS 语法及生成后的目标页面。
- 交互工具还应检查桌面端、移动端、控制台和异常路径。

## Studio 约定

### 代码结构

- `src/features/`：按能力划分的功能模块。
- `src/pages/`、`src/layouts/`、`src/router/`：页面、应用壳和路由。
- `src/components/`、`src/composables/`：共享组件和组合式逻辑。
- `src/core/`：浏览器、本地隐私和通用基础能力。
- `src/assets/`、`public/`：样式和静态资源。
- `src/features/zitie/`：独立 React 字帖应用的组件、配置、Canvas、字体和导出逻辑。
- `zitie.html`：Zitie 所有页面共用的唯一 HTML 源模板。
- `public/zitie/`：Zitie 字体、Logo、图标等静态资源。

### 编码与运行约定

- 使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。
- 首页不得预加载重型编辑器或 WASM。
- 文件打开、新建、保存和销毁必须经过统一的文件交接入口（`src/composables/useFileLauncher.ts` 与 `src/core/browser/file-handoff.ts`），不要在页面内自行判断格式或跳转。
- 需要串行化的渲染与保存必须排队执行，不要引入并行：Mermaid 任务统一走 `src/core/mermaid/scheduler.ts` 的 `enqueueMermaidTask`；绘图保存与书籍渲染各自维护 Promise 链。
- 用户文件、图片和附件不得上传，也不得写入 Cookie、日志或远程数据库。涉及文件系统、导出、Worker 或对象 URL 时，保留现有的授权、取消和资源释放处理。
- 壁纸页的桌面 App 推广位（`src/features/wallpapers/app-promo/`）在运行时读取同域 `data/livewall/version.json` 获取版本与安装包地址；`livewall-meta.ts` 的 `LIVEWALL_FALLBACK_VERSION` 是拉取失败时的静态兜底，**livewall 发版后必须同步更新**（兜底下载地址由该常量派生，不手写完整 URL，以防版本与地址漂移）。

### Zitie 约定

- 使用 React 18 函数组件和严格 TypeScript，遵循 Studio 的 Prettier 规则、PascalCase 组件和 camelCase 函数命名。
- Zitie 的 HTML 只加载 Zitie React 入口和 CSS，不加载 Vue、`StudioShell` 或 Studio CSS；不要将 `/zitie` 注册到 Vue Router。
- pathname、练习模式和页面元数据统一维护在 `src/features/zitie/routes.ts`。
- 开发时由 Vite 中间件从单一 HTML 模板响应各页面，构建时再生成目录式 HTML；不要为每条路由复制相同的源 HTML。
- 笔顺数据在开发时直接从 `hanzi-writer-data` 响应，构建时复制到 `dist/zitie/hanzi-data/`；不要生成或提交 `public/zitie/hanzi-data/`。
- 涉及分页、Canvas、字体、打印或导出时，验证应覆盖多页、PNG/PDF/ZIP 导出、打印、窄屏布局和资源路径。

## Wallpapers 约定

### 代码结构

- `src/wallpapers/cli.py`：CLI 参数与命令分发。
- `src/wallpapers/config.py`：数据源配置与运行常量。
- `src/wallpapers/models.py`：`CategoryData`、`AssetData`、`WallpaperData` 等领域模型。
- `src/wallpapers/normalize.py`：接口返回值到内部字段的规范化（URL、尺寸、标签）。
- `src/wallpapers/pipeline.py`：公开接口抓取、增量游标和资源校验流程。
- `src/wallpapers/db.py`：SQLite 初始化、兼容迁移和查询。
- `src/wallpapers/publish.py`：从 SQLite 生成 Studio catalog、bootstrap 和 manifest。
- `src/wallpapers/export.py`：从 SQLite 导出供 `livewall/` 使用的明文壁纸清单目录（不加密）——`catalog.json` 索引（分类清单 + 默认分类，**不含条目**）+ 按一级分类拆分的 `category.<id>.json` 切片。旧版单文件 `livewall.json` 与上一版含全量条目的「总文件」都已废弃，不要再把条目塞回索引。
- `src/wallpapers/sources/`：各公开接口适配器（`base.py` 提供 `HttpClient` 与 `SourceError`，另有 `desktop.py`、`mobile.py`、`manifest.py`）。
- `tests/`：数据库、规范化、抓取流程、接口适配和发布逻辑测试。

### 约定与验证

- 使用 Python `>= 3.12`。项目无运行时第三方依赖，仅使用标准库；测试依赖按 `pyproject.toml` 的 `[test]` extra 安装。
- 默认数据库为 `wallpapers/wallpapers.db`，该文件属于本地数据，不提交 Git。
- 采集器只访问公开接口并保存元数据和 CDN 地址，不登录、不读取 Cookie、不下载媒体文件，也不绕过付费或权限校验。新增接口、字段或抓取范围时，保持 `device_type`、`content_type`、资源角色和 UTC 时间字段的既有约定。
- `publish` 生成的 JSON 仅作为加密前的临时目录；部署目录必须经 `studio/scripts/encrypt-wallpaper.mjs` 处理，使用现有 AES-256-GCM 版本化 `.bin` 格式，并保留 manifest 中的加密版本和文件大小信息。不要在源码、日志或文档中写入新的密钥材料。
- 修改采集、数据库或发布逻辑时，优先运行 `cd wallpapers && pytest`；修改加密脚本时，至少执行 `node --check studio/scripts/encrypt-wallpaper.mjs`，并检查 manifest、旧版本文件清理和 `.bin` 输出。

## livewall 约定

macOS 视频动态壁纸工具。定位是个人自用 / 小范围共享，不面向大规模公开发布，因此没有用户系统、后端服务、多租户或权限体系。

### 代码结构

- `Package.swift`：SwiftPM 清单，声明三个 target：`LiveWallCore`（纯逻辑库）、`LiveWallDesktop`（依赖 AppKit 的桌面层代码）、`LiveWall`（正式 App），外加 `LiveWallCoreTests` 测试运行器。
- `Sources/LiveWallCore/`：不依赖 `NSApplication` 的纯逻辑，可脱离 GUI 单测。层级预设、清单模型与降级链、**同步取数（`SynchronousFetch`，清单与更新共用：锁保护结果 + 超时必取消 + 会话可注入）**、候选池、选片顺序、调度策略与切换间隔、时长文案、日志轮转阈值与判定、省电信号与状态判定、遮挡覆盖率、多屏策略、内容过滤、配置模型、版本检查（远程信息解析、三态判定、菜单文案与显隐状态机）都在这里；P10 之后另有「固定」状态机（`PinnedPlayback`）、选片顺序子菜单的行（`PlaybackOrderMenu`）、缩略图地址拼装与请求去重（`ThumbnailURL` / `ThumbnailRequestTracker`）。**新写的逻辑优先放这里**，这样才测得到。
- `Sources/LiveWallDesktop/`：依赖 AppKit 的桌面层代码 —— 桌面层覆盖窗口、窗口层级探测、遮挡检测。
- `Sources/LiveWall/`：正式 App。菜单栏常驻，负责编排（清单、调度、失败处理、菜单栏、系统事件）。省电信号的采集在 `PlaybackGovernor.swift`，播放器的暂停与恢复只在 `AppDelegate.applyPlaybackState` 一处发生；全局热键在 `HotKeyManager.swift`，开机自启在 `LaunchAtLogin.swift`。动态壁纸浏览窗口在 `WallpaperBrowserWindowController.swift` / `WallpaperBrowserViewController.swift`（配套 `BrowserItemView.swift` / `ThumbnailLoader.swift` / `PreviewPlayer.swift`）—— 这是本项目**唯一**允许的普通 UI 窗口，两栏（分类 / 网格）+ 双击打开的预览浮层。
- `Tests/LiveWallCoreTests/`：测试用例与自建断言运行器（`Harness.swift`）。
- `build.sh`：编译并组装 `.app`。`test.sh`：跑测试。`run.sh`：运行正式 App。
- `Resources/Info-LiveWall.plist`：App 的 `LSUIElement=true`（菜单栏常驻，不占 Dock）。

### 约定与验证

- 使用 Swift，**只需要 Command Line Tools，不需要 Xcode**，也不依赖 Node/pnpm。本机因此**没有 XCTest**（`unable to resolve module dependency: 'XCTest'`），测试用 `executableTarget` + 自建断言运行器实现，见 `Package.swift` 顶部说明。不要改成 `testTarget`，那会直接编译失败。
- 构建与运行可直接走 `livewall/build.sh`、`livewall/test.sh`、`livewall/run.sh`、`livewall/make-dmg.sh`（打包 DMG），也可从根目录执行 `./build.sh livewall` / `./run.sh livewall`。根目录脚本只把 App 汇总到 `build/livewall/`，`deploy.sh` 不上传该目录。注意 `livewall/run.sh` 与根目录 `run.sh` **同名不同物**，前者负责 App 自己的 debug/release 构建与运行。
- **`version.json` 必须与它的签名 `version.json.sig` 成对出现、同一次上传**（`make-dmg.sh` 生成清单后立刻用本机私钥签名，根 `build.sh` 搬运时缺签名会直接中止）。客户端**没有「验签不过就退回只看 sha256」这条路** —— 那种降级等于没做：攻击者删掉签名文件即可绕过。反向的坑同样致命：客户端只认验签通过的清单，**漏传 `.sig` 的表现是「用户永远看不到更新」，与「线上没发新版」的症状一模一样**，没有任何别的信号，排障会往完全错误的方向走（先怀疑版本号没递增）。私钥在 `~/.livewall-signing/version-key.txt`（仓库外，权限 600），**换密钥等于所有已发布客户端都验不过新签名，必须重新发版**。签名覆盖的是清单的**原始字节**，所以发布时不要重新格式化 `version.json`（改缩进、调键顺序、加删尾随换行都会让签名失效）。细节与发版对账命令见 `livewall/README.md` 的「更新清单签名」。**`make-dmg.sh` 会在打包前校验 `CFBundleVersion` 相对上次产物（`build/studio.meowv.com/data/livewall/version.json` 或 `build/version.json`）已递增，不递增直接中止** —— 客户端只认它，忘了加就永远不提示，而症状与「线上没发新版」无法区分。
- **本目录的 shell 脚本同样适用「变量后紧跟中文一律写 `${VAR}`」**（规则在「根目录脚本约定」里，但**适用于全仓库脚本**）。新写或改动脚本后跑一次技能 `shell-locale-safety` 的扫描器：`livewall/make-dmg.sh` 首次提交时就带了三处致命项（`$DMG_PATH（` 等），只有 `LC_ALL=C` 的沙箱掩盖了它。
- **构建配置分界：`build.sh` 默认 release（发布版），`run.sh` 默认 debug（开发版，`--release` 可切到发布版）。** 开发者工具用 `#if DEBUG` 隔离，release 构建里不参与编译 —— 目前是菜单里的「打印窗口层级表」，连同 `WindowInspector.printTable` 和它专用的三个文本对齐转发函数。改默认配置或搬动这段代码前，先确认 release 二进制里搜不到该字符串。
- 修改纯逻辑后优先运行 `cd livewall && ./test.sh`；修改窗口层级、播放或窗口生命周期逻辑后必须真机跑一次 App 验证（会短暂占用桌面）。**修改浏览窗口（`WallpaperBrowser*`）后必须人工点一次** —— 探针能验数据与布局、连「双击」都能造 `NSEvent` 验，但验不了真机点击的手感、预览播放的实际观感，以及「关窗不影响桌面播放」。
- **新增测试文件必须同时在 `Tests/LiveWallCoreTests/main.swift` 里加一行调用**：运行器是按**函数名**手工登记的，漏登记时编译通过、测试全绿，而那个文件一行都不跑。`./test.sh` 现在会做这个自检并直接失败（按函数名比对，所以一个文件里定义两个测试函数是允许的）。**测试项数不要写进文档** —— 会漂移，跑 `./test.sh` 看实际值。
- **受限环境（沙箱 / CI）里跑构建或测试**：SwiftPM 自己的 `sandbox-exec` 会嵌套失败（`sandbox_apply: Operation not permitted`）。用 `SWIFT_BUILD_FLAGS="--disable-sandbox --manifest-cache none" ./build.sh`（`./test.sh` 同样支持）绕过。默认**不加** —— 正常环境该保留沙箱保护。
- **`swift build --product LiveWall` 在本机出现过一次「报 `Build complete! (0.24秒)` 却未真正重编」**（`touch` 后仍是 0.24 秒，删掉 `.build/out/Intermediates.noindex/LiveWall.build` 后 `grep` 不到任何输出）。**原因仍未查清**（怀疑是增量构建缓存指纹判断异常，可能是 CLT 版本差异）。但**加 `--disable-sandbox --manifest-cache none` 之后的构建可核实为真实**：编译耗时 14 秒量级、产物时间戳随之后移、二进制里能按字节搜到新字符串 —— 三重佐证。改完 `Sources/LiveWall/` 下的代码后 `touch Sources/LiveWall/*.swift` 强制一次再核对产物时间戳；要确认**代码本身**正确就用 `swiftc` 直接编译真源码做一次性探针，它绕开 SwiftPM 的增量缓存。
- **验证「新代码真的进了产物」用二进制字节扫描，但探针必须选 UTF-8 长度 > 15 字节的字符串**。release 下 Swift 走**小字符串优化**，≤ 15 字节的字面量被内联成立即数、不作为连续字节落在数据段 → 搜不到，会得到**假阴性**（实测 `解除固定：` 15B、`无预览图` 12B 在 release 里都找不到，换成 24B 的 `用户主动恢复轮换` 就找得到）。所以「搜不到」必须配 **debug 二进制对照**（debug 不内联，同批字符串全部找得到）才能下结论 —— 尤其验 `#if DEBUG` 隔离时：`打印窗口层级表`（21B）在 release 搜不到、在 debug 搜得到，后半句才是排除「搜索方法失效」的关键对照。另外 `codesign` 会改写 Mach-O，**包内二进制与 `.build/` 里的哈希必然不同**，只能靠搜字符串比对。
- **菜单里「检查更新 / 有新版本」的显隐只由 `UpdateState` 一处驱动**（`LiveWallCore/UpdateState.swift`），写入口只有 `AppDelegate.setUpdateState`（幂等）。不要再新增 `hasUpdate` / `isCheckingUpdate` 之类的布尔量 —— 两个独立开关能组合出菜单上不存在的状态。状态表与切换条件见 `livewall/README.md` 的「菜单显隐」小节。更新段的**位置**在「关于动态壁纸」子菜单里、紧贴「当前版本」那一行 —— 由 `AboutMenu.Entry.updateSection` 占位决定（顺序可单测，具体内容由 `UpdateState` 决定、由 `AppDelegate` 填），不要挪回主菜单。
- **状态区附注分两种生命周期（`AppDelegate.Notice.isOneShot`）**：默认常驻（留到被下一个事件覆盖），「用户点了某个菜单项」的应答一律一次性 —— **展示过之后**菜单收起即作废。两个硬约束：①作废时必须重建菜单（`item.menu` 持有的是上次构建的对象，只清字段的话下次展开还是旧的）；②必须是「展示过之后」（`noticeShown`），否则结果在菜单展开期回来时会把还没显示过的最终回执清掉。真异常不能用一次性，否则用户隔很久才打开菜单就整段漏掉。
- **窗口层级值只能由 `CGWindowLevelForKey` 派生**，禁止硬编码魔数；不同 macOS 版本的实际值不同。层级必须落在「系统壁纸之上、桌面图标之下」的开区间内。
- 识别系统壁纸窗口时**不能用宽松子串匹配**（`contains("wallpaper")` 会把第三方壁纸软件误判成系统壁纸）；系统壁纸进程名会随系统语言本地化，中文系统下是「墙纸」。
- 必须保留同层竞争检测：第三方壁纸软件可能占用同一层级，同层前后顺序由 WindowServer 决定，不由本程序控制。
- 壁纸必须静音，且 `preventsDisplaySleepDuringVideoPlayback = false`；覆盖窗口必须 `ignoresMouseEvents = true`，否则桌面右键、框选、拖文件全部失效。
- **覆盖窗口必须在 `applicationDidFinishLaunching` 里同步创建**，不能推迟到 `asyncAfter`。实测推迟后窗口会被系统加上对称边距（1512×982 的屏幕拿到 `9,5 1494x972`），「覆盖整屏」判定失败并触发无意义的层级降级。
- **层级判定不能紧跟在建窗口之后**：`orderFrontRegardless()` 是异步的，立刻查窗口列表会查不到自己的窗口。必须等窗口上屏（`ScreenCoordinator.waitForWindowsToAppear`）。
- 视频源与清单都来自同仓库 `wallpapers/` 项目的 `export-livewall` 子命令。**清单没有本地一层**：输出目录是 `studio/public/data/livewall/`，里面是**索引 + 按分类切片**两个角色 —— `catalog.json`（**纯索引**：分类清单 + 默认分类，**不含条目**，901 字节）与 `category.<一级分类 id>.json`（每个分类的条目）。随 Studio 一起部署，客户端在运行时从 `https://studio.meowv.com/data/livewall/` 下按需拉取，断网时各自回退本地副本（Application Support 下 `catalog.remote-cache.index.json` / `catalog.remote-cache.slice.json`）。仓库内不保存清单副本，也不要再往 `livewall/data/` 写。清单结构改动需与 `wallpapers/src/wallpapers/export.py` 同步。**旧版单文件 `livewall.json` 与上一版的「总文件」（含全量条目的 4.9 MB `catalog.json`）都已废弃，不要再把条目塞回索引。** 条目字段**新增一律不升 `schemaVersion`**：客户端用 `decodeIfPresent` 容错，升版本会让老客户端撞上 `unsupportedSchema` 直接拒绝加载整份清单 —— `coverUrl`（静态图地址，供锁屏预览与「下载当前壁纸」用）就是这么加的，它只影响分类切片的体积，索引仍是 901 字节。
- **索引必须保持「不含条目」**。`catalog.json` 是启动时唯一必拉的文件，只有几百字节；条目一律按分类单独拉。谁把 `items` 加回索引，启动就会退回「一次下全量」（实测 4.9 MB），这个改造就白做了 —— `test_index_has_no_items` 专门锁这条。
- **切分类是异步拉一个文件**，因此有两件必须处理的事：① 递增的请求序号，回包时比对丢弃过期结果（否则「点了 B，画面却停在 A」）；② 失败时保持当前画面**与当前勾选** —— 选中项只在拉取成功后才写回配置。`selectedCategoryID` 的语义是「池子里装的是哪个分类」，不是「用户点了哪个」。
- **分类文件名来自远端，不能照着它发请求**。`LivewallCategoryEntry.resolvedFileURL(relativeTo:)` 只接受纯文件名（不含 `/`、`\`、`:`，不是 `.`/`..`，以 `.json` 结尾）并校验 host/scheme 与索引一致 —— 否则远端改一个字段就能把客户端请求指到任意地址。
- **失败分类不能靠解析错误文本**。实测 AVFoundation 对 404 的本地化描述是「在此服务器上找不到所请求的URL。」，不含任何数字状态码。`VideoLoader` 必须在播放前做一次 HEAD 探测拿真实状态码，交给 `FailurePolicy.classify(httpStatus:)` 分类。
- **网络类失败绝不拉黑**。一次断网会把整池好资源丢进黑名单。`FailurePolicy.action` 的判定顺序是硬约束：先看是否已达连续失败阈值 → 再看网络可达性 → 再看是否可重试 → 最后才拉黑。改动顺序会破坏这个保证。
- **同一个程序只允许跑一个实例，判据是 `flock` 而不是 PID 文件**（2026-09-21 加，起因是发现打包版与 `./run.sh` 的开发版同时在跑）。`run.sh` 是 `exec` 可执行文件，**绕过 LaunchServices 的「同 bundle id 复用已有实例」**（那条只对 Finder 双击 / `open -a` 生效），而两者身份完全相同（bundle id 都是 `com.meowv.livewall`）→ 会互相覆盖 `config.json`、改写**唯一一份**分类切片缓存（离线兜底语义直接失效）、互相抹掉日志（轮转是截断为 0 字节）、抢同一窗口层级与同一组全局热键（Carbon 进程独占，后启动的**静默失效**）。实现要点：① 身份 = `bundle id ?? exe-<可执行文件名>`，锁文件 `instance-<身份>.lock`；② 取锁必须在 **`main.swift` 里 `NSApplication` 之前**（建窗口 / 注册热键 / 写配置都有副作用）；③ **锁不可用时照常启动**（只记一行「本次不设防」）—— 锁是防误操作，不该让 App 起不来；④ 被挡掉时三条回执都要有：stdout（`run.sh` 是前台 `exec`）、日志（可能从 Finder/登录项启动）、`DistributedNotificationCenter` 通知老实例在状态区显示一句（否则「第二次点了没反应」会被当成坏了）；⑤ 开发豁免只认 `LIVEWALL_ALLOW_MULTIPLE` 的**明确真值**（`1/true/yes/on`），写错不豁免；`run.sh --allow-multiple` 是它的入口。**路径与日志格式必须收敛到 `LiveWallPaths` / `AppLog`**：启动早期（`main.swift`）也要写同一份日志与锁，各写一份路径等于埋「改了一处、另一处没改」的坑。**`pkill -x LiveWall` 按可执行文件名匹配，豁免多开时会一次全杀** —— 文档里点到这条。
- **非隔离 `async` 函数里不要直接碰共享的可变集合**（2026-09-21 真机崩溃后定位）。`AppDelegate.loadVideo` 没有 `@MainActor` 标注，它的函数体跑在**协作线程池**上（既不是主线程，也不是调用方所在的 actor）；而「每屏独立」模式下两个槽位会同时取片 —— 对 `sharedVideoLoads` 这张 `Dictionary` 的并发读写会写坏它的存储指针并**直接崩**，症状是 `Dictionary._Variant.setValue` 里 `-[NSTaggedPointerString count]: unrecognized selector sent to instance 0x8000…`，**完全不像竞态**（栈顶只有 `libswiftCore` 的集合帧）。现在这张表的读 / 写 / 清空一律走 `takeSharedLoad` / `releaseSharedLoad` / `drainSharedLoads` 三个辅助函数：**检查与插入必须在同一把锁里**（分开做会让两个槽位同时未命中、同一条视频被并发拉两遍，等于去重失效），**取消任务要放在锁外**。以后在这个文件里新增 `async` 函数时，先问一句「函数体会在哪个线程上跑、它碰的集合还有谁在碰」。
- **一个视频只建一个 `AVURLAsset`**。每个 asset 都会把整个文件拉一遍，元数据校验与播放各建一个就是双倍流量（实测 6.28MB → 12.55MB）。播放时用 `AVPlayerItem(asset:)` 复用 `VideoLoader` 建好的那个。
- **不做本地视频缓存**。实测 `AVPlayerLooper` 一次下载后不再产生流量，洗牌模式下每条候选约 9 天才轮到一次，LRU 缓存永远命中不了。断网兜底靠「保持当前画面」而不是靠缓存。
- **省电判定必须是纯函数**。`PlaybackStateResolver.resolve(_:)` 在 `LiveWallCore`，只吃 `PlaybackSignals` 吐 `PlaybackState`，不做任何系统调用；采集在 `PlaybackGovernor`。判定优先级顺序（手动暂停 > 锁屏 > 息屏 > 遮挡 > 热压力 > 空闲 > 低电量 > 电池）是硬约束，改动前先看代码里的理由注释。
- **播放器的暂停与恢复只能在一个地方发生**（`AppDelegate.applyPlaybackState`）。系统通知只负责更新 governor 的信号，绝不直接碰播放器 —— 多路信号各改一次会互相打架。
- **`VideoLoader.load` 是异步的，加载完成后必须重新核对状态**。否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。`advance()` 开头的状态守卫同理，它挡住的是网络恢复之类的旁路触发。
- **每屏独立的失败计数必须按槽位分开**。`failuresBySlot` / `retriesBySlot` 是字典而不是单个计数器：副屏挂掉就把主屏也停掉，等于把「某一块屏的问题」放大成「壁纸没了」。只有**全部**槽位都失败才 `stopScheduling`。
- **只有主槽位排调度定时器**。多个槽位各排一个会互相覆盖 `scheduleTimer`，切换节奏会变成「最后一个加载完的说了算」。
- **遍历字典时不要改字典**。`PlaybackEngine.useSlots` 里删槽位、`AppDelegate` 里清 `namesBySlot` 都要先 `filter` 出数组再删 —— Swift 在 `Dictionary was mutated while being iterated` 上是直接崩，不是警告。
- **遮挡检测不要退回网格采样或 bbox**。网格采样会漏掉窄缝（20px 的缝比 63px 的网格还窄，实测报告「覆盖 100%」），union + bounding box 会把两个并排的半屏窗口误判成完全遮挡。现行实现是 `CoverageGrid` 的坐标压缩法，算精确面积；`legacyBoundingBoxCovers` 只留给测试做对比证据。
- **`Preferences` 必须保持逐字段容错解码**。Swift 合成的 `Codable` **不会**回退到属性默认值 —— 缺字段直接抛 `keyNotFound`，会让用户已有的 `config.json` 整体解码失败并静默丢配置。新增字段时同步补 `CodingKeys`、`init(from:)` 与往返测试。**枚举字段还要额外用 `try?` 包一层**：键在但取值非法（手改配置写错，如 `"playbackOrder": "random"`）会抛 `dataCorrupted`，后果与缺字段完全一样 —— 整个文件退回默认，用户的其它设置一起被静默清零。
- **两种选片顺序都必须「走完一轮才重排，一轮内不重复」**（`CandidatePool.order`：`shuffle` 每轮重洗 / `sequential` 按清单原序）。随机模式靠「洗牌前排除当前项」避免连着重复；顺序模式**不能沿用这一招** —— 每轮都会少一条尾巴，实际序列会退化成 `A…Z → A…Y → A…X`，看起来像漏播，正确做法是只在新一轮首条恰好等于当前项时向后让一位。**换分类或重载清单都会清空待取队列**（等于重新开始一轮），但**黑名单不清**。候选池自己不做任何过滤 —— 候选集由调用方切好再 `setItems` 灌入。
- **「固定」不是第三种 `PlaybackOrder`**。`CandidatePool.next()` 完全不读 `order`，`refill()` 里 `order` 的分支是非穷举 `if` —— 给 `PlaybackOrder` 加第三个 case 之后 `next()` 照常取片、`refill()` 静默落到「按 source 原序」，**固定根本拦不住**，而三个穷举 switch 还会先编译报错。固定是**正交于选片顺序**的一层状态，由 `AppDelegate` 在候选池**之上**拦截（`LiveWallCore/PinnedPlayback` 把「驱动事件 + 是否固定」映射成裁决，`PinDriveEvent` 是穷举的 —— 新增旁路驱动点必须去那里加 case，这样「漏了一个旁路」会变成编译错误或测试失败，而不是画面被悄悄换走）。`order` 因此仍然只有两个值、只有一个含义（解钉后恢复哪个顺序）。「固定」在菜单里是**派生显示**：`pinnedItem != nil` 时勾选落在固定行上、随机/顺序两行**都不勾**，父项标题变 `选片顺序（固定）`，**不另存任何布尔量**。**解钉只有三个触发点**：菜单「下一张」（含 `⌥⌘N` 热键）、选片顺序里点「随机」或「顺序」、固定项被判失效（拉黑）。**浏览窗口里刻意没有「取消固定」按钮**，它只标记当前项。
- **固定的落点是 `Preferences.pinnedItem`，存整条而不是 id**。只存 id 就必须靠「当前分类切片」定位它，而切分类**不解钉**（用户可以在固定之后换分类继续浏览），重启时 `selectedCategoryID` 已经是另一个分类、切片里找不到这个 id → **固定被丢掉**。存整条之后**定位**固定项不再依赖任何切片；但**「能定位」不等于「一定能开播」** —— 启动时槽位的铺满发生在 `applySliceResult` 里（与轮换共用同一条启动路径），索引或切片都取不到时固定项也不会开播，那种情况下轮换同样播不了任何东西，**不存在「固定特有的黑屏」**。固定态下**所有屏**铺同一条（`applyPinToMissingSlots`，幂等），定时器停排，`persistScreenSources` 也停写（每屏源记忆是轮换的产物）。`advance()` 在固定态下仍会被调用，但能走到那里的只剩**恢复类**请求，所以那一路用 `force` 重拉而不是短路跳过 —— 槽位里挂着的固定项正是失败的那条，不重拉就永远卡在坏状态上。
- **切换间隔的单位是秒，合法区间由 `SwitchInterval` 夹紧（10 秒 – 24 小时）**，写法是「夹到最近的合法值」而不是退回默认，非有限值才退回 `SchedulePolicy.defaultIntervalSeconds`。注意非正数间隔**不等于**「播完即切」——后者要显式开 `switchWhenFinished`。改完间隔要立即重排下一次切换（否则用户盯着看毫无变化，会以为没点上），但「正在等网络恢复」和「当前暂停」两种状态下不要插队。
- **全局热键用 Carbon `RegisterEventHotKey`，不要换成 `NSEvent.addGlobalMonitorForEvents`** —— 后者需要「辅助功能」授权，会弹窗且要重启 App。代价是热键会**抢占**该组合，所以只挑不常用的 `⌥⌘` 组合，并且**注册失败必须显式提示**：重复注册同一组合返回 `eventHotKeyExistsErr`（-9878），据此区分「被占用」与「其它失败」。
- **菜单项的快捷键提示写进标题，不要设 `keyEquivalent`**。设了会让菜单打开时全局热键与菜单项各触发一次，切换类操作执行两遍等于互相抵消。
- **带 target/action 的菜单项，可用性只能写进 `validateMenuItem(_:)`**（`AppDelegate` 末尾的 `NSMenuItemValidation` 扩展），`buildXxxMenu` 里**不要再写 `isEnabled`**。原因：`NSMenu.autoenablesItems` 默认 `true`，展开菜单时 AppKit 会重新校验这类项；没实现 `NSMenuItemValidation` 时判定退化成「target 能不能响应 action」→ 手写的 `isEnabled = false` **被静默覆盖成 true**，症状是「菜单项看着能点、点了没反应」（2026-09-21 星哥实测发现「打开动态壁纸」没置灰）。`action: nil` 的说明行不受影响（target 为 nil，不被校验），仍在构建时置灰。这条同时修好了另外五处此前一直没生效的置灰：下载当前壁纸、固定、0 条分类、空闲阈值、检查更新。判据尽量复用已单测的纯函数（`WallpaperSourceMenu.isEnabled(_:isLocalSource:)`、`CategoryMenu.entries`、`canPinCurrent`），不要在这里另写一份规则。
- **菜单状态区的「片名」与「附注」必须是两个字段，且附注要分信息 / 警告两级**。共用一个字段时失败信息会顶掉片名，用户看不到正在循环的是哪张，会误读成「壁纸掉了」；而附注既承载真异常（候选池耗尽、保持当前画面），也承载操作回执（窗口层级切换成功、开机自启已开启），**前缀 `⚠` 只能加在警告级上** —— 给回执加警告符号会让人以为操作失败。菜单是「状态 → 播放控制 → 设置 → 维护 → 关于」五段，插入新项时归到对应段，不要打散同类（**没有「退出」段**：状态项常驻，退出走 `pkill -x LiveWall`）。**菜单父项的括号里只放「值」**：`多屏策略（全部同片）`、`开机自启（未开启）`、`切换间隔（5 分钟）`、`选片顺序（随机）`、`内容过滤（美女）`。**不要写「当前 xxx」**（括号里本来就是当前值，加这两个字纯冗余），**更不要套括号** —— 曾经出现过 `随机模式（当前 随机（每轮重新洗牌））` 这种三层嵌套，说明写进子菜单的选项标题里就够了。
- **作者信息与赞助入口只在 `LiveWallCore/AboutMenu` 维护一份**（作者名、博客地址、赞助入口 URL、条目顺序与禁用行），`AppDelegate.buildAboutMenu()` 只负责把数据翻译成 `NSMenuItem` —— 与 `buildCategoryMenu` 同一分工，那样才测得到。**赞助指向 studio 首页**（`https://studio.meowv.com`），二维码在那边页脚的弹窗里；客户端不存二维码、也不做 App 内二维码弹窗。**这条结论没变，但理由在 P10 换了**：原先写的是「那会是本项目第一个普通 UI 窗口，还要在 `LSUIElement` 下自己处理激活、焦点与关闭行为」—— 这套成本**已经在浏览窗口上付过了**（见下一条），所以它不再是拦路虎；现在不做的理由是**维护面**：二维码是运营素材（可能换渠道、换图、换尺寸），内置进客户端就得发版才能改，而 `AboutMenu` 里只维护一个 URL 就永远不用改。**不要再拿「那是第一个 UI 窗口」当理由** —— 它已经不成立，本项目自 P10 起有普通 UI 窗口了。
- **菜单栏 App 没有 main menu，⌘ 开头的快捷键一律要自己接在 `NSWindow.performKeyEquivalent(with:)` 上**（2026-09-21 加，起因是「浏览窗口里 ⌘W 没反应」）。`LSUIElement` 进程的 `NSApp.mainMenu` 是 nil，⌘W 这类组合没有菜单项去消费它；而带 Command 的按键事件走**快捷键通道**（`NSApplication` → `NSWindow.performKeyEquivalent`），没人处理时事件被**直接丢弃**，**不会**再作为 `keyDown` 往下传 —— 所以视图/控制器里的 `keyDown`、`cancelOperation` 永远收不到它（Esc 能用是因为它不带 Command、走 `cancelOperation`）。做法：`BrowserWindow`（`NSWindow` 子类）重写 `performKeyEquivalent`，把事件转给内容视图里**唯一一份**层次规则（`dismissTopLayer()`：浮层优先、否则关窗口），自己不做判断；只认**恰好 ⌘** 的组合（`⇧⌘W` / `⌥⌘W` 交回 AppKit），匹配用 `charactersIgnoringModifiers` 而不是键码（菜单快捷键按字符匹配，非 QWERTY 布局才成立）。同类坑：菜单项的可用性也要走 `validateMenuItem(_:)`（见上一条），两者都是「构建时写了不算数」。
- **本项目唯一允许的普通 UI 窗口是动态壁纸浏览窗口**（P10 起）。四条硬约束：① **单窗口复用** —— `AppDelegate` 只持有一个 `WallpaperBrowserWindowController`，已存在就 `present()` 前置；开两个窗口 = 两个预览播放器 = 同一条视频被下两遍。② **`.accessory` 下必须「先上屏、再激活」**：`makeKeyAndOrderFront` → `NSApp.activate`，顺序反了激活请求会作用在一个还没上屏的窗口上，窗口开在别的 App 后面，用户以为点了没反应。③ 窗口用**默认 level**（远高于桌面覆盖窗口那一层，不跟壁纸抢层级），**不切 `.regular`**（那会闪出一个 Dock 图标，而窗口里只有列表和按钮、没有文本输入），`isReleasedWhenClosed = false`（controller 持有窗口，否则关闭后再 `showWindow` 会崩）。④ **关窗只停预览播放器与在飞的缩略图请求，桌面播放不动**，也**不调 `NSApp.terminate`** —— 菜单栏图标才是这个 App 的主体。
- **浏览窗口是只读调用方：复用 `CatalogService.loadSlice`，绝不调 `cacheSlice` / `loadIndex`**。`sliceCacheURL` 只有一份，是播放的离线兜底；让它写缓存，离线启动就会读到「用户随手翻过的那个分类」而不是「上次真正在播的那个」。代价是**离线时只能浏览当前播放分类**（归属校验会拦住别的分类，显示「加载失败」，**不会显示错分类**）。它还必须有自己的请求序号（`sliceGeneration`），**不能复用 `AppDelegate.sliceRequestGeneration`** —— 那个是播放用的，混用会让「浏览别的分类」把正在播的加载结果判成过期。同理：窗口里切分类**只换列表数据、不写配置**；只有「设为桌面壁纸」且该条目属于别的分类时才同步内容过滤。
- **缩略图必须走 `LiveWallCore/ThumbnailURL` 的候选链，不要直接加载 `coverUrl`**。`coverUrl` 是**全尺寸**图：实测风景分类 3536 条全是 `.jpg`、单张 384 KB，一屏 12 张 4.6 MB、滚完一个分类 **1.3 GB**。加 `?x-oss-process=image/resize,w_360/quality,q_80` 后 10.3 KB（`w_720` 39 KB）。三条实现约束：① 地址用**字符串拼接**而不是 `URLComponents` —— 后者会把值里的 `/` 编码成 `%2F`，OSS 对编码后的值行为没有保证；② 这是**对第三方能力的依赖、没有文档保证**，所以不硬编码 host 白名单，改成「处理版 → 原图」候选链 + 内容类型兜底；③ **兜底只看 `Content-Type`（`image/*`），不要用体积阈值** —— 实测 PNG 缩略图有 115–193 KB 的，用阈值会把好图错判成失败而退回 4 MB 原图。
- **缩略图请求必须去重 + 限并发 + 失败不自动重试**（纯逻辑在 `LiveWallCore/ThumbnailRequestTracker`，有单测）。滚动时同一张图会被反复经过，自动重试等于对着一批坏地址反复发请求。内存缓存用 `NSCache`（上限 96 MB，cost 按**解码后的字节数** `pixelsWide * pixelsHigh * 4` 算），**不做磁盘缓存** —— 与「不做本地视频缓存」同一条取舍。
- **`NSCollectionView` / `NSTableView` 作为 `documentView` 时不要加 Auto Layout 约束**：它们自己管 frame，加了会跟流式布局抢高度，表现是「只能看到第一行」。做法是「先定 frame 再挂 `documentView`」+ `autoresizingMask = [.width]`。另外两条 AppKit 小坑：**卡片里不要放按钮**（网格每格塞按钮既挤又容易点错，操作集中在双击打开的预览浮层里）；**`NSCollectionViewItem` 的子视图不要叫 `imageView`** —— 那个属性已经存在（给 nib 用的 outlet），重名直接编译不过。
- **预览只在「双击」时开**：双击某张卡片 → 网格区上浮出一块 16:9 画面**并开始播放**，**打开即播、不可暂停/停止**（✕ / Esc / 切分类关闭）。视频复用 `VideoLoader.loaded.asset`，**不另建 `AVURLAsset`**（「一个视频只建一个 asset」是既有硬约束）。**不要做成「选中即自动播」**：方向键连翻几条就会把每条视频都拉一遍，流量和 CPU 都不划算；**双击是明确动作所以直接播**，两者不冲突。左上角**不显示**「加载中… / 播放中 / 静态图」这类状态角标，但**失败要显示原因**（那是错误反馈，不是常态提示；不给原因看起来就是「点了没反应」）。
- **网格卡片尺寸依赖「clip view 的真实宽度」，且必须在 `NSCollectionView` 子类里覆写 `setFrameSize` 挂钩**。三个坑一起踩过：① 不能用 `collectionView.bounds.width` —— 早期布局轮次里它还是整个滚动视图的宽度（984），没扣竖向滚动条（真实 967）；② clip 缩窄之后 collection view **未必再排一次**，`viewDidLayout` 与 clip 的 bounds 通知实测一次都没触发，`setFrameSize`（`autoresizingMask = [.width]`）才必然走；③ `invalidateLayout()` 不会把 collection view 标成 `needsLayout`，要手动标，而且要**显式写回 `itemSize`** —— 只靠 `sizeForItemAt` 会出现「尺寸查询跑了但 frame 还是旧的」。
- **`NSTableColumn` 默认宽 100pt，收窄侧栏时必须显式设 `width/minWidth/maxWidth`**。实测栏宽从 138 收到 76 之后列仍是 100 宽 —— 单元格溢出栏外，长名字被滚动视图硬裁，而不是在标签内截断成省略号（`resizingMask = .autoresizingMask` 不会把你显式赋的 `frame` 宽度传播给列）。
- **按「可用宽度均分」算卡片宽时要留 1pt 余量**：整行宽度与可用宽度**正好相等**时流式布局会少放一列（浮点边界）。实测 4×226.75 + 间距 = 943、可用正好 943 → 只摆 3 列、右边空 226pt；改成 `(usable - 1) / columns` 后 4 列放得下、只余 1pt。
- **`NSCollectionView` 没有 `doubleAction` / `target`**（`NSTableView` 才有），delegate 里也没有双击回调。双击只能在子类 `BrowserGridView.mouseDown` 里按 `event.clickCount == 2` 判，再用 `indexPathForItem(at:)` 反查命中项。**先调 `super.mouseDown`** —— 双击的第一下本来就该先选中那张卡片。探针里可以造 `NSEvent.mouseEvent(...)` 直接发给 `mouseDown`，所以这条**不用人工点**也能验。
- **`didSelectItemsAt` / `didDeselectItemsAt` 现在刻意不实现**：它们此前存在的唯一理由是驱动右栏（选中 → 右栏显示它的预览与按钮），右栏移除后没有消费者 —— 网格高亮由 `NSCollectionView` 自己管，预览只认「双击」（`previewItemID`）。留着两个空回调只会让人以为选中态还有副作用。已知行为留档：`selectItems` **不**触发 `didSelectItemsAt`，而 `deselectAll(nil)` **会**触发 `didDeselectItemsAt`，两者方向相反。
- **预览浮层的容器与压暗层**两个都必须是 `PassThroughView`（`hitTest` 命中自己时返回 nil，即 `hit === self`）。只改容器没用：`super.hitTest` 会先命中铺满整个区域的**压暗层并返回它**（不是 self），事件照样被吃掉，网格仍是死区（实测「面板外的点」仍命中浮层内的视图）。验这条要**直接测 `hitTest`**，断言「面板外的点既不在浮层内、又落在网格内」—— 直接调 `grid.mouseDown(with:)` 绕过事件派发，测不出来（误判过一版）。
- **写 UI 断言必须限定在被测容器内，且要统一坐标系** —— 三个都踩过：① 用「`content` 下所有 `NSTextField` 里以『风景壁纸』开头的那个」当标题，而网格卡片的标签本身就是「风景壁纸 N 4K」→「无残留」永远为 true（假阳性）；`private` 容器取不到时，**借里面那个按钮的 `superview` 反查**再收集。② `panel.frame` 是相对浮层的，跟 `gridScroll.frame`（相对 root）比「是否居中」永远不等 —— 先 `convert(_:to:)` 到同一个坐标系。③ **AppKit 是非翻转坐标系**，`frame.minY` 才是「距底」；写 `bounds.height - frame.maxY` 量到的是距顶（实测「距底 12」被读成 279）。
- **同一行里「文字 + 按钮」必须显式排压缩阻力**：两者默认阻力相同，超长文字会把按钮压成 **0 宽**（实测 85 字标题把「停止预览」压没了，短标题下它是 76 宽）。给文字 `setContentCompressionResistancePriority(.defaultLow, for: .horizontal)` + hugging `.defaultLow`，给按钮两个都 `.required` —— 该截尾的是文字，按钮没了是功能损失。断言要量**按钮宽度**和「文字右缘 vs 按钮左缘」，只看「面板宽度没变」发现不了。
- **Auto Layout 的等式是双向的**：`panel.width == overlay.width - 80` 会让求解器为了满足它**反过来压窄**网格区（实测窗口从 1060 被压到 778 = 138 + 640，而 640 = 560 + 80，甚至小于 `minSize` 880）。要「跟着父视图收缩但有上限」，用**常量宽度约束 + 在 `viewDidLayout` 里按实际宽度夹取**，不要靠等式 + 优先级。定位手段是二分：注释掉可疑的子视图构建，看窗口宽度是否恢复。
- **「不引入新字面量」的改动，字符串扫描验不了**（这轮的两栏改造复用的全是既有文案）。改用 `otool -oV <binary>` 查类与方法：`BrowserGridView`（superclass `NSCollectionView`，带 `mouseDown:`）、`PassThroughView`（superclass `NSView`，带 `hitTest:`）。⚠️ **Swift 合成的选择子带参数名**（`collectionView:didDeselectItemsAtIndexPaths:`），按直觉搜 `...At:` 会假阴性。
- **`SMAppService.mainApp.status` 在未注册时返回 `notFound` 而不是 `notRegistered`**。曾据此显示「不可用（需在 .app 内运行）」，而 App 不在 `/Applications` 下也能注册成功 —— 一个会让用户放弃使用的假故障。两个「没开启」状态要统一显示为「未开启」。
- **「仅主屏」用 `NSScreen.screens.first`，不要用 `NSScreen.main`**。后者是「当前键盘焦点所在的屏幕」，会随用户拖窗口漂移，会导致窗口建到副屏上。
- **等待窗口上屏要等到 bounds 稳定，不能只看「窗口号出现了」**。窗口上屏有一段对称缩放的进入动画，动画期间 WindowServer 报的 bounds 是内缩的（实测 1512×982 被报成 `9,6 1494x970` / `5,3 1502x976`，两次采样值不同），此时 `evaluate` 会得到「未覆盖整屏」并触发无意义的降级。比较时**不能用 `NSWindow.frame`** —— 它用「原点在主屏左下」的坐标系，副屏上会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98` 而 `CGWindowBounds.y = 0`）。
- **内容过滤按一级分类，不要退回按作者或按标签**。分类是数据源里唯一「既有一级结构、又 100% 非空」的维度（当前 10 个分类 / 20,703 条）；标签在采集侧根本没有（`desktop + dynamic` 的候选里带 tag 的是 0 条）；作者虽然非空但平铺 50 个，用户无法判断该选谁。分类清单来自索引的 `categories`，**条目数为 0 的分类也要显示并置灰**（可点会进空池，表现成「点了没反应」，置灰能一眼看出是数据没抓全）。菜单是**单选**，没有「清除过滤」项 —— 分类恒有选中项，不存在「不限」态。选中的分类存 `Preferences.selectedCategoryID`（存 id 不存名字，分类可能被改名），记忆值不在清单里时回退默认分类并**立刻写回**。
- **「壁纸来源」是线上 / 本地二选一，且与选片顺序正交**。菜单里是设置段的独立父项 `壁纸来源（线上）`（紧跟「内容过滤」），行内容由 `LiveWallCore/WallpaperSourceMenu` 出（本地态根标题带文件夹名）。**不要把它塞进「选片顺序」子菜单** —— 那样会变成四行同级单选，而「随机」与「本地」根本不是一类东西，用户没法表达「本地 + 随机」。本地模式四条硬约束：① **播放地址判定一律走 `WallpaperItem.playableURL`**（接受 http(s) 与 `file://`），**不要用 `remoteURL`** —— 后者只认 http(s)，用它判定会让本地条目「灌进池子却播不了」，还会让本地固定项被 `Preferences.sanitized()` 静默清掉；`remoteURL` 现在只服务远端清洗（`CatalogCoding.sanitize`）与「下载当前壁纸」。② **`VideoLoader` 对 `file://` 不做 HEAD 探测**（本地没有状态码可探），改判 `isReadableFile`，失败抛 `VideoLoadError.fileUnreadable` → `FailurePolicy` 归**资源问题**（拉黑换下一条），**绝不能归网络类**，否则失效条目会留在池子里被反复重试。③ **本地条目的 id 必须是绝对路径的稳定哈希**（`LocalVideoSource`，FNV-1a 64 位，冲突线性探测）：失效黑名单与每屏源记忆都按 id 记、且要跨重启生效，拿下标当 id 时「往文件夹里加一个文件」会让后面全部错位；哈希也必须**跨进程**稳定 —— Swift 的 `Hashable` 每进程随机加盐，不能拿来当持久化 id。④ **本地态下三个「只服务线上内容」的入口一律置灰**：`内容过滤`（本地没有分类可言）、`下载当前壁纸`（等于把文件从用户自己的硬盘拷回自己硬盘）、`打开动态壁纸`（那个窗口列的是**线上分类的条目**）。三者**集中在 `WallpaperSourceMenu.OnlineOnlyEntry` 一处登记**、判据走 `isEnabled(_:isLocalSource:)`（穷举 switch）—— 新增线上专属入口时必须来登记，否则它会一直可点而点了没反应（没有编译错误会提示这件事，`WallpaperSourceMenuTests` 里有「登记表没漏项」的断言兜底）。已经打开的浏览窗口**不自动关闭**（只读，不影响桌面播放）。
- **`Preferences.localFolderPath` 非 nil 即启用本地来源**（不另存 `useLocalSource` 布尔量），且 `sanitized()` **只清洗空串 / 纯空白、不判文件夹是否存在**：外接盘拔掉时应当保留配置、回退线上并提示（`AppDelegate.startLocalSource` 的失败分支），插回来或按 `⌥⌘R` 重扫即恢复；清掉路径的唯一入口是菜单里点「线上」。同理 `AppDelegate.isLocalSource` 表示「**此刻生效**的来源」（扫描失败即翻回线上），菜单、置灰、固定时的分类同步都按它判定，**不能按配置里有没有路径判定** —— 否则会出现「菜单写着本地、画面里却是线上片单」这种自相矛盾的状态。本地来源**只在启动与手动重载（菜单「重新加载」那一项 / `⌥⌘R`）时重扫**，定时切换刻意不重扫（每个间隔遍历一遍目录，文件夹很大或在外接盘上会有卡顿）。那一项的**标题随来源变**（本地来源下是「重新扫描本地文件夹」），判定条件必须与 `reloadCatalog` 的分支同源 —— 都按「**配置里有没有路径**」而不是生效态，否则会出现「盘拔了、标题写着重新加载清单、点下去却去扫本地目录」这种不一致。
- **「选中哪个分类」必须经过 `LivewallCatalogIndex.playableCategoryID(remembered:)`**：记忆值 → 默认分类 → 第一个有内容的分类，**每一步都要求 `itemCount > 0`**。理由：菜单里 0 条的分类本来就置灰不可点，客户端不该因为生成侧 `--default-category` 指到一个还没抓过的分类就以「没有可用的内容」收场 —— 索引里明明有别的分类有内容。
- **锁屏预览只能是静态图**。锁屏界面由 `loginwindow` 在安全罩层级绘制，第三方窗口提不到它之上（能提上去就等于能伪造登录框）。可行路径只有「把当前壁纸的静态图设成系统墙纸」—— 覆盖窗口在系统墙纸之上，桌面态被挡住、锁屏态露出来。**不要试图提高窗口层级去覆盖锁屏**；也不要为了「锁屏也播视频」引入 Apple 私有 `WallpaperExtensionKit`（要完整 Xcode + 签名 + 私有框架 `dlopen`，与「只用 Command Line Tools、零依赖」的定位冲突）。
- **静态图地址只能来自清单的 `coverUrl`，不许用 URL 规律推导**。实测全量 20,703 条里有 256 条与视频不同源 id（含 `.png`、日期段不同），按「换域名 + 去掉 `_10s_for_html` + 改成 `.jpg`」推会推错。另：`coverUrl` 的 `accessible` **不是真实探测结果**（`pipeline` 从不做 HEAD，走默认值 1），所以客户端**必须有抓帧兜底**，且抓帧也失败时保留系统原墙纸、不要清空。
- **抓帧必须挂 `player.currentItem`，不能挂 `AVPlayerLooper` 的 template item**（实测后者 24 秒 0 帧，挂 currentItem 0.20 秒拿到首帧）。抓帧**不产生额外流量**，且**只能在播放中进行** —— 锁屏通知到达时 governor 已经暂停了播放器，那一刻只复用已缓存的图（`reapplyCached`）。取到帧后立刻 `remove(output)`，不要常挂。
- **`LockScreenPreviewer` / `WallpaperDownloader` 刻意不标 `@MainActor`**：标了会让 `AppDelegate` 里 `lazy var` 的属性初始化变成跨隔离调用、直接编译失败。它们与项目其它组件一样靠「只在主线程使用」的约定。
- **手动下载的落点固定 `~/Downloads/livewall/`，文件名一律走 `LiveWallCore/DownloadNaming`**，不要在别处手写清洗逻辑；扩展名必须从 URL 取（静态图有 `.jpg` 也有 `.png`）。菜单项放**维护段**（与「重新加载内容」同类的一次性动作），不设 `keyEquivalent`，没有可下载条目时置灰而不是让用户点到必然失败的动作。
- **菜单的行内容（只显示名字、0 条置灰、单选勾选、根项标题）必须走 `LiveWallCore/CategoryMenu` 的纯函数**，不要在 `AppDelegate` 里另写一套 —— 那里没有测试，而这几条规则正是用户唯一看得见的正确性。**条目数只参与置灰，不显示**（星哥明确要求过）。**这条现在管全局**：浏览窗口左栏同样只显示分类名（0 条用 35% 透明度 + `shouldSelectRow` 返回 false 双重置灰），窗口底部那条 `<分类名> · 共 N 条` 也已移除 —— 条目数在网格里一眼看得到，不值得单占一行。
- **容错解码的地方要跟着结构走**：`CatalogSource.categoryIds`（索引的 `source` 只有 deviceType/contentType）与 `WallpaperItem.categoryIds`（手写清单与测试构造的条目没有这个键）都用 `decodeIfPresent` 兜底。Swift 合成的 `Codable` 缺字段时抛 `keyNotFound` 而不是回退默认值 —— 漏一处就会让整份文件解不出来。
- **每屏源的恢复只做一次，且必须过滤掉已不在当前分类切片里的条目**。`perScreenSources` 在**本次启动第一次成功加载清单**时恢复（`AppDelegate.pendingRestore`，由 `advance()` 取出即清空）：手动重载清单（`⌥⌘R`）时各屏已经记着当前条目，再恢复一次等于把同一段视频重新下一遍；而查不到的条目必须**退回正常取片**，不能让那块屏空着。恢复计划由 `ScreenSourceRestore.plan(store:candidateIDs:)` 这个纯函数算（可单测），`CandidatePool.restore(id:)` 负责机械动作 —— 它会同时把条目从待取队列里拿掉，否则同一轮里会再被取一次。
- **状态项必须常驻，菜单底部提供「退出动态壁纸」项**。`statusItem.behavior = []`（去掉默认的 `.removalAllowed` 与 `.terminationOnRemoval`）：留着前者用户一 ⌘ 拖走图标就没了，留着后者更糟 —— 拖走会直接把 App 终止掉。菜单退出、`pkill -x LiveWall` 和系统终止共用 `shutdown()`；其中 Cocoa 默认不处理 SIGTERM（进程直接死、`applicationWillTerminate` 不跑、当前这张的静态图固化不了，桌面停在上一张），所以 `AppDelegate` 仍需用 `DispatchSource` 信号源接住 SIGTERM / SIGINT 并转调 `shutdown()`。不要在多个出口各写一份清理。**仍然不要拦系统终止**（`applicationShouldTerminate` 一律放行）—— 拦住会让关机 / 重启 / 注销卡住。
- **进程自身占用（CPU / 内存）只在菜单展开时采一次，收起即取消，不得引入定时器或后台轮询**。触发点在 `NSMenuDelegate` 的三个回调：`menuNeedsUpdate`（最早，发起采样）、`menuWillOpen`（置 `isMenuOpen`，**只在前者没被回调时**才兜底发起一次）、`menuDidClose`（`ProcessMonitor.cancel()`）。**每次展开只采一次**（`sampledThisOpen` 锁住）—— 采两次会算出「CPU 134%（自启动 0 秒）」这种纯噪音：第一次的结果回主线程后把基线推进到「刚刚那一刻」，第二次就拿着 ≈0 的区间做除法。区间还必须有下限 `ProcessUsage.minimumWindowSeconds`（0.25 s）：低于它**不给占用率**（显示 `CPU —`）且**不推进基线**，否则下一次查看会退化成「距上一次几乎为 0」的一连串假数据；内存是瞬时量，这种情况照样给值。四点约束：① 采样跑在 utility 队列上，回主线程后**只改占用那一行的 title，不重建菜单**（重建会让正在展开的菜单闪一下并重置已展开的子菜单）；② 收起后回来的结果必须丢弃（用递增代号，光靠 `DispatchWorkItem.cancel()` 挡不住已经在跑的那一个）；③ CPU 是**区间量**，必须两次采样求差，所以行内**必须带区间标注**（`近 3 分钟` / `自启动 1 小时`），否则会被读成瞬时值；基线由启动时的**一次性** `prepareBaseline()` 提供，否则第一次查看永远没有起点；④ 采样失败与「算不出占用率」是两回事，都不能显示成 `0%`（那是假数据）：失败 → 整行 `暂不可用`（`sample` 必须回调 nil，静默返回会让行永远停在「测量中…」），算不出 → 只把 CPU 写成 `—`、内存照常显示。
- **版本更新只提示、只下载，绝不自动安装**。判定以 `CFBundleVersion`（build）为权威、`CFBundleShortVersionString` 只用于展示（语义化比较会踩 `0.10.0 < 0.9.0`）；发版**必须递增 build**，忘了加就永远不提示，且从外部看不出哪里错了。三处硬约束：① 「立即下载更新」= `UpdateInstaller` 把 dmg 拉到 `~/Downloads` 并在 Finder 选中，**不碰 `/Applications`** —— 覆盖运行中的自己需要另一条 installer 进程，而且本 App 退出时要把当前这张的静态图固化成系统墙纸，被替换/强杀时那一步会丢（桌面停在上一张）；② 更新检查的任何失败（超时/非 2xx/解析失败/字段缺失）都**静默降级**，不提示、不影响播放，只有用户主动点下载后失败才以 `Notice.warning` 出现；③ 远程 `version.json` 是远端数据，`UpdateFeedCoding` 的防御式解析遇到必填字段（`version`/`build`/`fileURL`）缺失或类型不对就整体判不可用，**不留半截数据**。`fileURL` 只认 https（与 `resolvedRemoteURL` 同规则），但配置里的 `resolvedUpdateURL` 刻意允许 http，方便本地起静态服务验证。
- **取 CPU 时间用 `proc_pid_rusage`，不要用 `task_info(MACH_TASK_BASIC_INFO)`**。后者在本机（macOS 27.0 / arm64）实测 `user_time` / `system_time` **恒为 0**，而同一结构体里的 `virtual_size` / `resident_size` 有值且返回 `KERN_SUCCESS` —— 直接用会得到一个永远 0% 的占用率，而「0%」看起来完全合理，极难发现。用 `proc_pid_rusage` 时还有两件事：它的 `ri_user_time` / `ri_system_time` 单位是 **mach 滴答**不是纳秒（本机 125/3 ≈ 41.67 ns/滴答，必须乘 `mach_timebase_info`；不换算会差 41 倍），以及第三个参数在 Swift 里要 rebind 成 `Optional<rusage_info_t>`，而 `RUSAGE_INFO_V2` 是宏、只能写常量 2。内存用 `ri_phys_footprint`（口径 = 活动监视器「内存」列）。
- **`Preferences` 里凡是「用户配置项」的字段，改默认值不会迁移老配置**。`remoteCatalogURL` 就是实例：`config.json` 里显式写着地址时，`decodeIfPresent` 会把它读回来，改 `defaultRemoteCatalogURL` 等于没改。改这个默认值时要意识到：**只有配置里没有这个键的人才会用上新地址**。（曾经为此写过一段「按字面量比对旧地址并改写」的迁移，旧地址作废后已删除 —— 现在配置里写什么就用什么。）顺带：启动时 `sanitized() != loaded` 就落盘，写失败要显式告警而不是 `try?` 吞掉。

## 验证与交付

- 优先执行与改动直接相关的轻量检查，例如语法、格式、类型检查、定向测试或 `git diff --check`。
- 除非用户明确要求，不主动执行完整编译、完整构建、全量测试或端到端测试；只有完整构建才能可靠验证时，先说明原因并征得同意。
- 界面或交互改动不能只凭静态检查判定完成；条件允许时启动目标项目，检查实际页面、关键交互、窄屏布局、控制台和异常路径。
- 将语法、类型、Lint、构建、浏览器、部署和生产验证视为不同证据层级，只报告实际执行过的检查。

完成任务后简要说明：

- 修改内容与涉及文件。
- 实际执行的检查或测试。
- 未验证事项、兼容性风险或部署前待确认项。

除非用户明确要求，不创建子项目级 `AGENTS.md` 或 `README.md`。需要补充说明时更新根目录文档，或使用源码注释和配置文件。
