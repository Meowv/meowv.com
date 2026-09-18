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

- `run.sh` 和 `build.sh` 必须同时支持无参数、独占的 `all`、一个或多个项目参数，以及 `blog`/`b`、`studio`/`s` 简写。
- `run.sh` 的 `wallpapers`/`w` 分支执行 Wallpapers CLI，默认子命令为 `crawl`；支持 `crawl`、`publish`、`stats`、`check`，其余参数原样传递。
- 固定开发端口为 Blog `4000`、Studio `4001`；Zitie 由 Studio 的 `/zitie/` 多页面入口提供，不另启端口。
- `run.sh` 并行启动多个项目，并统一处理退出；修改端口清理逻辑时，不得扩大终止进程的范围。
- `build.sh` 按参数顺序构建。全量构建必须全部成功后再替换 `build/`；指定项目构建只替换对应域名目录。
- 汇总目录固定为 `build/meowv.com/`、`build/studio.meowv.com/`。Studio 产物包含 `dist/zitie/`。
- 保持 macOS Bash 3.2 兼容性，不使用 `mapfile`、关联数组等 4.0+ 特性。Bash 3.2 在 `set -u` 下展开空数组会报 `unbound variable`，遍历前先使用 `${SELECTED_PROJECTS[*]:-}` 防护。
- 所有 shell 脚本中，变量后紧跟中文或全角字符时一律写成 `${VAR}`。非 `C` locale 下 bash 会把紧随其后的多字节字符首字节并入变量名（`$APP（` 被解析为变量名 `APP\xef`），`set -u` 下直接报 `unbound variable` 并使脚本中断。`LC_ALL=C` 的环境（例如某些沙箱）测不出这个问题，本地跑通不代表对用户的终端成立。
- `build/`、暂存目录和备份目录均为可替换生成内容，不提交 Git。
- `build.sh wallpapers` 只生成并加密 Studio 壁纸目录，不构建项目；`./build.sh studio --with-wallpapers` 仅允许与 `studio` 一起使用，并在 Studio 构建前生成目录数据。两者都会同时生成供 livewall 使用的未加密清单目录 `studio/public/data/livewall/`，并同步到 `build/studio.meowv.com/data/livewall/`。
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
- `src/wallpapers/export.py`：从 SQLite 导出供 `livewall/` 使用的明文壁纸清单目录（不加密）——`catalog.json` 总文件 + 按一级分类拆分的 `category.<id>.json`。旧版单文件 `livewall.json` 已废弃并删除，不要再加回单文件路径。
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
- `Sources/LiveWallCore/`：不依赖 `NSApplication` 的纯逻辑，可脱离 GUI 单测。层级预设、清单模型与降级链、候选池、选片顺序、调度策略与切换间隔、时长文案、省电信号与状态判定、遮挡覆盖率、多屏策略、内容过滤、配置模型都在这里。**新写的逻辑优先放这里**，这样才测得到。
- `Sources/LiveWallDesktop/`：依赖 AppKit 的桌面层代码 —— 桌面层覆盖窗口、窗口层级探测、遮挡检测。
- `Sources/LiveWall/`：正式 App。菜单栏常驻，负责编排（清单、调度、失败处理、菜单栏、系统事件）。省电信号的采集在 `PlaybackGovernor.swift`，播放器的暂停与恢复只在 `AppDelegate.applyPlaybackState` 一处发生；全局热键在 `HotKeyManager.swift`，开机自启在 `LaunchAtLogin.swift`。
- `Tests/LiveWallCoreTests/`：测试用例与自建断言运行器（`Harness.swift`）。
- `build.sh`：编译并组装 `.app`。`test.sh`：跑测试。`run.sh`：运行正式 App。
- `Resources/Info-LiveWall.plist`：App 的 `LSUIElement=true`（菜单栏常驻，不占 Dock）。

### 约定与验证

- 使用 Swift，**只需要 Command Line Tools，不需要 Xcode**，也不依赖 Node/pnpm。本机因此**没有 XCTest**（`unable to resolve module dependency: 'XCTest'`），测试用 `executableTarget` + 自建断言运行器实现，见 `Package.swift` 顶部说明。不要改成 `testTarget`，那会直接编译失败。
- 构建与运行只走 `livewall/build.sh`、`livewall/test.sh`、`livewall/run.sh`。**不接入根目录的 `build.sh`、`run.sh`、`deploy.sh`** —— 那些脚本的模型是「Web 产物 → `build/<域名>/` → Nginx」，与本项目无关。注意 `livewall/run.sh` 与根目录 `run.sh` **同名不同物**，前者只在 `livewall/` 目录内使用。
- **构建配置分界：`build.sh` 默认 release（发布版），`run.sh` 默认 debug（开发版，`--release` 可切到发布版）。** 开发者工具用 `#if DEBUG` 隔离，release 构建里不参与编译 —— 目前是菜单里的「打印窗口层级表」，连同 `WindowInspector.printTable` 和它专用的三个文本对齐转发函数。改默认配置或搬动这段代码前，先确认 release 二进制里搜不到该字符串。
- 修改纯逻辑后优先运行 `cd livewall && ./test.sh`；修改窗口层级、播放或窗口生命周期逻辑后必须真机跑一次 App 验证（会短暂占用桌面）。
- **窗口层级值只能由 `CGWindowLevelForKey` 派生**，禁止硬编码魔数；不同 macOS 版本的实际值不同。层级必须落在「系统壁纸之上、桌面图标之下」的开区间内。
- 识别系统壁纸窗口时**不能用宽松子串匹配**（`contains("wallpaper")` 会把第三方壁纸软件误判成系统壁纸）；系统壁纸进程名会随系统语言本地化，中文系统下是「墙纸」。
- 必须保留同层竞争检测：第三方壁纸软件可能占用同一层级，同层前后顺序由 WindowServer 决定，不由本程序控制。
- 壁纸必须静音，且 `preventsDisplaySleepDuringVideoPlayback = false`；覆盖窗口必须 `ignoresMouseEvents = true`，否则桌面右键、框选、拖文件全部失效。
- **覆盖窗口必须在 `applicationDidFinishLaunching` 里同步创建**，不能推迟到 `asyncAfter`。实测推迟后窗口会被系统加上对称边距（1512×982 的屏幕拿到 `9,5 1494x972`），「覆盖整屏」判定失败并触发无意义的层级降级。
- **层级判定不能紧跟在建窗口之后**：`orderFrontRegardless()` 是异步的，立刻查窗口列表会查不到自己的窗口。必须等窗口上屏（`ScreenCoordinator.waitForWindowsToAppear`）。
- 视频源与清单都来自同仓库 `wallpapers/` 项目的 `export-livewall` 子命令。**清单没有本地一层**：输出目录是 `studio/public/data/livewall/`（`catalog.json` 总文件 + `category.<一级分类 id>.json`），随 Studio 一起部署，客户端在运行时从 `https://studio.meowv.com/data/livewall/` 下按需拉取，断网时用上次成功拉取的副本（Application Support 下）兜底。仓库内不保存清单副本，也不要再往 `livewall/data/` 写。清单结构改动需与 `wallpapers/src/wallpapers/export.py` 同步。**旧版单文件 `livewall.json` 已废弃删除，不要再新增单文件清单。**
- **失败分类不能靠解析错误文本**。实测 AVFoundation 对 404 的本地化描述是「在此服务器上找不到所请求的URL。」，不含任何数字状态码。`VideoLoader` 必须在播放前做一次 HEAD 探测拿真实状态码，交给 `FailurePolicy.classify(httpStatus:)` 分类。
- **网络类失败绝不拉黑**。一次断网会把整池好资源丢进黑名单。`FailurePolicy.action` 的判定顺序是硬约束：先看是否已达连续失败阈值 → 再看网络可达性 → 再看是否可重试 → 最后才拉黑。改动顺序会破坏这个保证。
- **一个视频只建一个 `AVURLAsset`**。每个 asset 都会把整个文件拉一遍，元数据校验与播放各建一个就是双倍流量（实测 6.28MB → 12.55MB）。播放时用 `AVPlayerItem(asset:)` 复用 `VideoLoader` 建好的那个。
- **不做本地视频缓存**。实测 `AVPlayerLooper` 一次下载后不再产生流量，洗牌模式下每条候选约 9 天才轮到一次，LRU 缓存永远命中不了。断网兜底靠「保持当前画面」而不是靠缓存。
- **省电判定必须是纯函数**。`PlaybackStateResolver.resolve(_:)` 在 `LiveWallCore`，只吃 `PlaybackSignals` 吐 `PlaybackState`，不做任何系统调用；采集在 `PlaybackGovernor`。判定优先级顺序（手动暂停 > 锁屏 > 息屏 > 遮挡 > 热压力 > 空闲 > 低电量 > 电池）是硬约束，改动前先看代码里的理由注释。
- **播放器的暂停与恢复只能在一个地方发生**（`AppDelegate.applyPlaybackState`）。系统通知只负责更新 governor 的信号，绝不直接碰播放器 —— 多路信号各改一次会互相打架。
- **`VideoLoader.load` 是异步的，加载完成后必须重新核对状态**。否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。`advance()` 开头的状态守卫同理，它挡住的是网络恢复之类的旁路触发。
- **遮挡检测不要退回网格采样或 bbox**。网格采样会漏掉窄缝（20px 的缝比 63px 的网格还窄，实测报告「覆盖 100%」），union + bounding box 会把两个并排的半屏窗口误判成完全遮挡。现行实现是 `CoverageGrid` 的坐标压缩法，算精确面积；`legacyBoundingBoxCovers` 只留给测试做对比证据。
- **`Preferences` 必须保持逐字段容错解码**。Swift 合成的 `Codable` **不会**回退到属性默认值 —— 缺字段直接抛 `keyNotFound`，会让用户已有的 `config.json` 整体解码失败并静默丢配置。新增字段时同步补 `CodingKeys`、`init(from:)` 与往返测试。**枚举字段还要额外用 `try?` 包一层**：键在但取值非法（手改配置写错，如 `"playbackOrder": "random"`）会抛 `dataCorrupted`，后果与缺字段完全一样 —— 整个文件退回默认，用户的其它设置一起被静默清零。
- **两种选片顺序都必须「走完一轮才重排，一轮内不重复」**（`CandidatePool.order`：`shuffle` 每轮重洗 / `sequential` 按清单原序）。随机模式靠「洗牌前排除当前项」避免连着重复；顺序模式**不能沿用这一招** —— 每轮都会少一条尾巴，实际序列会退化成 `A…Z → A…Y → A…X`，看起来像漏播，正确做法是只在新一轮首条恰好等于当前项时向后让一位。换模式或改过滤条件都会清空待取队列（等于重新开始一轮），但**黑名单不清**。
- **切换间隔的单位是秒，合法区间由 `SwitchInterval` 夹紧（10 秒 – 24 小时）**，写法是「夹到最近的合法值」而不是退回默认，非有限值才退回 `SchedulePolicy.defaultIntervalSeconds`。注意非正数间隔**不等于**「播完即切」——后者要显式开 `switchWhenFinished`。改完间隔要立即重排下一次切换（否则用户盯着看毫无变化，会以为没点上），但「正在等网络恢复」和「当前暂停」两种状态下不要插队。
- **全局热键用 Carbon `RegisterEventHotKey`，不要换成 `NSEvent.addGlobalMonitorForEvents`** —— 后者需要「辅助功能」授权，会弹窗且要重启 App。代价是热键会**抢占**该组合，所以只挑不常用的 `⌥⌘` 组合，并且**注册失败必须显式提示**：重复注册同一组合返回 `eventHotKeyExistsErr`（-9878），据此区分「被占用」与「其它失败」。
- **菜单项的快捷键提示写进标题，不要设 `keyEquivalent`**。设了会让菜单打开时全局热键与菜单项各触发一次，切换类操作执行两遍等于互相抵消。
- **菜单状态区的「片名」与「附注」必须是两个字段，且附注要分信息 / 警告两级**。共用一个字段时失败信息会顶掉片名，用户看不到正在循环的是哪张，会误读成「壁纸掉了」；而附注既承载真异常（候选池耗尽、保持当前画面），也承载操作回执（窗口层级切换成功、开机自启已开启），**前缀 `⚠` 只能加在警告级上** —— 给回执加警告符号会让人以为操作失败。菜单是「状态 → 播放控制 → 设置 → 维护 → 退出」五段，插入新项时归到对应段，不要打散同类。
- **`SMAppService.mainApp.status` 在未注册时返回 `notFound` 而不是 `notRegistered`**。曾据此显示「不可用（需在 .app 内运行）」，而 App 不在 `/Applications` 下也能注册成功 —— 一个会让用户放弃使用的假故障。两个「没开启」状态要统一显示为「未开启」。
- **「仅主屏」用 `NSScreen.screens.first`，不要用 `NSScreen.main`**。后者是「当前键盘焦点所在的屏幕」，会随用户拖窗口漂移，会导致窗口建到副屏上。
- **等待窗口上屏要等到 bounds 稳定，不能只看「窗口号出现了」**。窗口上屏有一段对称缩放的进入动画，动画期间 WindowServer 报的 bounds 是内缩的（实测 1512×982 被报成 `9,6 1494x970` / `5,3 1502x976`，两次采样值不同），此时 `evaluate` 会得到「未覆盖整屏」并触发无意义的降级。比较时**不能用 `NSWindow.frame`** —— 它用「原点在主屏左下」的坐标系，副屏上会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98` 而 `CGWindowBounds.y = 0`）。
- **内容过滤按作者，不要按标签**。数据源在采集侧没有标签：`desktop + dynamic` 的 2,614 条候选里带 tag 的是 **0 条**，全库 14,449 个 tag 只挂在桌面静态壁纸与手机端壁纸上。`CandidateFilter` 里保留了标签维度，但别在菜单里暴露一个永远为空的选项。

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
