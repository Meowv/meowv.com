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
    private var preferences = Preferences.default
    /// 路径统一来自 `LiveWallPaths`（配置 / 缓存 / 日志 / 单实例锁的唯一来源）——
    /// 启动早期（`main.swift` 取锁、写日志）也要用同一份，不能各写一份。
    private lazy var configURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("config.json")
    /// 索引副本缓存（几百字节）。
    private lazy var indexCacheURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.index.json")
    /// 分类切片副本缓存。**只有一份** —— 配置里的 `selectedCategoryID` 就是
    /// 「上次成功加载的那个分类」，所以启动时读回来的必然对得上（另有归属校验兜底）。
    private lazy var sliceCacheURL: URL = LiveWallPaths.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.slice.json")
    /// 已经废弃的清单缓存，启动时清掉。
    ///
    /// 三个都不能再读：`catalog.json` 是最早那版「本地清单」的残留（`catalogPath` 配置项
    /// 早已移除，没有任何代码读它）；另外两个分别是 `livewall.json` 时代的单文件缓存
    /// （里面每条候选都没有 `categoryIds`）与上一版含全量 4.9 MB 条目的「总文件」。
    private lazy var legacyCacheURLs: [URL] = [
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent("catalog.json"),
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent(
            "catalog.remote-cache.json"),
        LiveWallPaths.applicationSupportDirectory.appendingPathComponent(
            "catalog.remote-cache.catalog.json"),
    ]

    // 组件
    private let screenCoordinator: ScreenCoordinator
    private let engine = PlaybackEngine()
    private let network = NetworkMonitor()
    /// 进程自身的 CPU / 内存采样。**只在菜单展开时采一次**，收起即取消（无定时器）。
    private let processMonitor = ProcessMonitor()
    /// 锁屏预览：把当前壁纸的静态图同步成系统墙纸（桌面态被覆盖窗口挡住，只在锁屏可见）。
    private lazy var lockScreenPreviewer = LockScreenPreviewer(
        cacheDirectory: LiveWallPaths.applicationSupportDirectory
    )
    /// 手动下载当前壁纸（视频 + 静态预览图）到 `~/Downloads/livewall/`。
    private lazy var downloader = WallpaperDownloader()
    /// 全局热键。Carbon `RegisterEventHotKey`，不需要辅助功能授权。
    private let hotKeys = HotKeyManager()
    /// 动态壁纸浏览窗口。**单窗口复用** —— 已有就前置，不重复开。
    /// 窗口关闭时由 `onClose` 置回 nil。
    private var browserWindowController: WallpaperBrowserWindowController?
    /// 省电状态机。延迟创建，因为它的求值依赖已加载的 `preferences`。
    private lazy var governor = PlaybackGovernor(resolverProvider: { [weak self] in
        self?.preferences.playbackStateResolver ?? PlaybackStateResolver()
    })
    private var pool = CandidatePool()

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
    private var isLocalSource = false

    /// 来源切换的说明还没给出去（见 `consumePendingSourceNotice`）。
    ///
    /// 与 `pendingUnpinNotice` 同因同果：本地文件夹失效时会先写一句「已回到线上清单」，
    /// 紧接着线上加载成功会执行 `notice = nil`（清掉上一次的异常），那句话一次都没
    /// 显示过就被冲掉 —— 而用户恰恰需要知道画面为什么换了内容。
    private var pendingSourceNotice: String?

    // 固定为桌面壁纸
    /// 是否处于固定态。
    ///
    /// **唯一真源是 `preferences.pinnedItem`**，这里刻意不另存一个 `Bool` ——
    /// 存了就会出现「配置里有固定项、标志位却是 false」这种不一致，而它一旦出现，
    /// 每一条分支都得猜该信哪个。写入只走 `setPinned` / `clearPin` 两个函数。
    private var isPinned: Bool { preferences.pinnedItem != nil }

    /// 铺满固定项的加载是否在飞。防重入：同一条视频被并发拉两遍，流量直接翻倍。
    private var isPinApplyInFlight = false

    /// 「设为桌面壁纸」这个动作的回执还没给。
    ///
    /// 由 `setPinned` 置位、`applyPinToMissingSlots` 成功铺满后消费。**不直接在
    /// `setPinned` 里写 `notice`**：决策 7 会同步切分类，那条路径要走一遍切片加载，
    /// 而 `applySliceResult` 里有 `notice = nil` —— 回执还没被看见就被冲掉了。
    private var pendingPinAnnouncement = false

    /// 解钉提示的「重播」。
    ///
    /// `loadAndPlay` 成功时会 `notice = nil`（清掉上一次的异常），那会把刚写下的
    /// 解钉提示一起冲掉 —— 而用户恰恰需要知道「画面为什么突然换了」。
    /// 这里留一份，成功加载后写回，写回一次即作废。
    private var pendingUnpinNotice: String?

    // 内容分类
    /// 清单索引。分类清单与默认分类都从这里取 —— **单一来源**，不再各存一份。
    private var index: LivewallCatalogIndex?
    /// 索引里的分类清单（含条目数为 0 的）。菜单的数据源。
    private var categories: [LivewallCategoryEntry] { index?.categories ?? [] }
    /// 当前**已经加载好**的一级分类 id。nil = 还没有任何内容。
    ///
    /// 注意它表示「池子里装的是哪个分类」，不是「用户点了哪个」——
    /// 切分类是异步的，只有拉取成功才会更新它（失败时保持旧值，画面与菜单才不会打架）。
    private var selectedCategoryID: Int?
    /// 分类切片的请求序号。用户可能连点两次，回包时比对，过期结果直接丢弃 ——
    /// 否则会出现「点了 B，画面却停在 A」。
    private var sliceRequestGeneration = 0
    /// 每个播放槽位的加载代次。旧请求完成后不能覆盖用户已经选中的新内容。
    private var loadGenerationBySlot: [PlaybackSlotKey: Int] = [:]
    /// 每个槽位当前的视频加载任务。代次只能丢弃结果，任务本身也要取消，
    /// 否则旧的 HEAD / AVURLAsset 加载仍会继续占用网络和解码资源。
    private var loadTasksBySlot: [PlaybackSlotKey: Task<Void, Never>] = [:]
    /// 同一 URL 的并发准入校验只执行一次。多屏候选不足时，多个槽位会共享同一条视频。
    /// 这里只做 in-flight 去重，不长期缓存 `AVURLAsset`，避免把大型资源留在内存中。
    ///
    /// ⚠️ **读写一律经下面三个辅助函数，不要直接下标访问**。`loadVideo` 是**非隔离的
    /// async 函数**，函数体跑在协作线程池上（不是主线程）；每屏独立模式下两个槽位会同时
    /// 取片，于是两个线程同时改这张表 —— Swift 的 `Dictionary` 不是线程安全的，实测会
    /// **损坏存储指针并直接崩**：`Dictionary._Variant.setValue` 里
    /// `-[NSTaggedPointerString count]: unrecognized selector sent to instance 0x8000…`。
    /// 已用同构探针稳定复现（不安全版必崩，加锁版 3/3 干净）。
    private var sharedVideoLoads: [URL: Task<LoadedVideo, Error>] = [:]
    private let sharedVideoLoadsLock = NSLock()

    /// 待恢复的每屏源（displayID → 条目 id）。见 `ScreenSourceRestore`。
    ///
    /// 只在**本次启动第一次成功加载清单**时填入，由 `advance()` 取出后立刻清空 ——
    /// 所以它天然是「一次性」的，不会影响之后的定时切换。
    private var pendingRestore: [UInt32: Int] = [:]

    // 失败处理
    private let failurePolicy = FailurePolicy()
    /// 各槽位的连续失败次数。
    ///
    /// 按槽位分开而不是用一个全局计数：每屏独立时副屏挂掉不该把主屏也停掉，
    /// 否则「某一块屏的问题」会被放大成「壁纸没了」。
    private var failuresBySlot: [PlaybackSlotKey: Int] = [:]
    /// 各槽位对同一条目的重试次数。同样是按槽位的。
    private var retriesBySlot: [PlaybackSlotKey: Int] = [:]
    /// 因网络不可达而暂停切换中。网络恢复时立刻重试，不等定时器。
    private var isHoldingForNetwork = false

    // 状态
    private var statusItem: NSStatusItem?
    private var scheduleTimer: Timer?
    /// 状态区第二行：当前（或最后一次成功播放的）条目名。
    ///
    /// 刻意与 `notice` 分开。以前两者共用一个字段，结果是失败时名称行被
    /// 「候选池已耗尽」顶掉，用户看不到正在循环的是哪张，容易误读成「壁纸掉了」。
    private var currentName = "启动中"
    /// 各槽位当前播放的条目名。多槽位时状态区把它们拼成一行。
    private var namesBySlot: [PlaybackSlotKey: String] = [:]
    /// 状态区附注行（容量、暂停原因、设置回执等）。非 nil 时显示一条。
    ///
    /// 成功加载下一条时清空 —— 它的生命周期是「上一次异常或操作到现在」。
    private var notice: Notice? {
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
    private var noticeShown = false

    /// 上一次**配置写失败**的说明。**刻意独立于 `notice`**。
    ///
    /// 为什么不能塞进 `notice`：`notice` 会被后续的成功路径清成 nil
    /// （`applySliceResult`、`loadAndPlay` 成功时都会），而「设置没存上」这件事
    /// 恰恰发生在一次成功操作之后 —— 写进 `notice` 会被那次成功静默吞掉，
    /// 于是「改完当场生效、重启回退」又一次变成没有痕迹的怪事。
    /// 这里单独留一格，**由下一次成功的写入清掉**，菜单里单独占一行。
    private var persistenceFailure: String?

    /// 菜单是否处于展开状态。**采样只在这个窗口期有效** —— 收起之后才回来的
    /// 结果一律丢弃，否则会去更新一个已经不存在的菜单。
    private var isMenuOpen = false

    /// 展开期间收到过刷新请求，收起后要**补一次**菜单重建。
    ///
    /// 与 `isMenuOpen` 配套：展开期不换 `item.menu`（会闪一下、并重置已展开的子菜单），
    /// 但也不能把这次刷新丢掉 —— 状态是变了才来刷新的，丢掉就等于「点了没反应」。
    private var isMenuRebuildPending = false
    /// 本次展开是否已经发起过采样。**每次展开只采一次**是硬要求 ——
    /// 采两次的话，第一次的结果回到主线程后会把基线推进到「刚刚那一刻」，
    /// 第二次就拿着一个≈0 的区间去除，实测算出「CPU 134%（自启动 0 秒）」这种纯噪音；
    /// 而它还会因为代号更新把第一次的结果直接丢掉。
    private var sampledThisOpen = false
    /// 最近一次进程自身占用采样。菜单重建时用它填内容，避免每次都从占位文案开始闪。
    private var usageReport: ProcessMonitor.Report?
    /// 上一次采样是否失败。用来把状态区从「测量中…」切到「暂不可用」——
    /// 一直停在「测量中」会让用户以为程序卡住了，而真相是取不到数据。
    private var usageFailed = false
    /// 退出清理只做一次（`applicationWillTerminate` 与信号源可能都触发）。
    private var isShuttingDown = false

    /// 是否正在重建窗口。见 `rebuildWindows` 的说明。
    private var isRebuilding = false
    /// 重建期间又收到的重建请求（原因）。重建结束后**合并执行一次**，不丢。
    private var pendingRebuildReason: String?
    /// SIGTERM / SIGINT 的信号源。必须持有 —— 释放了就收不到信号。
    private var signalSources: [DispatchSourceSignal] = []
    /// 进程占用那一行的标记。`buildMenu` 重建菜单后靠它在 `menuNeedsUpdate` 里
    /// 找到对应行 —— 用标记而不是持有 `NSMenuItem`，就不会出现「引用的是上一个菜单里的行」。
    private static let usageRowID = "usage"
    /// 版本检查器。只在被调用时发起请求，没有定时器。
    private let updateChecker = UpdateChecker()
    /// **更新功能在菜单里的唯一状态**。菜单显隐、可点性、文案全部由它派生，
    /// 改它必须走 `setUpdateState`（那里负责幂等与重建菜单）。
    private var updateState: UpdateState = .idle
    /// 进行中的这一次检查是不是用户点的。**只有手动检查才给界面回执** ——
    /// 启动与网络恢复时的自动检查没人在等结果，静默才是对的。
    private var pendingManualUpdateCheck = false

    /// 附注内容与级别。
    ///
    /// 分级别而不是在展示时统一加「⚠」：这一行既承载「候选池已耗尽」（真出问题），
    /// 也承载「窗口层级：…」「开机自启已开启」（用户刚做的操作的回执）。
    /// 给回执加上警告符号会让人以为操作失败了。
    private struct Notice {
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
    private var isUserPaused: Bool { governor.signals.userPaused }

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
    private func shutdown() {
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
    private func persistPreferences(_ context: String) {
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
    private func freezeCurrentWallpaper() {
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
    private func installSignalHandlers() {
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

    private var gravity: AVLayerVideoGravity {
        preferences.gravity == "fit" ? .resizeAspect : .resizeAspectFill
    }

    // MARK: - 本地文件夹数据源

    /// 扫描本地文件夹并切换过去。失败时**保留配置里的路径**并回退线上清单。
    ///
    /// 与线上路径的对应关系：`loadCatalogAndStart` + `applySliceResult` 两步在这里合成
    /// 一步 —— 本地没有索引与切片之分，扫描是同步的（一个几千文件的目录也在毫秒级），
    /// 为它引入异步只会多出一层「结果回来时状态已变」的核对。
    ///
    /// - Parameter isFirstLoad: 是否算「本次启动的第一次加载」。只有它为真时才恢复
    ///   每屏源记忆（与线上路径同一条规则：手动重载时各屏已经记着当前条目，
    ///   再恢复一次等于把同一段视频重新拉一遍）。
    private func startLocalSource(_ folder: URL, isFirstLoad: Bool) {
        let items: [WallpaperItem]
        do {
            items = try LocalVideoSource.items(in: folder)
        } catch {
            let reason =
                (error as? LocalVideoSource.SourceError)?.errorDescription
                ?? error.localizedDescription
            log("⚠️ 本地文件夹不可用：\(reason)")
            // 配置里的路径**保留**（外接盘插回来、或 ⌥⌘R 重扫即可恢复），
            // 但生效来源翻回线上 —— 菜单必须如实显示。
            isLocalSource = false
            let message = "本地文件夹不可用（\(reason)），已回到线上清单"
            pendingSourceNotice = message
            notice = .warning(message)
            refreshStatusItem()
            loadCatalogAndStart()
            return
        }
        applyLocalItems(items, folder: folder, isFirstLoad: isFirstLoad)
    }

    /// 把已经扫到的本地条目灌进候选池并开播。
    ///
    /// 单独抽出来是为了让「用户刚选完文件夹」那条路径**只扫一次**：
    /// 先试扫校验、成功再进来，而不是校验一遍、启用时再扫一遍。
    private func applyLocalItems(_ items: [WallpaperItem], folder: URL, isFirstLoad: Bool) {
        isLocalSource = true
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        // 换来源等于换了一整片候选集，上一次的异常提示（分类加载失败等）不再成立。
        notice = nil

        pool.order = preferences.playbackOrder
        pool.setItems(items)
        log("壁纸来源：本地文件夹 \(folder.path)，\(items.count) 个 mp4")

        if isFirstLoad && !isPinned {
            // 本地条目的 id 是路径哈希，跨重启稳定，所以每屏源记忆在本地模式下同样有效。
            // 从线上切过来时记忆里的 id 一条都匹配不上（plan 会算成空），各屏正常取片。
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: Set(items.map(\.id))
            )
            if !pendingRestore.isEmpty {
                let detail = pendingRestore.map { "屏\($0.key)→\($0.value)" }.sorted().joined(
                    separator: "、")
                log("待恢复的每屏源 \(pendingRestore.count) 条：\(detail)")
            }
        }

        refreshStatusItem()

        // 固定态：不轮换，核一遍固定项即可（与线上路径同一处置）。
        guard !isPinned else {
            applyPinToMissingSlots()
            return
        }
        advance()
    }

    /// 把「来源切换」留下的说明重新挂回状态区。
    ///
    /// 线上加载成功会把 `notice` 清成 nil（那是「清掉上一次的异常」的正常行为），
    /// 而「本地文件夹不可用，已回到线上清单」正是**在它之前**写下的、用户必须看到的一句。
    private func consumePendingSourceNotice() {
        guard let message = pendingSourceNotice else { return }
        pendingSourceNotice = nil
        notice = .warning(message)
    }

    // MARK: - 清单

    /// 清单由两个文件组成，启动时按顺序拉：
    /// 1. **索引** `livewall/catalog.json`（几百字节）—— 拿到分类清单，菜单就能建了；
    /// 2. **当前分类的切片** `livewall/category.<id>.json`（约 0.6 MB）—— 拿到条目。
    ///
    /// 切分类是「再拉一个切片」，不是「在本地全量里筛」：索引里**没有条目**，
    /// 那是它保持几百字节的前提。
    private func loadCatalogAndStart() {
        let service = makeCatalogService()
        log("加载清单索引：远程=\(service.remoteIndexURL?.absoluteString ?? "未配置")")
        let requested = preferences.selectedCategoryID

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = service.loadIndex()
            DispatchQueue.main.async {
                guard let self else { return }
                self.handleIndexResult(result, service: service, requested: requested)
            }
        }
    }

    private func makeCatalogService() -> CatalogService {
        CatalogService(
            remoteIndexURL: preferences.resolvedRemoteURL,
            indexCacheURL: indexCacheURL,
            sliceCacheURL: sliceCacheURL
        )
    }

    private func handleIndexResult(
        _ result: CatalogIndexLoadResult,
        service: CatalogService,
        requested: Int?
    ) {
        // 与 `applySliceResult` 同一条理由：本地来源生效期间，线上回包（含失败回包）
        // 一律丢弃 —— 否则会把「没有可用的清单」这类提示写到正在播本地视频的状态区上，
        // 也会让索引与生效来源对不上。切回线上时会重新加载一次。
        guard !isLocalSource else {
            log("本地来源已生效，丢弃线上索引结果")
            return
        }

        guard let loaded = result.index, let origin = result.origin else {
            // 失败原因必须打出来：DNS / TLS / 超时 / 解析 各对应完全不同的处理
            for warning in result.warnings { log("  ⚠︎ \(warning)") }
            notice = .warning("没有可用的清单")
            log("清单索引加载失败：远程与本地副本都不可用")
            refreshStatusItem()
            return
        }
        index = loaded
        for warning in result.warnings { log("  ⚠︎ \(warning)") }
        log("索引来源：\(origin.label)，\(categories.count) 个分类")

        guard let target = resolveCategoryID(requested: requested) else {
            notice = .warning("没有可用的内容")
            log("索引里没有任何有内容的分类（都是 0 条）")
            refreshStatusItem()
            return
        }

        // 判定要在 `setItems` **之前**做 —— 灌进去之后池子就非空了。
        loadSlice(for: target, service: service, isFirstLoad: pool.totalCount == 0)
    }

    /// 拉取并应用某个分类的切片。
    ///
    /// 带请求序号：用户可能连点两次分类，回包时比对序号，过期结果直接丢弃 ——
    /// 否则会出现「点了 B，画面却停在 A」。
    private func loadSlice(for categoryID: Int, service: CatalogService, isFirstLoad: Bool) {
        guard let entry = categories.first(where: { $0.id == categoryID }) else { return }
        sliceRequestGeneration += 1
        let generation = sliceRequestGeneration
        log("加载分类切片「\(entry.name)」（id \(entry.id)）…")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = service.loadSlice(entry)
            DispatchQueue.main.async {
                guard let self else { return }
                guard generation == self.sliceRequestGeneration else {
                    self.log("丢弃过期的分类切片结果（\(entry.name)，id \(entry.id)）")
                    return
                }
                self.applySliceResult(
                    result, entry: entry, service: service, isFirstLoad: isFirstLoad)
            }
        }
    }

    private func applySliceResult(
        _ result: CatalogSliceLoadResult,
        entry: LivewallCategoryEntry,
        service: CatalogService,
        isFirstLoad: Bool
    ) {
        // 本地来源生效期间**丢弃线上结果**：用户可能在启动那一下（索引 / 切片还在路上）
        // 就切到了本地文件夹，回包若照常灌进候选池，就会出现「来源显示本地、池子里却是
        // 线上条目」——菜单、置灰、固定时的分类同步全都按「本地」判定，前后自相矛盾。
        // 请求序号挡不住这种情况：它不是「过期请求」，而是一次**来源已变**的有效回包。
        guard !isLocalSource else {
            log("本地来源已生效，丢弃线上切片结果（\(entry.name)）")
            return
        }

        guard let slice = result.catalog, let origin = result.origin else {
            // 刻意不动播放器：保持当前画面比黑屏好。
            // 首次加载时池子是空的，没有「当前画面」可保持，文案要说实话。
            for warning in result.warnings { log("  ⚠︎ \(warning)") }
            if pool.totalCount == 0 {
                notice = .warning("没有可用的内容")
                log("⚠️ 分类「\(entry.name)」切片加载失败，且当前没有在播的内容")
            } else {
                notice = .warning("分类「\(entry.name)」加载失败，保持当前画面")
                log("⚠️ 分类「\(entry.name)」（id \(entry.id)）切片加载失败，保持当前画面")
            }
            refreshStatusItem()
            return
        }

        for warning in result.warnings { log("  ⚠︎ \(warning)") }

        // 只有通过请求代次校验的结果才能成为离线副本。否则先请求 A、再请求 B，
        // B 可能先完成而 A 后完成，下一次离线启动就会读到过期分类。
        if origin == .remote, let data = result.cacheData {
            do {
                try service.cacheSlice(data)
            } catch {
                log("  ⚠︎ 分类切片已使用，但写入本地副本失败：\(error.localizedDescription)")
            }
        }

        // 切分类时 `selectCategory` 会写一句「正在加载分类「X」…」。那是**进度提示**，
        // 内容到手就该消失 —— 不能指望 `loadAndPlay` 成功时去清它：
        // 暂停（或候选池耗尽）时 `advance()` 会提前返回，那句提示就永远挂在状态区了。
        //
        // 顺带清掉更早的警告也是对的：这次操作成功了，池子已经换成新分类，
        // 「候选池已耗尽」不再成立；「已暂停调度」同样不会残留成假信息 ——
        // 成功取到内容后 `loadAndPlay` 会重排定时器，恢复播放时
        // `applyPlaybackState(.playing)` 也会重排。
        notice = nil
        // 但「本地文件夹失效、已回到线上清单」那句必须留住 —— 它正是在这次加载之前
        // 写下的，`advance()` 若因暂停/耗尽提前返回，光靠 `loadAndPlay` 兜不住。
        consumePendingSourceNotice()

        // 只有真的拿到内容才更新选中项：拉取失败时保持旧值，
        // 菜单的勾选与池子里的内容才不会打架。
        selectedCategoryID = entry.id
        if preferences.selectedCategoryID != entry.id {
            // 首次启动，或记忆值已经不在索引里（分类被删/改名）：立刻写回，
            // 否则每次启动都要重复回退一次，菜单里的勾选也不稳定。
            preferences.selectedCategoryID = entry.id
            persistPreferences("分类记忆")
        }

        pool.order = preferences.playbackOrder
        pool.setItems(slice.items)

        // 每屏独立模式下，各屏上次播的是哪一条记在 `perScreenSources` 里，这里恢复它。
        //
        // **只在本次启动第一次成功加载清单时做**：手动重载清单（⌥⌘R）时各屏已经记着
        // 当前条目，再恢复一次等于把同一段视频重新下一遍。
        // 计划里只保留**当前分类里确实存在**的条目，其余直接丢弃（见 `ScreenSourceRestore`）。
        // **固定态不填**：`advance()` 会被固定分支拦截，`pendingRestore` 不会被消费，
        // 会滞留成一份过期计划，等用户解钉后被突然消费掉 —— 表现成「解钉后莫名
        // 跳回上次开机时播的那条」。
        if isFirstLoad && !isPinned {
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: Set(slice.items.map(\.id))
            )
            if !pendingRestore.isEmpty {
                let detail = pendingRestore.map { "屏\($0.key)→\($0.value)" }.sorted().joined(
                    separator: "、")
                log("待恢复的每屏源 \(pendingRestore.count) 条：\(detail)")
            } else if preferences.multiScreenPolicy == .perScreen,
                preferences.perScreenSources.count > 0
            {
                log("每屏源记忆里的条目都不在当前分类，本轮各屏重新取片")
            }
        }

        log("内容：\(entry.name)（id \(entry.id)）\(pool.totalCount) 条，来源 \(origin.label)")
        if isFirstLoad {
            log("选片顺序：\(preferences.playbackOrder.label)（\(preferences.playbackOrder.detail)）")
        }

        refreshStatusItem()

        // 固定态：不轮换，也不因为换了分类而解钉（决策 10 —— 桌面继续播固定项，
        // 菜单「内容过滤」照实显示新分类）。
        //
        // 固定项**自包含**（`pinnedItem` 存的是整条，不是 id），所以不依赖本切片定位，
        // 这里只做一次「核一遍」：启动时各槽位还是空的，会在这里被铺满。
        // 铺满是幂等的 —— 已经铺满时就是 no-op，不会因为换个分类重下一遍视频。
        guard !isPinned else {
            applyPinToMissingSlots()
            return
        }
        advance()
    }

    // MARK: - 内容分类

    /// 解析要生效的分类：**记忆值优先**（必须仍在索引里**且有内容**），
    /// 否则用索引里的默认分类（同样要求有内容），再否则取第一个有内容的分类。
    ///
    /// 规则本身在 `LivewallIndex.playableCategoryID` 里（纯函数，可单测）；
    /// 这里只负责把「为什么换了」记进日志。
    private func resolveCategoryID(requested: Int?) -> Int? {
        let resolved = index?.playableCategoryID(remembered: requested) ?? nil
        guard let requested, resolved != requested else { return resolved }

        // 走到这里说明记忆值没能直接用上，两种情况的原因完全不同，日志要分开说
        if let entry = categories.first(where: { $0.id == requested }) {
            log("记忆的分类「\(entry.name)」条目数为 0（还没抓或已被清空），改选有内容的分类")
        } else {
            log("记忆的分类 id \(requested) 已不在索引里，回退到默认分类")
        }
        return resolved
    }

    private func categoryName(for id: Int?) -> String {
        CategoryMenu.selectedName(categories: categories, selectedID: id)
    }

    // MARK: - 调度

    /// 切到下一条。
    ///
    /// 每屏独立时**一次给所有槽位各挑一条**，先挑完再统一开始加载。
    /// 不能「加载完一个再挑下一个」—— 两次 `pool.next()` 之间隔着一个网络往返，
    /// 期间屏幕可能已经变化，槽位集合也就变了。
    private func advance() {
        // 恢复计划只对「紧接着加载完清单的那一次」有效：**先取出再清空**，
        // 这样即使下面因暂停/耗尽提前 return，它也不会泄漏到之后某一次定时切换。
        let restorePlan = pendingRestore
        pendingRestore.removeAll()

        // 固定态：**不取新片**。这是「停止轮换」的落点 —— 放在这里而不是每个调用点，
        // 是因为 `advance()` 是全局切换的唯一入口，同时覆盖：轮换定时器、网络恢复
        // （`network.onChange`）、`holdCurrent` 的 60 秒重试、`scheduleRecoveryAttempt`、
        // 「下一张」按钮与 ⌥⌘N 热键。
        //
        // 固定态下**不存在定时切换**（`scheduleNext` 已拦截），所以能走到这里的
        // 只剩恢复类请求。它们要的是「把固定项重新拉一遍」，而不是「什么都不做」——
        // 槽位里虽然还挂着固定项（`item(on:)` 非空），但那正是加载 / 播放失败的那条。
        // 所以这里用 `force`：忽略「URL 相同就算已就位」的短路。
        if isPinned {
            log("固定模式：不轮换，重新铺满固定项 \(preferences.pinnedItem?.id ?? -1)")
            applyPinToMissingSlots(force: true)
            return
        }

        // 暂停期间不加载任何新内容：既省流量，也避免「恢复时发现画面是刚拉的」。
        // 这不只是手动暂停 —— 遮挡、锁屏、息屏等任何暂停原因都算，否则网络恢复
        // 之类的旁路触发会在没人看见的时候把视频拉下来。
        // 恢复路径由 `applyPlaybackState(.playing)` 重新驱动，不会漏掉。
        guard governor.state.isPlaying else {
            let reason = governor.state.reason?.label ?? "未知"
            log("处于暂停状态（\(reason)），跳过切换")
            return
        }
        guard !pool.isExhausted else {
            notice = .warning("候选池已耗尽")
            log("候选池耗尽，停止调度")
            refreshStatusItem()
            return
        }

        let keys = engine.slotKeys()
        guard !keys.isEmpty else {
            log("没有可播放的槽位，跳过切换")
            return
        }

        var picked: [(key: PlaybackSlotKey, item: WallpaperItem)] = []
        for key in keys {
            // 恢复优先：这块屏上次播的那条还在候选集里就直接接着播。
            // 取不到（条目已不属于当前分类 / 已被清单移除）就落下去正常取片 ——
            // 绝不能因为查不到就让这块屏空着。
            if let displayID = key.displayID,
                let remembered = restorePlan[displayID],
                let item = pool.restore(id: remembered)
            {
                log("恢复 \(key.label) 上次播放的条目 \(item.id)")
                picked.append((key, item))
                continue
            }
            guard let item = pool.next() else { break }
            picked.append((key, item))
        }
        guard let fallback = picked.first else {
            notice = .warning("候选池为空")
            refreshStatusItem()
            return
        }
        // 候选比槽位少时（池里就剩一两条），后面的槽位分不到片 ——
        // 宁可几屏同片，也不要有一屏黑着。
        for key in keys.dropFirst(picked.count) {
            picked.append((key, fallback.item))
        }

        for pair in picked {
            loadAndPlay(pair.item, attempt: 0, on: pair.key)
        }
    }

    /// 只给一个槽位补一张。
    ///
    /// 与 `advance()` 的区别：那个是全局切换，这个是某槽位自己的条目失败后的补救 ——
    /// 其它槽位正在正常播放，不该被牵连着一起换片。
    private func advanceOne(_ key: PlaybackSlotKey) {
        guard governor.state.isPlaying else { return }
        // 固定态：不给这个槽位取新片，改成补固定项。覆盖三条路径 ——
        // `syncPlaybackSlots` 的新增槽位、拉黑后的补片、以及单槽位的恢复请求。
        // 放在 `isPlaying` 判断**之后**：暂停期间不加载任何新内容，与 `advance()` 同一条规则
        // （恢复时 `applyPlaybackState(.playing)` 会兜住这些空槽位）。
        if isPinned {
            applyPinToMissingSlots()
            return
        }
        guard !pool.isExhausted else {
            notice = .warning("候选池已耗尽")
            refreshStatusItem()
            return
        }
        guard let item = pool.next() else { return }
        loadAndPlay(item, attempt: 0, on: key)
    }

    /// 加载并播放指定条目。失败时按 `FailurePolicy` 决定重试、拉黑还是保持画面。
    private func loadAndPlay(_ item: WallpaperItem, attempt: Int, on key: PlaybackSlotKey) {
        loadTasksBySlot[key]?.cancel()
        let generation = (loadGenerationBySlot[key] ?? 0) + 1
        loadGenerationBySlot[key] = generation

        // 播放地址用 `playableURL`（http(s) 或 file://），**不是** `remoteURL` ——
        // 后者只认 http(s)，本地文件夹数据源的条目会被一律判成非法。
        guard let url = item.playableURL else {
            log("跳过 URL 非法的条目 \(item.id)（\(key.label)）")
            pool.blacklist(id: item.id)
            // 失效的正是固定项 → 自动解钉（决策 8），然后**全局** `advance()`
            // 而不是只补这一个槽位：固定是对所有屏生效的，失效也该所有屏一起回轮换。
            if unpinIfInvalidated(item.id) {
                advance()
            } else {
                advanceOne(key)
            }
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                // 失败重试可能已经替换了任务；不要误删新任务的句柄。
                if self.loadGenerationBySlot[key] == generation {
                    self.loadTasksBySlot[key] = nil
                }
            }
            do {
                let loaded = try await self.loadVideo(url)
                guard !Task.isCancelled else { return }
                // 加载是异步的，期间槽位可能已经被拆掉（屏拔了 / 策略切了）。
                // 往一个不存在的槽位里塞内容只会让播放器空转。
                guard self.engine.slotKeys().contains(key) else {
                    self.log("槽位 \(key.label) 在加载完成前已失效，丢弃 \(item.id)")
                    return
                }
                guard self.loadGenerationBySlot[key] == generation else {
                    self.log("槽位 \(key.label) 的旧加载结果已过期，丢弃 \(item.id)")
                    return
                }
                self.engine.play(item, loaded: loaded, on: key)
                self.failuresBySlot[key] = 0
                self.retriesBySlot[key] = 0
                self.isHoldingForNetwork = false
                self.namesBySlot[key] = item.displayName
                self.refreshCurrentName()
                // 成功加载会清掉上一次的异常提示。但**解钉提示要留住** ——
                // 用户需要知道画面为什么突然换了（固定项失效），而那句话正是在
                // 本次加载之前写下的，直接 `= nil` 会让它一次都看不见。
                // 「来源切换」的说明同理（本地文件夹失效 → 已回到线上清单）。
                if let unpin = self.pendingUnpinNotice {
                    self.notice = .warning(unpin)
                    self.pendingUnpinNotice = nil
                    self.pendingSourceNotice = nil
                } else {
                    self.notice = nil
                    self.consumePendingSourceNotice()
                }
                self.log(
                    "播放 \(item.id) \(item.title)(\(loaded.resolutionText)) 时长 "
                        + "\(String(format: "%.2f", loaded.durationSeconds))s 编码 \(loaded.codec)"
                        + " [\(key.label)]")
                // 锁屏预览：把这张的静态图同步成系统墙纸。**只跟随主槽位** ——
                // 系统墙纸全局只有一张，多槽位（每屏独立）时以主槽位为准。
                // 必须在**播放中**发起：抓帧兜底要求播放器在播，而锁屏通知到达时
                // governor 已经把播放器暂停了，那一刻只复用已缓存的图。
                if self.preferences.lockScreenPreview, key == self.engine.primaryKey {
                    self.refreshLockScreenPreview(for: item, on: key)
                }
                self.refreshStatusItem()
                // 加载是异步的，期间状态可能已翻成暂停。播放器必须服从当前状态，
                // 否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。
                // 画面保持就位（已解码缓冲），恢复时能立刻无缝续上。
                if !self.governor.state.isPlaying {
                    self.engine.pause()
                    self.log("加载完成时已处于暂停状态，画面就位但不播放")
                }
                // 只有主槽位排下一次切换：多个槽位各排一个定时器会互相覆盖。
                if key == self.engine.primaryKey {
                    self.scheduleNext(after: loaded.durationSeconds)
                    self.persistScreenSources()
                }
            } catch {
                guard !Task.isCancelled else { return }
                guard self.loadGenerationBySlot[key] == generation else {
                    self.log("槽位 \(key.label) 的旧加载失败结果已过期，忽略 \(item.id)")
                    return
                }
                self.handleLoadFailure(error, item: item, attempt: attempt, on: key)
            }
        }
        loadTasksBySlot[key] = task
    }

    /// 共享同一 URL 的并发准入校验，完成后立即移除任务引用。
    private func loadVideo(_ url: URL) async throws -> LoadedVideo {
        let (task, isNew) = takeSharedLoad(for: url)
        // 只有**建表的那一次**负责删表。让复用方也删的话，会把还在被其它槽位等待的
        // 条目提前摘掉，下一个调用方就会再拉一遍同一条视频（等于去重失效）。
        defer { if isNew { releaseSharedLoad(for: url) } }
        return try await task.value
    }

    /// 取回或创建某个 URL 的共享加载任务。
    ///
    /// **检查与插入必须在同一把锁里**：分开做的话两个槽位可能同时未命中，同一条视频
    /// 被并发拉两遍 —— 而那正是这张表存在的理由（`AGENTS.md`：一个视频只建一个 asset，
    /// 否则流量翻倍）。
    private func takeSharedLoad(for url: URL) -> (task: Task<LoadedVideo, Error>, isNew: Bool) {
        sharedVideoLoadsLock.lock()
        defer { sharedVideoLoadsLock.unlock() }
        if let existing = sharedVideoLoads[url] { return (existing, false) }
        let task = Task { () throws -> LoadedVideo in
            try await VideoLoader.load(url)
        }
        sharedVideoLoads[url] = task
        return (task, true)
    }

    private func releaseSharedLoad(for url: URL) {
        sharedVideoLoadsLock.lock()
        defer { sharedVideoLoadsLock.unlock() }
        sharedVideoLoads[url] = nil
    }

    /// 退出时取出并清空全部在飞的共享加载。**取消动作放在锁外**：`cancel()` 会跑
    /// 其它线程上的取消处理器，不该在持锁时调用。
    private func drainSharedLoads() -> [Task<LoadedVideo, Error>] {
        sharedVideoLoadsLock.lock()
        defer { sharedVideoLoadsLock.unlock() }
        let tasks = Array(sharedVideoLoads.values)
        sharedVideoLoads.removeAll()
        return tasks
    }

    /// 加载失败的统一出口。
    private func handleLoadFailure(
        _ error: Error, item: WallpaperItem, attempt: Int, on key: PlaybackSlotKey
    ) {
        let kind = FailurePolicy.classify(error)
        let failures = (failuresBySlot[key] ?? 0) + 1
        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: failures,
            retriesForItem: attempt
        )
        log("加载失败 \(item.id) [\(key.label)]：\(kind.label) → \(Self.describe(action))")

        switch action {
        case .stopScheduling:
            failuresBySlot[key] = failures
            stopSchedulingForFailedSlot(key)

        case .holdCurrent:
            holdCurrent(reason: kind.label)

        case .retrySame:
            retriesBySlot[key] = attempt + 1
            loadAndPlay(item, attempt: attempt + 1, on: key)

        case .blacklistAndAdvance:
            // 只有确认是资源本身的问题才拉黑。网络类失败绝不拉黑，
            // 否则一次断网会把整池好资源全丢进黑名单。
            pool.blacklist(id: item.id)
            failuresBySlot[key] = failures
            // 拉黑的如果正是固定项 → 自动解钉（决策 8）。
            // 注意 `.holdCurrent` / `.retrySame` / `.stopScheduling` 三个分支**保持原样**：
            // 前两个是网络类问题（不该解钉），第三个是连续失败（画面还在，也没到解钉的程度）。
            if unpinIfInvalidated(item.id) {
                advance()
            } else {
                advanceOne(key)
            }
        }
    }

    /// 某个槽位连续失败到阈值时的处理。
    ///
    /// **只有所有槽位都失败才停全局调度**：每屏独立时副屏挂掉就把主屏也停掉，
    /// 等于把「某一块屏的问题」放大成「壁纸没了」。单槽位失败只让它自己保持画面，
    /// 全局定时器照常走，下次切换时它会重新取片。
    private func stopSchedulingForFailedSlot(_ key: PlaybackSlotKey) {
        let keys = engine.slotKeys()
        let allFailed =
            !keys.isEmpty
            && keys.allSatisfy {
                (failuresBySlot[$0] ?? 0) >= failurePolicy.maxConsecutiveFailures
            }
        guard allFailed else {
            notice = .warning("\(key.label)连续失败，保持其画面")
            log("\(key.label)连续失败 \(failuresBySlot[key] ?? 0) 次，保持当前画面，其余槽位不受影响")
            if key == engine.primaryKey {
                scheduleRecoveryAttempt()
            }
            refreshStatusItem()
            return
        }
        stopScheduling(reason: "全部 \(keys.count) 个槽位连续失败")
    }

    /// 保持当前画面不动，过一会儿再试。
    ///
    /// 这里**刻意不动播放器**：当前视频已经被 AVFoundation 缓冲，继续循环即可。
    /// 一旦清空播放器或换成黑帧，就违反了「任何失败都不能黑屏」的硬约束。
    private func holdCurrent(reason: String) {
        isHoldingForNetwork = true
        notice = .warning("\(reason)，保持当前画面")
        log("保持当前画面（\(reason)），60 秒后重试")
        refreshStatusItem()

        scheduleTimer?.invalidate()
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) {
            [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.failuresBySlot.removeAll()
                self.advance()
            }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    private func stopScheduling(reason: String) {
        scheduleTimer?.invalidate()
        scheduleTimer = nil
        notice = .warning("\(reason)，已暂停调度")
        log("停止调度（\(reason)）—— 保留当前画面，不黑屏")
        refreshStatusItem()
    }

    /// 主槽位失败但副屏仍正常时，保留全局调度，稍后重新尝试取片。
    private func scheduleRecoveryAttempt() {
        scheduleTimer?.invalidate()
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) {
            [weak self] _ in
            Task { @MainActor in self?.advance() }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    /// 播放中途失败（`AVPlayerLooper` 或实际 `AVPlayerItem` 副本报告失败）。
    private func handlePlaybackFailure(_ key: PlaybackSlotKey, _ error: Error) {
        guard let item = engine.item(on: key) else { return }
        let kind = FailurePolicy.classify(error)
        log("播放失败 \(item.id) [\(key.label)]：\(kind.label)")
        // 只有主槽位管调度定时器，非主槽位失败不该把它的下一次切换也取消掉
        if key == engine.primaryKey {
            scheduleTimer?.invalidate()
        }

        let failures = (failuresBySlot[key] ?? 0) + 1
        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: failures,
            retriesForItem: retriesBySlot[key] ?? 0
        )
        switch action {
        case .stopScheduling:
            failuresBySlot[key] = failures
            stopSchedulingForFailedSlot(key)
        case .holdCurrent:
            holdCurrent(reason: kind.label)
        case .retrySame:
            let attempt = (retriesBySlot[key] ?? 0) + 1
            retriesBySlot[key] = attempt
            loadAndPlay(item, attempt: attempt, on: key)
        case .blacklistAndAdvance:
            pool.blacklist(id: item.id)
            failuresBySlot[key] = failures
            if unpinIfInvalidated(item.id) {
                advance()
            } else {
                advanceOne(key)
            }
        }
    }

    private func scheduleNext(after videoDuration: Double?) {
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        // 固定态：**不排下一次切换**。放这里而不是各调用点，是为了同时覆盖
        // 定时切换、恢复播放、改切换间隔（`rescheduleAfterIntervalChange`）、
        // 以及「播完即切」（`switchWhenFinished`）四条路径 —— 少覆盖一条就会出现
        // 「固定了几分钟后自己换了一张」。
        //
        // 日志必须写明：否则排障时看到「播完了却没有下一行」会误判成播完即切坏了。
        guard !isPinned else {
            log("固定模式：不安排下一次切换（固定项 \(preferences.pinnedItem?.id ?? -1) 一直播）")
            return
        }

        // 暂停期间不排切换：既看不到画面，也没必要消耗带宽
        guard governor.state.isPlaying else {
            log("当前处于暂停状态，暂不安排下一次切换")
            return
        }

        let policy = preferences.schedulePolicy
        let delay = policy.nextDelaySeconds(videoDuration: videoDuration)
        // 把生效的间隔设置一起打出来 —— 验证「改了间隔有没有生效」只看这一行就够
        log(
            "下次切换在 \(String(format: "%.1f", delay)) 秒后"
                + "（间隔设置 \(SwitchInterval.label(policy.intervalSeconds))，抖动 ±\(Int(policy.jitterRatio * 100))%）"
        )
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) {
            [weak self] _ in
            // 与其它定时器 / 观察者闭包同一处理：块的类型是 `@Sendable`，
            // 回跳一层让编译器看见「这一定在主 actor 上」（定时器挂在 `RunLoop.main`）。
            Task { @MainActor in self?.advance() }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    // MARK: - 省电状态

    /// 状态机翻转时的唯一落点。**播放器的暂停与恢复只在这里发生**，
    /// 各处系统通知只负责更新信号，不直接碰播放器 —— 否则多路信号会互相打架。
    private func applyPlaybackState(_ state: PlaybackState, signals: PlaybackSignals) {
        switch state {
        case .playing:
            log("恢复播放")
            engine.resume()
            // 固定态：不排下一次切换，但**要把缺片的槽位补齐** ——
            // 暂停期间新增的槽位（热插拔 / 策略切换）、以及加载失败留下的空槽位，
            // 都靠这一句收口。幂等，已铺满时是 no-op。
            if isPinned {
                applyPinToMissingSlots()
                break
            }
            // 暂停期间定时器已被取消，恢复时要重新排一次
            if scheduleTimer == nil || !(scheduleTimer?.isValid ?? false) {
                if engine.isEmpty {
                    // 启动时就被暂停（或首次加载尚未成功），此时窗口还是空白：
                    // 排下一次切换等于白等 4~6 分钟，应当立刻加载。
                    advance()
                } else {
                    scheduleNext(after: engine.primaryDuration)
                }
            }
        case .paused(let reason):
            log("暂停播放：\(reason.label)")
            engine.pause()
            scheduleTimer?.invalidate()
            scheduleTimer = nil
        }
        refreshStatusItem()
    }

    private static func describe(_ action: FailureAction) -> String {
        switch action {
        case .blacklistAndAdvance: return "拉黑并切下一条"
        case .retrySame: return "重试同一条"
        case .holdCurrent: return "保持当前画面"
        case .stopScheduling: return "停止调度"
        }
    }

    // MARK: - 系统事件

    /// ## 为什么每个闭包都包了一层 `Task { @MainActor }`
    ///
    /// 这些观察者闭包都是 `@Sendable` 的，而 `queue: .main` **不参与隔离推断** ——
    /// 直接在主 actor 隔离的方法体内写逻辑会被判「在非隔离上下文里调用主 actor 方法」。
    /// 包一层回跳是唯一不改语义的写法：`queue: .main` 保证闭包在主线队列上执行，
    /// 回跳只是让编译器看得见这件事（实测：这些闭包确实在主线程，回跳不会换线程）。
    private func registerNotifications() {
        let workspace = NSWorkspace.shared.notificationCenter

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.log("屏幕参数变化 → 重建窗口")
                self.rebuildWindows(reason: "屏幕变化")
            }
        }
        workspace.addObserver(
            forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setDisplaySleeping(true) }
        }
        workspace.addObserver(
            forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setDisplaySleeping(false) }
        }
        workspace.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) {
            [weak self] _ in
            Task { @MainActor in self?.rebuildWindows(reason: "系统唤醒") }
        }

        // 锁屏 / 解锁同样只更新信号，不直接碰播放器 ——
        // 暂停与恢复统一由 governor 的状态机决定，避免多路信号互相打架。
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.governor.setSessionLocked(true)
                // 把最近一次成功的静态图**再设一遍**：`setDesktopImageURL` 生效有延迟，
                // 而锁屏正是「用户马上要看」的时刻。这里刻意不抓帧 —— 播放器已被
                // governor 暂停，取不到新帧（见 `PlaybackEngine.currentFrame` 的说明）。
                self?.lockScreenPreviewer.reapplyCached()
            }
        }
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setSessionLocked(false) }
        }
    }

    /// 重建窗口并把播放端对齐到新的屏幕/策略。
    ///
    /// ## 为什么需要重入守卫
    ///
    /// `screenCoordinator.rebuild()` 内部会自旋 run loop 等窗口上屏（上限 1 秒），
    /// 而自旋期间**主队列上的其它 block 会照常执行** —— 包括再来一条屏幕参数变化 /
    /// 系统唤醒通知。没有守卫时那会嵌套进第二次 `rebuildWindows`，而 `createWindows()`
    /// 的第一步就是 `close()` 现有窗口 —— 于是「重建中重建」，外层拿到的是半成品状态。
    ///
    /// 后到的请求**合并成一次尾部重建**而不是丢弃：屏幕确实变了，不重建就是错的。
    private func rebuildWindows(reason: String) {
        guard !isRebuilding else {
            pendingRebuildReason = reason
            log("\(reason)：正在重建中，合并为一次尾部重建")
            return
        }
        isRebuilding = true

        let verdict = screenCoordinator.rebuild()
        syncPlaybackSlots()
        log("\(reason)后重建 \(screenCoordinator.windows.count) 个窗口：\(verdict.summary)")
        refreshStatusItem()
        persistScreenSources()

        // **先释放守卫再执行尾部重建**：不释放的话那次调用会立刻撞上守卫、
        // 把原因又记一遍而什么都不做 —— 表现为「屏幕变了但窗口一直不重建」。
        isRebuilding = false
        if let pending = pendingRebuildReason {
            pendingRebuildReason = nil
            rebuildWindows(reason: pending)
        }
    }

    /// 让播放端的槽位集合与当前屏幕/策略对齐，并重新绑定窗口。
    ///
    /// 屏幕热插拔、系统唤醒、策略切换都走这里。槽位是**按 key 复用**的：
    /// 没变化的那块屏不会重新拉视频，只有新出现的槽位才需要补一张。
    private func syncPlaybackSlots() {
        let keys = screenCoordinator.playbackSlotKeys()
        let previous = Set(engine.slotKeys())
        for key in previous where !keys.contains(key) {
            loadTasksBySlot[key]?.cancel()
            loadTasksBySlot[key] = nil
            loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1
        }
        engine.useSlots(keys)

        // 重建窗口后必须重新绑定 —— 新窗口没有 playerLayer，不 attach 就是一片黑
        for binding in screenCoordinator.windowBindings {
            engine.attach(binding.window, to: binding.key, gravity: gravity)
        }

        // 拆掉的槽位不该再占着状态区。先收集再删：遍历字典时改字典会崩。
        let staleKeys = namesBySlot.keys.filter { !keys.contains($0) }
        for key in staleKeys { namesBySlot[key] = nil }
        refreshCurrentName()

        // 策略或屏幕变了，锁屏预览的目标屏也可能变了（例如切到「仅主屏」）——
        // 不刷新的话副屏会一直顶着一张不属于它的静态图。
        if preferences.lockScreenPreview, let primary = engine.primaryKey,
            let item = engine.item(on: primary)
        {
            refreshLockScreenPreview(for: item, on: primary)
        }

        let added = keys.filter { !previous.contains($0) }
        guard !added.isEmpty else { return }
        log("新增槽位 \(added.map(\.label).joined(separator: "、"))，各取一张")
        for key in added { advanceOne(key) }
    }

    /// 状态区第二行：把所有槽位的条目名拼成一行。
    private func refreshCurrentName() {
        let names = engine.slotKeys().compactMap { namesBySlot[$0] }
        currentName = names.isEmpty ? "启动中" : names.joined(separator: " · ")
    }

    /// 把某张壁纸的静态图同步成系统墙纸（锁屏预览）。
    ///
    /// 用独立 Task：内部要下载几百 KB（最长 15 秒超时），不能挡住切换排期。
    /// `frameProvider` 只在静态图不可用时才会被调用，那时播放器仍在播（下载通常几秒内结束）。
    private func refreshLockScreenPreview(for item: WallpaperItem, on key: PlaybackSlotKey) {
        let previewer = lockScreenPreviewer
        let policy = screenCoordinator.policy
        Task { @MainActor [weak self] in
            await previewer.update(
                for: item,
                multiScreenPolicy: policy,
                frameProvider: { self?.engine.currentFrame(on: key) }
            )
        }
    }

    /// 把各屏当前播放的条目 id 写回配置，下次启动接着播（恢复见 `advance()` 里的
    /// `pendingRestore`）。
    ///
    /// 只在每屏独立模式下写 —— 另外两种策略共用一张，没有「每屏」可记。
    private func persistScreenSources() {
        guard preferences.multiScreenPolicy == .perScreen else { return }
        // 固定态不写：此时每屏播的都是同一条固定项，写进去会**覆盖用户固定前
        // 「每屏各不相同」的记忆**，解钉后重启就变成「各屏都恢复成固定项」。
        // 固定项本身另有真源（`pinnedItem`），不需要这里帮忙记。
        guard !isPinned else { return }
        var store = preferences.perScreenSources
        for key in engine.slotKeys() {
            guard let displayID = key.displayID, let item = engine.item(on: key) else { continue }
            store.setItemID(item.id, for: displayID)
        }
        let removed = store.prune(keeping: screenCoordinator.displayIDs)
        guard store != preferences.perScreenSources || removed > 0 else { return }
        preferences.perScreenSources = store
        persistPreferences("每屏源记忆")
        if removed > 0 {
            log("清理 \(removed) 条已拔掉屏幕的源记录")
        }
    }

    // MARK: - 菜单栏

    /// 菜单栏状态项图标。资源由 `build.sh` 拷进 `Contents/Resources/`。
    ///
    /// 用 `Bundle.main` 而不是 `NSImage(named:)`：本 App 的 .app 由脚本手工组装，
    /// 没有 asset catalog，资源只在 bundle 根下。
    private static let playingIcon = menuBarIcon(named: "MenuBarIcon")
    private static let pausedIcon = menuBarIcon(named: "MenuBarIconPaused")

    /// 显式把逻辑尺寸钉在 18pt，不依赖 PNG 里的 DPI 元数据 ——
    /// 这样即使只加载到 36px 的 @2x 位图，显示尺寸也不会翻倍，
    /// 而 Retina 屏仍能采样到全部像素。
    ///
    /// 彩色而非模板图：图形是四色风车，转成模板图会被压成单色剪影，颜色全部丢失 ——
    /// 而「带色彩」正是选它的理由。代价是不会随菜单栏明暗自动反色，所以播放 / 暂停
    /// 靠颜色区分而非透明度：菜单栏是叠在壁纸上的半透明层，低 alpha 实测几乎看不清。
    /// 暂停态因而另出一张同形状、统一中灰的图。
    private static func menuBarIcon(named name: String) -> NSImage? {
        guard let image = Bundle.main.image(forResource: name) else { return nil }
        image.isTemplate = false
        image.size = NSSize(width: 18, height: 18)
        return image
    }

    private func buildStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        // 常驻：既不允许被 ⌘ 拖走，也不因移除而终止进程。
        // 默认是 [.removalAllowed, .terminationOnRemoval]，两项都要去掉 ——
        // 留着 `.terminationOnRemoval` 的话，用户一拖走 App 就跟着退出，
        // 而拖走这个动作本身是很容易误触的。
        item.behavior = []
        statusItem = item
        refreshStatusItem()
    }

    private func refreshStatusItem() {
        guard let item = statusItem else { return }

        if let icon = engine.isPlaying ? Self.playingIcon : Self.pausedIcon {
            item.button?.image = icon
            item.button?.title = ""
        } else {
            // 图标资源缺失时的兜底（例如不经 .app 直接跑 .build 里的可执行文件）
            item.button?.image = nil
            item.button?.title = engine.isPlaying ? "◉" : "◐"
        }

        // 菜单展开期间**不重建**：换掉 `item.menu` 会让菜单闪一下、并重置已展开的子菜单
        // 与高亮项。但这次刷新不能丢（状态是变了才来刷的），所以记一个待办，
        // 由 `menuDidClose` 在收起后补一次。
        //
        // 此前这条约束只在 `setUpdateState` 一处被遵守，其余二十来个调用点
        // （网络变化、状态翻转、每次成功加载）都在展开期无条件重建 —— 行为自相矛盾。
        guard !isMenuOpen else {
            isMenuRebuildPending = true
            return
        }
        item.menu = buildMenu()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        // ── 状态区 ───────────────────────────────────────────
        // 六段结构：状态 → 播放控制 → 设置 → 维护 → 关于 → 退出。
        // 菜单从光标位置向下展开，到达成本与行号正相关，所以高频动作贴顶、
        // 低频与破坏性操作置底；同一类别必须连续成块，否则会破坏位置记忆。
        let header = NSMenuItem(title: "动态壁纸", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let current = NSMenuItem(title: currentName, action: nil, keyEquivalent: "")
        current.isEnabled = false
        menu.addItem(current)

        // 进程自身占用。**常驻**（不是 debug 工具、也不是异常时才出现）—— 这是
        // 「一个一直挂在后台的东西到底吃多少资源」的唯一可见处。
        // 内容只在菜单展开时刷新（见 `NSMenuDelegate` 扩展），所以这两行在菜单收起
        // 期间显示的是上一次的值；CPU 那行自带区间标注，不会被读成瞬时值。
        menu.addItem(usageRow(id: Self.usageRowID, text: usageText))

        // 暂停原因由 governor 的状态直接推导，不另存一份 —— 存一份就要在每个
        // 恢复路径上记得清掉，漏一处就会残留一句「已手动暂停」。
        if !governor.state.isPlaying {
            let paused = NSMenuItem(
                title: "已暂停：\(governor.state.reason?.label ?? "未知原因")",
                action: nil,
                keyEquivalent: ""
            )
            paused.isEnabled = false
            menu.addItem(paused)
        }

        if !network.isReachable {
            let networkInfo = NSMenuItem(title: "⚠ 网络不可达，保持当前画面", action: nil, keyEquivalent: "")
            networkInfo.isEnabled = false
            menu.addItem(networkInfo)
        }

        if let notice {
            // 进了这一次构建，用户下次展开就能看到它 —— 收起时才可以作废。
            noticeShown = true
            let noticeItem = NSMenuItem(title: notice.display, action: nil, keyEquivalent: "")
            noticeItem.isEnabled = false
            menu.addItem(noticeItem)
        }

        // 配置写失败单独占一行，**不受 `notice` 的生命周期影响** ——
        // 它由下一次成功的写入清掉（见 `persistenceFailure` 的说明）。
        // 放进 `notice` 会被随后的成功路径清成 nil，「设置没存上」就又一次没有痕迹。
        if let persistenceFailure {
            let saveFailure = NSMenuItem(
                title: "⚠ \(persistenceFailure)", action: nil, keyEquivalent: "")
            saveFailure.isEnabled = false
            menu.addItem(saveFailure)
        }

        // 热键冲突行只在真出问题时出现。三项热键的组合提示已经写在各自菜单项的
        // 标题里，再常驻一行纯属重复；而「被别的程序抢了」只有这里能发现。
        let hotKeyFailures = hotKeys.failures
        if !hotKeyFailures.isEmpty {
            let conflict = NSMenuItem(
                title: "⚠ 热键冲突：" + hotKeyFailures.map(\.definition.display).joined(separator: "、")
                    + "（组合被其它程序占用）",
                action: nil,
                keyEquivalent: ""
            )
            conflict.isEnabled = false
            menu.addItem(conflict)
        }

        menu.addItem(.separator())

        // ── 播放控制 ─────────────────────────────────────────
        // 标题里写组合提示，但**不要**设 `keyEquivalent` —— 菜单打开时全局热键与
        // 菜单项会各触发一次，切换类操作执行两遍等于互相抵消。
        let next = NSMenuItem(
            title: "下一张（\(HotKeyManager.Definition.nextItem.display)）",
            action: #selector(nextNow),
            keyEquivalent: ""
        )
        next.target = self
        menu.addItem(next)

        let toggle = NSMenuItem(
            title: (isUserPaused ? "继续播放" : "暂停播放")
                + "（\(HotKeyManager.Definition.togglePause.display)）",
            action: #selector(togglePause),
            keyEquivalent: ""
        )
        toggle.target = self
        menu.addItem(toggle)

        menu.addItem(buildOrderMenu())

        menu.addItem(.separator())

        // ── 设置 ────────────────────────────────────────────
        // 组内按「用户调整它的频率」降序：切换间隔与内容过滤是会用几次就调的，
        // 开机自启与窗口层级装完基本不动。
        menu.addItem(buildIntervalMenu())
        menu.addItem(buildPowerMenu())
        // 锁屏预览紧跟省电设置：同属「画面行为」的开关，且都是开一次就不常动。
        let lockPreview = NSMenuItem(
            title: "锁屏预览（\(preferences.lockScreenPreview ? "开" : "关")）",
            action: #selector(toggleLockScreenPreview),
            keyEquivalent: ""
        )
        lockPreview.target = self
        lockPreview.state = preferences.lockScreenPreview ? .on : .off
        menu.addItem(lockPreview)
        menu.addItem(buildCategoryMenu())
        // 壁纸来源紧跟内容过滤：两者都是「播什么」的选择，且都是低频设置项。
        menu.addItem(buildSourceMenu())

        let policyMenu = NSMenu()
        // 顶部一行说明当前策略的代价（尤其流量），这是选择时唯一要权衡的东西
        let policyDetail = NSMenuItem(
            title: screenCoordinator.policy.detail, action: nil, keyEquivalent: "")
        policyDetail.isEnabled = false
        policyMenu.addItem(policyDetail)
        policyMenu.addItem(.separator())
        for policy in MultiScreenPolicy.allCases {
            let entry = NSMenuItem(
                title: policy.label,
                action: #selector(switchMultiScreenPolicy(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = policy.rawValue
            entry.state = policy == screenCoordinator.policy ? .on : .off
            policyMenu.addItem(entry)
        }
        let policyRoot = NSMenuItem(
            title: "多屏策略（\(screenCoordinator.policy.label)）",
            action: nil,
            keyEquivalent: ""
        )
        policyRoot.submenu = policyMenu
        menu.addItem(policyRoot)

        let levelMenu = NSMenu()
        for preset in LevelPreset.allCases {
            let entry = NSMenuItem(
                title: preset.label, action: #selector(switchLevel(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = preset.rawValue
            entry.state = preset.level == screenCoordinator.level ? .on : .off
            levelMenu.addItem(entry)
        }
        let levelRoot = NSMenuItem(
            title: "窗口层级（\(screenCoordinator.level)）", action: nil, keyEquivalent: "")
        levelRoot.submenu = levelMenu
        menu.addItem(levelRoot)

        // 开机自启放设置组末尾：它属「系统集成」而不是「画面显示」，
        // 状态直接读系统（不是读我们自己的配置）—— 用户可能在
        // 「系统设置 → 通用 → 登录项」里关掉它，那时这里必须如实显示。
        let loginItem = NSMenuItem(
            title: "开机自启（\(LaunchAtLogin.statusLabel)）",
            action: #selector(toggleLaunchAtLogin),
            keyEquivalent: ""
        )
        loginItem.target = self
        loginItem.state = LaunchAtLogin.isEnabled ? .on : .off
        menu.addItem(loginItem)

        menu.addItem(.separator())

        // ── 维护 ────────────────────────────────────────────
        // 低频一次性动作。放在设置组之后：它们都不改变任何设置，混在配置项中间
        // 既打断位置记忆，也容易被误点。
        // 「打开动态壁纸」排在这一段最前：它是唯一一个「浏览 + 挑选」性质的入口，
        // 与后面两个「产出 / 恢复」动作不同类。
        let browser = NSMenuItem(
            title: "打开动态壁纸",
            action: #selector(openWallpaperBrowser),
            keyEquivalent: ""
        )
        browser.target = self
        // 本地来源下置灰：那个窗口列的是**线上分类的条目**，本地没有可浏览的目录。
        // 判据与「内容过滤」「下载当前壁纸」共用 `WallpaperSourceMenu.OnlineOnlyEntry`
        // 一处登记，实际生效在 `validateMenuItem(_:)` —— 带 action 的项写在这里的
        // `isEnabled` 会被 `NSMenu` 的自动校验覆盖（详见文件末尾的说明）。
        menu.addItem(browser)

        // 「下载当前壁纸」排在「重新加载」之前：前者是主动产出，后者是恢复动作。
        let downloadCurrent = NSMenuItem(
            title: downloader.isDownloading ? "下载中…" : "下载当前壁纸",
            action: #selector(downloadCurrentWallpaper),
            keyEquivalent: ""
        )
        downloadCurrent.target = self
        // 可用性（下载中 / 没有可下载条目 / 本地来源）一律在 `validateMenuItem(_:)` 里判 ——
        // 与「打开动态壁纸」同一个坑：这里写 `isEnabled` 会被自动校验覆盖。
        menu.addItem(downloadCurrent)

        // 标题必须与 `reloadCatalog` 的实际分支一致（都用**配置里有没有本地路径**判定，
        // 不是用生效态）：本地来源下这一项做的是「重扫文件夹」，其中也包括
        // 「盘拔了导致回退线上之后，再按一次重试那个文件夹」——菜单里写着「重新加载清单」
        // 却去扫本地目录，是排障时最费解的一种不一致。
        let reload = NSMenuItem(
            title: preferences.resolvedLocalFolderURL == nil
                ? "重新加载清单（\(HotKeyManager.Definition.reloadCatalog.display)）"
                : "重新扫描本地文件夹（\(HotKeyManager.Definition.reloadCatalog.display)）",
            action: #selector(reloadCatalog),
            keyEquivalent: ""
        )
        reload.target = self
        menu.addItem(reload)

        // 开发者工具：只在 debug 构建里存在。日常使用走 `./build.sh`（release），
        // 排障走 `./run.sh`（debug）。整块不参与 release 编译，二进制里也没有相关字符串。
        #if DEBUG
            let dump = NSMenuItem(
                title: "打印窗口层级表", action: #selector(dumpWindows), keyEquivalent: "")
            dump.target = self
            menu.addItem(dump)
        #endif

        // 更新段**不在这里**：它属于「关于」子菜单，紧贴「当前版本」那一行
        // （位置由 `AboutMenu.entries` 里的 `.updateSection` 占位决定）。

        // ── 关于 ────────────────────────────────────────────
        // 最低频的内容放最末段。
        menu.addItem(.separator())
        menu.addItem(buildAboutMenu())

        // 退出放在最底部并单独分隔，避免误触；点击后走 `shutdown()`，
        // 与系统终止和 SIGTERM 共用同一条清理路径（含恢复用户原墙纸）。
        menu.addItem(.separator())
        let quit = NSMenuItem(
            title: "退出动态壁纸",
            action: #selector(quitApplication(_:)),
            keyEquivalent: "q"
        )
        quit.target = self
        menu.addItem(quit)
        //
        // 菜单的采样刷新靠 delegate：`NSMenu.delegate` 是 weak，而 `AppDelegate`
        // 由 `main.swift` 顶层的 `let` 持有到进程结束，所以这里可以直接用 self。
        menu.delegate = self
        return menu
    }

    /// 菜单退出。先主动执行清理，再交给 AppKit 结束进程；
    /// `applicationWillTerminate` 可能再次调用 `shutdown()`，由幂等保护挡住重复清理。
    @objc private func quitApplication(_ sender: Any?) {
        log("菜单请求退出，开始退出清理")
        shutdown()
        NSApp.terminate(sender)
    }

    /// 「关于」子菜单：版本、**更新段**、作者、赞助入口。
    ///
    /// 内容（顺序、禁用行、链接）全在 `LiveWallCore/AboutMenu`，这里只负责把数据
    /// 翻译成 `NSMenuItem` —— 与 `buildCategoryMenu` 同一分工，那样才测得到。
    private func buildAboutMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for entry in AboutMenu.entries(version: Self.appVersion) {
            switch entry {
            case .updateSection:
                // 入口与更新行**互斥**，由 `updateState` 一处决定。
                appendUpdateSection(to: submenu)
            case .info(let title):
                let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
                item.isEnabled = false
                submenu.addItem(item)
            case .link(let title, let action):
                let item = NSMenuItem(
                    title: title,
                    action: Self.selector(for: action),
                    keyEquivalent: ""
                )
                item.target = self
                submenu.addItem(item)
            case .separator:
                submenu.addItem(.separator())
            }
        }
        let root = NSMenuItem(title: "关于动态壁纸", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// `AboutMenu.Action` → `Selector` 的映射。
    ///
    /// 放在 App 这一侧而不是 `LiveWallCore`：纯逻辑层不该知道 `Selector` 这种 AppKit 概念。
    private static func selector(for action: AboutMenu.Action) -> Selector {
        switch action {
        case .openBlog: return #selector(openAuthorBlog)
        case .showDonation: return #selector(openDonationPage)
        }
    }

    /// App 版本。从 bundle 读，不在代码里维护第二份。
    /// 不经 .app 直接跑 `.build/` 里的可执行文件时读不到，回退成「开发版」。
    private static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "开发版"
    }

    /// App 的 build 号（`CFBundleVersion`）—— **版本比对的权威值**，发版必须递增。
    ///
    /// 读不到（直接跑 `.build/` 里的可执行文件）或不是数字时返回 nil，
    /// `UpdateEvaluator` 会因此判为「不可用」，绝不会误提示。
    private static var appBuild: Int? {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return raw.flatMap { Int($0) }
    }

    // MARK: - 版本更新

    /// 「有新版本」那一行 + 它的子菜单。只在真的检测到新版本时才被加进菜单。
    ///
    /// 动作不带 `representedObject`：同一时刻只可能有一个待更新版本，读
    /// `availableUpdate` 即可 —— 挂上去反而要处理「引用的是上一版」的问题。
    private func buildUpdateItem(_ feed: UpdateFeed) -> NSMenuItem {
        let root = NSMenuItem(
            title: UpdateMenu.rowTitle(version: feed.version, sizeBytes: feed.sizeBytes),
            action: nil,
            keyEquivalent: ""
        )

        let submenu = NSMenu()
        for line in UpdateMenu.detailLines(feed: feed) {
            let item = NSMenuItem(title: line, action: nil, keyEquivalent: "")
            item.isEnabled = false
            submenu.addItem(item)
        }
        submenu.addItem(.separator())
        for action in [UpdateMenu.Action.updateNow] {
            let item = NSMenuItem(
                title: UpdateMenu.actionTitle(action), action: selector(for: action),
                keyEquivalent: "")
            item.target = self
            submenu.addItem(item)
        }
        root.submenu = submenu
        return root
    }

    private func selector(for action: UpdateMenu.Action) -> Selector {
        switch action {
        case .updateNow: return #selector(downloadUpdate)
        }
    }

    /// 当前待更新的版本。**只读** —— 状态本身由 `updateState` 持有，
    /// 三个动作用它拿 feed，不改状态。
    private var availableUpdate: UpdateFeed? { updateState.feed }

    /// **唯一的写入口**：改状态 + 重建菜单都在这一处。
    ///
    /// 幂等：值没变就直接返回，不重建菜单 —— 于是「同一个结果到了两次」
    /// 「状态没变却重复刷新」都不会让菜单闪一下。
    private func setUpdateState(_ newState: UpdateState) {
        guard newState != updateState else { return }
        let old = updateState
        updateState = newState
        log("更新状态：\(old.label) → \(newState.label)")
        // 「展开中不重建」现在由 `refreshStatusItem` 统一处理（展开期记待办、收起后补一次）。
        // 这里不再自己判一次 —— 同一条约束写两处迟早会分叉，而它此前确实只在这一处分叉着。
        refreshStatusItem()
    }

    /// 按状态往菜单里加更新段。**两者互斥**：有新版本时只加更新行（隐藏入口），
    /// 其余只加「检查更新」入口。
    private func appendUpdateSection(to menu: NSMenu) {
        if updateState.showsCheckItem {
            let item = NSMenuItem(
                title: updateState.checkItemTitle,
                action: #selector(checkForUpdates),
                keyEquivalent: ""
            )
            item.target = self
            // 置灰判据在 `validateMenuItem(_:)`（构建时写 `isEnabled` 会被自动校验覆盖）。
            menu.addItem(item)
        }
        if let feed = updateState.feed {
            menu.addItem(buildUpdateItem(feed))
        }
    }

    /// 发起检查。网络不可达时**根本不发请求**（状态区已经有「网络不可达」那一行了）。
    private func performUpdateCheck(force: Bool, manual: Bool = false) {
        guard network.isReachable else { return }
        // 先置位再发起：`check` 在「压根没发请求」时是**同步**回调的。
        pendingManualUpdateCheck = manual
        setUpdateState(updateState.afterCheckStarted)
        updateChecker.check(preferences: preferences, localBuild: Self.appBuild, force: force)
    }

    /// 手动检查：无视节流，且**必须给回执**。
    ///
    /// 点完菜单立刻收起，结果要下次展开才看得见 —— 不给一句「已是最新版本」
    /// 或「检查失败：xxx」，用户看到的就是「点了没反应」。
    @objc private func checkForUpdates() {
        guard network.isReachable else {
            notice = .warning("网络不可达，无法检查更新", oneShot: true)
            refreshStatusItem()
            return
        }
        guard updateState != .checking else {
            // 这一项在检查中是禁用的；走到这里多半是键盘等别的途径触发的，
            // 那就只回一句「在查了」，**不再发第二个请求**。
            notice = .info("正在检查更新…", oneShot: true)
            refreshStatusItem()
            return
        }
        notice = .info("正在检查更新…", oneShot: true)
        performUpdateCheck(force: true, manual: true)
    }

    private func applyUpdateResult(_ decision: UpdateDecision, warnings: [String]) {
        let manual = pendingManualUpdateCheck
        pendingManualUpdateCheck = false
        for warning in warnings { log("更新检查：\(warning)") }

        // 状态迁移只有这一行：**非 available 一律回 idle**（失败按无更新处理，
        // 入口原样保留），可用则隐藏入口、显示更新行。
        setUpdateState(updateState.afterCheckFinished(decision))

        switch decision {
        case .available(let feed):
            log("发现新版本 \(feed.version)（build \(feed.build)）")
        case .upToDate:
            log("已是最新版本（本地 build \(Self.appBuild.map(String.init) ?? "?")）")
        case .unusable:
            log("更新检查判不出结果（原因见上），按无更新处理")
        }

        // 回执只给手动检查：自动检查没人在等结果，弹提示是打扰。
        if manual {
            let result = UpdateMenu.feedback(
                decision, warnings: warnings, currentVersion: Self.appVersion)
            notice =
                result.isWarning
                ? .warning(result.text, oneShot: result.isOneShot)
                : .info(result.text, oneShot: result.isOneShot)
            log("手动检查回执：\(result.text)")
            refreshStatusItem()
        }
    }

    /// 只下载到 `~/Downloads` 并在 Finder 里选中，**绝不安装**。
    /// 理由见 `UpdateInstaller` 顶部。
    @objc private func downloadUpdate() {
        guard let feed = availableUpdate else { return }
        log("开始下载更新：\(feed.fileURL.absoluteString)")
        // `Task { }` 写在 `@MainActor` 方法里会**继承主 actor**，闭包体（含 `self` 的读写）
        // 就在主线程上，`AppDelegate` 本身也已隐式 `Sendable` —— 因此不需要
        // `nonisolated(unsafe) let delegate = self` 那种「我确认安全」的手工标记。
        //
        // 真正的重活不在主线程：`UpdateInstaller.download` 是 **nonisolated async**，
        // 按 SE-0338 会 hop 到全局执行器（逐字节下载循环因此不占主线程）。
        Task { @MainActor [weak self] in
            do {
                let outcome = try await UpdateInstaller.download(feed)
                guard let self else { return }
                NSWorkspace.shared.activateFileViewerSelecting([outcome.file])
                notice = .info(UpdateMenu.installHint)
                log("更新已下载：\(outcome.file.path)（\(outcome.byteCount) 字节）")
                // 清单里的 `sizeBytes` 只用于菜单显示，**摘要才是权威**。
                // 对不上时只记日志、不阻断 —— 用户拿到的是校验通过的文件，
                // 该修的是发布流程里那个数字。
                if let declared = feed.sizeBytes, declared > 0, declared != outcome.byteCount {
                    log(
                        "⚠️ 清单里的 sizeBytes（\(declared)）与实际下载大小"
                            + "（\(outcome.byteCount)）不符")
                }
                refreshStatusItem()
            } catch {
                let message = error.localizedDescription
                guard let self else { return }
                notice = .warning("更新下载失败：\(message)")
                log("更新下载失败：\(message)")
                refreshStatusItem()
            }
        }
    }

    @objc private func openAuthorBlog() {
        guard let url = URL(string: AboutMenu.blogURLString) else { return }
        log("打开作者博客：\(url.absoluteString)")
        NSWorkspace.shared.open(url)
    }

    /// 赞助支持：打开 studio 首页。
    ///
    /// 不直接打开二维码图片、也不在 App 内做二维码弹窗：studio 页脚本来就有「赞助支持」
    /// 入口（点开是二维码弹窗），送到那里就够了。客户端因此不必存二维码，也不必为了它
    /// 写一个 UI 窗口 —— 那会是本项目第一个普通窗口，还要在 `LSUIElement` 下自己处理
    /// 激活（不激活窗口会开在别的 App 后面）、焦点与关闭行为。
    @objc private func openDonationPage() {
        guard let url = URL(string: AboutMenu.donationURLString) else { return }
        log("打开赞助支持页：\(url.absoluteString)")
        NSWorkspace.shared.open(url)
    }

    /// 状态区里的一行占用数据。标记用于 `menuNeedsUpdate` 里定位它。
    private func usageRow(id: String, text: String) -> NSMenuItem {
        let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
        item.isEnabled = false
        item.representedObject = id
        return item
    }

    /// 状态区那一行占用数据：**内存在前、CPU 在后**（两行并一行，省菜单高度）。
    private var usageText: String {
        guard let report = usageReport else {
            // 四态的前两态：还没采到（测量中…）/ 采过但失败（暂不可用）。
            // 两者都写成「测量中」会让失败被永远掩盖 —— 用户没有任何办法知道真相。
            // 后两态（有报告但算不出占用率 / 有数据）走下面的 `combinedRow`。
            let placeholder =
                usageFailed ? ProcessUsageText.unavailable : ProcessUsageText.measuring
            return "内存 \(placeholder) · CPU \(placeholder)"
        }
        return ProcessUsageText.combinedRow(
            percent: report.cpuPercent,
            windowSeconds: report.windowSeconds,
            sinceLaunch: report.sinceLaunch,
            bytes: report.memoryBytes,
            peakBytes: report.peakBytes
        )
    }

    // MARK: - 菜单展开期的惰性采样

    /// 发起一次采样。**每次展开只调一次**（由 `sampledThisOpen` 保证）——
    /// 同一次展开采两次会把基线推到「刚刚那一刻」，第二次的区间≈0，算出纯噪音。
    private func requestUsageSample() {
        processMonitor.sample { [weak self] report in
            guard let self else { return }
            // `nil` = 采样失败（mach 调用没拿到数据）。失败也要让用户看见 ——
            // 不处理的话状态区会一直停在「测量中…」，看起来像卡住了。
            if let report {
                self.applyUsageReport(report)
            } else {
                self.applyUsageFailure()
            }
        }
    }

    /// 采样失败：只改文案，不重建菜单（同 `updateUsageRows` 的理由）。
    private func applyUsageFailure() {
        usageFailed = true
        guard isMenuOpen, let menu = statusItem?.menu else { return }
        updateUsageRows(in: menu)
    }

    /// 采样回到主线程。菜单已经收起就直接丢弃 —— 那时行已经不在屏幕上，
    /// 而 `statusItem.menu` 可能已经被 `refreshStatusItem` 换掉了。
    private func applyUsageReport(_ report: ProcessMonitor.Report) {
        usageReport = report
        usageFailed = false
        guard isMenuOpen, let menu = statusItem?.menu else { return }
        updateUsageRows(in: menu)
    }

    /// 只改这一行的 title，**不重建菜单** —— 重建会让正在展开的菜单闪一下、
    /// 并把已经展开的子菜单与高亮项重置掉。
    private func updateUsageRows(in menu: NSMenu) {
        for item in menu.items where (item.representedObject as? String) == Self.usageRowID {
            item.title = usageText
        }
    }

    /// 全局热键触发。按 id 分派 —— 走的是和菜单完全相同的入口，不另开一条路径。
    private func handleHotKey(_ id: UInt32) {
        switch id {
        case HotKeyManager.Definition.togglePause.id:
            togglePause()
        case HotKeyManager.Definition.nextItem.id:
            nextNow()
        case HotKeyManager.Definition.reloadCatalog.id:
            reloadCatalog()
        default:
            log("未知热键 id \(id)")
        }
    }

    /// 选片顺序子菜单：**随机 / 顺序 / 固定**三行。
    ///
    /// 两种顺序都会走完一整轮才重排、一轮内不重复，所以这里选的不是「有没有随机」，
    /// 而是「这一轮的排列怎么来」。改成子菜单而不是勾选项：勾选项的「未勾」状态
    /// 分不清是「顺序」还是「没设置」。
    ///
    /// 行的内容（标题、顺序、置灰、勾选）由 `PlaybackOrderMenu` 算好 —— 那是纯逻辑，
    /// 可以单测；这里只负责把它贴成 `NSMenu`。
    ///
    /// **「固定」是派生显示**：`pinnedItem != nil` 时勾选它，随机/顺序两行都不勾。
    /// `playbackOrder` 本身仍是两值之一，天然提供「解钉后恢复哪个顺序」。
    private func buildOrderMenu() -> NSMenuItem {
        let submenu = NSMenu()
        // 当前没有正在播的条目时「固定」行置灰 —— 置灰优于点了之后收到一句失败提示。
        // 实际生效的判据在 `validateMenuItem(_:)`（见文件末尾的说明），这里传进去的
        // `canPinCurrent` 与它同源（都读 `self.canPinCurrent`），不会打架。
        let canPinCurrent = self.canPinCurrent

        for entry in PlaybackOrderMenu.entries(
            order: preferences.playbackOrder,
            isPinned: isPinned,
            canPinCurrent: canPinCurrent
        ) {
            let item: NSMenuItem
            switch entry.kind {
            case .order(let order):
                item = NSMenuItem(
                    title: entry.title,
                    action: #selector(switchPlaybackOrder(_:)),
                    keyEquivalent: ""
                )
                item.representedObject = order.rawValue
            case .pin:
                // 已固定时仍可点（幂等）：再点一次正是用户确认
                // 「现在固定的到底是哪条」的自然动作。
                item = NSMenuItem(
                    title: entry.title,
                    action: #selector(pinCurrentItem),
                    keyEquivalent: ""
                )
            }
            item.target = self
            // 不在这里写 `isEnabled`：带 action 的项由 `validateMenuItem(_:)` 决定可用性
            // （`NSMenu.autoenablesItems` 默认开启，写了也会被覆盖 —— 见文件末尾的说明）。
            item.state = entry.isSelected ? .on : .off
            submenu.addItem(item)
        }

        let root = NSMenuItem(
            title: PlaybackOrderMenu.rootTitle(
                order: preferences.playbackOrder, isPinned: isPinned),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 菜单「固定」行：把**当前正在播的那条**固定为桌面壁纸（决策 6）。
    @objc private func pinCurrentItem() {
        guard let primary = engine.primaryKey, let item = engine.item(on: primary) else {
            // 菜单里这一行本来就置灰了，走到这里说明是别的途径触发的
            notice = .warning("当前没有正在播放的壁纸", oneShot: true)
            refreshStatusItem()
            return
        }
        // 分类传当前值：这条本来就在播，说明当前分类就是对的，没有要切的东西。
        // 本地来源下传 nil —— 本地条目没有分类，传 `selectedCategoryID`（线上残留值）
        // 会让 `setPinned` 去拉一个跟画面毫无关系的线上切片。
        setPinned(item, categoryID: isLocalSource ? nil : selectedCategoryID)
    }

    /// 切换间隔子菜单。改的是 `intervalSeconds`（单位秒），预设覆盖 30 秒 – 1 小时；
    /// 想填别的值就手改 `config.json`，范围外的会被 `SwitchInterval.clamp` 夹紧。
    private func buildIntervalMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for seconds in SwitchInterval.presets {
            let entry = NSMenuItem(
                title: SwitchInterval.label(seconds),
                action: #selector(setSwitchInterval(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = seconds
            entry.state = abs(preferences.intervalSeconds - seconds) < 0.5 ? .on : .off
            submenu.addItem(entry)
        }

        let root = NSMenuItem(
            title: "切换间隔（\(SwitchInterval.label(preferences.intervalSeconds))）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 省电开关的菜单标识。用 `representedObject` 传递，省掉五个几乎相同的 @objc 方法。
    private enum PowerOption: String {
        case covered
        case idle
        case lowPowerMode
        case battery
        case thermalPressure

        var label: String {
            switch self {
            case .covered: return "画面被遮挡时"
            case .idle: return "无操作时"
            case .lowPowerMode: return "低电量模式时"
            case .battery: return "电池供电时"
            case .thermalPressure: return "温度过高时"
            }
        }

        /// 菜单展示顺序 = 判定优先级顺序，两者不能各排各的。
        static let all: [PowerOption] = [
            .covered, .idle, .lowPowerMode, .battery, .thermalPressure,
        ]
    }

    /// 省电设置子菜单。改动直接写回 config.json 并立即重算，不需要重启。
    private func buildPowerMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for option in PowerOption.all {
            let entry = NSMenuItem(
                title: option.label,
                action: #selector(togglePowerOption(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = option.rawValue
            entry.state = isOptionEnabled(option) ? .on : .off
            submenu.addItem(entry)

            // 空闲阈值作为「无操作时」的子项，缩进挂在它下面
            if option == .idle {
                let thresholds = NSMenu()
                for seconds in IdleThreshold.presets {
                    let item = NSMenuItem(
                        title: IdleThreshold.label(seconds),
                        action: #selector(setIdleThreshold(_:)),
                        keyEquivalent: ""
                    )
                    item.target = self
                    item.representedObject = seconds
                    item.state = abs(preferences.idleThresholdSeconds - seconds) < 0.5 ? .on : .off
                    // 总开关关着时子项没有意义，置灰而不是隐藏（保留可发现性）。
                    // 置灰判据在 `validateMenuItem(_:)`（构建时写 `isEnabled` 会被自动校验覆盖）。
                    thresholds.addItem(item)
                }
                let root = NSMenuItem(
                    title: "空闲阈值：\(IdleThreshold.label(preferences.idleThresholdSeconds))",
                    action: nil,
                    keyEquivalent: ""
                )
                root.submenu = thresholds
                submenu.addItem(root)
            }
        }
        let root = NSMenuItem(title: "省电设置", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    private func isOptionEnabled(_ option: PowerOption) -> Bool {
        switch option {
        case .covered: return preferences.pauseWhenCovered
        case .idle: return preferences.pauseWhenIdle
        case .lowPowerMode: return preferences.pauseOnLowPowerMode
        case .battery: return preferences.pauseOnBattery
        case .thermalPressure: return preferences.pauseOnThermalPressure
        }
    }

    private func setOption(_ option: PowerOption, enabled: Bool) {
        switch option {
        case .covered: preferences.pauseWhenCovered = enabled
        case .idle: preferences.pauseWhenIdle = enabled
        case .lowPowerMode: preferences.pauseOnLowPowerMode = enabled
        case .battery: preferences.pauseOnBattery = enabled
        case .thermalPressure: preferences.pauseOnThermalPressure = enabled
        }
    }

    @objc private func toggleLaunchAtLogin() {
        let target = !LaunchAtLogin.isEnabled
        if let error = LaunchAtLogin.setEnabled(target) {
            notice = .warning("开机自启设置失败")
            log("⚠️ 开机自启\(target ? "开启" : "关闭")失败：\(error)")
        } else {
            notice = .info("开机自启已\(target ? "开启" : "关闭")")
            log("开机自启已\(target ? "开启" : "关闭")，系统状态：\(LaunchAtLogin.statusLabel)")
            // requiresApproval 是成功注册但还没批准 —— 不说清楚用户会以为没生效
            if LaunchAtLogin.requiresApproval {
                notice = .warning("开机自启待批准（系统设置 → 通用 → 登录项）")
                log("需在「系统设置 → 通用 → 登录项」里手动批准后才会生效")
            }
        }
        refreshStatusItem()
    }

    @objc private func togglePowerOption(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let option = PowerOption(rawValue: raw)
        else { return }
        setOption(option, enabled: sender.state != .on)
        persistPreferences("省电设置")
        log("省电设置：\(option.label)暂停 → \(isOptionEnabled(option) ? "开" : "关")")
        // 立刻重算，否则要等下一次 2 秒轮询才生效，用户会以为没点上
        governor.refresh()
        refreshStatusItem()
    }

    /// 锁屏预览开关。
    ///
    /// 关掉时立刻把系统墙纸恢复成用户原来的那张 —— 否则「关掉」之后锁屏仍是最后
    /// 一张静态图，用户会以为开关没生效。
    @objc private func toggleLockScreenPreview() {
        preferences.lockScreenPreview.toggle()
        persistPreferences("锁屏预览开关")
        log("锁屏预览 → \(preferences.lockScreenPreview ? "开" : "关")")
        if preferences.lockScreenPreview {
            notice = .info("锁屏预览已开启")
            if let primary = engine.primaryKey, let item = engine.item(on: primary) {
                refreshLockScreenPreview(for: item, on: primary)
            }
        } else {
            notice = .info("锁屏预览已关闭，系统墙纸已恢复")
            lockScreenPreviewer.restoreUserWallpaper()
        }
        refreshStatusItem()
    }

    /// 当前可下载的条目（主槽位正在播的那张）。没有就置灰菜单项 ——
    /// 让用户点到一个必然失败的动作比置灰更糟。
    private var currentDownloadableItem: WallpaperItem? {
        // 本地来源下没有可下载的东西 —— 文件本来就在用户自己的文件夹里，
        // 「下载」只会把它从自己硬盘拷回自己硬盘。置灰而不是让用户点到必然失败的动作。
        // 判据与「内容过滤」「打开动态壁纸」共用一处登记（`WallpaperSourceMenu.OnlineOnlyEntry`）。
        guard WallpaperSourceMenu.isEnabled(.downloadCurrent, isLocalSource: isLocalSource) else { return nil }
        guard let primary = engine.primaryKey else { return nil }
        return engine.item(on: primary)
    }

    /// 当前是否有正在播放的条目可供「固定」。
    ///
    /// 菜单构建（`PlaybackOrderMenu.entries(canPinCurrent:)`）与可用性校验
    /// （`validateMenuItem(_:)`）共用这一个判据，两处不会打架。
    private var canPinCurrent: Bool {
        engine.primaryKey.flatMap { engine.item(on: $0) } != nil
    }

    /// 下载当前壁纸（视频 + 静态预览图）到 `~/Downloads/livewall/`。
    ///
    /// 入口在维护段：它不改播放、不改配置，属于低频的一次性动作。
    @objc private func downloadCurrentWallpaper() {
        guard !downloader.isDownloading else {
            notice = .info("正在下载，请稍候")
            refreshStatusItem()
            return
        }
        guard let item = currentDownloadableItem else {
            notice = .warning("当前没有正在播放的壁纸")
            refreshStatusItem()
            return
        }

        notice = .info("正在下载 \(item.displayName)…")
        refreshStatusItem()

        Task { @MainActor in
            do {
                guard let result = try await self.downloader.download(item) else { return }
                let names = result.files.map(\.lastPathComponent).joined(separator: "、")
                if result.skippedCover {
                    // 视频成功、静态图失败：这是「部分成功」，必须说清楚，否则用户
                    // 只会看到「下载失败」而以为视频也没存下来。
                    self.notice = .warning("视频已下载（\(names)），静态图未保存")
                } else {
                    self.notice = .info("已下载：\(names)")
                }
                self.log("下载当前壁纸完成 → \(self.downloader.destinationDirectory.path)")
            } catch {
                self.notice = .warning("下载失败：\(error.localizedDescription)")
                self.log("⚠️ 下载当前壁纸失败：\(error.localizedDescription)")
            }
            self.refreshStatusItem()
        }
    }

    @objc private func setIdleThreshold(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.idleThresholdSeconds = seconds
        persistPreferences("空闲阈值")
        log("空闲阈值改为 \(IdleThreshold.label(seconds))")
        governor.refresh()
        refreshStatusItem()
    }

    /// 「下一张」：**解钉触发点 1**（菜单项与 ⌥⌘N 热键都落到这里，见 `handleHotKey`）。
    @objc private func nextNow() {
        // 解钉刻意**不给提示**：画面立刻换了就是回执。而且 `loadAndPlay` 成功时会把
        // `notice` 重写成 nil，那句提示本来也留不住；菜单里「选片顺序」父项同步变回
        // 「随机 / 顺序」，那是更可靠的指示。
        if isPinned { clearPin(reason: nil) }
        failuresBySlot.removeAll()
        advance()
    }

    @objc private func togglePause() {
        // 只切信号，暂停/恢复与定时器由 governor 的状态机统一处理，避免两条路径各改一次。
        // 这里也不改状态区文案：暂停原因由菜单里的状态行直接读 governor 显示，
        // 写入一个「已手动暂停」反而会在恢复后残留。
        governor.setUserPaused(!isUserPaused)
        refreshStatusItem()
    }

    /// 切换选片顺序。**刻意不立刻换片** —— 当前这张在新顺序下依然合法，
    /// 换模式只决定「下一张是谁」（顺序模式下就是清单第一条）。
    /// 候选池的待取队列会因 `order` 的 didSet 被清空，等于重新开始一轮。
    ///
    /// 固定态下选「随机 / 顺序」＝ **解钉触发点 3**。
    @objc private func switchPlaybackOrder(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let order = PlaybackOrder(rawValue: raw)
        else { return }

        let wasPinned = isPinned
        // `|| wasPinned` 不能省：固定前是「随机」、固定后点「随机」时，
        // `order` 与配置里的值相同，原 guard 会把这次点击整个吞掉 ——
        // 于是「点随机解钉」失效，用户只会觉得「固定之后点不回来了」。
        guard order != preferences.playbackOrder || wasPinned else { return }

        if wasPinned { clearPin(reason: nil) }

        preferences.playbackOrder = order
        persistPreferences("选片顺序")
        pool.order = order

        log(
            "选片顺序改为\(order.label)（\(order.detail)）：候选 \(pool.totalCount) 条，"
                + "下一张起按新顺序，本轮重新开始")

        // 固定期间 `scheduleNext` 被拦截，定时器一直是空的。解钉后必须重排一次，
        // 否则「恢复轮换」只体现在菜单文案上 —— 画面会一直停在固定项上不动。
        if wasPinned { rescheduleAfterIntervalChange() }
        refreshStatusItem()
    }

    /// 切换自动切换间隔。立即按新间隔重新计时，不换片。
    @objc private func setSwitchInterval(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.intervalSeconds = seconds
        persistPreferences("切换间隔")
        log("切换间隔改为 \(SwitchInterval.label(seconds))")

        // 不重新计时的话，改完要等旧定时器到期才生效 —— 用户改完盯着看却毫无变化，
        // 只会以为没点上。旧定时器作废，从此刻起按新间隔重新算。
        rescheduleAfterIntervalChange()
        refreshStatusItem()
    }

    /// 间隔变化后重排下一次切换。**当前这张继续播**，只重置「还剩多久切」。
    private func rescheduleAfterIntervalChange() {
        // 正在等网络恢复时不要插队 —— 那条 60 秒重试有自己的节奏，
        // 抢过来会变成「每改一次间隔就立刻重试一次加载」，反而把重试次数刷满。
        guard !isHoldingForNetwork else {
            log("正在等待网络恢复，新间隔将在下一次成功加载后生效")
            return
        }
        guard governor.state.isPlaying else {
            log("当前处于暂停状态，新间隔将在恢复播放后生效")
            return
        }
        scheduleNext(after: engine.primaryDuration)
    }

    // MARK: - 固定为桌面壁纸

    /// 落实固定：把某条设为桌面壁纸，**所有屏幕**都播它、停止轮换（决策 2 / 3）。
    ///
    /// UI 的「设为桌面壁纸」与菜单的「固定」行都走这里 —— 只有一条落实路径，
    /// 两条路径各写一份早晚会分叉（一边记得同步内容过滤、另一边忘了）。
    ///
    /// - Parameters:
    ///   - item: 要固定的条目。
    ///   - categoryID: 该条所属的一级分类。与当前 `selectedCategoryID` 不同时会
    ///     **同步切换内容过滤**（决策 7），让「解钉之后的轮换」落在用户刚挑的那个
    ///     分类里，而不是回到某个不相干的分类。传 nil 表示不改内容过滤。
    private func setPinned(_ item: WallpaperItem, categoryID: Int?) {
        guard PinnedPlayback.isPlayable(item) else {
            notice = .warning("这条壁纸的地址不可用，无法设为桌面壁纸")
            log("⚠️ 固定失败：条目 \(item.id) 的播放地址非法")
            refreshStatusItem()
            return
        }

        // 1) 单一真源先立即可用。**顺序很重要**：这一写下去 `isPinned` 就为真，
        //    后面所有分支（`advance` / `advanceOne` / `scheduleNext`）自动进入固定态。
        //    整个落实流程因此**不依赖切片加载是否成功** —— 这是「存整条而非 id」
        //    带来的直接好处（只存 id 就得等切片到手才能定位，中间态会悬挂）。
        preferences.pinnedItem = item
        pendingUnpinNotice = nil

        // 2) best-effort 让候选池记住它：在池里就设成 `currentID` 并从待取队列移除，
        //    解钉后不会紧接着又把它取一遍。不在池里（用户固定的是别的分类的条目）
        //    也无所谓 —— 固定本身不依赖候选池。
        _ = pool.restore(id: item.id)

        // 3) 决策 7：同步内容过滤。只在真的不同、且索引里确实有该分类时才拉切片 ——
        //    同分类下重复拉一次 0.6 MB 纯属浪费。
        //    **本地来源下整段跳过**：本地模式没有分类可言，而这条路径会被浏览窗口
        //    （列的是线上内容）触发 —— 拉一个线上切片灌进池子，会让「来源是本地、
        //    池子里却是线上条目」，重启后又变回本地，前后不一致。
        //    固定项本身是自包含的（存整条），不依赖池子，所以跳过它照样能播。
        if !isLocalSource, let categoryID, categoryID != selectedCategoryID,
            categories.contains(where: { $0.id == categoryID })
        {
            preferences.selectedCategoryID = categoryID
            log("固定项属于分类 \(categoryID)，同步切换内容过滤")
            loadSlice(for: categoryID, service: makeCatalogService(), isFirstLoad: false)
        }

        // 4) 固定态下 `advance()` 被拦截、`pendingRestore` 不会被消费，
        //    留着只会在解钉后突然生效 —— 表现成「解钉后莫名跳回开机时那条」。
        pendingRestore.removeAll()
        persistPreferences("固定为桌面壁纸")

        pendingPinAnnouncement = true
        notice = .info("正在设为桌面壁纸…")
        log("设为桌面壁纸：\(item.id) \(item.title)（\(item.displayName)）")
        refreshStatusItem()

        // 5) 所有屏铺满。定时器由 `applyPinToMissingSlots` 与 `scheduleNext` 共同保证不排。
        applyPinToMissingSlots()
        // 浏览窗口若开着，让它把「当前」徽标与右栏按钮同步过来 ——
        // 用户可能是从**菜单**固定的，窗口里得跟着变。
        browserWindowController?.refreshPinState()
    }

    /// 解除固定，回到轮换。
    ///
    /// - Parameter reason: 非 nil 时作为状态区提示。**用户主动解钉传 nil** ——
    ///   画面立刻变了就是回执，多说一句反而像出了错。
    private func clearPin(reason: String?) {
        guard isPinned else { return }
        preferences.pinnedItem = nil
        pendingPinAnnouncement = false
        persistPreferences("解除固定")
        // 固定期间不填、也不消费恢复计划；这里再清一次，防止它跨过固定期生效。
        pendingRestore.removeAll()
        if let reason {
            notice = .warning(reason)
            // 成功加载下一条时 `loadAndPlay` 会把 `notice` 重写掉，留一份让它写回来 ——
            // 用户恰恰需要知道「画面为什么突然换了」。
            pendingUnpinNotice = reason
        }
        log("解除固定：\(reason ?? "用户主动恢复轮换")")
        // 解钉可能是从菜单触发的（下一张 / 选顺序），窗口里要把徽标与按钮撤回原样。
        browserWindowController?.refreshPinState()
        refreshStatusItem()
    }

    /// 某个条目被判失效（拉黑）后的检查：失效的正是固定项就自动解钉（决策 8）。
    ///
    /// **只有「资源本身不可用」才算失效** —— 切分类、重载清单、网络断开都不算，
    /// 而那些路径本来也不会走到这里（它们不拉黑条目）。
    ///
    /// - Returns: 是否真的解了钉。为 `true` 时调用方应当走**全局** `advance()`：
    ///   固定对所有屏生效，失效也该所有屏一起回到轮换，而不是只补一个槽位。
    @discardableResult
    private func unpinIfInvalidated(_ itemID: Int) -> Bool {
        guard preferences.pinnedItem?.id == itemID else { return false }
        clearPin(reason: "固定项已失效（资源不可用），已恢复轮换")
        return true
    }

    /// 把固定项铺到**所有**没在播它的槽位上（决策 3：固定对所有屏生效）。
    ///
    /// **幂等**：已经铺满时是 no-op。四种场景共用这一个函数 ——
    /// 启动首次铺满、新增槽位、空引擎恢复、落实固定。
    ///
    /// 之所以要「铺满」而不是「播一条」：多屏策略是「每屏独立」时槽位不止一个，
    /// 固定语义要求它们**同片**；而 `PlaybackEngine` 没有「一条铺所有槽位」的 API，
    /// 循环只能写在这里。
    ///
    /// - Parameter force: 忽略「URL 相同就算已就位」的短路，所有槽位都重新加载。
    ///   只给**恢复类**路径用（`advance()` 在固定态下只剩这一种来源）：那时槽位里
    ///   挂着的固定项正是加载 / 播放失败的那条，不重拉就永远卡在坏状态上。
    ///   常规路径（新增槽位、切片应用、恢复播放）不要传 —— 那些场景下
    ///   「已经在播了」是真的不用再拉一遍。
    private func applyPinToMissingSlots(force: Bool = false) {
        guard let item = preferences.pinnedItem, PinnedPlayback.isPlayable(item),
            let url = item.playableURL
        else { return }

        let targets = engine.slotKeys().filter { force || engine.item(on: $0)?.url != item.url }
        guard !targets.isEmpty else {
            // 已经全部就位（典型场景：从菜单固定「当前正在播的那条」，镜像策略下
            // 那一个槽位本来就在播它）。这时**也必须把回执发掉** ——
            // 否则状态区会一直挂着「正在设为桌面壁纸…」。
            announcePinIfPending()
            return
        }
        // 防重入：这一批还没铺完又来一次请求的话，同一条视频会被并发拉两遍。
        guard !isPinApplyInFlight else { return }
        isPinApplyInFlight = true

        // **必须先递增代次**：可能正有一个「旧条目」的加载在飞，它完成后会把画面
        // 换成旧条目（`loadAndPlay` 里比对的就是这个代次）。递增之后那个结果会被
        // 判为过期而丢弃 —— 这是整个固定功能里最容易漏、后果最直接的一步。
        for key in targets { loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1 }
        let generations = targets.map { ($0, loadGenerationBySlot[$0] ?? 0) }

        // 固定态不排定时器。这里再保险一次：从「正在轮换」切到固定的那一瞬间，
        // 可能已经有一个在飞的定时器。
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        log("铺满固定项 \(item.id) \(item.title) → \(targets.map(\.label).joined(separator: "、"))")

        Task { @MainActor in
            do {
                // **只加载一次**，再把同一个 `LoadedVideo` 给所有槽位 ——
                // 每个槽位各加载一遍会让同一条视频被拉 N 遍，流量按屏数翻倍。
                let loaded = try await VideoLoader.load(url)
                var applied = 0
                for (key, generation) in generations {
                    // 加载是异步的，期间槽位可能已经被拆掉（屏拔了 / 策略切了）。
                    guard engine.slotKeys().contains(key) else {
                        log("槽位 \(key.label) 在固定项加载完成前已失效，跳过")
                        continue
                    }
                    guard loadGenerationBySlot[key] == generation else {
                        log("槽位 \(key.label) 的固定项加载结果已过期，跳过")
                        continue
                    }
                    engine.play(item, loaded: loaded, on: key)
                    namesBySlot[key] = item.displayName
                    failuresBySlot[key] = 0
                    retriesBySlot[key] = 0
                    applied += 1
                }
                isHoldingForNetwork = false
                refreshCurrentName()
                // 加载期间状态可能已翻成暂停（锁屏 / 遮挡 / 息屏）。播放器必须服从
                // 当前状态，否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。
                if !governor.state.isPlaying {
                    engine.pause()
                    log("固定项就位时已处于暂停状态，画面就位但不播放")
                }
                if preferences.lockScreenPreview, let primary = engine.primaryKey,
                    engine.item(on: primary)?.id == item.id
                {
                    refreshLockScreenPreview(for: item, on: primary)
                }
                announcePinIfPending()
                log("固定项已铺满 \(applied) 个槽位：\(item.id) \(item.title)")
                refreshStatusItem()
            } catch {
                log("⚠️ 固定项加载失败：\(error.localizedDescription)")
                // 决策 8：固定项连加载都失败 → 解钉回轮换，绝不黑屏。
                clearPin(reason: "固定项加载失败，已恢复轮换")
                advance()
            }

            isPinApplyInFlight = false
            // 收尾再核一次：加载期间可能新增了槽位（屏幕热插拔 / 策略切换），
            // 那一批不在本次的 `generations` 里。**放在释放标志之后**，
            // 否则会被上面的防重入守卫挡掉。
            // 不会无限递归：铺满后 `targets` 为空直接返回；失败路径已解钉。
            if isPinned { applyPinToMissingSlots() }
        }
    }

    /// 消费「设为桌面壁纸」的回执。
    ///
    /// 单独抽出来是因为有**两条**消费路径：真正铺满之后（异步、要等视频加载完），
    /// 以及「已经全部就位、不需要铺」的短路路径（从菜单固定当前正在播的那条）。
    /// 少了后者，状态区会一直挂着「正在设为桌面壁纸…」。
    private func announcePinIfPending() {
        guard pendingPinAnnouncement, let item = preferences.pinnedItem else { return }
        notice = .info("已设为桌面壁纸：\(item.displayName)")
        pendingPinAnnouncement = false
        refreshStatusItem()
    }

    /// 内容过滤子菜单：按一级分类**单选**。
    ///
    /// 行的内容（标题、置灰、勾选）由 `CategoryMenu` 算好 —— 那是纯逻辑，可以单测；
    /// 这里只负责把它贴成 `NSMenu`。
    ///
    /// 没有「清除过滤」项：分类恒有选中项，不存在「不限」态。
    ///
    /// 本地来源下**整项置灰**：本地文件夹没有分类概念，点任何一行都没有可加载的东西。
    /// 置灰优于让用户点到必然无反应的动作（`AGENTS.md` 的既有取舍），根标题如实写出原因。
    private func buildCategoryMenu() -> NSMenuItem {
        // 判据与另外两个线上专属入口共用一处登记（`WallpaperSourceMenu.OnlineOnlyEntry`）。
        guard WallpaperSourceMenu.isEnabled(.categoryFilter, isLocalSource: isLocalSource) else {
            let root = NSMenuItem(
                title: CategoryMenu.localSourceRootTitle, action: nil, keyEquivalent: "")
            root.isEnabled = false
            return root
        }

        let submenu = NSMenu()
        let entries = CategoryMenu.entries(categories: categories, selectedID: selectedCategoryID)

        if entries.isEmpty {
            let empty = NSMenuItem(title: "清单里没有分类信息", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            submenu.addItem(empty)
        } else {
            for entry in entries {
                let item = NSMenuItem(
                    title: entry.title,
                    action: #selector(selectCategory(_:)),
                    keyEquivalent: ""
                )
                item.target = self
                item.representedObject = entry.id
                item.state = entry.isSelected ? .on : .off
                // 条目数为 0 的分类要置灰、本地来源下整项不可用 —— 判据都在
                // `validateMenuItem(_:)` 里（构建时写 `isEnabled` 会被自动校验覆盖）。
                submenu.addItem(item)
            }
        }

        let root = NSMenuItem(
            title: CategoryMenu.rootTitle(categories: categories, selectedID: selectedCategoryID),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 壁纸来源子菜单：**线上 / 本地**二选一。
    ///
    /// 行的内容由 `WallpaperSourceMenu` 算好（纯逻辑，可单测），这里只贴成 `NSMenu`。
    /// 两行都**永远可点**：本地行同时承担「改选文件夹」——已启用时再点一次就是换一个文件夹，
    /// 再单独放一行「改选文件夹…」纯属重复。
    private func buildSourceMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for entry in WallpaperSourceMenu.entries(isLocal: isLocalSource) {
            let item = NSMenuItem(
                title: entry.title,
                action: #selector(selectSource(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = entry.kind.rawValue
            item.state = entry.isSelected ? .on : .off
            submenu.addItem(item)
        }

        let root = NSMenuItem(
            title: WallpaperSourceMenu.rootTitle(
                isLocal: isLocalSource,
                localFolderName: preferences.localFolderName
            ),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 切换壁纸来源。
    ///
    /// 选「本地」时先开面板选文件夹、**当场试扫一遍**，扫不出 mp4 就地提示并且
    /// **不写配置** —— 让用户选了「本地」却因为挑了个空文件夹而静默停在旧来源上，
    /// 是最难排查的一种表现（菜单勾选和实际来源对不上）。
    ///
    /// 选「线上」时**不清空候选池**再加载：与 `reloadCatalog` 同一条取舍 ——
    /// 拉取失败要保持当前画面继续播，而不是先黑一下。
    @objc private func selectSource(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let kind = WallpaperSourceMenu.Kind(rawValue: raw)
        else { return }

        switch kind {
        case .remote:
            // 判据是**配置**而不是生效态：本地扫描失败回退线上之后，菜单里勾的是线上，
            // 但配置里还留着路径 —— 这时点「线上」应该把那份路径清掉（用户明确不要它了），
            // 而不是因为「已经是线上」就静默吞掉这次点击。
            guard preferences.resolvedLocalFolderURL != nil else { return }
            isLocalSource = false
            preferences.localFolderPath = nil
            persistPreferences("壁纸来源：线上清单")
            log("壁纸来源改为线上清单")
            notice = .info("壁纸来源：线上清单")
            refreshStatusItem()
            loadCatalogAndStart()

        case .local:
            guard let folder = chooseLocalFolder() else { return }
            let items: [WallpaperItem]
            do {
                items = try LocalVideoSource.items(in: folder)
            } catch {
                let reason =
                    (error as? LocalVideoSource.SourceError)?.errorDescription
                    ?? error.localizedDescription
                log("⚠️ 选中的文件夹不能用：\(reason)")
                notice = .warning("这个文件夹不能用（\(reason)），仍用当前来源")
                refreshStatusItem()
                return
            }

            preferences.localFolderPath = folder.path
            persistPreferences("壁纸来源：本地文件夹")
            log("壁纸来源改为本地文件夹：\(folder.path)")
            // 换文件夹后候选集整体换了，「这块屏上次播的那条」不再适用。
            pendingRestore.removeAll()
            applyLocalItems(items, folder: folder, isFirstLoad: false)
        }
    }

    /// 弹出文件夹选择面板。用户取消返回 nil。
    private func chooseLocalFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        // 不允许选文件、也不允许在面板里新建目录：数据源是一个**已有内容的**文件夹，
        // 现建一个空目录只会立刻撞上「文件夹里没有 mp4」。
        panel.canCreateDirectories = false
        panel.prompt = "选用"
        panel.message = "选择一个存放 mp4 的文件夹（含子文件夹，其它格式会被忽略）"
        // 再次选择时从当前文件夹开始，不用一层层点回去。
        if let current = preferences.resolvedLocalFolderURL {
            panel.directoryURL = current
        }
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        return url
    }

    /// 切换内容分类。
    ///
    /// 索引里没有条目，所以这一步是**真的去拉一个文件**（`category.<id>.json`，约 0.6 MB）——
    /// 换来的好处是启动时不必下全量。因为是异步的，要处理两件事：
    ///
    /// - **连点**：用递增的请求序号，回包时比对，过期结果丢弃（`loadSlice` 里做）；
    /// - **失败**：保持当前画面与当前勾选，不把候选池换空。
    ///
    /// 选中项**只在拉取成功后写回**配置，否则菜单的勾选会和池子里的内容打架。
    @objc private func selectCategory(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? Int else { return }
        guard id != selectedCategoryID else { return }
        guard let entry = categories.first(where: { $0.id == id }) else { return }
        guard entry.itemCount > 0 else {
            // 菜单里这种项本来就置灰了，走到这里说明是别的途径触发的
            notice = .warning("分类「\(entry.name)」没有可用内容")
            log("⚠️ 分类「\(entry.name)」条目数为 0，忽略本次切换")
            refreshStatusItem()
            return
        }

        failuresBySlot.removeAll()
        notice = .info("正在加载分类「\(entry.name)」…")
        refreshStatusItem()
        // 「首次加载」的判据与 `handleIndexResult` 保持一致：池子还空着才算。
        // 用户可能在启动那一下（首次切片还在路上）就点了分类，那次也算首次 ——
        // 写死 `false` 会让「启动后立刻点一下」丢掉每屏源的恢复。
        loadSlice(for: id, service: makeCatalogService(), isFirstLoad: pool.totalCount == 0)
    }

    @objc private func switchMultiScreenPolicy(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let policy = MultiScreenPolicy(rawValue: raw)
        else { return }

        preferences.multiScreenPolicy = policy
        persistPreferences("多屏策略")

        let verdict = screenCoordinator.apply(policy: policy)
        // 槽位集合随策略变化（镜像 1 个 / 每屏独立 N 个），必须重新对齐并绑定窗口。
        // 失败计数也要清：旧槽位的失败次数跟新槽位没有关系。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        syncPlaybackSlots()

        notice = .info("多屏策略：\(policy.label)（\(verdict.summary)）")
        log(
            "多屏策略切换为 \(policy.label)：窗口 \(screenCoordinator.windows.count) 个 / 屏幕 "
                + "\(screenCoordinator.screenCount) 块，槽位 \(engine.slotKeys().count) 个 | \(verdict.summary)"
        )
        if policy == .perScreen, screenCoordinator.slotPlan.hasSharedSlot {
            log(
                "屏幕数超过每屏独立上限 \(MultiScreenPolicy.maxIndependentScreens) 块，"
                    + "超出的屏幕共用最后一路解码")
        }
        refreshStatusItem()
        persistScreenSources()
    }

    @objc private func switchLevel(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let preset = LevelPreset(rawValue: raw)
        else { return }
        let verdict = screenCoordinator.apply(level: preset.level)
        preferences.levelPreset = preset
        persistPreferences("窗口层级")
        notice = .info("窗口层级：\(verdict.summary)")
        log("切换到层级 \(preset.shortLabel)（\(preset.level)）：\(verdict.summary)")
        refreshStatusItem()
    }

    /// 打开动态壁纸浏览窗口（维护段）。
    ///
    /// **单窗口复用**：已有 controller 就只前置，不重复开 —— 否则点两次会有两个窗口，
    /// 而它们各自持有一个预览播放器，同一个视频会被下两遍。
    ///
    /// 打开窗口**不暂停桌面播放**（决策 12）：浏览窗口是「挑一张」的工具，
    /// 不该把正在看的壁纸弄停。
    @objc private func openWallpaperBrowser() {
        // 本地来源下这一项在菜单里已经置灰（`OnlineOnlyEntry.wallpaperBrowser`）。
        // 这里的守卫是给「别的途径触发」兜底 —— 窗口列的是线上分类的条目，
        // 本地来源下打开它只会显示一个与当前画面无关的目录。
        guard WallpaperSourceMenu.isEnabled(.wallpaperBrowser, isLocalSource: isLocalSource) else {
            notice = .warning("本地文件夹来源下不浏览线上内容")
            log("本地来源下忽略「打开动态壁纸」")
            refreshStatusItem()
            return
        }
        if let existing = browserWindowController {
            existing.present()
            return
        }
        let controller = WallpaperBrowserWindowController(dataSource: self)
        controller.log = { [weak self] message in self?.log(message) }
        controller.onClose = { [weak self] in
            self?.browserWindowController = nil
            self?.log("浏览窗口已关闭（桌面播放不受影响）")
        }
        browserWindowController = controller
        log("打开动态壁纸浏览窗口")
        controller.present()
    }

    @objc private func reloadCatalog() {
        // 刻意**不清空候选池**：重载失败时保持现有内容继续播，
        // 而不是把池子清空、让下一次切换撞上「候选池已耗尽」。
        // 重载成功时 `handleCatalogResult` 会自己把候选集换成当前分类的那一片。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        // 本地来源下「重新加载清单」= **重扫文件夹**（⌥⌘R 与菜单项共用这一条路径）。
        // 往文件夹里加/删 mp4 之后，就是靠它生效的 —— 定时切换刻意不重扫。
        if let folder = preferences.resolvedLocalFolderURL {
            log("重新扫描本地文件夹")
            startLocalSource(folder, isFirstLoad: false)
            return
        }
        loadCatalogAndStart()
    }

    #if DEBUG
        @objc private func dumpWindows() {
            WindowInspector.printTable(highlightPIDs: [
                Int(ProcessInfo.processInfo.processIdentifier)
            ])
        }
    #endif

    // MARK: - 自身完整性

    /// 启动时校验自身签名，把结论写进日志。
    ///
    /// **只写日志**：不弹提示、不阻断启动。ad-hoc 签名下这个检查能被重签绕过，
    /// 而误判的代价（用户以为 App 被动过手脚）远大于收益。详见 `Seal`。
    private func reportSeal() {
        switch Seal.readBundle() {
        case .trusted:
            log("自身完整性校验通过")
        case .modified(let reason):
            log("⚠️ 自身完整性校验失败：\(reason) —— 本副本可能被改动过且未重新签名")
        case .undetermined(let reason):
            log("自身完整性无法判定（不影响运行）：\(reason)")
        }
    }

    // MARK: - 日志

    /// 日志轮转阈值。要调整改这里，单位见各字段注释。
    private static let logRotation = LogRotationConfig()

    /// 日志落盘锁。
    ///
    /// `log(_:)` 会被主线程、网络回调、调度定时器等多处调用，而轮转是
    /// 「读大小 → 清空 → 写说明 → 写正文」的多步操作。整个序列必须与写入处在同一把锁内，
    /// 否则两个线程同时轮转会写出两条说明，或者把正在写的那条清掉。
    private let logLock = NSLock()

    /// 距上次文件大小检查后累计写入的条数。
    private var logWritesSinceCheck = 0
    /// 上次文件大小检查的时刻。
    private var logLastCheck = Date()

    /// 落盘到 `~/Library/Logs/com.meowv.livewall/livewall.log`，同时输出到 stdout。
    /// 出问题时先看这个文件 —— 壁纸应用是后台进程，没有控制台可看。
    ///
    /// 时间戳格式与「追加一行」的落盘逻辑在 `AppLog`（Core）：启动早期
    /// （`main.swift` 里判单实例、那时 `AppDelegate` 还没建起来）也要写同一个文件，
    /// 各抄一份迟早会漂移。**轮转仍留在本地**：它是播放期的高频路径。
    private func log(_ message: String) {
        let line = "[\(AppLog.stamp())] \(message)"
        print(line)
        fflush(stdout)

        logLock.lock()
        defer { logLock.unlock() }

        guard let file = LiveWallPaths.logFileURL else { return }

        // 先判断要不要轮转，再写当前这条。
        // 顺序不能反：反过来的话，刚追加的这条会被随后的清空一起抹掉。
        let now = Date()
        if Self.logRotation.shouldCheck(
            writesSinceCheck: logWritesSinceCheck,
            elapsedSeconds: now.timeIntervalSince(logLastCheck)
        ) {
            logWritesSinceCheck = 0
            logLastCheck = now
            rotateLogFileIfNeeded(file)
        } else {
            logWritesSinceCheck += 1
        }

        AppLog.append(line, to: file)
    }

    /// 超过上限就清空复用同一个文件。调用方需已持有 `logLock`。
    ///
    /// 刻意**不生成** `.1` / `.2` / 日期后缀 / 压缩归档，也不做归档：
    /// 日志只用于排障，留一堆历史文件只是白占空间。
    private func rotateLogFileIfNeeded(_ file: URL) {
        let size = Self.logFileSize(file)
        guard Self.logRotation.shouldRotate(fileSizeBytes: size) else { return }

        // 截断为 0 字节而不是删文件：删了再建会换 inode，这里要的是「同一个文件复用」。
        try? "".write(to: file, atomically: false, encoding: .utf8)

        let notice =
            "[\(AppLog.stamp())] "
            + LogRotationConfig.rotationNoticeText(
                clearedBytes: size,
                limitBytes: Self.logRotation.maxFileSizeBytes
            )
        AppLog.append(notice, to: file)
    }

    /// 日志文件当前大小，读不到或为 0 时按 0 处理（文件还不存在）。
    private static func logFileSize(_ file: URL) -> UInt64 {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0 else {
            return 0
        }
        return UInt64(size)
    }
}

// MARK: - 菜单项的实际可用性

/// 菜单项的**实际**可用性由这里决定，而不是 `buildXxxMenu` 里写的 `isEnabled`。
///
/// ## 为什么
///
/// `NSMenu.autoenablesItems` 默认为 `true`：菜单展开时，**带 target/action 的项**会被
/// AppKit 重新校验一遍；没实现 `NSMenuItemValidation` 时，判定退化成「target 能不能响应
/// 这个 action」，于是构建时写的 `isEnabled = false` **被静默覆盖**。
/// 实测（2026-09-21）：本地来源下「打开动态壁纸」看起来仍可点，点了才被守卫拦下 ——
/// 用户看到的是「点了没反应」，比一开始就置灰更糟。
///
/// 同一个坑此前还悄悄影响另外五处：`下载当前壁纸`（没有可下载条目时）、`固定`（没有正在
/// 播的条目时）、`内容过滤`（条目数为 0 的分类）、`空闲阈值`（总开关关着时）、
/// `检查更新`（`updateState` 说不可点时）。它们当时**都没有真正置灰**。
///
/// ## 约定
///
/// - 带 action 的项：判据写在这里，`buildXxxMenu` 里**不要再写 `isEnabled`**（写了不生效，
///   只会让人以为改那里就够了）。
/// - `action: nil` 的说明行（状态区、更新详情、`关于` 里的信息行）不受影响 ——
///   它们的 target 是 nil，不会被自动校验碰到，仍在构建时置灰。
extension AppDelegate: NSMenuItemValidation {

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(openWallpaperBrowser):
            // 本地来源下不可用：那个窗口列的是线上分类的条目。
            return WallpaperSourceMenu.isEnabled(.wallpaperBrowser, isLocalSource: isLocalSource)

        case #selector(downloadCurrentWallpaper):
            // 本地来源下没有可下载的东西；下载中、或当前没有在播的条目时同样不可点。
            return WallpaperSourceMenu.isEnabled(.downloadCurrent, isLocalSource: isLocalSource)
                && !downloader.isDownloading
                && currentDownloadableItem != nil

        case #selector(selectCategory(_:)):
            // 本地来源下没有分类；条目数为 0 的分类本来就该置灰（可点会进空池）。
            // 「0 条置灰」的判据复用 `CategoryMenu.entries` 这个已单测的纯函数，
            // 不在这里另写一遍 `itemCount > 0`（同一条规则写两处，迟早会漂移）。
            guard WallpaperSourceMenu.isEnabled(.categoryFilter, isLocalSource: isLocalSource),
                  let id = menuItem.representedObject as? Int else { return false }
            return CategoryMenu.entries(categories: categories, selectedID: selectedCategoryID)
                .first { $0.id == id }?.isEnabled ?? false

        case #selector(pinCurrentItem):
            // 当前没有正在播的条目时不可固定。已固定时仍可点（幂等）。
            return canPinCurrent

        case #selector(setIdleThreshold(_:)):
            // 「无操作时」总开关关着时，子项没有意义（置灰而不是隐藏，保留可发现性）。
            return preferences.pauseWhenIdle

        case #selector(checkForUpdates):
            return updateState.checkItemEnabled

        default:
            // 其余带 action 的项没有额外条件。回落到构建时写的值：`action: nil` 的说明行
            // 若某天被自动校验碰到，也仍按「构建时置灰」处理，不会被误开。
            return menuItem.isEnabled
        }
    }
}

// MARK: - 浏览窗口的数据出口

/// 浏览窗口只通过这五个成员与 App 交互 —— 不把 `AppDelegate` 的四十来个私有成员
/// 暴露给它，也不给它第二套分类 / 固定状态的读法。
extension AppDelegate: WallpaperBrowserDataSource {

    var browserCategories: [LivewallCategoryEntry] { categories }

    var browserSelectedCategoryID: Int? { selectedCategoryID }

    /// 固定项的 id。UI 只**标记**它，不提供取消固定的入口（决策 11）。
    var browserPinnedItemID: Int? { preferences.pinnedItem?.id }

    /// 拉取某个分类的条目给浏览窗口。
    ///
    /// **复用 `CatalogService.loadSlice`，但绝不调 `cacheSlice` / `loadIndex`**：
    /// `sliceCacheURL` 只有一份，是播放的离线兜底。浏览窗口是第一个只读调用方，
    /// 一旦让它写缓存，离线启动就会读到「用户随手翻过的那个分类」，
    /// 而不是「上次真正在播的那个」。
    ///
    /// 已知限制（写进文档）：离线时 `loadSlice` 会回退读共享切片缓存，而
    /// `tryDecodeSlice` 的归属校验（`source.categoryIds.contains(entry.id)`）会返回 nil
    /// —— 于是**离线时只能浏览当前播放分类的条目**，其它分类显示「加载失败」。
    /// 不会显示错分类。
    func browserLoadItems(
        for categoryID: Int,
        completion: @escaping @MainActor @Sendable (Result<[WallpaperItem], BrowserLoadFailure>) ->
            Void
    ) {
        guard let entry = categories.first(where: { $0.id == categoryID }) else {
            completion(.failure(BrowserLoadFailure(message: "分类不存在（清单可能已经更新）")))
            return
        }
        let service = makeCatalogService()
        DispatchQueue.global(qos: .userInitiated).async {
            let result = service.loadSlice(entry)
            // 回跳用 `Task { @MainActor }` 而不是 `DispatchQueue.main.async`：
            // 后者在 Swift 6 下也能推断出主 actor 隔离，但 `Task` 是项目里统一的回跳写法，
            // 且不会与「主队列是否被 run loop 抽干」这类隐式前提纠缠。
            Task { @MainActor in
                guard let catalog = result.catalog else {
                    completion(
                        .failure(
                            BrowserLoadFailure(
                                message: result.warnings.first ?? "远程与本地副本都不可用"
                            )))
                    return
                }
                completion(.success(catalog.items))
            }
        }
    }

    /// 设为桌面壁纸。与菜单「固定」行走**同一条落实路径**。
    func browserSetPinned(_ item: WallpaperItem, categoryID: Int) {
        setPinned(item, categoryID: categoryID)
    }
}

// MARK: - 菜单展开期的惰性采样

/// 进程自身的占用**只在菜单展开时采一次**，收起即停 —— 没有后台轮询、没有常驻定时器。
///
/// 三个回调的分工：
///  - `menuNeedsUpdate`：菜单显示前，AppKit 来要内容 —— 这是**最早**的时机，在这里
///    发起采样，结果最可能在菜单出现前就填好；
///  - `menuWillOpen`：确认展开，置 `isMenuOpen`。只在 `menuNeedsUpdate` 没被回调时
///    才兜底发起一次（正常路径上 `menuNeedsUpdate` 一定先于本回调触发）；
///  - `menuDidClose`：收起 —— 立刻取消未完成的采样并释放它。
extension AppDelegate: NSMenuDelegate {

    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        sampledThisOpen = true
        requestUsageSample()
    }

    func menuWillOpen(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        isMenuOpen = true
        // 只在 `menuNeedsUpdate` 没被回调时兜底 —— 正常路径上它一定会先于本回调触发。
        if !sampledThisOpen { requestUsageSample() }
    }

    func menuDidClose(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        isMenuOpen = false
        sampledThisOpen = false
        // 采样到此为止：`ProcessMonitor` 会取消后台队列上未执行的任务，
        // 已经跑完的也会因为代号不匹配被丢弃。
        processMonitor.cancel()

        // 一次性回执（手动「检查更新」的应答）**展示过之后**收起即作废。
        //
        // **必须重建菜单**：`item.menu` 持有的是上一次构建的 `NSMenu` 对象，
        // 只把 `notice` 置 nil 的话，下次展开显示的还是旧的那份 —— 回执照样在。
        // 而重建放在下一个 runloop：本回调还在关闭流程里，此刻换掉 `item.menu`
        // 有与 AppKit 抢状态的风险。
        if notice?.isOneShot == true, noticeShown {
            notice = nil
            DispatchQueue.main.async { [weak self] in self?.refreshStatusItem() }
        }

        // 展开期间被推迟的菜单重建在这里补上。
        // 同样放到下一个 runloop：本回调还在关闭流程里，此刻换掉 `item.menu`
        // 有与 AppKit 抢状态的风险。
        if isMenuRebuildPending {
            isMenuRebuildPending = false
            DispatchQueue.main.async { [weak self] in self?.refreshStatusItem() }
        }
    }
}
