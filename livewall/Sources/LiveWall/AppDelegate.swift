import AppKit
import AVFoundation
import LiveWallCore
import LiveWallDesktop

/// 正式 App 的主控制器。
///
/// 职责边界：这里只做编排（加载配置与清单、建窗口、跑调度、更新菜单栏），
/// 具体逻辑都在 `LiveWallCore`（可单测）与 `LiveWallDesktop`（窗口层）里。
final class AppDelegate: NSObject, NSApplicationDelegate {

    // 配置
    private var preferences = Preferences.default
    private lazy var configURL: URL = Self.applicationSupportDirectory.appendingPathComponent("config.json")
    /// 索引副本缓存（几百字节）。
    private lazy var indexCacheURL: URL = Self.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.index.json")
    /// 分类切片副本缓存。**只有一份** —— 配置里的 `selectedCategoryID` 就是
    /// 「上次成功加载的那个分类」，所以启动时读回来的必然对得上（另有归属校验兜底）。
    private lazy var sliceCacheURL: URL = Self.applicationSupportDirectory
        .appendingPathComponent("catalog.remote-cache.slice.json")
    /// 已经废弃的清单缓存，启动时清掉。
    ///
    /// 三个都不能再读：`catalog.json` 是最早那版「本地清单」的残留（`catalogPath` 配置项
    /// 早已移除，没有任何代码读它）；另外两个分别是 `livewall.json` 时代的单文件缓存
    /// （里面每条候选都没有 `categoryIds`）与上一版含全量 4.9 MB 条目的「总文件」。
    private lazy var legacyCacheURLs: [URL] = [
        Self.applicationSupportDirectory.appendingPathComponent("catalog.json"),
        Self.applicationSupportDirectory.appendingPathComponent("catalog.remote-cache.json"),
        Self.applicationSupportDirectory.appendingPathComponent("catalog.remote-cache.catalog.json"),
    ]

    // 组件
    private let screenCoordinator: ScreenCoordinator
    private let engine = PlaybackEngine()
    private let network = NetworkMonitor()
    /// 锁屏预览：把当前壁纸的静态图同步成系统墙纸（桌面态被覆盖窗口挡住，只在锁屏可见）。
    private lazy var lockScreenPreviewer = LockScreenPreviewer(
        cacheDirectory: Self.applicationSupportDirectory
    )
    /// 手动下载当前壁纸（视频 + 静态预览图）到 `~/Downloads/livewall/`。
    private lazy var downloader = WallpaperDownloader()
    /// 全局热键。Carbon `RegisterEventHotKey`，不需要辅助功能授权。
    private let hotKeys = HotKeyManager()
    /// 省电状态机。延迟创建，因为它的求值依赖已加载的 `preferences`。
    private lazy var governor = PlaybackGovernor(resolverProvider: { [weak self] in
        self?.preferences.playbackStateResolver ?? PlaybackStateResolver()
    })
    private var pool = CandidatePool()

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
    private var notice: Notice?

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

        static func info(_ text: String) -> Notice { Notice(level: .info, text: text) }
        static func warning(_ text: String) -> Notice { Notice(level: .warning, text: text) }

        /// 菜单里的显示文案。前缀只在这一处加，避免各调用点各写一遍。
        var display: String {
            level == .warning ? "⚠ \(text)" : text
        }
    }

    /// 用户手动暂停。真值存在 governor 的信号里，这里只是方便读取。
    private var isUserPaused: Bool { governor.signals.userPaused }

    private static var applicationSupportDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("com.meowv.livewall", isDirectory: true)
    }

    override init() {
        preferences = Preferences.default
        screenCoordinator = ScreenCoordinator(level: Preferences.default.levelPreset.level)
        super.init()
    }

    // MARK: - 生命周期

    func applicationDidFinishLaunching(_ notification: Notification) {
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

            let calibration = self.screenCoordinator.calibrate(startingFrom: self.preferences.levelPreset)
            self.syncPlaybackSlots()

            self.log("屏幕 \(self.screenCoordinator.screenCount) 块，窗口 \(self.screenCoordinator.windows.count) 个")
            for attempt in calibration.attempts {
                self.log("  尝试 \(attempt.preset.shortLabel)(\(attempt.preset.level))：\(attempt.verdict.summary)")
                for note in attempt.verdict.notes { self.log("    · \(note)") }
            }
            self.log("层级自检：\(calibration.verdict.summary)")
            if calibration.preset != self.preferences.levelPreset {
                self.log("基线层级 \(self.preferences.levelPreset.shortLabel) 未通过，降级为 \(calibration.preset.shortLabel)")
            }

            // 自检未通过时才把窗口实况打出来，便于定位；正常路径不刷日志
            if !calibration.verdict.isHealthy {
                let numbers = self.screenCoordinator.windowNumbers
                for record in WindowInspector.snapshot() where numbers.contains(record.windowNumber) {
                    self.log("  窗口 #\(record.windowNumber) layer=\(record.layer) bounds=\(record.boundsText) 覆盖整屏=\(WindowInspector.coversAnyScreen(record.bounds))")
                }
            }

            self.loadCatalogAndStart()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        scheduleTimer?.invalidate()
        network.stop()
        persistScreenSources()
        // 恢复用户原来的墙纸。不恢复的话，退出后桌面会直接露出一张「最后播放过的
        // 静态图」，用户会以为自己的壁纸被改坏了。进程被强杀时恢复不了，
        // 原图路径已写在日志里。
        lockScreenPreviewer.restoreUserWallpaper()
        engine.teardown()
    }

    private var gravity: AVLayerVideoGravity {
        preferences.gravity == "fit" ? .resizeAspect : .resizeAspectFill
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
                self.applySliceResult(result, entry: entry, isFirstLoad: isFirstLoad)
            }
        }
    }

    private func applySliceResult(
        _ result: CatalogSliceLoadResult,
        entry: LivewallCategoryEntry,
        isFirstLoad: Bool
    ) {
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

        // 切分类时 `selectCategory` 会写一句「正在加载分类「X」…」。那是**进度提示**，
        // 内容到手就该消失 —— 不能指望 `loadAndPlay` 成功时去清它：
        // 暂停（或候选池耗尽）时 `advance()` 会提前返回，那句提示就永远挂在状态区了。
        //
        // 顺带清掉更早的警告也是对的：这次操作成功了，池子已经换成新分类，
        // 「候选池已耗尽」不再成立；「已暂停调度」同样不会残留成假信息 ——
        // 成功取到内容后 `loadAndPlay` 会重排定时器，恢复播放时
        // `applyPlaybackState(.playing)` 也会重排。
        notice = nil

        // 只有真的拿到内容才更新选中项：拉取失败时保持旧值，
        // 菜单的勾选与池子里的内容才不会打架。
        selectedCategoryID = entry.id
        if preferences.selectedCategoryID != entry.id {
            // 首次启动，或记忆值已经不在索引里（分类被删/改名）：立刻写回，
            // 否则每次启动都要重复回退一次，菜单里的勾选也不稳定。
            preferences.selectedCategoryID = entry.id
            try? preferences.save(to: configURL)
        }

        pool.order = preferences.playbackOrder
        pool.setItems(slice.items)

        // 每屏独立模式下，各屏上次播的是哪一条记在 `perScreenSources` 里，这里恢复它。
        //
        // **只在本次启动第一次成功加载清单时做**：手动重载清单（⌥⌘R）时各屏已经记着
        // 当前条目，再恢复一次等于把同一段视频重新下一遍。
        // 计划里只保留**当前分类里确实存在**的条目，其余直接丢弃（见 `ScreenSourceRestore`）。
        if isFirstLoad {
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: Set(slice.items.map(\.id))
            )
            if !pendingRestore.isEmpty {
                let detail = pendingRestore.map { "屏\($0.key)→\($0.value)" }.sorted().joined(separator: "、")
                log("待恢复的每屏源 \(pendingRestore.count) 条：\(detail)")
            } else if preferences.multiScreenPolicy == .perScreen,
                      preferences.perScreenSources.count > 0 {
                log("每屏源记忆里的条目都不在当前分类，本轮各屏重新取片")
            }
        }

        log("内容：\(entry.name)（id \(entry.id)）\(pool.totalCount) 条，来源 \(origin.label)")
        if isFirstLoad {
            log("选片顺序：\(preferences.playbackOrder.label)（\(preferences.playbackOrder.detail)）")
        }

        refreshStatusItem()
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
               let item = pool.restore(id: remembered) {
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
        guard let url = item.remoteURL else {
            log("跳过 URL 非法的条目 \(item.id)（\(key.label)）")
            pool.blacklist(id: item.id)
            advanceOne(key)
            return
        }

        Task { @MainActor in
            do {
                let loaded = try await VideoLoader.load(url)
                // 加载是异步的，期间槽位可能已经被拆掉（屏拔了 / 策略切了）。
                // 往一个不存在的槽位里塞内容只会让播放器空转。
                guard self.engine.slotKeys().contains(key) else {
                    self.log("槽位 \(key.label) 在加载完成前已失效，丢弃 \(item.id)")
                    return
                }
                self.engine.play(item, loaded: loaded, on: key)
                self.failuresBySlot[key] = 0
                self.retriesBySlot[key] = 0
                self.isHoldingForNetwork = false
                self.namesBySlot[key] = item.displayName
                self.refreshCurrentName()
                self.notice = nil
                self.log("播放 \(item.id) \(item.title)(\(loaded.resolutionText)) 时长 "
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
                self.handleLoadFailure(error, item: item, attempt: attempt, on: key)
            }
        }
    }

    /// 加载失败的统一出口。
    private func handleLoadFailure(_ error: Error, item: WallpaperItem, attempt: Int, on key: PlaybackSlotKey) {
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
            advanceOne(key)
        }
    }

    /// 某个槽位连续失败到阈值时的处理。
    ///
    /// **只有所有槽位都失败才停全局调度**：每屏独立时副屏挂掉就把主屏也停掉，
    /// 等于把「某一块屏的问题」放大成「壁纸没了」。单槽位失败只让它自己保持画面，
    /// 全局定时器照常走，下次切换时它会重新取片。
    private func stopSchedulingForFailedSlot(_ key: PlaybackSlotKey) {
        let keys = engine.slotKeys()
        let allFailed = !keys.isEmpty && keys.allSatisfy {
            (failuresBySlot[$0] ?? 0) >= failurePolicy.maxConsecutiveFailures
        }
        guard allFailed else {
            notice = .warning("\(key.label)连续失败，保持其画面")
            log("\(key.label)连续失败 \(failuresBySlot[key] ?? 0) 次，保持当前画面，其余槽位不受影响")
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
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.failuresBySlot.removeAll()
            self.advance()
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

    /// 播放中途失败（`AVPlayerItem.status == .failed`）。
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
            advanceOne(key)
        }
    }

    private func scheduleNext(after videoDuration: Double?) {
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        // 暂停期间不排切换：既看不到画面，也没必要消耗带宽
        guard governor.state.isPlaying else {
            log("当前处于暂停状态，暂不安排下一次切换")
            return
        }

        let policy = preferences.schedulePolicy
        let delay = policy.nextDelaySeconds(videoDuration: videoDuration)
        // 把生效的间隔设置一起打出来 —— 验证「改了间隔有没有生效」只看这一行就够
        log("下次切换在 \(String(format: "%.1f", delay)) 秒后"
            + "（间隔设置 \(SwitchInterval.label(policy.intervalSeconds))，抖动 ±\(Int(policy.jitterRatio * 100))%）")
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.advance()
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

    private func registerNotifications() {
        let workspace = NSWorkspace.shared.notificationCenter

        workspace.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.log("屏幕参数变化 → 重建窗口")
            self.rebuildWindows(reason: "屏幕变化")
        }
        workspace.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { [weak self] _ in
            self?.governor.setDisplaySleeping(true)
        }
        workspace.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.governor.setDisplaySleeping(false)
        }
        workspace.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.rebuildWindows(reason: "系统唤醒")
        }

        // 锁屏 / 解锁同样只更新信号，不直接碰播放器 ——
        // 暂停与恢复统一由 governor 的状态机决定，避免多路信号互相打架。
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main
        ) { [weak self] _ in
            self?.governor.setSessionLocked(true)
            // 把最近一次成功的静态图**再设一遍**：`setDesktopImageURL` 生效有延迟，
            // 而锁屏正是「用户马上要看」的时刻。这里刻意不抓帧 —— 播放器已被
            // governor 暂停，取不到新帧（见 `PlaybackEngine.currentFrame` 的说明）。
            self?.lockScreenPreviewer.reapplyCached()
        }
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main
        ) { [weak self] _ in
            self?.governor.setSessionLocked(false)
        }
    }

    /// 重建窗口并把播放端对齐到新的屏幕/策略。
    private func rebuildWindows(reason: String) {
        let verdict = screenCoordinator.rebuild()
        syncPlaybackSlots()
        log("\(reason)后重建 \(screenCoordinator.windows.count) 个窗口：\(verdict.summary)")
        refreshStatusItem()
        persistScreenSources()
    }

    /// 让播放端的槽位集合与当前屏幕/策略对齐，并重新绑定窗口。
    ///
    /// 屏幕热插拔、系统唤醒、策略切换都走这里。槽位是**按 key 复用**的：
    /// 没变化的那块屏不会重新拉视频，只有新出现的槽位才需要补一张。
    private func syncPlaybackSlots() {
        let keys = screenCoordinator.playbackSlotKeys()
        let previous = Set(engine.slotKeys())
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
        if preferences.lockScreenPreview, let primary = engine.primaryKey, let item = engine.item(on: primary) {
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
        var store = preferences.perScreenSources
        for key in engine.slotKeys() {
            guard let displayID = key.displayID, let item = engine.item(on: key) else { continue }
            store.setItemID(item.id, for: displayID)
        }
        let removed = store.prune(keeping: screenCoordinator.displayIDs)
        guard store != preferences.perScreenSources || removed > 0 else { return }
        preferences.perScreenSources = store
        try? preferences.save(to: configURL)
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

        item.menu = buildMenu()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        // ── 状态区 ───────────────────────────────────────────
        // 五段结构：状态 → 播放控制 → 设置 → 维护 → 退出。
        // 菜单从光标位置向下展开，到达成本与行号正相关，所以高频动作贴顶、
        // 低频与破坏性操作置底；同一类别必须连续成块，否则会破坏位置记忆。
        let header = NSMenuItem(title: "动态壁纸", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let current = NSMenuItem(title: currentName, action: nil, keyEquivalent: "")
        current.isEnabled = false
        menu.addItem(current)

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
            let noticeItem = NSMenuItem(title: notice.display, action: nil, keyEquivalent: "")
            noticeItem.isEnabled = false
            menu.addItem(noticeItem)
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
            title: "锁屏预览（当前 \(preferences.lockScreenPreview ? "开" : "关")）",
            action: #selector(toggleLockScreenPreview),
            keyEquivalent: ""
        )
        lockPreview.target = self
        lockPreview.state = preferences.lockScreenPreview ? .on : .off
        menu.addItem(lockPreview)
        menu.addItem(buildCategoryMenu())

        let policyMenu = NSMenu()
        // 顶部一行说明当前策略的代价（尤其流量），这是选择时唯一要权衡的东西
        let policyDetail = NSMenuItem(title: screenCoordinator.policy.detail, action: nil, keyEquivalent: "")
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
            let entry = NSMenuItem(title: preset.label, action: #selector(switchLevel(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = preset.rawValue
            entry.state = preset.level == screenCoordinator.level ? .on : .off
            levelMenu.addItem(entry)
        }
        let levelRoot = NSMenuItem(title: "窗口层级（当前 \(screenCoordinator.level)）", action: nil, keyEquivalent: "")
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
        // 「下载当前壁纸」排在「重新加载清单」之前：前者是主动产出，后者是恢复动作。
        let downloadCurrent = NSMenuItem(
            title: downloader.isDownloading ? "下载中…" : "下载当前壁纸",
            action: #selector(downloadCurrentWallpaper),
            keyEquivalent: ""
        )
        downloadCurrent.target = self
        downloadCurrent.isEnabled = !downloader.isDownloading && currentDownloadableItem != nil
        menu.addItem(downloadCurrent)

        let reload = NSMenuItem(
            title: "重新加载清单（\(HotKeyManager.Definition.reloadCatalog.display)）",
            action: #selector(reloadCatalog),
            keyEquivalent: ""
        )
        reload.target = self
        menu.addItem(reload)

        // 开发者工具：只在 debug 构建里存在。日常使用走 `./build.sh`（release），
        // 排障走 `./run.sh`（debug）。整块不参与 release 编译，二进制里也没有相关字符串。
#if DEBUG
        let dump = NSMenuItem(title: "打印窗口层级表", action: #selector(dumpWindows), keyEquivalent: "")
        dump.target = self
        menu.addItem(dump)
#endif

        menu.addItem(.separator())

        // ── 退出 ────────────────────────────────────────────
        let quit = NSMenuItem(title: "退出", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        return menu
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

    /// 随机模式子菜单：选「随机」还是「顺序」。
    ///
    /// 两种模式都会走完一整轮才重排、一轮内不重复，所以这里选的不是「有没有随机」，
    /// 而是「这一轮的排列怎么来」。改成子菜单而不是勾选项：勾选项的「未勾」状态
    /// 分不清是「顺序」还是「没设置」。
    private func buildOrderMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for order in PlaybackOrder.allCases {
            let entry = NSMenuItem(
                title: order.menuTitle,
                action: #selector(switchPlaybackOrder(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = order.rawValue
            entry.state = preferences.playbackOrder == order ? .on : .off
            submenu.addItem(entry)
        }
        let root = NSMenuItem(
            title: "随机模式（当前 \(preferences.playbackOrder.label)）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
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
        static let all: [PowerOption] = [.covered, .idle, .lowPowerMode, .battery, .thermalPressure]
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
                    // 总开关关着时子项没有意义，置灰而不是隐藏（保留可发现性）
                    item.isEnabled = preferences.pauseWhenIdle
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
              let option = PowerOption(rawValue: raw) else { return }
        setOption(option, enabled: sender.state != .on)
        try? preferences.save(to: configURL)
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
        try? preferences.save(to: configURL)
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
        guard let primary = engine.primaryKey else { return nil }
        return engine.item(on: primary)
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
        try? preferences.save(to: configURL)
        log("空闲阈值改为 \(IdleThreshold.label(seconds))")
        governor.refresh()
        refreshStatusItem()
    }

    @objc private func nextNow() {
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
    @objc private func switchPlaybackOrder(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
              let order = PlaybackOrder(rawValue: raw) else { return }
        guard order != preferences.playbackOrder else { return }

        preferences.playbackOrder = order
        try? preferences.save(to: configURL)
        pool.order = order

        log("选片顺序改为\(order.label)（\(order.detail)）：候选 \(pool.totalCount) 条，"
            + "下一张起按新顺序，本轮重新开始")
        refreshStatusItem()
    }

    /// 切换自动切换间隔。立即按新间隔重新计时，不换片。
    @objc private func setSwitchInterval(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.intervalSeconds = seconds
        try? preferences.save(to: configURL)
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

    /// 内容过滤子菜单：按一级分类**单选**。
    ///
    /// 行的内容（标题、置灰、勾选）由 `CategoryMenu` 算好 —— 那是纯逻辑，可以单测；
    /// 这里只负责把它贴成 `NSMenu`。
    ///
    /// 没有「清除过滤」项：分类恒有选中项，不存在「不限」态。
    private func buildCategoryMenu() -> NSMenuItem {
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
                item.isEnabled = entry.isEnabled
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
              let policy = MultiScreenPolicy(rawValue: raw) else { return }

        preferences.multiScreenPolicy = policy
        try? preferences.save(to: configURL)

        let verdict = screenCoordinator.apply(policy: policy)
        // 槽位集合随策略变化（镜像 1 个 / 每屏独立 N 个），必须重新对齐并绑定窗口。
        // 失败计数也要清：旧槽位的失败次数跟新槽位没有关系。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        syncPlaybackSlots()

        notice = .info("多屏策略：\(policy.label)（\(verdict.summary)）")
        log("多屏策略切换为 \(policy.label)：窗口 \(screenCoordinator.windows.count) 个 / 屏幕 "
            + "\(screenCoordinator.screenCount) 块，槽位 \(engine.slotKeys().count) 个 | \(verdict.summary)")
        if policy == .perScreen, screenCoordinator.slotPlan.hasSharedSlot {
            log("屏幕数超过每屏独立上限 \(MultiScreenPolicy.maxIndependentScreens) 块，"
                + "超出的屏幕共用最后一路解码")
        }
        refreshStatusItem()
        persistScreenSources()
    }

    @objc private func switchLevel(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let preset = LevelPreset(rawValue: raw) else { return }
        let verdict = screenCoordinator.apply(level: preset.level)
        preferences.levelPreset = preset
        try? preferences.save(to: configURL)
        notice = .info("窗口层级：\(verdict.summary)")
        log("切换到层级 \(preset.shortLabel)（\(preset.level)）：\(verdict.summary)")
        refreshStatusItem()
    }

    @objc private func reloadCatalog() {
        // 刻意**不清空候选池**：重载失败时保持现有内容继续播，
        // 而不是把池子清空、让下一次切换撞上「候选池已耗尽」。
        // 重载成功时 `handleCatalogResult` 会自己把候选集换成当前分类的那一片。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        loadCatalogAndStart()
    }

#if DEBUG
    @objc private func dumpWindows() {
        WindowInspector.printTable(highlightPIDs: [Int(ProcessInfo.processInfo.processIdentifier)])
    }
#endif

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    // MARK: - 日志

    /// 日志轮转阈值。要调整改这里，单位见各字段注释。
    private static let logRotation = LogRotationConfig()

    /// 日志文件路径。nil 表示取不到 Logs 目录，此时只输出到 stdout。
    private static let logFileURL: URL? =
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Logs/com.meowv.livewall", isDirectory: true)
            .appendingPathComponent("livewall.log")

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
    private func log(_ message: String) {
        let line = "[\(Self.timestamp())] \(message)"
        print(line)
        fflush(stdout)

        logLock.lock()
        defer { logLock.unlock() }

        guard let file = Self.logFileURL else { return }
        guard let data = (line + "\n").data(using: .utf8) else { return }

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

        appendToLog(data, to: file)
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

        let notice = "[\(Self.timestamp())] "
            + LogRotationConfig.rotationNoticeText(
                clearedBytes: size,
                limitBytes: Self.logRotation.maxFileSizeBytes
            )
        if let noticeData = (notice + "\n").data(using: .utf8) {
            appendToLog(noticeData, to: file)
        }
    }

    /// 追加一段内容到日志末尾。调用方需已持有 `logLock`。
    private func appendToLog(_ data: Data, to file: URL) {
        if FileManager.default.fileExists(atPath: file.path) {
            guard let handle = try? FileHandle(forWritingTo: file) else { return }
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            // 只有文件还不存在时才走整体写入 —— `write(to:)` 会截断，
            // 对已存在的文件用它会把已有内容抹掉。
            try? FileManager.default.createDirectory(
                at: file.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? data.write(to: file)
        }
    }

    /// 日志文件当前大小，读不到或为 0 时按 0 处理（文件还不存在）。
    private static func logFileSize(_ file: URL) -> UInt64 {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0 else {
            return 0
        }
        return UInt64(size)
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM-dd HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}
