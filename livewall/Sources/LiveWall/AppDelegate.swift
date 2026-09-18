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
    private lazy var remoteCacheURL: URL = Self.applicationSupportDirectory.appendingPathComponent("catalog.remote-cache.json")

    // 组件
    private let screenCoordinator: ScreenCoordinator
    private let engine = PlaybackEngine()
    private let network = NetworkMonitor()
    /// 全局热键。Carbon `RegisterEventHotKey`，不需要辅助功能授权。
    private let hotKeys = HotKeyManager()
    /// 省电状态机。延迟创建，因为它的求值依赖已加载的 `preferences`。
    private lazy var governor = PlaybackGovernor(resolverProvider: { [weak self] in
        self?.preferences.playbackStateResolver ?? PlaybackStateResolver()
    })
    private var pool = CandidatePool()
    private var catalogItemCount = 0

    // 失败处理
    private let failurePolicy = FailurePolicy()
    private var retriesForCurrentItem = 0
    /// 因网络不可达而暂停切换中。网络恢复时立刻重试，不等定时器。
    private var isHoldingForNetwork = false

    // 状态
    private var statusItem: NSStatusItem?
    private var scheduleTimer: Timer?
    private var consecutiveFailures = 0
    /// 状态区第二行：当前（或最后一次成功播放的）条目名。
    ///
    /// 刻意与 `notice` 分开。以前两者共用一个字段，结果是失败时名称行被
    /// 「候选池已耗尽」顶掉，用户看不到正在循环的是哪张，容易误读成「壁纸掉了」。
    private var currentName = "启动中"
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
        preferences = Preferences.load(from: configURL).sanitized()

        buildStatusItem()
        registerNotifications()

        engine.onFailure = { [weak self] error in
            self?.handlePlaybackFailure(error)
        }

        network.onChange = { [weak self] reachable in
            guard let self else { return }
            self.log(reachable ? "网络已恢复" : "网络已断开（当前画面继续循环，暂不切换）")
            // 之前是因为网络不通才保持画面的，现在恢复了就立刻重试，不等定时器
            if reachable, self.isHoldingForNetwork {
                self.scheduleTimer?.invalidate()
                self.consecutiveFailures = 0
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
            self.engine.attach(to: self.screenCoordinator.windows, gravity: self.gravity)

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
        engine.teardown()
    }

    private var gravity: AVLayerVideoGravity {
        preferences.gravity == "fit" ? .resizeAspect : .resizeAspectFill
    }

    // MARK: - 清单

    private func loadCatalogAndStart() {
        let service = CatalogService(
            remoteCatalogURL: preferences.resolvedRemoteURL,
            remoteCacheURL: remoteCacheURL
        )
        log("加载清单：远程=\(service.remoteCatalogURL?.absoluteString ?? "未配置")")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = service.load()
            DispatchQueue.main.async {
                guard let self else { return }
                self.handleCatalogResult(result)
            }
        }
    }

    private func handleCatalogResult(_ result: CatalogLoadResult?) {
        guard let result else {
            notice = .warning("没有可用的清单")
            log("清单加载失败：远程、副本、内置全部不可用")
            refreshStatusItem()
            return
        }
        catalogItemCount = result.catalog.items.count
        // 过滤条件与选片顺序都要在灌入候选集之前设好 —— `setItems` 会按它们直接
        // 算出 source，之后再设会触发一次多余的整表重建。
        pool.filter = preferences.authorFilter.isEmpty
            ? CandidateFilter()
            : CandidateFilter(authors: Set(preferences.authorFilter))
        pool.order = preferences.playbackOrder
        pool.setItems(result.catalog.items)
        log("清单来源：\(result.origin.label)，共 \(catalogItemCount) 条")
        log("选片顺序：\(preferences.playbackOrder.label)（\(preferences.playbackOrder.detail)）")
        if pool.filter.isActive {
            log("内容过滤：\(pool.filter.summary)，可用 \(pool.totalCount) 条"
                + "（已排除 \(pool.filteredOutCount) 条）")
        }
        for warning in result.warnings { log("  ⚠︎ \(warning)") }

        refreshStatusItem()
        advance()
    }

    // MARK: - 调度

    /// 切到下一条。
    private func advance() {
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
        guard let item = pool.next() else {
            notice = .warning("候选池为空")
            refreshStatusItem()
            return
        }
        loadAndPlay(item, attempt: 0)
    }

    /// 加载并播放指定条目。失败时按 `FailurePolicy` 决定重试、拉黑还是保持画面。
    private func loadAndPlay(_ item: WallpaperItem, attempt: Int) {
        guard let url = item.remoteURL else {
            log("跳过 URL 非法的条目 \(item.id)")
            pool.blacklist(id: item.id)
            advance()
            return
        }

        Task { @MainActor in
            do {
                let loaded = try await VideoLoader.load(url)
                engine.play(item, loaded: loaded)
                consecutiveFailures = 0
                retriesForCurrentItem = 0
                isHoldingForNetwork = false
                currentName = item.displayName
                notice = nil
                log("播放 \(item.id) \(item.title)(\(loaded.resolutionText)) 时长 "
                    + "\(String(format: "%.2f", loaded.durationSeconds))s 编码 \(loaded.codec)")
                refreshStatusItem()
                // 加载是异步的，期间状态可能已翻成暂停。播放器必须服从当前状态，
                // 否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。
                // 画面保持就位（已解码缓冲），恢复时能立刻无缝续上。
                if !governor.state.isPlaying {
                    engine.pause()
                    log("加载完成时已处于暂停状态，画面就位但不播放")
                }
                scheduleNext(after: loaded.durationSeconds)
            } catch {
                handleLoadFailure(error, item: item, attempt: attempt)
            }
        }
    }

    /// 加载失败的统一出口。
    private func handleLoadFailure(_ error: Error, item: WallpaperItem, attempt: Int) {
        let kind = FailurePolicy.classify(error)
        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: consecutiveFailures + 1,
            retriesForItem: attempt
        )
        log("加载失败 \(item.id)：\(kind.label) → \(Self.describe(action))")

        switch action {
        case .stopScheduling:
            consecutiveFailures += 1
            stopScheduling(reason: "连续 \(consecutiveFailures) 次失败")

        case .holdCurrent:
            holdCurrent(reason: kind.label)

        case .retrySame:
            retriesForCurrentItem = attempt + 1
            loadAndPlay(item, attempt: attempt + 1)

        case .blacklistAndAdvance:
            // 只有确认是资源本身的问题才拉黑。网络类失败绝不拉黑，
            // 否则一次断网会把整池好资源全丢进黑名单。
            pool.blacklist(id: item.id)
            consecutiveFailures += 1
            advance()
        }
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
            self.consecutiveFailures = 0
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
    private func handlePlaybackFailure(_ error: Error) {
        guard let item = engine.currentItem else { return }
        let kind = FailurePolicy.classify(error)
        log("播放失败 \(item.id)：\(kind.label)")
        scheduleTimer?.invalidate()

        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: consecutiveFailures + 1,
            retriesForItem: retriesForCurrentItem
        )
        switch action {
        case .stopScheduling:
            consecutiveFailures += 1
            stopScheduling(reason: "连续 \(consecutiveFailures) 次失败")
        case .holdCurrent:
            holdCurrent(reason: kind.label)
        case .retrySame:
            retriesForCurrentItem += 1
            loadAndPlay(item, attempt: retriesForCurrentItem)
        case .blacklistAndAdvance:
            pool.blacklist(id: item.id)
            consecutiveFailures += 1
            advance()
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
                if engine.currentItem == nil {
                    // 启动时就被暂停（或首次加载尚未成功），此时窗口还是空白：
                    // 排下一次切换等于白等 4~6 分钟，应当立刻加载。
                    advance()
                } else {
                    scheduleNext(after: engine.currentDuration)
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
        }
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main
        ) { [weak self] _ in
            self?.governor.setSessionLocked(false)
        }
    }

    /// 重建窗口并复用同一个播放器，不重开解码器。
    private func rebuildWindows(reason: String) {
        let verdict = screenCoordinator.rebuild()
        engine.attach(to: screenCoordinator.windows, gravity: gravity)
        log("\(reason)后重建 \(screenCoordinator.windows.count) 个窗口：\(verdict.summary)")
        refreshStatusItem()
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
        menu.addItem(buildFilterMenu())

        let policyMenu = NSMenu()
        // 顶部一行说明当前策略的代价（尤其流量），这是选择时唯一要权衡的东西
        let policyDetail = NSMenuItem(title: screenCoordinator.policy.detail, action: nil, keyEquivalent: "")
        policyDetail.isEnabled = false
        policyMenu.addItem(policyDetail)
        policyMenu.addItem(.separator())
        for policy in MultiScreenPolicy.allCases where policy.isImplemented {
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
        // 低频恢复动作。放在设置组之后：它不改变任何设置，只是把清单重新拉一遍，
        // 混在配置项中间既打断位置记忆，也容易被误点。
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

    @objc private func setIdleThreshold(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.idleThresholdSeconds = seconds
        try? preferences.save(to: configURL)
        log("空闲阈值改为 \(IdleThreshold.label(seconds))")
        governor.refresh()
        refreshStatusItem()
    }

    @objc private func nextNow() {
        consecutiveFailures = 0
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
        scheduleNext(after: engine.currentDuration)
    }

    /// 内容过滤子菜单。
    ///
    /// 选项取自清单里**实际出现过**的作者（按条目数降序），而不是数据库里的全量作者 ——
    /// 选了当前清单里没有的作者只会得到「过滤后没有可用内容」。
    private func buildFilterMenu() -> NSMenuItem {
        let submenu = NSMenu()

        let current = NSMenuItem(title: "当前：\(pool.filter.summary)", action: nil, keyEquivalent: "")
        current.isEnabled = false
        submenu.addItem(current)

        let clear = NSMenuItem(title: "清除过滤", action: #selector(clearContentFilter), keyEquivalent: "")
        clear.target = self
        clear.isEnabled = pool.filter.isActive
        submenu.addItem(clear)

        submenu.addItem(.separator())

        if pool.authorOptions.isEmpty {
            let empty = NSMenuItem(title: "清单里没有可用的作者", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            submenu.addItem(empty)
        } else {
            let header = NSMenuItem(title: "按作者（可多选）", action: nil, keyEquivalent: "")
            header.isEnabled = false
            submenu.addItem(header)
            for option in pool.authorOptions {
                let entry = NSMenuItem(
                    title: "\(option.value)（\(option.count)）",
                    action: #selector(toggleAuthorFilter(_:)),
                    keyEquivalent: ""
                )
                entry.target = self
                entry.representedObject = option.value
                entry.state = preferences.authorFilter.contains(option.value) ? .on : .off
                submenu.addItem(entry)
            }
        }

        let root = NSMenuItem(title: "内容过滤（\(pool.filter.summary)）", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func toggleAuthorFilter(_ sender: NSMenuItem) {
        guard let author = sender.representedObject as? String else { return }
        if sender.state == .on {
            preferences.authorFilter.removeAll { $0 == author }
        } else if !preferences.authorFilter.contains(author) {
            preferences.authorFilter.append(author)
        }
        try? preferences.save(to: configURL)
        applyContentFilter()
    }

    @objc private func clearContentFilter() {
        preferences.authorFilter.removeAll()
        try? preferences.save(to: configURL)
        applyContentFilter()
    }

    /// 把过滤条件应用到候选池。
    private func applyContentFilter() {
        pool.filter = preferences.authorFilter.isEmpty
            ? CandidateFilter()
            : CandidateFilter(authors: Set(preferences.authorFilter))
        log("内容过滤：\(pool.filter.summary)，可用 \(pool.totalCount) 条"
            + "（已排除 \(pool.filteredOutCount) 条）")

        if pool.isExhausted {
            // 刻意不动播放器：保持当前画面比黑屏好
            notice = .warning("过滤后没有可用内容")
            log("⚠️ 过滤后没有可用内容，请放宽条件")
            refreshStatusItem()
        } else {
            // 过滤后原来那条多半已不在候选集里，直接换一张 ——
            // 否则用户改了设置却看不到任何变化
            advance()
        }
    }

    @objc private func switchMultiScreenPolicy(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
              let policy = MultiScreenPolicy(rawValue: raw) else { return }

        preferences.multiScreenPolicy = policy
        try? preferences.save(to: configURL)

        let verdict = screenCoordinator.apply(policy: policy)
        // 重建窗口后必须重新绑定 —— 新窗口没有 playerLayer，不 attach 就是一片黑
        engine.attach(to: screenCoordinator.windows, gravity: gravity)

        notice = .info("多屏策略：\(policy.label)（\(verdict.summary)）")
        log("多屏策略切换为 \(policy.label)：窗口 \(screenCoordinator.windows.count) 个 / 屏幕 "
            + "\(screenCoordinator.screenCount) 块 | \(verdict.summary)")
        refreshStatusItem()
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
        pool = CandidatePool()
        consecutiveFailures = 0
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

    /// 落盘到 `~/Library/Logs/com.meowv.livewall/livewall.log`，同时输出到 stdout。
    /// 出问题时先看这个文件 —— 壁纸应用是后台进程，没有控制台可看。
    private func log(_ message: String) {
        let line = "[\(Self.timestamp())] \(message)"
        print(line)
        fflush(stdout)

        let logs = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Logs/com.meowv.livewall", isDirectory: true)
        guard let logs else { return }
        try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
        let file = logs.appendingPathComponent("livewall.log")
        guard let data = (line + "\n").data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: file) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: file)
        }
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM-dd HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }
}
