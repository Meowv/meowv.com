import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

/// 正式 App 的主控制器。
///
/// 职责边界：这里只做编排（加载配置与清单、建窗口、跑调度、更新菜单栏），
/// 具体逻辑都在 `LiveWallCore`（可单测）与 `LiveWallDesktop`（窗口层）里。
///
/// **`@MainActor` 必须显式写，不能指望从协议推断。** `NSApplicationDelegate` 在
/// AppKit 的 `.apinotes` 里**没有** `@MainActor` 标注（实测：`final class D: NSObject,
/// NSApplicationDelegate {}` 在 Swift 6 模式下不产生任何隔离推断）—— 不写这一行，
/// 整个类就是非隔离的，于是持有的每个主 actor 隔离的协作者、每次 AppKit 调用
/// 都会报错（实测 123 条）。显式标上之后，与协议的普通一致性检查干净通过，
/// 不需要 `@preconcurrency`。
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {

    // 配置
    var preferences = Preferences.default
    /// 路径统一来自 `LiveWallPaths`（配置 / 缓存 / 日志 / 单实例锁的唯一来源）——
    /// 启动早期（`main.swift` 取锁、写日志）也要用同一份，不能各写一份。
    lazy var configURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("config.json")
    /// 索引副本缓存（几百字节）。
    lazy var indexCacheURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.index.json")
    /// 分类切片副本缓存。**只有一份** —— 配置里的 `selectedCategoryID` 就是
    /// 「上次成功加载的那个分类」，所以启动时读回来的必然对得上（另有归属校验兜底）。
    lazy var sliceCacheURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.slice.json")
    /// 已经废弃的清单缓存，启动时清掉。
    ///
    /// 三个都不能再读：`catalog.json` 是最早那版「本地清单」的残留（`catalogPath` 配置项
    /// 早已移除，没有任何代码读它）；另外两个分别是 `livewall.json` 时代的单文件缓存
    /// （里面每条候选都没有 `categoryIds`）与上一版含全量 4.9 MB 条目的「总文件」。
    lazy var legacyCacheURLs: [URL] = [
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent("catalog.json"),
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent(
            "catalog.remote-cache.json"),
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent(
            "catalog.remote-cache.catalog.json"),
    ]

    // 组件
    let screenCoordinator: ScreenCoordinator
    let engine = PlaybackEngine()
    let network = NetworkMonitor()
    /// 进程自身的 CPU / 内存采样。**只在菜单展开时采一次**，收起即取消（无定时器）。
    let processMonitor = ProcessMonitor()
    /// 锁屏预览：把当前壁纸的静态图同步成系统墙纸（桌面态被覆盖窗口挡住，只在锁屏可见）。
    lazy var lockScreenPreviewer = LockScreenPreviewer(
        cacheDirectory: LiveWallPaths.applicationSupportDirectory
    )
    /// 手动下载当前壁纸（视频 + 静态预览图）到 `~/Downloads/livewall/`。
    lazy var downloader = WallpaperDownloader()
    /// 全局热键。Carbon `RegisterEventHotKey`，不需要辅助功能授权。
    let hotKeys = HotKeyManager()
    /// 动态壁纸浏览窗口。**单窗口复用** —— 已有就前置，不重复开。
    /// 窗口关闭时由 `onClose` 置回 nil。
    var browserWindowController: WallpaperBrowserWindowController?
    /// 省电状态机。延迟创建，因为它的求值依赖已加载的 `preferences`。
    lazy var governor = PlaybackGovernor(resolverProvider: { [weak self] in
        self?.preferences.playbackStateResolver ?? PlaybackStateResolver()
    })
    var pool = CandidatePool()

    // 壁纸来源
    /// 本地文件夹**此刻是否生效**（配置里有路径，且最近一次扫描成功）。
    ///
    /// 刻意与「配置里是否写了路径」（`preferences.resolvedLocalFolderURL != nil`）分开：
    /// 外接盘拔掉时配置**保留**路径（插回来、或按 ⌥⌘R 重扫即可恢复），但此刻播的是线上
    /// 清单。菜单、内容过滤的置灰、下载的置灰都必须按**实际在用的来源**显示 ——
    /// 否则会出现「菜单写着本地、画面里却是线上片单」这种自相矛盾的状态。
    ///
    /// 写入口只有三个：`applyLocalItems`（扫描成功）、`startLocalSource` 的失败回退、
    /// `selectSource(.remote)`。
    var isLocalSource = false

    /// 来源切换的说明还没给出去（见 `consumePendingSourceNotice`）。
    ///
    /// 与 `pendingUnpinNotice` 同因同果：本地文件夹失效时会先写一句「已回到线上清单」，
    /// 紧接着线上加载成功会执行 `notice = nil`（清掉上一次的异常），那句话一次都没
    /// 显示过就被冲掉 —— 而用户恰恰需要知道画面为什么换了内容。
    var pendingSourceNotice: String?

    // 固定为桌面壁纸
    /// 是否处于固定态。
    ///
    /// **唯一真源是 `preferences.pinnedItem`**，这里刻意不另存一个 `Bool` ——
    /// 存了就会出现「配置里有固定项、标志位却是 false」这种不一致，而它一旦出现，
    /// 每一条分支都得猜该信哪个。写入只走 `setPinned` / `clearPin` 两个函数。
    var isPinned: Bool { preferences.pinnedItem != nil }

    /// 铺满固定项的加载是否在飞。防重入：同一条视频被并发拉两遍，流量直接翻倍。
    var isPinApplyInFlight = false

    /// 「设为桌面壁纸」这个动作的回执还没给。
    ///
    /// 由 `setPinned` 置位、`applyPinToMissingSlots` 成功铺满后消费。**不直接在
    /// `setPinned` 里写 `notice`**：决策 7 会同步切分类，那条路径要走一遍切片加载，
    /// 而 `applySliceResult` 里有 `notice = nil` —— 回执还没被看见就被冲掉了。
    var pendingPinAnnouncement = false

    /// 解钉提示的「重播」。
    ///
    /// `loadAndPlay` 成功时会 `notice = nil`（清掉上一次的异常），那会把刚写下的
    /// 解钉提示一起冲掉 —— 而用户恰恰需要知道「画面为什么突然换了」。
    /// 这里留一份，成功加载后写回，写回一次即作废。
    var pendingUnpinNotice: String?

    // 内容分类
    /// 清单索引。分类清单与默认分类都从这里取 —— **单一来源**，不再各存一份。
    var index: LivewallCatalogIndex?
    /// 索引里的分类清单（含条目数为 0 的）。菜单的数据源。
    var categories: [LivewallCategoryEntry] { index?.categories ?? [] }
    /// 当前**已经加载好**的一级分类 id。nil = 还没有任何内容。
    ///
    /// 注意它表示「池子里装的是哪个分类」，不是「用户点了哪个」——
    /// 切分类是异步的，只有拉取成功才会更新它（失败时保持旧值，画面与菜单才不会打架）。
    var selectedCategoryID: Int?
    /// 分类切片的请求序号。用户可能连点两次，回包时比对，过期结果直接丢弃 ——
    /// 否则会出现「点了 B，画面却停在 A」。
    var sliceRequestGeneration = 0
    /// 每个播放槽位的加载代次。旧请求完成后不能覆盖用户已经选中的新内容。
    var loadGenerationBySlot: [PlaybackSlotKey: Int] = [:]
    /// 每个槽位当前的视频加载任务。代次只能丢弃结果，任务本身也要取消，
    /// 否则旧的 HEAD / AVURLAsset 加载仍会继续占用网络和解码资源。
    var loadTasksBySlot: [PlaybackSlotKey: Task<Void, Never>] = [:]
    /// 同一 URL 的并发准入校验只执行一次。多屏候选不足时，多个槽位会共享同一条视频。
    /// 这里只做 in-flight 去重，不长期缓存 `AVURLAsset`，避免把大型资源留在内存中。
    ///
    /// ⚠️ **读写一律经下面三个辅助函数，不要直接下标访问**。`loadVideo` 是**非隔离的
    /// async 函数**，函数体跑在协作线程池上（不是主线程）；每屏独立模式下两个槽位会同时
    /// 取片，于是两个线程同时改这张表 —— Swift 的 `Dictionary` 不是线程安全的，实测会
    /// **损坏存储指针并直接崩**：`Dictionary._Variant.setValue` 里
    /// `-[NSTaggedPointerString count]: unrecognized selector sent to instance 0x8000…`。
    /// 已用同构探针稳定复现（不安全版必崩，加锁版 3/3 干净）。
    var sharedVideoLoads: [URL: Task<LoadedVideo, Error>] = [:]
    let sharedVideoLoadsLock = NSLock()

    /// 待恢复的每屏源（displayID → 条目 id）。见 `ScreenSourceRestore`。
    ///
    /// 只在**本次启动第一次成功加载清单**时填入，由 `advance()` 取出后立刻清空 ——
    /// 所以它天然是「一次性」的，不会影响之后的定时切换。
    var pendingRestore: [UInt32: Int] = [:]

    // 失败处理
    let failurePolicy = FailurePolicy()
    /// 各槽位的连续失败次数。
    ///
    /// 按槽位分开而不是用一个全局计数：每屏独立时副屏挂掉不该把主屏也停掉，
    /// 否则「某一块屏的问题」会被放大成「壁纸没了」。
    var failuresBySlot: [PlaybackSlotKey: Int] = [:]
    /// 各槽位对同一条目的重试次数。同样是按槽位的。
    var retriesBySlot: [PlaybackSlotKey: Int] = [:]
    /// 因网络不可达而暂停切换中。网络恢复时立刻重试，不等定时器。
    var isHoldingForNetwork = false

    // 状态
    var statusItem: NSStatusItem?
    var scheduleTimer: Timer?
    /// 状态区第二行：当前（或最后一次成功播放的）条目名。
    ///
    /// 刻意与 `notice` 分开。以前两者共用一个字段，结果是失败时名称行被
    /// 「候选池已耗尽」顶掉，用户看不到正在循环的是哪张，容易误读成「壁纸掉了」。
    var currentName = "启动中"
    /// 各槽位当前播放的条目名。多槽位时状态区把它们拼成一行。
    var namesBySlot: [PlaybackSlotKey: String] = [:]
    /// 状态区附注行（容量、暂停原因、设置回执等）。非 nil 时显示一条。
    ///
    /// 成功加载下一条时清空 —— 它的生命周期是「上一次异常或操作到现在」。
    var notice: Notice? {
        // 换了内容就重新计「是否已展示」：`didSet` 能覆盖全部 20 多处写入点，
        // 不依赖每个调用点自己记得重置。
        didSet { noticeShown = false }
    }

    /// 当前这条附注是否已经进过一次菜单构建。
    ///
    /// **一次性回执只在展示过之后才作废**。少了这个判断会吞掉回执：
    /// 结果回来时菜单可能正开着（那时不能重建菜单，见 `setUpdateState`），
    /// 用户看到的是上一版菜单里的「正在检查更新…」，而 `notice` 已经被覆盖成
    /// 最终结果 —— 此时关菜单清掉的正是那条**还没显示过**的回执，等于「点了没反应」。
    var noticeShown = false

    /// 上一次**配置写失败**的说明。**刻意独立于 `notice`**。
    ///
    /// 为什么不能塞进 `notice`：`notice` 会被后续的成功路径清成 nil
    /// （`applySliceResult`、`loadAndPlay` 成功时都会），而「设置没存上」这件事
    /// 恰恰发生在一次成功操作之后 —— 写进 `notice` 会被那次成功静默吞掉，
    /// 于是「改完当场生效、重启回退」又一次变成没有痕迹的怪事。
    /// 这里单独留一格，**由下一次成功的写入清掉**，菜单里单独占一行。
    var persistenceFailure: String?

    /// 菜单是否处于展开状态。**采样只在这个窗口期有效** —— 收起之后才回来的
    /// 结果一律丢弃，否则会去更新一个已经不存在的菜单。
    var isMenuOpen = false

    /// 展开期间收到过刷新请求，收起后要**补一次**菜单重建。
    ///
    /// 与 `isMenuOpen` 配套：展开期不换 `item.menu`（会闪一下、并重置已展开的子菜单），
    /// 但也不能把这次刷新丢掉 —— 状态是变了才来刷新的，丢掉就等于「点了没反应」。
    var isMenuRebuildPending = false
    /// 本次展开是否已经发起过采样。**每次展开只采一次**是硬要求 ——
    /// 采两次的话，第一次的结果回到主线程后会把基线推进到「刚刚那一刻」，
    /// 第二次就拿着一个≈0 的区间去除，实测算出「CPU 134%（自启动 0 秒）」这种纯噪音；
    /// 而它还会因为代号更新把第一次的结果直接丢掉。
    var sampledThisOpen = false
    /// 最近一次进程自身占用采样。菜单重建时用它填内容，避免每次都从占位文案开始闪。
    var usageReport: ProcessMonitor.Report?
    /// 上一次采样是否失败。用来把状态区从「测量中…」切到「暂不可用」——
    /// 一直停在「测量中」会让用户以为程序卡住了，而真相是取不到数据。
    var usageFailed = false
    /// 退出清理只做一次（`applicationWillTerminate` 与信号源可能都触发）。
    var isShuttingDown = false

    /// 是否正在重建窗口。见 `rebuildWindows` 的说明。
    var isRebuilding = false
    /// 重建期间又收到的重建请求（原因）。重建结束后**合并执行一次**，不丢。
    var pendingRebuildReason: String?
    /// SIGTERM / SIGINT 的信号源。必须持有 —— 释放了就收不到信号。
    var signalSources: [DispatchSourceSignal] = []
    /// 进程占用那一行的标记。`buildMenu` 重建菜单后靠它在 `menuNeedsUpdate` 里
    /// 找到对应行 —— 用标记而不是持有 `NSMenuItem`，就不会出现「引用的是上一个菜单里的行」。
    static let usageRowID = "usage"
    /// 版本检查器。只在被调用时发起请求，没有定时器。
    let updateChecker = UpdateChecker()
    /// **更新功能在菜单里的唯一状态**。菜单显隐、可点性、文案全部由它派生，
    /// 改它必须走 `setUpdateState`（那里负责幂等与重建菜单）。
    var updateState: UpdateState = .idle
    /// 进行中的这一次检查是不是用户点的。**只有手动检查才给界面回执** ——
    /// 启动与网络恢复时的自动检查没人在等结果，静默才是对的。
    var pendingManualUpdateCheck = false

    /// 附注内容与级别。
    ///
    /// 分级别而不是在展示时统一加「⚠」：这一行既承载「候选池已耗尽」（真出问题），
    /// 也承载「窗口层级：…」「开机自启已开启」（用户刚做的操作的回执）。
    /// 给回执加上警告符号会让人以为操作失败了。
    struct Notice {
        enum Level {
            /// 操作回执、状态说明。原样显示。
            case info
            /// 真异常：资源耗尽、设置失败、保持画面等。加「⚠」前缀。
            case warning
        }

        var level: Level
        var text: String
        /// 一次性：菜单收起即作废。用于「用户点了某个菜单项」的应答 ——
        /// 它回答的是那一次点击，看一次就该消失。
        ///
        /// 默认 `false`（常驻）：绝大多数这里的行是真异常，用户可能隔很久才打开
        /// 菜单，一次性的话就把异常漏掉了。
        var isOneShot = false

        static func info(_ text: String, oneShot: Bool = false) -> Notice {
            Notice(level: .info, text: text, isOneShot: oneShot)
        }

        static func warning(_ text: String, oneShot: Bool = false) -> Notice {
            Notice(level: .warning, text: text, isOneShot: oneShot)
        }

        /// 菜单里的显示文案。前缀只在这一处加，避免各调用点各写一遍。
        var display: String {
            level == .warning ? "⚠ \(text)" : text
        }
    }

    /// 用户手动暂停。真值存在 governor 的信号里，这里只是方便读取。
    var isUserPaused: Bool { governor.signals.userPaused }

    override init() {
        preferences = Preferences.default
        screenCoordinator = ScreenCoordinator(level: Preferences.default.levelPreset.level)
        super.init()
    }

    // MARK: - 生命周期

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 先写下「本次是哪个进程」：两个实例曾同时跑过（单实例锁就是为此加的），
        // 排障时必须能从日志分辨哪几条属于哪个副本 —— pid + 包路径是唯一可靠的依据。
        log("启动实例 pid=\(getpid()) 路径=\(Bundle.main.bundleURL.path)")

        // 单实例锁的持有者通知：新实例被挡掉时会发这个通知，这里给用户一句回执 ——
        // 否则「第二次点了没反应」会被当成 App 坏了。
        DistributedNotificationCenter.default().addObserver(
            forName: SingleInstance.duplicateLaunchNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // 观察者闭包是 `@Sendable` 的 —— `queue: .main` 只决定「在哪个队列上执行」，
            // **不参与隔离推断**，所以哪怕队列明确是主队列，也不能直接碰主 actor 状态。
            // 必须显式回跳。（对照：`DispatchQueue.main.async` 的闭包会被推断为主 actor
            // 隔离，不需要这一步 —— 两者容易混，实测过。）
            Task { @MainActor in
                guard let self else { return }
                self.notice = .info("已阻止重复启动（新实例已退出）")
                self.log("收到重复启动通知：已挡掉的新实例退出，本实例继续运行")
                self.refreshStatusItem()
            }
        }

        // 自身完整性自检。**只记日志、不阻断** —— 理由见 `Seal`：
        // 本 App 是 ad-hoc 签名，重签即可绕过，拿它拦启动只会误伤正常用户。
        reportSeal()

        let loaded = Preferences.load(from: configURL)
        preferences = loaded.sanitized()
        // 修正过（旧版清单地址迁移、超范围值夹紧、非法分类 id 清掉）就立刻落盘 ——
        // 否则每次启动都要重算一遍，而且配置里留着的东西和实际生效的不一致。
        // 写失败必须显式说出来：`try?` 会让「修正了但没存上」看起来像成功。
        if preferences != loaded {
            do {
                try preferences.save(to: configURL)
                log("配置已修正并写回：\(configURL.lastPathComponent)")
            } catch {
                log("⚠️ 配置已修正但写回失败（本次仍按修正后的值运行）：\(error.localizedDescription)")
            }
        }

        // 已废弃的清单缓存不再被读取，只剩占位，清掉。
        for legacy in legacyCacheURLs where FileManager.default.fileExists(atPath: legacy.path) {
            try? FileManager.default.removeItem(at: legacy)
            log("已清理废弃的清单缓存 \(legacy.lastPathComponent)")
        }

        // 菜单退出与 `pkill` 都必须经过同一个 `shutdown()` 清理路径；
        // SIGTERM 仍需接住，因为 Cocoa 默认不会为它调用 `applicationWillTerminate`。
        installSignalHandlers()

        buildStatusItem()

        registerNotifications()

        engine.onFailure = { [weak self] key, error in
            self?.handlePlaybackFailure(key, error)
        }

        // 锁屏预览的日志与提示出口。提示只在真失败时给一次（见 `LockScreenPreviewer`），
        // 免得每换一张片就刷一条警告。
        lockScreenPreviewer.log = { [weak self] message in self?.log(message) }
        lockScreenPreviewer.onNotice = { [weak self] message, isWarning in
            guard let self else { return }
            self.notice = isWarning ? .warning(message) : .info(message)
            self.refreshStatusItem()
        }
        downloader.log = { [weak self] message in self?.log(message) }
        updateChecker.onResult = { [weak self] decision, warnings in
            self?.applyUpdateResult(decision, warnings: warnings)
        }

        network.onChange = { [weak self] reachable in
            guard let self else { return }
            self.log(reachable ? "网络已恢复" : "网络已断开（当前画面继续循环，暂不切换）")
            // 之前是因为网络不通才保持画面的，现在恢复了就立刻重试，不等定时器
            if reachable, self.isHoldingForNetwork {
                self.scheduleTimer?.invalidate()
                self.failuresBySlot.removeAll()
                self.advance()
            }
            self.refreshStatusItem()
            // 断网时那次检查根本没发出去，恢复后补一次（内部有节流，不会重复打）。
            if reachable { self.performUpdateCheck(force: false) }
        }
        network.start()

        // 省电状态机。信号采集（这里与 PlaybackGovernor）与判定（LiveWallCore 里的纯函数）
        // 刻意分开：判定逻辑能穷举验证，采集部分只负责把系统状态读出来。
        governor.onStateChange = { [weak self] state, signals in
            self?.applyPlaybackState(state, signals: signals)
        }
        governor.start()

        // 全局热键。注册失败必须显式告知 —— 组合被别的程序占用时静默失效，
        // 用户只会以为「这个功能坏了」，而原因（换个组合就行）其实很好解决。
        hotKeys.onTrigger = { [weak self] id in
            self?.handleHotKey(id)
        }
        let hotKeyOutcomes = hotKeys.registerDefaults()
        let conflicts = hotKeyOutcomes.filter { !$0.isRegistered }
        if conflicts.isEmpty {
            log("全局热键已注册：" + hotKeyOutcomes.map(\.summary).joined(separator: "、"))
        } else {
            log("⚠️ 全局热键不可用：" + conflicts.map(\.summary).joined(separator: "、"))
        }

        // 窗口必须在 applicationDidFinishLaunching 里**同步**创建。
        //
        // 实测：如果推迟到 asyncAfter 里创建，窗口会被系统加上对称边距
        // （1512x982 的屏幕拿到 9,5 1494x972），导致「覆盖整屏」判定失败。
        // 探针在启动过程中同步建窗口，因此没有这个问题。
        screenCoordinator.apply(level: preferences.levelPreset.level)
        // 策略要在建窗口之前定好。这里用不 rebuild 的版本 —— `apply(policy:)`
        // 会自旋等待上屏，而在 applicationDidFinishLaunching 里自旋会让窗口
        // 被系统加上对称边距（见 `createWindows` 的注释）。
        screenCoordinator.setPolicyWithoutRebuild(preferences.multiScreenPolicy)
        screenCoordinator.createWindows()

        // 层级自检要等窗口真正上屏后再做：同步查询窗口列表会查不到刚建的窗口。
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self else { return }

            let calibration = self.screenCoordinator.calibrate(
                startingFrom: self.preferences.levelPreset)
            self.syncPlaybackSlots()

            self.log(
                "屏幕 \(self.screenCoordinator.screenCount) 块，窗口 \(self.screenCoordinator.windows.count) 个"
            )
            for attempt in calibration.attempts {
                self.log(
                    "  尝试 \(attempt.preset.shortLabel)(\(attempt.preset.level))：\(attempt.verdict.summary)"
                )
                for note in attempt.verdict.notes { self.log("    · \(note)") }
            }
            self.log("层级自检：\(calibration.verdict.summary)")
            if calibration.preset != self.preferences.levelPreset {
                self.log(
                    "基线层级 \(self.preferences.levelPreset.shortLabel) 未通过，降级为 \(calibration.preset.shortLabel)"
                )
            }

            // 自检未通过时才把窗口实况打出来，便于定位；正常路径不刷日志
            if !calibration.verdict.isHealthy {
                let numbers = self.screenCoordinator.windowNumbers
                for record in WindowInspector.snapshot() where numbers.contains(record.windowNumber)
                {
                    self.log(
                        "  窗口 #\(record.windowNumber) layer=\(record.layer) bounds=\(record.boundsText) 覆盖整屏=\(WindowInspector.coversAnyScreen(record.bounds))"
                    )
                }
            }

            // 进程占用的**启动基线**放在启动流程的最后：一次性采样（不是定时器），
            // 让第一次展开菜单就有可比较的起点。
            //
            // 刻意排在窗口与菜单都建好之后 —— 否则首屏那个「自启动 0 秒」会把建窗口 +
            // 建菜单的一次性开销算进来。实测那样会显示「CPU 85%（自启动 0 秒）」，
            // 看着像 App 吃满 CPU，其实只是启动那几百毫秒。
            self.processMonitor.prepareBaseline()
            // 壁纸来源二选一：配置了本地文件夹就直接扫它，**完全不碰远端清单** ——
            // 本地模式的意义就是离线可用，顺手拉一次索引只会白费流量。
            if let folder = self.preferences.resolvedLocalFolderURL {
                self.startLocalSource(folder, isFirstLoad: true)
            } else {
                self.loadCatalogAndStart()
            }
            // 版本检查刻意排在最后并再延后几秒：清单加载与首次取片正在抢网络，
            // 不该跟着挤。失败一律静默，不影响 App 正常用。
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                self?.performUpdateCheck(force: false)
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        shutdown()
    }

    /// 退出清理。系统终止与信号退出走同一条路径 —— 两个出口各写一份早晚会漏。
    func shutdown() {
        guard !isShuttingDown else { return }
        isShuttingDown = true
        processMonitor.cancel()
        scheduleTimer?.invalidate()
        for task in loadTasksBySlot.values { task.cancel() }
        loadTasksBySlot.removeAll()
        for task in drainSharedLoads() { task.cancel() }
        network.stop()
        persistScreenSources()
        // 退出要的是「把当前播放的静态图留在桌面上」，**不是**恢复用户原墙纸 ——
        // 后者会让桌面跳回一张跟刚才播放内容毫不相干的图。
        // 必须在 `engine.teardown()` 之前：抓帧兜底要求播放器还在播。
        freezeCurrentWallpaper()
        // `setDesktopImageURL` 生效有延迟（见 `reapplyCached` 的说明），而进程马上
        // 就要退出 —— 给主线程一点时间让它落地，然后再设一次兜底。
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        lockScreenPreviewer.reapplyCached()
        // 浏览窗口也要关掉：它持有预览播放器与在飞的缩略图请求，
        // 留着会让进程在「已经退出清理」之后还挂着一个窗口。
        browserWindowController?.close()
        engine.teardown()
    }

    // MARK: - 配置落盘

    /// 写回配置。**失败必须说出来**。
    ///
    /// 此前 13 个调用点清一色写 `try? preferences.save(to: configURL)`：磁盘满、
    /// 目录权限异常、配置被改成只读时，用户改的间隔 / 顺序 / 固定项 / 省电开关全部
    /// 「当场生效、重启回退」，而日志里没有任何痕迹。同一个文件在启动路径
    /// （`applicationDidFinishLaunching`）里专门写了「写失败必须显式说出来」——
    /// 规则是对的，只是没被执行到每一个调用点。
    ///
    /// 失败信息进 `persistenceFailure` 而不是 `notice`，理由见那个属性的说明。
    ///
    /// - Parameter context: 出问题时能定位是哪个动作触发的写入，例如「切换间隔」。
    func persistPreferences(_ context: String) {
        do {
            try preferences.save(to: configURL)
            // 写成功了：上一次的失败说明已经不成立，清掉。
            if persistenceFailure != nil {
                persistenceFailure = nil
                refreshStatusItem()
            }
        } catch {
            let message = "设置未能保存（\(context)）：\(error.localizedDescription)"
            log("⚠️ \(message)")
            persistenceFailure = message
            refreshStatusItem()
        }
    }

    /// 退出前把「当前正在播的那条」的静态图固化成系统墙纸。
    ///
    /// 锁屏预览关着时系统墙纸从没被动过，什么都不用做。
    /// 抓帧兜底要求播放器还在播，所以只能排在 `engine.teardown()` 之前。
    func freezeCurrentWallpaper() {
        guard preferences.lockScreenPreview else { return }
        guard let primary = engine.primaryKey, let item = engine.item(on: primary) else { return }
        lockScreenPreviewer.freezeCurrent(
            itemID: item.id,
            multiScreenPolicy: screenCoordinator.policy,
            frameProvider: { self.engine.currentFrame(on: primary) }
        )
    }

    /// 接住 SIGTERM / SIGINT 并转成正常退出流程。
    ///
    /// 菜单退出项会走 AppKit 的正常终止流程；命令行 `pkill -x LiveWall` 送的是 SIGTERM，
    /// Cocoa 默认不处理它，仍需由信号源显式转调 `shutdown()`。
    /// 先用 `SIG_IGN` 撤掉默认动作，再让 GCD 的信号源在主线程触发 `shutdown()`。
    ///
    /// 刻意**不拦**系统终止（`applicationShouldTerminate` 一律放行）：
    /// 拦住会让关机 / 重启 / 注销卡住，代价远大于保住一个常驻图标。
    func installSignalHandlers() {
        for sig in [SIGTERM, SIGINT] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler { [weak self] in
                self?.log("收到信号 \(sig)，开始退出清理")
                self?.shutdown()
                exit(0)
            }
            source.resume()
            signalSources.append(source)
        }
    }

    var gravity: AVLayerVideoGravity {
        preferences.gravity == "fit" ? .resizeAspect : .resizeAspectFill
    }


    // MARK: - 日志状态

    // 这三个是**实例存储属性**，Swift 的 extension 放不了存储属性，只能留在主类声明里。
    // 它们本属「日志」一节，正文见 AppDelegate+Logging.swift。

    /// 日志落盘锁。
    ///
    /// `log(_:)` 会被主线程、网络回调、调度定时器等多处调用，而轮转是
    /// 「读大小 → 清空 → 写说明 → 写正文」的多步操作。整个序列必须与写入处在同一把锁内，
    /// 否则两个线程同时轮转会写出两条说明，或者把正在写的那条清掉。
    let logLock = NSLock()

    /// 距上次文件大小检查后累计写入的条数。
    var logWritesSinceCheck = 0
    /// 上次文件大小检查的时刻。
    var logLastCheck = Date()
}
