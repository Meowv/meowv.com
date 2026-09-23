# livewall 协作指南

适用范围：`livewall/` 目录。仓库级约定见 [`../AGENTS.md`](../AGENTS.md)，项目定位、目录结构、快速开始与实测基线见 [`README.md`](./README.md)。

macOS 视频动态壁纸工具。定位是**个人自用 / 小范围共享**，不面向大规模公开发布，因此没有用户系统、后端服务、多租户或权限体系。

本文件记录修改边界、约定与验证要求。下面「硬约束」一节里的每一条都是踩过坑之后写下的，改代码前先读。

## 边界

- 只改本目录内的文件。`../blog/`、`../studio/`、`../wallpapers/` 是同一 Git 仓库中的独立项目，不在此处顺手处理。
- `build/` 与 `.build/` 是生成物，不提交 Git。`Resources/AppIcon-source.png` **已被有意删除，不要再恢复** —— 仓库里只留成品 `AppIcon.icns`，源图属外部设计资产。
- **签名私钥不在仓库里**：正常位于 `~/.livewall-signing/version-key.txt`（权限 600）。`.gitignore` 里那条 `version-key.txt` 防的是顺手拷进来 —— 真提上去等于更新链的信任根泄漏，且 Git 历史里删不干净，只能换密钥 + 重新发版。
- 不引入第三方依赖，不使用 Electron / Tauri。
- `livewall/run.sh` 与仓库根目录的 `run.sh` **同名不同物**，写文档时要点明。

## 代码结构

- `Package.swift`：SwiftPM 清单，声明三个 target：`LiveWallCore`（纯逻辑库）、`LiveWallDesktop`（依赖 AppKit 的桌面层代码）、`LiveWall`（正式 App），外加 `LiveWallCoreTests` 测试运行器。
- `Sources/LiveWallCore/`：不依赖 `NSApplication` 的纯逻辑，可脱离 GUI 单测。层级预设、清单模型与降级链、同步取数、候选池、选片顺序、调度策略与切换间隔、时长文案、日志轮转阈值与判定、省电信号与状态判定、遮挡覆盖率、多屏策略、内容过滤、配置模型、版本检查都在这里；P10 之后另有「固定」状态机（`PinnedPlayback`）、选片顺序子菜单的行（`PlaybackOrderMenu`）、缩略图地址拼装与请求去重（`ThumbnailURL` / `ThumbnailRequestTracker`）。**新写的逻辑优先放这里**，这样才测得到。
- `Sources/LiveWallDesktop/`：依赖 AppKit 的桌面层代码 —— 桌面层覆盖窗口、窗口层级探测、遮挡检测。
- `Sources/LiveWall/`：正式 App。菜单栏常驻，负责编排（清单、调度、失败处理、菜单栏、系统事件）。省电信号的采集在 `PlaybackGovernor.swift`，播放器的暂停与恢复只在 `AppDelegate.applyPlaybackState` 一处发生；全局热键在 `HotKeyManager.swift`，开机自启在 `LaunchAtLogin.swift`。动态壁纸浏览窗口在 `WallpaperBrowserWindowController.swift` / `WallpaperBrowserViewController.swift`（配套 `BrowserItemView.swift` / `ThumbnailLoader.swift` / `PreviewPlayer.swift`）—— 这是本项目**唯一**允许的普通 UI 窗口。
- **`AppDelegate` 按职责拆分**：主文件只留**全部存储属性**、生命周期和配置落盘；方法按职责分到 `AppDelegate+Catalog/Scheduling/SystemEvents/MenuBar/Update/MenuOptions/MenuActions/Pinning/SourceMenu/Logging.swift`，三个协议一致性（`NSMenuItemValidation` / `WallpaperBrowserDataSource` / `NSMenuDelegate`）各占一个文件。新增职责时先更新目录结构，再决定是否需要拆分。
  - 硬约束：**Swift 的 extension 不能放实例存储属性**。新增状态一律加进 `AppDelegate.swift` 的属性区，不要图省事放进 `AppDelegate+Xxx.swift`（编译期就会拦下）。`static` 存储属性例外，可以留在 extension。
  - 已知代价：跨文件访问的成员从 `private` 降为 **`internal`**（Swift 没有「同模块但跨文件可见」这一档）。这是这次拆分的对价，不要为了「看起来封装好」把方法搬回主文件。
  - 下一步若要做「抽内聚类型」（`MenuBuilder` / `CatalogCoordinator` 等），前提是**先有 App 层测试** —— 现在 App 层零自动化测试，抽类型无法自动验证。
- `Tests/LiveWallCoreTests/`：测试用例与自建断言运行器（`Harness.swift`）。
- `build.sh` 编译并组装 `.app`，`test.sh` 跑测试，`run.sh` 运行正式 App，`make-dmg.sh` 打包并签名 DMG。
- `Resources/Info-LiveWall.plist`：App 的 `LSUIElement=true`（菜单栏常驻，不占 Dock）。

## 构建与运行

- 使用 Swift，**只需要 Command Line Tools，不需要 Xcode**，也不依赖 Node/pnpm。本机因此**没有 XCTest**（`unable to resolve module dependency: 'XCTest'`），测试用 `executableTarget` + 自建断言运行器实现，见 `Package.swift` 顶部说明。**不要改成 `testTarget`**，那会直接编译失败。
- 可直接走本目录的 `build.sh` / `test.sh` / `run.sh` / `make-dmg.sh`，也可从根目录执行 `./build.sh livewall` / `./run.sh livewall`。根目录脚本只把 App 汇总到 `build/livewall/`，`deploy.sh` 不上传该目录。
- **构建配置分界：`build.sh` 默认 release（发布版），`run.sh` 默认 debug（开发版，`--release` 可切到发布版）。** 开发者工具用 `#if DEBUG` 隔离，release 构建里不参与编译 —— 目前是菜单里的「打印窗口层级表」，连同 `WindowInspector.printTable` 和它专用的三个文本对齐转发函数。改默认配置或搬动这段代码前，先确认 release 二进制里搜不到该字符串。
- **受限环境（沙箱 / CI）里跑构建或测试**：SwiftPM 自己的 `sandbox-exec` 会嵌套失败（`sandbox_apply: Operation not permitted`）。用 `SWIFT_BUILD_FLAGS="--disable-sandbox --manifest-cache none" ./build.sh`（`./test.sh` 同样支持）绕过。默认**不加** —— 正常环境该保留沙箱保护。
- **`swift build --product LiveWall` 在本机出现过「报 `Build complete! (0.24 秒)` 却未真正重编」**（`touch` 后仍是 0.24 秒，删掉 `.build/out/Intermediates.noindex/LiveWall.build` 后 `grep` 不到任何输出）。原因仍未查清（怀疑是增量构建缓存指纹判断异常，可能是 CLT 版本差异）。**加 `--disable-sandbox --manifest-cache none` 之后的构建可核实为真实**：编译耗时 14 秒量级、产物时间戳随之后移、二进制里能按字节搜到新字符串 —— 三重佐证。改完 `Sources/LiveWall/` 下的代码后 `touch Sources/LiveWall/*.swift` 强制一次再核对产物时间戳；要确认**代码本身**正确就用 `swiftc` 直接编译真源码做一次性探针，它绕开 SwiftPM 的增量缓存。
- **验证「新代码真的进了产物」用二进制字节扫描，但探针必须选 UTF-8 长度 > 15 字节的字符串**。release 下 Swift 走**小字符串优化**，≤ 15 字节的字面量被内联成立即数、不作为连续字节落在数据段 → 搜不到，会得到**假阴性**（实测 `解除固定：` 15B、`无预览图` 12B 在 release 里都找不到，换成 24B 的 `用户主动恢复轮换` 就找得到）。所以「搜不到」必须配 **debug 二进制对照**（debug 不内联，同批字符串全部找得到）才能下结论 —— 尤其验 `#if DEBUG` 隔离时：`打印窗口层级表`（21B）在 release 搜不到、在 debug 搜得到，后半句才是排除「搜索方法失效」的关键对照。另外 `codesign` 会改写 Mach-O，**包内二进制与 `.build/` 里的哈希必然不同**，只能靠搜字符串比对。

## 测试

- 修改纯逻辑后优先运行 `./test.sh`；修改窗口层级、播放或窗口生命周期逻辑后必须真机跑一次 App 验证（会短暂占用桌面）。**修改浏览窗口（`WallpaperBrowser*`）后必须人工点一次** —— 探针能验数据与布局、连「双击」都能造 `NSEvent` 验，但验不了真机点击的手感、预览播放的实际观感，以及「关窗不影响桌面播放」。
- **新增测试文件必须同时在 `Tests/LiveWallCoreTests/main.swift` 里加一行调用**：运行器是按**函数名**手工登记的，漏登记时编译通过、测试全绿，而那个文件一行都不跑。`./test.sh` 现在会做这个自检并直接失败（按函数名比对，所以一个文件里定义两个测试函数是允许的）。**测试项数不要写进文档** —— 会漂移，跑 `./test.sh` 看实际值。
- **本目录的 shell 脚本同样适用「变量后紧跟中文一律写 `${VAR}`」**（规则在根 `AGENTS.md` 的「根目录脚本约定」里，但**适用于全仓库脚本**）。新写或改动脚本后执行 `bash -n`，并在非 `C` locale 下跑一次实际帮助或 dry-run 路径；`LC_ALL=C` 的沙箱可能掩盖这类问题。

## 更新链与发版

- **`version.json` 必须与它的签名 `version.json.sig` 成对出现、同一次上传**（`make-dmg.sh` 生成清单后立刻用本机私钥签名，根 `build.sh` 搬运时缺签名会直接中止）。客户端**没有「验签不过就退回只看 sha256」这条路** —— 那种降级等于没做：攻击者删掉签名文件即可绕过。反向的坑同样致命：客户端只认验签通过的清单，**漏传 `.sig` 的表现是「用户永远看不到更新」，与「线上没发新版」的症状一模一样**，没有任何别的信号，排障会往完全错误的方向走（先怀疑版本号没递增）。
- 私钥在 `~/.livewall-signing/version-key.txt`（仓库外，权限 600）。**换密钥等于所有已发布客户端都验不过新签名，必须重新发版。**
- 签名覆盖的是清单的**原始字节**，所以发布时不要重新格式化 `version.json`（改缩进、调键顺序、加删尾随换行都会让签名失效）。细节与发版对账命令见 [`README.md`](./README.md) 的「更新清单签名」。
- **`CFBundleVersion` 由发布路径的 `build.sh --bump-build` 自动递增，不要手改** —— 它读「上次已装进 studio 部署目录的那一份 `version.json`」（次选本地产物）的 `build`，若源 plist 的值不大于它就 `+1` 写回 plist。递增必须在组装 `.app` 与 `codesign` **之前**完成，否则改包内 `Info.plist` 会让签名失效，所以这一步在 `build.sh` 而不是 `make-dmg.sh`。想手动指定更大跨度（如直接跳到 10）时把 plist 改大即可，脚本不会动它。`make-dmg.sh` 只保留**兜底校验**（拦「用 `--no-build` 拿旧 .app 直接打包」）。客户端只认它，不递增就永远不提示，而症状与「线上没发新版」无法区分。
- **递增只在发布路径发生，`--bump-build` 是显式开关（默认关）**。只有根 `build.sh` 与 `make-dmg.sh` 会传它；**本地运行（`./run.sh`、`./run.sh lw`、`./run.sh --release`）一律不传** —— 判据是「这次是否产出可分发包」，不是「是否 release 配置」。跑一次看看不该烧掉一个 build 号，也不该在工作区里留一次与本次改动无关的 plist 改动。`--bump-build` 与 `--debug` 同用会被直接拒绝。不递增时脚本**完全不输出**版本号相关的行（否则每次 `./run.sh` 都多一句噪音，看起来像「它动了什么」）。改这段后**别拿真实 plist 试**：把 `build.sh` 与 plist 副本放进 `/tmp` 的假工程（`../build/studio.meowv.com/data/livewall/version.json` 造参照物、`swift` 换成 `exit 0` 的桩、`.build/<cfg>/LiveWall` 放个可执行占位），逐例比对 plist 里的 `CFBundleVersion` 有没有被动 —— 真实验证过 9 个用例（不传旗标 3 例、发布路径 3 例、参数互斥与未知参数各 1 例、整条 `run.sh` 链 1 例）。
- **内容清单也走同一把密钥签名，但签的是「索引」**：`catalog.json.sig` 与 `catalog.json` 必须成对部署。索引里为全部切片和每个有内容的分类记了 `sha256`，切片的完整性由「已验签的索引」传递性地保证 —— 所以不需要给每个切片单独签名。
- **导出与签名是两步，中间不能省**：`wallpapers/src/wallpapers/export.py` 只写索引与切片（并删掉上一轮的旧签名），签名由**根 `build.sh` 的 `sign_livewall_catalog`** 调 `livewall/tools/sign-version.swift sign --catalog` 完成，失败即中止构建。单独跑 `python3 -m wallpapers export-livewall` 会产出一份**没有签名**的清单，新版客户端一律拒用。
- **首次上线的发布顺序是硬约束**：包含 `allSlice` 的新索引、`all.json` 与 `.sig` 必须先于新版客户端部署。新版没有「验不过就用」的降级路；老客户端会忽略未知的 `allSlice` 字段。
- **绝不手工改 `catalog.json` / `catalog.json.sig`**：签名覆盖原始字节，改一个字节（哪怕只是格式化）就会失效；而「新索引配旧签名」比「没有签名」更难排障 —— 症状指向密钥或密码学，实际原因只是漏了一步签名。

## 硬约束

### 窗口层级与覆盖窗口

- **窗口层级值只能由 `CGWindowLevelForKey` 派生**，禁止硬编码魔数；不同 macOS 版本的实际值不同。层级必须落在「系统壁纸之上、桌面图标之下」的开区间内。
- 识别系统壁纸窗口时**不能用宽松子串匹配**（`contains("wallpaper")` 会把第三方壁纸软件误判成系统壁纸）；系统壁纸进程名会随系统语言本地化，中文系统下是「墙纸」。
- 必须保留同层竞争检测：第三方壁纸软件可能占用同一层级，同层前后顺序由 WindowServer 决定，不由本程序控制。
- 壁纸必须静音，且 `preventsDisplaySleepDuringVideoPlayback = false`；覆盖窗口必须 `ignoresMouseEvents = true`，否则桌面右键、框选、拖文件全部失效。
- **覆盖窗口必须在 `applicationDidFinishLaunching` 里同步创建**，不能推迟到 `asyncAfter`。实测推迟后窗口会被系统加上对称边距（1512×982 的屏幕拿到 `9,5 1494x972`），「覆盖整屏」判定失败并触发无意义的层级降级。
- **层级判定不能紧跟在建窗口之后**：`orderFrontRegardless()` 是异步的，立刻查窗口列表会查不到自己的窗口。必须等窗口上屏（`ScreenCoordinator.waitForWindowsToAppear`）。
- **等待窗口上屏要等到 bounds 稳定，不能只看「窗口号出现了」**。窗口上屏有一段对称缩放的进入动画，动画期间 WindowServer 报的 bounds 是内缩的（实测 1512×982 被报成 `9,6 1494x970` / `5,3 1502x976`，两次采样值不同），此时 `evaluate` 会得到「未覆盖整屏」并触发无意义的降级。比较时**不能用 `NSWindow.frame`** —— 它用「原点在主屏左下」的坐标系，副屏上会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98` 而 `CGWindowBounds.y = 0`）。
- **「仅主屏」用 `NSScreen.screens.first`，不要用 `NSScreen.main`**。后者是「当前键盘焦点所在的屏幕」，会随用户拖窗口漂移，会导致窗口建到副屏上。

### 播放、状态机与失败处理

- **省电判定必须是纯函数**。`PlaybackStateResolver.resolve(_:)` 在 `LiveWallCore`，只吃 `PlaybackSignals` 吐 `PlaybackState`，不做任何系统调用；采集在 `PlaybackGovernor`。判定优先级顺序（手动暂停 > 锁屏 > 息屏 > 遮挡 > 热压力 > 空闲 > 低电量 > 电池）是硬约束，改动前先看代码里的理由注释。
- **播放器的暂停与恢复只能在一个地方发生**（`AppDelegate.applyPlaybackState`）。系统通知只负责更新 governor 的信号，绝不直接碰播放器 —— 多路信号各改一次会互相打架。
- **`VideoLoader.load` 是异步的，加载完成后必须重新核对状态**。否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。`advance()` 开头的状态守卫同理，它挡住的是网络恢复之类的旁路触发。
- **每屏独立的失败计数必须按槽位分开**。`failuresBySlot` / `retriesBySlot` 是字典而不是单个计数器：副屏挂掉就把主屏也停掉，等于把「某一块屏的问题」放大成「壁纸没了」。只有**全部**槽位都失败才 `stopScheduling`。
- **只有主槽位排调度定时器**。多个槽位各排一个会互相覆盖 `scheduleTimer`，切换节奏会变成「最后一个加载完的说了算」。
- **遍历字典时不要改字典**。`PlaybackEngine.useSlots` 里删槽位、`AppDelegate` 里清 `namesBySlot` 都要先 `filter` 出数组再删 —— Swift 在 `Dictionary was mutated while being iterated` 上是直接崩，不是警告。
- **遮挡检测不要退回网格采样或 bbox**。网格采样会漏掉窄缝（20px 的缝比 63px 的网格还窄，实测报告「覆盖 100%」），union + bounding box 会把两个并排的半屏窗口误判成完全遮挡。现行实现是 `CoverageGrid` 的坐标压缩法，算精确面积；`legacyBoundingBoxCovers` 只留给测试做对比证据。
- **非隔离 `async` 函数里不要直接碰共享的可变集合**（2026-09-21 真机崩溃后定位；**Swift 6 迁移后这条的成因已被编译器接住，但锁本身仍要留着**）。当时 `AppDelegate.loadVideo` 没有 `@MainActor` 标注，函数体跑在**协作线程池**上（既不是主线程，也不是调用方所在的 actor）；而「每屏独立」模式下两个槽位会同时取片 —— 对 `sharedVideoLoads` 这张 `Dictionary` 的并发读写会写坏它的存储指针并**直接崩**，症状是 `Dictionary._Variant.setValue` 里 `-[NSTaggedPointerString count]: unrecognized selector sent to instance 0x8000…`，**完全不像竞态**（栈顶只有 `libswiftCore` 的集合帧）。迁移后 `AppDelegate` 是 `@MainActor` 的，函数体确实回到主线程，**但那三个辅助函数的锁不能拆**：`VideoLoader.load` / `FileDownloader.download` 是 **nonisolated async**，`await` 它们会 hop 到全局执行器（SE-0338），回调路径仍在别的线程上。现在这张表的读 / 写 / 清空一律走 `takeSharedLoad` / `releaseSharedLoad` / `drainSharedLoads` 三个辅助函数：**检查与插入必须在同一把锁里**（分开做会让两个槽位同时未命中、同一条视频被并发拉两遍，等于去重失效），**取消任务要放在锁外**。以后在这个文件里新增 `async` 函数时，先问一句「函数体会在哪个线程上跑、它碰的集合还有谁在碰」。
- **一个视频只建一个 `AVURLAsset`**。每个 asset 都会把整个文件拉一遍，元数据校验与播放各建一个就是双倍流量（实测 6.28MB → 12.55MB）。播放时用 `AVPlayerItem(asset:)` 复用 `VideoLoader` 建好的那个。
- **不做本地视频缓存**。实测 `AVPlayerLooper` 一次下载后不再产生流量，洗牌模式下每条候选约 9 天才轮到一次，LRU 缓存永远命中不了。断网兜底靠「保持当前画面」而不是靠缓存。
- **`Preferences` 必须保持逐字段容错解码**。Swift 合成的 `Codable` **不会**回退到属性默认值 —— 缺字段直接抛 `keyNotFound`，会让用户已有的 `config.json` 整体解码失败并静默丢配置。新增字段时同步补 `CodingKeys`、`init(from:)` 与往返测试。**枚举字段还要额外用 `try?` 包一层**：键在但取值非法（手改配置写错，如 `"playbackOrder": "random"`）会抛 `dataCorrupted`，后果与缺字段完全一样 —— 整个文件退回默认，用户的其它设置一起被静默清零。
- **`Preferences` 里凡是「用户配置项」的字段，改默认值不会迁移老配置**。`remoteCatalogURL` 就是实例：`config.json` 里显式写着地址时，`decodeIfPresent` 会把它读回来，改 `defaultRemoteCatalogURL` 等于没改。改这个默认值时要意识到：**只有配置里没有这个键的人才会用上新地址**。顺带：启动时 `sanitized() != loaded` 就落盘，写失败要显式告警而不是 `try?` 吞掉。

### 选片顺序与「固定」

- **两种选片顺序都必须「走完一轮才重排，一轮内不重复」**（`CandidatePool.order`：`shuffle` 每轮重洗 / `sequential` 按清单原序）。随机模式靠「洗牌前排除当前项」避免连着重复；顺序模式**不能沿用这一招** —— 每轮都会少一条尾巴，实际序列会退化成 `A…Z → A…Y → A…X`，看起来像漏播，正确做法是只在新一轮首条恰好等于当前项时向后让一位。**换分类或重载清单都会清空待取队列**（等于重新开始一轮），但**黑名单不清**。候选池自己不做任何过滤 —— 候选集由调用方切好再 `setItems` 灌入。
- **「固定」不是第三种 `PlaybackOrder`**。`CandidatePool.next()` 完全不读 `order`，`refill()` 里 `order` 的分支是非穷举 `if` —— 给 `PlaybackOrder` 加第三个 case 之后 `next()` 照常取片、`refill()` 静默落到「按 source 原序」，**固定根本拦不住**，而三个穷举 switch 还会先编译报错。固定是**正交于选片顺序**的一层状态，由 `AppDelegate` 在候选池**之上**拦截（`LiveWallCore/PinnedPlayback` 把「驱动事件 + 是否固定」映射成裁决，`PinDriveEvent` 是穷举的 —— 新增旁路驱动点必须去那里加 case，这样「漏了一个旁路」会变成编译错误或测试失败，而不是画面被悄悄换走）。`order` 因此仍然只有两个值、只有一个含义（解钉后恢复哪个顺序）。「固定」在菜单里是**派生显示**：`pinnedItem != nil` 时勾选落在固定行上、随机/顺序两行**都不勾**，父项标题变 `选片顺序（固定）`，**不另存任何布尔量**。**解钉只有三个触发点**：菜单「下一张」（含 `⌥⌘N` 热键）、选片顺序里点「随机」或「顺序」、固定项被判失效（拉黑）。**浏览窗口里刻意没有「取消固定」按钮**，它只标记当前项。
- **固定的落点是 `Preferences.pinnedItem`，存整条而不是 id**。只存 id 就必须靠「当前分类切片」定位它，而切分类**不解钉**（用户可以在固定之后换分类继续浏览），重启时 `selectedCategoryID` 已经是另一个分类、切片里找不到这个 id → **固定被丢掉**。存整条之后**定位**固定项不再依赖任何切片；但**「能定位」不等于「一定能开播」** —— 启动时槽位的铺满发生在 `applySliceResult` 里（与轮换共用同一条启动路径），索引或切片都取不到时固定项也不会开播，那种情况下轮换同样播不了任何东西，**不存在「固定特有的黑屏」**。固定态下**所有屏**铺同一条（`applyPinToMissingSlots`，幂等），定时器停排，`persistScreenSources` 也停写（每屏源记忆是轮换的产物）。`advance()` 在固定态下仍会被调用，但能走到那里的只剩**恢复类**请求，所以那一路用 `force` 重拉而不是短路跳过 —— 槽位里挂着的固定项正是失败的那条，不重拉就永远卡在坏状态上。
- **切换间隔的单位是秒，合法区间由 `SwitchInterval` 夹紧（10 秒 – 24 小时）**，写法是「夹到最近的合法值」而不是退回默认，非有限值才退回 `SchedulePolicy.defaultIntervalSeconds`。注意非正数间隔**不等于**「播完即切」——后者要显式开 `switchWhenFinished`。改完间隔要立即重排下一次切换（否则用户盯着看毫无变化，会以为没点上），但「正在等网络恢复」和「当前暂停」两种状态下不要插队。

### 清单、网络与失败分类

- 视频源与清单都来自同仓库 `wallpapers/` 项目的 `export-livewall` 子命令。输出目录 `studio/public/data/livewall/` 包含签名索引 `catalog.json` / `catalog.json.sig`、去重的 `all.json` 与 `category.<一级分类 id>.json` 切片；索引不含条目，记录全部及各分类切片摘要。客户端按当前筛选拉一份切片，断网时回退 Application Support 下的索引、签名与单份切片缓存。清单结构改动需与 `wallpapers/src/wallpapers/export.py` 同步。
- **索引与其签名的两道闸都不可绕过，也不要加「验不过就跳过」的开关**：① 索引整体验签（含「摘要齐全性」检查，有切片的分类缺 `sha256` 就整份拒掉 —— 那是生产侧 bug，客户端不能靠少校验一层掩盖）；② 切片字节摘要与索引里记的一致 + 切片归属校验。**缺摘要不能当作通过**，否则攻击者把摘要字段删掉即可绕过。细节与实测见 [`README.md`](./README.md) 的「内容清单与签名」。
- **索引必须保持「不含条目」**。`catalog.json` 是启动时唯一必拉的文件，大小随分类数线性增长；全部切片和每个有内容的分类各自登记 `sha256`，条目放在独立切片中。
- **条目字段新增一律不升 `schemaVersion`**：客户端用 `decodeIfPresent` 容错，升版本会让老客户端撞上 `unsupportedSchema` 直接拒绝加载整份清单 —— `coverUrl`（静态图地址，供锁屏预览与「下载当前壁纸」用）就是这么加的。
- **切分类是异步拉一个文件**，因此有两件必须处理的事：① 递增的请求序号，回包时比对丢弃过期结果（否则「点了 B，画面却停在 A」）；② 失败时保持当前画面**与当前勾选** —— 选中项只在拉取成功后才写回配置。`selectedCategoryID` 的语义是「池子里装的是哪个分类」，不是「用户点了哪个」。
- **分类文件名来自远端，不能照着它发请求**。`LivewallCategoryEntry.resolvedFileURL(relativeTo:)` 只接受纯文件名（不含 `/`、`\`、`:`，不是 `.`/`..`，以 `.json` 结尾）并校验 host/scheme 与索引一致 —— 否则远端改一个字段就能把客户端请求指到任意地址。
- **失败分类不能靠解析错误文本**。实测 AVFoundation 对 404 的本地化描述是「在此服务器上找不到所请求的URL。」，不含任何数字状态码。`VideoLoader` 必须在播放前做一次 HEAD 探测拿真实状态码，交给 `FailurePolicy.classify(httpStatus:)` 分类。
- **网络类失败绝不拉黑**。一次断网会把整池好资源丢进黑名单。`FailurePolicy.action` 的判定顺序是硬约束：先看是否已达连续失败阈值 → 再看网络可达性 → 再看是否可重试 → 最后才拉黑。改动顺序会破坏这个保证。
- **容错解码的地方要跟着结构走**：`CatalogSource.categoryIds`（索引的 `source` 只有 deviceType/contentType）与 `WallpaperItem.categoryIds`（手写清单与测试构造的条目没有这个键）都用 `decodeIfPresent` 兜底。Swift 合成的 `Codable` 缺字段时抛 `keyNotFound` 而不是回退默认值 —— 漏一处就会让整份文件解不出来。
- **「选中哪个分类」必须经过 `LivewallCatalogIndex.playableCategoryID(remembered:)`**：记忆值 → 默认分类 → 第一个有内容的分类，**每一步都要求 `itemCount > 0`**。理由：菜单里 0 条的分类本来就置灰不可点，客户端不该因为生成侧 `--default-category` 指到一个还没抓过的分类就以「没有可用的内容」收场 —— 索引里明明有别的分类有内容。
- **每屏源的恢复只做一次，且必须过滤掉已不在当前分类切片里的条目**。`perScreenSources` 在**本次启动第一次成功加载清单**时恢复（`AppDelegate.pendingRestore`，由 `advance()` 取出即清空）：手动重载清单（`⌥⌘R`）时各屏已经记着当前条目，再恢复一次等于把同一段视频重新下一遍；而查不到的条目必须**退回正常取片**，不能让那块屏空着。恢复计划由 `ScreenSourceRestore.plan(store:candidateIDs:)` 这个纯函数算（可单测），`CandidatePool.restore(id:)` 负责机械动作 —— 它会同时把条目从待取队列里拿掉，否则同一轮里会再被取一次。

### 壁纸来源（线上 / 本地文件夹）

- **「壁纸来源」是线上 / 本地二选一，且与选片顺序正交**。菜单里是设置段的独立父项 `壁纸来源（线上）`（紧跟「内容过滤」），行内容由 `LiveWallCore/WallpaperSourceMenu` 出（本地态根标题带文件夹名）。**不要把它塞进「选片顺序」子菜单** —— 那样会变成四行同级单选，而「随机」与「本地」根本不是一类东西，用户没法表达「本地 + 随机」。本地模式四条硬约束：
  1. **播放地址判定一律走 `WallpaperItem.playableURL`**（接受 http(s) 与 `file://`），**不要用 `remoteURL`** —— 后者只认 http(s)，用它判定会让本地条目「灌进池子却播不了」，还会让本地固定项被 `Preferences.sanitized()` 静默清掉；`remoteURL` 现在只服务远端清洗（`CatalogCoding.sanitize`）与「下载当前壁纸」。
  2. **`VideoLoader` 对 `file://` 不做 HEAD 探测**（本地没有状态码可探），改判 `isReadableFile`，失败抛 `VideoLoadError.fileUnreadable` → `FailurePolicy` 归**资源问题**（拉黑换下一条），**绝不能归网络类**，否则失效条目会留在池子里被反复重试。
  3. **本地条目的 id 必须是绝对路径的稳定哈希**（`LocalVideoSource`，FNV-1a 64 位，冲突线性探测）：失效黑名单与每屏源记忆都按 id 记、且要跨重启生效，拿下标当 id 时「往文件夹里加一个文件」会让后面全部错位；哈希也必须**跨进程**稳定 —— Swift 的 `Hashable` 每进程随机加盐，不能拿来当持久化 id。
  4. **本地态下三个「只服务线上内容」的入口一律置灰**：`内容过滤`、`下载当前壁纸`、`打开动态壁纸`。三者**集中在 `WallpaperSourceMenu.OnlineOnlyEntry` 一处登记**、判据走 `isEnabled(_:isLocalSource:)`（穷举 switch）—— 新增线上专属入口时必须来登记，否则它会一直可点而点了没反应（没有编译错误会提示这件事，`WallpaperSourceMenuTests` 里有「登记表没漏项」的断言兜底）。已经打开的浏览窗口**不自动关闭**（只读，不影响桌面播放）。
- **`Preferences.localFolderPath` 非 nil 即启用本地来源**（不另存 `useLocalSource` 布尔量），且 `sanitized()` **只清洗空串 / 纯空白、不判文件夹是否存在**：外接盘拔掉时应当保留配置、回退线上并提示（`AppDelegate.scanLocalFolder` 的失败分支），插回来或按 `⌥⌘R` 重扫即恢复；清掉路径的唯一入口是菜单里点「线上」。同理 `AppDelegate.isLocalSource` 表示「**此刻生效**的来源」（扫描失败即翻回线上），菜单、置灰、固定时的分类同步都按它判定，**不能按配置里有没有路径判定** —— 否则会出现「菜单写着本地、画面里却是线上片单」这种自相矛盾的状态。本地来源**只在启动与手动重载（菜单「重新加载」那一项 / `⌥⌘R`）时重扫**，定时切换刻意不重扫。目录遍历必须走 `Task.detached`，主 actor 只接收结果并用 `localScanGeneration` 丢弃过期扫描 —— 大目录、外接盘或网络卷不能在主线程同步遍历。那一项的**标题随来源变**（本地来源下是「重新扫描本地文件夹」），判定条件必须与 `reloadCatalog` 的分支同源 —— 都按「**配置里有没有路径**」而不是生效态，否则会出现「盘拔了、标题写着重新加载清单、点下去却去扫本地目录」这种不一致。

### 单实例

- **同一个程序只允许跑一个实例，判据是 `flock` 而不是 PID 文件**（2026-09-21 加，起因是发现打包版与 `./run.sh` 的开发版同时在跑）。`run.sh` 是 `exec` 可执行文件，**绕过 LaunchServices 的「同 bundle id 复用已有实例」**（那条只对 Finder 双击 / `open -a` 生效），而两者身份完全相同（bundle id 都是 `com.meowv.livewall`）→ 会互相覆盖 `config.json`、改写**唯一一份**内容切片缓存（离线兜底语义直接失效）、互相抹掉日志（轮转是截断为 0 字节）、抢同一窗口层级与同一组全局热键（Carbon 进程独占，后启动的**静默失效**）。实现要点：
  - 身份 = `bundle id ?? exe-<可执行文件名>`，锁文件 `instance-<身份>.lock`；
  - 取锁必须在 **`main.swift` 里 `NSApplication` 之前**（建窗口 / 注册热键 / 写配置都有副作用）；
  - **锁不可用时照常启动**（只记一行「本次不设防」）—— 锁是防误操作，不该让 App 起不来；
  - 被挡掉时三条回执都要有：stdout（`run.sh` 是前台 `exec`）、日志（可能从 Finder/登录项启动）、`DistributedNotificationCenter` 通知老实例在状态区显示一句（否则「第二次点了没反应」会被当成坏了）；
  - 开发豁免只认 `LIVEWALL_ALLOW_MULTIPLE` 的**明确真值**（`1/true/yes/on`），写错不豁免；`run.sh --allow-multiple` 是它的入口。
  - **路径与日志格式必须收敛到 `LiveWallPaths` / `AppLog`**：启动早期（`main.swift`）也要写同一份日志与锁，各写一份路径等于埋「改了一处、另一处没改」的坑。
  - **`pkill -x LiveWall` 按可执行文件名匹配，豁免多开时会一次全杀** —— 文档里要点到这条。

### 菜单、状态区与热键

- **状态项必须常驻，菜单底部提供「退出动态壁纸」项**。`statusItem.behavior = []`（去掉默认的 `.removalAllowed` 与 `.terminationOnRemoval`）：留着前者用户一 ⌘ 拖走图标就没了，留着后者更糟 —— 拖走会直接把 App 终止掉。菜单退出、`pkill -x LiveWall` 和系统终止共用 `shutdown()`；其中 Cocoa 默认不处理 SIGTERM（进程直接死、`applicationWillTerminate` 不跑、当前这张的静态图固化不了，桌面停在上一张），所以 `AppDelegate` 仍需用 `DispatchSource` 信号源接住 SIGTERM / SIGINT 并转调 `shutdown()`。不要在多个出口各写一份清理。**仍然不要拦系统终止**（`applicationShouldTerminate` 一律放行）—— 拦住会让关机 / 重启 / 注销卡住。
- **菜单里「检查更新 / 有新版本」的显隐只由 `UpdateState` 一处驱动**（`LiveWallCore/UpdateState.swift`），写入口只有 `AppDelegate.setUpdateState`（幂等）。不要再新增 `hasUpdate` / `isCheckingUpdate` 之类的布尔量 —— 两个独立开关能组合出菜单上不存在的状态。状态表与切换条件见 [`README.md`](./README.md) 的「菜单显隐」小节。更新段的**位置**在「关于动态壁纸」子菜单里、紧贴「当前版本」那一行 —— 由 `AboutMenu.Entry.updateSection` 占位决定（顺序可单测，具体内容由 `UpdateState` 决定、由 `AppDelegate` 填），不要挪回主菜单。
- **状态区附注分两种生命周期（`AppDelegate.Notice.isOneShot`）**：默认常驻（留到被下一个事件覆盖），「用户点了某个菜单项」的应答一律一次性 —— **展示过之后**菜单收起即作废。两个硬约束：① 作废时必须重建菜单（`item.menu` 持有的是上次构建的对象，只清字段的话下次展开还是旧的）；② 必须是「展示过之后」（`noticeShown`），否则结果在菜单展开期回来时会把还没显示过的最终回执清掉。真异常不能用一次性，否则用户隔很久才打开菜单就整段漏掉。
- **带 target/action 的菜单项，可用性只能写进 `validateMenuItem(_:)`**（`AppDelegate` 末尾的 `NSMenuItemValidation` 扩展），`buildXxxMenu` 里**不要再写 `isEnabled`**。原因：`NSMenu.autoenablesItems` 默认 `true`，展开菜单时 AppKit 会重新校验这类项；没实现 `NSMenuItemValidation` 时判定退化成「target 能不能响应 action」→ 手写的 `isEnabled = false` **被静默覆盖成 true**，症状是「菜单项看着能点、点了没反应」（2026-09-21 星哥实测发现「打开动态壁纸」没置灰）。`action: nil` 的说明行不受影响（target 为 nil，不被校验），仍在构建时置灰。判据尽量复用已单测的纯函数（`WallpaperSourceMenu.isEnabled(_:isLocalSource:)`、`CategoryMenu.entries`、`canPinCurrent`），不要在这里另写一份规则。
- **菜单状态区的「片名」与「附注」必须是两个字段，且附注要分信息 / 警告两级**。共用一个字段时失败信息会顶掉片名，用户看不到正在循环的是哪张，会误读成「壁纸掉了」；而附注既承载真异常（候选池耗尽、保持当前画面），也承载操作回执（窗口层级切换成功、开机自启已开启），**前缀 `⚠` 只能加在警告级上** —— 给回执加警告符号会让人以为操作失败。菜单是「状态 → 播放控制 → 设置 → 维护 → 关于」五段，插入新项时归到对应段，不要打散同类（**没有「退出」段**：状态项常驻，退出走菜单项或 `pkill -x LiveWall`）。**菜单父项的括号里只放「值」**：`多屏策略（全部同片）`、`开机自启（未开启）`、`切换间隔（5 分钟）`、`选片顺序（随机）`、`内容过滤（美女）`。**不要写「当前 xxx」**，**更不要套括号** —— 曾经出现过 `随机模式（当前 随机（每轮重新洗牌））` 这种三层嵌套。
- **菜单项的快捷键提示写进标题，不要设 `keyEquivalent`**。设了会让菜单打开时全局热键与菜单项各触发一次，切换类操作执行两遍等于互相抵消。
- **全局热键用 Carbon `RegisterEventHotKey`，不要换成 `NSEvent.addGlobalMonitorForEvents`** —— 后者需要「辅助功能」授权，会弹窗且要重启 App。代价是热键会**抢占**该组合，所以只挑不常用的 `⌥⌘` 组合，并且**注册失败必须显式提示**：重复注册同一组合返回 `eventHotKeyExistsErr`（-9878），据此区分「被占用」与「其它失败」。
- **菜单栏 App 没有 main menu，⌘ 开头的快捷键一律要自己接在 `NSWindow.performKeyEquivalent(with:)` 上**（2026-09-21 加，起因是「浏览窗口里 ⌘W 没反应」）。`LSUIElement` 进程的 `NSApp.mainMenu` 是 nil，⌘W 这类组合没有菜单项去消费它；而带 Command 的按键事件走**快捷键通道**（`NSApplication` → `NSWindow.performKeyEquivalent`），没人处理时事件被**直接丢弃**，**不会**再作为 `keyDown` 往下传 —— 所以视图/控制器里的 `keyDown`、`cancelOperation` 永远收不到它（Esc 能用是因为它不带 Command、走 `cancelOperation`）。做法：`BrowserWindow`（`NSWindow` 子类）重写 `performKeyEquivalent`，把事件转给内容视图里**唯一一份**层次规则（`dismissTopLayer()`：浮层优先、否则关窗口），自己不做判断；只认**恰好 ⌘** 的组合（`⇧⌘W` / `⌥⌘W` 交回 AppKit），匹配用 `charactersIgnoringModifiers` 而不是键码（菜单快捷键按字符匹配，非 QWERTY 布局才成立）。
- **作者信息与赞助入口只在 `LiveWallCore/AboutMenu` 维护一份**（作者名、博客地址、赞助入口 URL、条目顺序与禁用行），`AppDelegate.buildAboutMenu()` 只负责把数据翻译成 `NSMenuItem` —— 与 `buildCategoryMenu` 同一分工，那样才测得到。**赞助指向 studio 首页**（`https://studio.meowv.com`），二维码在那边页脚的弹窗里；客户端不存二维码、也不做 App 内二维码弹窗。**理由在 P10 换了**：原先写的是「那会是本项目第一个普通 UI 窗口」—— 这套成本**已经在浏览窗口上付过了**，所以它不再是拦路虎；现在不做的理由是**维护面**：二维码是运营素材（可能换渠道、换图、换尺寸），内置进客户端就得发版才能改，而 `AboutMenu` 里只维护一个 URL 就永远不用改。**不要再拿「那是第一个 UI 窗口」当理由**。
- **内容过滤按一级分类或全部，保持单选**。分类清单来自索引的 `categories`，条目数为 0 的分类也显示并置灰；首项「全部」读取 `allSlice`，导出端按壁纸 id 去重，候选池随后跨分类随机轮换。选中的分类存 `Preferences.selectedCategoryID`；`nil` 表示全部，显式分类按 id 记忆。找不到已记忆分类时回退清单默认分类并立刻写回。
- **菜单的行内容（「全部」首项、分类名、0 条置灰、单选勾选、根项标题）必须走 `LiveWallCore/CategoryMenu` 的纯函数**，不要在 `AppDelegate` 里另写一套 —— 那里没有测试，而这几条规则正是用户唯一看得见的正确性。**条目数只参与置灰，不显示**（星哥明确要求过）。**这条现在管全局**：浏览窗口左栏同样只显示分类名（0 条用 35% 透明度 + `shouldSelectRow` 返回 false 双重置灰）。

### 进程自身占用（CPU / 内存）

- **这一节的功能整体只在 debug 构建里存在**（2026-09-22 起）：菜单那一行、`ProcessMonitor`、三个状态属性、文案全部由 `#if DEBUG` 隔离，release 下既不显示也不采样。与菜单里的「打印窗口层级表」同一约定（日常走 `./build.sh` release，排障走 `./run.sh` debug）。改这里时**不要**让 release 侧产生引用，也别把 `#if DEBUG` 拆掉 —— 漏一处 release 直接编不过，所以改完 **release 与 debug 两个配置都要各编一次**验证。`LiveWallCore` 的 `ProcessUsage` / `ProcessUsageText` **刻意没包**：前者被单测锁住，后者的 `bytes(_:)` 还被更新菜单的「大小 xxx MB」用着。
- **进程自身占用只在菜单展开时采一次，收起即取消，不得引入定时器或后台轮询**。触发点在 `NSMenuDelegate` 的三个回调：`menuNeedsUpdate`（最早，发起采样）、`menuWillOpen`（置 `isMenuOpen`，**只在前者没被回调时**才兜底发起一次）、`menuDidClose`（`ProcessMonitor.cancel()`）。**每次展开只采一次**（`sampledThisOpen` 锁住）—— 采两次会算出「CPU 134%（自启动 0 秒）」这种纯噪音：第一次的结果回主 actor 后把基线推进到「刚刚那一刻」，第二次就拿着 ≈0 的区间做除法。必须用 `Task.detached(priority: .utility)` 执行采样，不能把 `DispatchWorkItem` 建在 `@MainActor` 方法里后投到后台队列 —— Swift 6 会把闭包推断成主 actor 隔离，运行时直接报 data race。区间还必须有下限 `ProcessUsage.minimumWindowSeconds`（0.25 s）：低于它**不给占用率**（显示 `CPU —`）且**不推进基线**，否则下一次查看会退化成「距上一次几乎为 0」的一连串假数据；内存是瞬时量，这种情况照样给值。四点约束：① 采样在后台任务执行，回主 actor 后**只改占用那一行的 title，不重建菜单**（重建会让正在展开的菜单闪一下并重置已展开的子菜单）；② 收起后回来的结果必须丢弃（用递增代号，`Task.cancel()` 挡不住已经在跑的那一个）；③ CPU 是**区间量**，必须两次采样求差，所以行内**必须带区间标注**（`近 3 分钟` / `自启动 1 小时`），否则会被读成瞬时值；基线由启动时的**一次性** `prepareBaseline()` 提供，否则第一次查看永远没有起点；④ 采样失败与「算不出占用率」是两回事，都不能显示成 `0%`（那是假数据）：失败 → 整行 `暂不可用`（`sample` 必须回调 nil，静默返回会让行永远停在「测量中…」），算不出 → 只把 CPU 写成 `—`、内存照常显示。
- **取 CPU 时间用 `proc_pid_rusage`，不要用 `task_info(MACH_TASK_BASIC_INFO)`**。后者在本机（macOS 27.0 / arm64）实测 `user_time` / `system_time` **恒为 0**，而同一结构体里的 `virtual_size` / `resident_size` 有值且返回 `KERN_SUCCESS` —— 直接用会得到一个永远 0% 的占用率，而「0%」看起来完全合理，极难发现。用 `proc_pid_rusage` 时还有两件事：它的 `ri_user_time` / `ri_system_time` 单位是 **mach 滴答**不是纳秒（本机 125/3 ≈ 41.67 ns/滴答，必须乘 `mach_timebase_info`；不换算会差 41 倍），以及第三个参数在 Swift 里要 rebind 成 `Optional<rusage_info_t>`，而 `RUSAGE_INFO_V2` 是宏、只能写常量 2。内存用 `ri_phys_footprint`（口径 = 活动监视器「内存」列）。

### 锁屏预览与下载

- **锁屏预览优先使用系统真实动态播放**。公开 `NSWorkspace.setDesktopImageURL` 只设置图片；macOS 27 动态路径复用用户已下载的 Apple Aerial 槽位，并把 `Index.plist` 写为 `Type=linked` 动态选择。下载与转换只在锁屏事件后执行；普通桌面轮换只更新静态回退图。用户已授权占用 Apple 资源，因此必须备份原 MOV 与 `Index.plist`，关闭「锁屏预览」时恢复；失败或版本未验证时回退静态图。锁屏事件后才开始处理，完成前可能短暂显示静态图。转换与校验不得阻塞桌面轮换或主线程。此方式会同时替换该槽位的 Apple 屏保视频，且系统更新可能重置内容。
- **静态图地址只能来自清单的 `coverUrl`，不许用 URL 规律推导**。视频与静态图可能使用不同资源 id、扩展名或日期段；另：`coverUrl` 的 `accessible` **不是真实探测结果**（`pipeline` 从不做 HEAD，走默认值 1），所以客户端**必须有抓帧兜底**，且抓帧也失败时保留系统原墙纸、不要清空。
- **抓帧使用 `AVAssetImageGenerator` 异步生成，禁止在主 actor 用 `RunLoop` 自旋等待 `AVPlayerItemVideoOutput`**。播放开始后异步缓存一帧；锁屏预览需要时优先用缓存，退出路径只复用已缓存文件，不在主线程现抓帧。抓帧复用同一 asset，**不产生额外流量**。历史上的 `AVPlayerItemVideoOutput` 探针只用于证明「不能挂 template item」，不再是现行实现。
- **退出 = 固化「当前正在播」已经缓存好的静态图**，不是恢复原墙纸。`shutdown()` → `freezeCurrent` 只复用 `lastApplied`；还没写好就保持现状不动，绝不为了补图在主线程重编码。随后给 0.3 s 生效窗口并 `reapplyCached`。真原墙纸只在首次运行时拿得到，因此持久化到 `original-wallpapers.json`，并用 `LockScreenPreviewPolicy.isOwnCacheFile` 排除自家缓存；`restoreUserWallpaper` 只服务「关闭锁屏预览开关」。
- **`LockScreenPreviewer` / `WallpaperDownloader` 标 `@MainActor` 管状态，重活留在 nonisolated async 路径**：下载走分块 delegate，帧编码走 ImageIO + `Task.detached`，不能把大图 JPEG 编码或同步文件 IO 放回主线程。
- **手动下载的落点固定 `~/Downloads/livewall/`，文件名一律走 `LiveWallCore/DownloadNaming`**，不要在别处手写清洗逻辑；扩展名必须从 URL 取（静态图有 `.jpg` 也有 `.png`）。菜单项放**维护段**（与「重新加载内容」同类的一次性动作），不设 `keyEquivalent`，没有可下载条目时置灰而不是让用户点到必然失败的动作。

### 浏览窗口（本项目唯一允许的普通 UI 窗口）

- 四条硬约束：① **单窗口复用** —— `AppDelegate` 只持有一个 `WallpaperBrowserWindowController`，已存在就 `present()` 前置；开两个窗口 = 两个预览播放器 = 同一条视频被下两遍。② **`.accessory` 下必须用 `orderFrontRegardless()` 上屏，别退回「先上屏、再激活」**：`NSApp.activate()` 自 macOS 14 起是协作式请求、系统可以直接拒绝，`activate(ignoringOtherApps:)` 的 `ignoringOtherApps` 自 macOS 14 起**完全无效**（编译器会告警「will have no effect」），而 `makeKeyAndOrderFront` 只把窗口排到本 App 窗口列表最前、提不到活跃 App 之上 —— 三者叠一起的实测后果就是「窗口开在别的 App 后面」（2026-09-21 真机复现）。`present()` 因此是 `makeKeyAndOrderFront` → `orderFrontRegardless` → 请求一次激活（被拒只损失键盘焦点）→ 下一个 runloop 再 `orderFrontRegardless` 一次（菜单收起那一拍可能把窗口压回去；重提幂等，不要换成定时器）。③ 窗口用**默认 level**（远高于桌面覆盖窗口那一层，不跟壁纸抢层级），**不切 `.regular`**（那会闪出一个 Dock 图标，而窗口里只有列表和按钮、没有文本输入），`isReleasedWhenClosed = false`（controller 持有窗口，否则关闭后再 `showWindow` 会崩）。④ **关窗只停预览播放器与在飞的缩略图请求，桌面播放不动**，也**不调 `NSApp.terminate`** —— 菜单栏图标才是这个 App 的主体。
- **浏览窗口是只读调用方：复用 `CatalogService.loadSlice`，绝不调 `cacheSlice` / `loadIndex`**。`sliceCacheURL` 只有一份，是播放的离线兜底；让它写缓存，离线启动就会读到「用户随手翻过的那个分类」而不是「上次真正在播的那个」。代价是**离线时只能浏览当前播放分类**（归属校验会拦住别的分类，显示「加载失败」，**不会显示错分类**）。它还必须有自己的请求序号（`sliceGeneration`），**不能复用 `AppDelegate.sliceRequestGeneration`** —— 那个是播放用的，混用会让「浏览别的分类」把正在播的加载结果判成过期。同理：窗口里切分类**只换列表数据、不写配置**；只有「设为桌面壁纸」且该条目属于别的分类时才同步内容过滤。
- **缩略图必须走 `LiveWallCore/ThumbnailURL` 的候选链，不要直接加载 `coverUrl`**。`coverUrl` 是**全尺寸**图：实测风景分类 3536 条全是 `.jpg`、单张 384 KB，一屏 12 张 4.6 MB、滚完一个分类 **1.3 GB**。加 `?x-oss-process=image/resize,w_360/quality,q_80` 后 10.3 KB（`w_720` 39 KB）。三条实现约束：① 地址用**字符串拼接**而不是 `URLComponents` —— 后者会把值里的 `/` 编码成 `%2F`，OSS 对编码后的值行为没有保证；② 这是**对第三方能力的依赖、没有文档保证**，所以不硬编码 host 白名单，改成「处理版 → 原图」候选链 + 内容类型兜底；③ **兜底只看 `Content-Type`（`image/*`），不要用体积阈值** —— 实测 PNG 缩略图有 115–193 KB 的，用阈值会把好图错判成失败而退回 4 MB 原图。
- **缩略图请求必须去重 + 限并发 + 失败不自动重试**（纯逻辑在 `LiveWallCore/ThumbnailRequestTracker`，有单测）。滚动时同一张图会被反复经过，自动重试等于对着一批坏地址反复发请求。网络回调线程用 ImageIO 完成降采样与解码，主 actor 只包装 `NSImage`、更新状态和 UI；内存缓存用 `NSCache`（上限 96 MB，cost 按**解码后的字节数** `pixelsWide * pixelsHigh * 4` 算），**不做磁盘缓存** —— 与「不做本地视频缓存」同一条取舍。
- **`NSCollectionView` / `NSTableView` 作为 `documentView` 时不要加 Auto Layout 约束**：它们自己管 frame，加了会跟流式布局抢高度，表现是「只能看到第一行」。做法是「先定 frame 再挂 `documentView`」+ `autoresizingMask = [.width]`。另外两条 AppKit 小坑：**卡片里不要放按钮**（操作集中在双击打开的预览浮层里）；**`NSCollectionViewItem` 的子视图不要叫 `imageView`** —— 那个属性已经存在（给 nib 用的 outlet），重名直接编译不过。
- **预览只在「双击」时开**：双击某张卡片 → 网格区上浮出一块 16:9 画面**并开始播放**，**打开即播、不可暂停/停止**（✕ / Esc / 切分类关闭）。视频复用 `VideoLoader.loaded.asset`，**不另建 `AVURLAsset`**；若这条正是桌面槽位当前播放项，必须通过 `browserLoadedVideo(for:)` 直接复用槽位 asset，不再做第二次 HEAD / 下载。**不要做成「选中即自动播」**：方向键连翻几条就会把每条视频都拉一遍，流量和 CPU 都不划算。左上角**不显示**「加载中… / 播放中 / 静态图」这类状态角标，但**失败要显示原因**（那是错误反馈，不是常态提示）。
- **网格卡片尺寸依赖「clip view 的真实宽度」，且必须在 `NSCollectionView` 子类里覆写 `setFrameSize` 挂钩**。三个坑一起踩过：① 不能用 `collectionView.bounds.width` —— 早期布局轮次里它还是整个滚动视图的宽度（984），没扣竖向滚动条（真实 967）；② clip 缩窄之后 collection view **未必再排一次**，`viewDidLayout` 与 clip 的 bounds 通知实测一次都没触发，`setFrameSize`（`autoresizingMask = [.width]`）才必然走；③ `invalidateLayout()` 不会把 collection view 标成 `needsLayout`，要手动标，而且要**显式写回 `itemSize`**。
- **`NSTableColumn` 默认宽 100pt，收窄侧栏时必须显式设 `width/minWidth/maxWidth`**。实测栏宽从 138 收到 76 之后列仍是 100 宽 —— 单元格溢出栏外，长名字被滚动视图硬裁，而不是在标签内截断成省略号。
- **按「可用宽度均分」算卡片宽时要留 1pt 余量**：整行宽度与可用宽度**正好相等**时流式布局会少放一列（浮点边界）。实测 4×226.75 + 间距 = 943、可用正好 943 → 只摆 3 列；改成 `(usable - 1) / columns` 后 4 列放得下。
- **`NSCollectionView` 没有 `doubleAction` / `target`**（`NSTableView` 才有），delegate 里也没有双击回调。双击只能在子类 `BrowserGridView.mouseDown` 里按 `event.clickCount == 2` 判，再用 `indexPathForItem(at:)` 反查命中项。**先调 `super.mouseDown`**。探针里可以造 `NSEvent.mouseEvent(...)` 直接发给 `mouseDown`，所以这条**不用人工点**也能验。
- **`didSelectItemsAt` / `didDeselectItemsAt` 现在刻意不实现**：它们此前存在的唯一理由是驱动右栏（选中 → 右栏显示它的预览与按钮），右栏移除后没有消费者。留着两个空回调只会让人以为选中态还有副作用。已知行为留档：`selectItems` **不**触发 `didSelectItemsAt`，而 `deselectAll(nil)` **会**触发 `didDeselectItemsAt`。
- **预览浮层的容器与压暗层**两个都必须是 `PassThroughView`（`hitTest` 命中自己时返回 nil，即 `hit === self`）。只改容器没用：`super.hitTest` 会先命中铺满整个区域的**压暗层并返回它**（不是 self），事件照样被吃掉，网格仍是死区。验这条要**直接测 `hitTest`**，断言「面板外的点既不在浮层内、又落在网格内」—— 直接调 `grid.mouseDown(with:)` 绕过事件派发，测不出来（误判过一版）。
- **写 UI 断言必须限定在被测容器内，且要统一坐标系** —— 三个都踩过：① 用「`content` 下所有 `NSTextField` 里以『风景壁纸』开头的那个」当标题，而网格卡片的标签本身就是「风景壁纸 N 4K」→「无残留」永远为 true（假阳性）；`private` 容器取不到时，**借里面那个按钮的 `superview` 反查**再收集。② `panel.frame` 是相对浮层的，跟 `gridScroll.frame`（相对 root）比「是否居中」永远不等 —— 先 `convert(_:to:)` 到同一个坐标系。③ **AppKit 是非翻转坐标系**，`frame.minY` 才是「距底」；写 `bounds.height - frame.maxY` 量到的是距顶（实测「距底 12」被读成 279）。
- **同一行里「文字 + 按钮」必须显式排压缩阻力**：两者默认阻力相同，超长文字会把按钮压成 **0 宽**（实测 85 字标题把「停止预览」压没了，短标题下它是 76 宽）。给文字 `setContentCompressionResistancePriority(.defaultLow, for: .horizontal)` + hugging `.defaultLow`，给按钮两个都 `.required` —— 该截尾的是文字，按钮没了是功能损失。断言要量**按钮宽度**和「文字右缘 vs 按钮左缘」，只看「面板宽度没变」发现不了。
- **Auto Layout 的等式是双向的**：`panel.width == overlay.width - 80` 会让求解器为了满足它**反过来压窄**网格区（实测窗口从 1060 被压到 778 = 138 + 640，而 640 = 560 + 80，甚至小于 `minSize` 880）。要「跟着父视图收缩但有上限」，用**常量宽度约束 + 在 `viewDidLayout` 里按实际宽度夹取**，不要靠等式 + 优先级。定位手段是二分：注释掉可疑的子视图构建，看窗口宽度是否恢复。
- **「不引入新字面量」的改动，字符串扫描验不了**（两栏改造复用的全是既有文案）。改用 `otool -oV <binary>` 查类与方法：`BrowserGridView`（superclass `NSCollectionView`，带 `mouseDown:`）、`PassThroughView`（superclass `NSView`，带 `hitTest:`）。⚠️ **Swift 合成的选择子带参数名**（`collectionView:didDeselectItemsAtIndexPaths:`），按直觉搜 `...At:` 会假阴性。

### 反编译门槛与自校验

- `strip -x` 抹的是**符号表**与体积，**不是路径** —— 路径的载体是 `.dSYM`，而 `build.sh` 只拷 `Contents/MacOS/LiveWall`、不拷 dSYM，所以路径本来就不会随 `.app` 外泄。真正抹不掉的是 Swift 类型名（在 `__swift5_*` 元数据段，只能改源码）与 `fatalError` 默认 `file: #file` 带进来的源文件名字符串常量（要清掉就显式传 `file: "", line: 0`）。`-disable-reflection-metadata` 实测无效。
- `PackedText` / `IntegrityCheck` 的文件名仍是描述性的，但**类型名刻意叫 `Folded` / `Seal`**，**不要改回来**。
- 自校验只能「只记日志」——重签即可绕过，不要做成阻断式。
- **`strings` 默认只输出 ASCII**，中文串查不到，需要时做字节级搜索。

### 并发（Swift 6）

`Package.swift` 是 `swift-tools-version: 6.0`，语言模式 = Swift 6（2026-09-21 从 5.9 迁移）。
**改任何 App 层代码前先看这六条**，它们都是实测过的，不是推断：

1. **`Timer` 块、`NotificationCenter.addObserver(queue: .main)`、KVO 闭包、`NWPathMonitor` 回调都不会被推断为主 actor 隔离** —— `queue: .main` / `RunLoop.main` 只决定「投递到哪个队列」，不参与隔离推断。必须 `Task { @MainActor in }` 回跳。
   对照：**`DispatchQueue.main.async` 的闭包会被推断**为主 actor 隔离，可以直接碰隔离状态。两者容易混，别凭感觉套。
2. **嵌套类型不继承外层的全局 actor 隔离**，要单独标（如 `PlaybackEngine.Slot`）。
3. **`@MainActor` 类的 `deinit` 是非隔离的**：不能调隔离方法，也读不了非 `Sendable` 的存储属性（`Timer`、`NSObjectProtocol` 都不是）。解法是**引用类型句柄盒**（`PlaybackGovernor.CleanupBox`），**不要用 `nonisolated(unsafe)` 放宽** —— 那会让「从后台线程误改定时器」这类错误彻底静默。
4. **`Task { }` 写在 `@MainActor` 上下文里会继承主 actor**；但 `await` 一个 **nonisolated async** 函数会 hop 到全局执行器（SE-0338）。所以重活（分块下载、HEAD 探测、ImageIO 解码）仍在后台，把类标成 `@MainActor` **不会**把它们搬到主线程。
5. **`NSApplicationDelegate` 没有 `@MainActor` 标注**，`AppDelegate` 必须显式标，且**不需要** `@preconcurrency`（加了反而无效）。不要指望从协议推断。
6. **非 `Sendable` 的对象不能跨 actor 递**（`AVPlayerLooper` / `AVPlayerItem` / `Notification` 都不是）：只递 `ObjectIdentifier` 这类 `Sendable` 值，「状态是什么、归属谁」回到主 actor 再读。

**纪律：只用 `@MainActor` 标注 + 引用类型状态盒消错，禁止 actor 化消错** —— 后者会改语义。
新增代码若需要放宽检查，先确认那是真实契约（如 `URLProtocol` 的实例只由 URLSession 单线程驱动），
并把理由写进注释，不要裸写 `nonisolated(unsafe)` / `@unchecked Sendable`。

**拿全量诊断的命令**与「迁移副作用（10 个源文件名进二进制，已核实零信息增益）」见
[`README.md`](./README.md) 的「并发约定（Swift 6）」。要点：`swift build` 会在首个失败文件处停止，
`-typecheck` 会漏掉 SIL 阶段的 region isolation，只有 `-emit-sil` 能一次拿全量 ——
且必须带 `-sdk` **与** `-target`，少了 `-target` 会产出一批弃用警告假阳性。

## 验证与交付

- 优先执行与改动直接相关的轻量检查：`./test.sh`、`git diff --check`、二进制字符串扫描。
- 除非用户明确要求，不主动执行完整构建或端到端验证；只有完整构建才能可靠验证时，先说明原因并征得同意。**真机运行会真实占用桌面**，要设时长上限。
- 完成改动后简要说明：修改内容与涉及文件、实际执行的检查或测试、未验证事项与待人工验收项（例如「浏览窗口的交互只经探针验证」「锁屏界面需人眼确认」）。
- 不要自动提交、推送或创建版本；发版涉及签名私钥与线上产物，必须单独确认。
