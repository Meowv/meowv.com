import AppKit
import AVFoundation
import LiveWallCore

/// 软件内「一键锁屏」的生命周期。
///
/// 职责：覆盖窗口、独立壁纸、严格输入拦截、系统呈现选项。进入与退出方式
/// 参考 `RestReminderCoordinator`，但**没有倒计时、不会自动结束** ——
/// 只能由空格或 ⌘W 退出。
///
/// 默认沿用「锁屏那一刻正在播放的壁纸」，直接复用同一个 `LoadedVideo`，不重新下载；
/// 用户把配置改成纯黑、或当时没有在播的条目时，画面是纯黑 —— 加载失败也停在纯黑，
/// 不会回退到桌面正在播放的画面。
@MainActor
final class InAppLockCoordinator {

    private(set) var isActive = false
    /// 本次锁定是否成功启用了全局事件拦截。false 表示降级（只有窗口层拦截）。
    private(set) var isInputShieldActive = false

    private var windowsByDisplayID: [UInt32: InAppLockWindow] = [:]
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var loadTask: Task<Void, Never>?
    private var shield: InAppLockInputShield?
    private var previousPresentationOptions: NSApplication.PresentationOptions?
    /// 重新拿到前台时把键盘焦点拉回锁屏窗。窗口层的兜底依赖它是 key window。
    private var activationObserver: NSObjectProtocol?

    /// 解锁请求（空格 / ⌘W）。事件 tap 与窗口兜底都汇到这里。
    var onUnlockRequest: (() -> Void)?
    var log: ((String) -> Void)?
    var onNotice: ((String) -> Void)?

    init() {
        player.isMuted = true
        // 锁屏期间不该阻止显示器休眠
        player.preventsDisplaySleepDuringVideoPlayback = false
        player.actionAtItemEnd = .advance
    }

    /// 进入锁屏。`item` 为 nil（或没有可播放地址）时使用纯黑屏。
    ///
    /// - Parameter preloaded: 该条目若正是桌面正在播的那条，可直接复用已加载的
    ///   `LoadedVideo`，省掉一次 HEAD 与整段视频下载。
    @discardableResult
    func start(item: WallpaperItem?, preloaded: LoadedVideo? = nil) -> Bool {
        guard !isActive else { return false }
        isActive = true

        // 记下原值再覆盖：解锁与退出都要原样还回去，不能留下被改过的全局呈现状态。
        previousPresentationOptions = NSApp.presentationOptions
        NSApp.presentationOptions = Self.presentationOptions
        NSApp.activate()

        rebuildWindows()
        observeActivation()

        let shield = InAppLockInputShield { [weak self] in
            Task { @MainActor in self?.onUnlockRequest?() }
        }
        isInputShieldActive = shield.start()
        self.shield = shield
        if !isInputShieldActive {
            log?("⚠️ 一键锁屏的全局输入拦截未启用（缺少辅助功能权限），仅由窗口层拦截")
        }

        if let item, let url = item.playableURL {
            if let preloaded, preloaded.url == url {
                attach(preloaded)
                log?("一键锁屏壁纸：\(item.displayName)（复用桌面已加载的视频）")
            } else {
                loadVideo(url, title: item.displayName)
            }
        } else {
            log?("一键锁屏：本次使用纯黑屏（纯黑模式或当前没有在播的条目）")
        }
        return true
    }

    /// 退出锁屏。幂等；退出清理路径也会调用。
    func end() {
        guard isActive || !windowsByDisplayID.isEmpty else { return }
        isActive = false
        isInputShieldActive = false

        loadTask?.cancel()
        loadTask = nil
        shield?.stop()
        shield = nil
        if let activationObserver {
            NotificationCenter.default.removeObserver(activationObserver)
            self.activationObserver = nil
        }

        looper?.disableLooping()
        looper = nil
        player.pause()
        player.removeAllItems()

        let windows = Array(windowsByDisplayID.values)
        windowsByDisplayID.removeAll()
        for window in windows {
            window.onUnlockRequest = nil
            window.orderOut(nil)
            window.close()
        }

        if let previous = previousPresentationOptions {
            NSApp.presentationOptions = previous
            previousPresentationOptions = nil
        }
        // 关掉最后一个窗口后主动让出前台：否则解锁后键盘输入会继续落在
        // 一个没有窗口的本 App 上，用户会以为键盘失灵了。
        NSApp.deactivate()
    }

    /// 屏幕参数变化后重建覆盖窗口（新屏也要锁上）。
    func refreshWindows() {
        guard isActive else { return }
        rebuildWindows()
    }

    /// 系统唤醒 / 解锁后把锁屏画面重新顶到最前。
    ///
    /// - Parameter activate: 是否抢回前台。系统锁屏尚未解除时不要抢 ——
    ///   loginwindow 的密码框正在等输入，把本 App 顶上去只会添乱。
    func bringToFront(activate: Bool) {
        guard isActive else { return }
        for window in windowsByDisplayID.values { window.orderFrontRegardless() }
        if activate { NSApp.activate() }
        focusLockWindow()
    }

    // MARK: - 窗口

    private func rebuildWindows() {
        for window in windowsByDisplayID.values {
            window.onUnlockRequest = nil
            window.orderOut(nil)
            window.close()
        }
        windowsByDisplayID.removeAll()

        for screen in NSScreen.screens {
            guard let displayID = Self.displayID(for: screen) else { continue }
            let window = InAppLockWindow(screen: screen, player: player)
            window.onUnlockRequest = { [weak self] in self?.onUnlockRequest?() }
            windowsByDisplayID[displayID] = window
            window.orderFrontRegardless()
        }

        // 主屏窗口拿键盘焦点：事件 tap 不可用时，键盘事件至少要落在锁屏窗上。
        // 用 `makeKeyAndOrderFront` 而不是 `makeKey` —— 激活是异步的，
        // 前者会把它记为「激活后的 key window 候选」。
        focusLockWindow()
    }

    private func focusLockWindow() {
        let primaryID = NSScreen.main.flatMap(Self.displayID(for:))
        (primaryID.flatMap { windowsByDisplayID[$0] } ?? windowsByDisplayID.values.first)?
            .makeKeyAndOrderFront(nil)
    }

    /// 前台变化会重置 key window；锁屏期间必须把焦点抢回覆盖窗。
    private func observeActivation() {
        guard activationObserver == nil else { return }
        activationObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // 观察者闭包是 `@Sendable` 的，`queue: .main` 不参与隔离推断，仍需显式回跳。
            Task { @MainActor in
                guard let self, self.isActive else { return }
                self.focusLockWindow()
            }
        }
    }

    // MARK: - 壁纸

    private func loadVideo(_ url: URL, title: String) {
        loadTask?.cancel()
        loadTask = Task { @MainActor [weak self] in
            do {
                let loaded = try await VideoLoader.load(url)
                guard let self, self.isActive, !Task.isCancelled else { return }
                self.attach(loaded)
                self.log?(
                    "一键锁屏壁纸已就绪：\(title)（\(loaded.resolutionText)，"
                        + "\(String(format: "%.2f", loaded.durationSeconds))s）"
                )
            } catch {
                guard let self, self.isActive, !Task.isCancelled else { return }
                // 加载失败**不换片、不黑屏以外的任何回退**：锁屏画面保持纯黑，
                // 绝不能让当前桌面壁纸透出来。
                self.log?("⚠️ 一键锁屏壁纸加载失败，保持纯黑屏：\(error.localizedDescription)")
                self.onNotice?("一键锁屏壁纸加载失败，本次使用纯黑屏")
            }
        }
    }

    private func attach(_ loaded: LoadedVideo) {
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()

        let item = AVPlayerItem(asset: loaded.asset)
        item.preferredForwardBufferDuration = min(
            loaded.durationSeconds,
            PlaybackTuning.forwardBufferCap
        )
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.play()
    }

    // MARK: - 系统呈现选项

    /// 锁定期间请求的呈现选项。
    ///
    /// 这些是**尽力而为**的一层：只在本 App 处于前台时生效，且拦不住 Spotlight
    /// 之类的系统快捷键（那要靠事件 tap）。两者叠加才是「严格」。
    ///
    /// 组合里不能同时出现 `autoHideDock` 与 `hideDock`、`autoHideMenuBar` 与
    /// `hideMenuBar` —— 系统会直接抛异常。
    private static var presentationOptions: NSApplication.PresentationOptions {
        var options: NSApplication.PresentationOptions = [
            .hideDock,
            .hideMenuBar,
            .disableAppleMenu,
            .disableProcessSwitching,
            .disableForceQuit,
            .disableSessionTermination,
            .disableHideApplication,
        ]
        if #available(macOS 27.0, *) {
            // 屏幕热角（调度中心、启动台等）不是键鼠事件，事件 tap 拦不到；
            // 27 起系统提供了专门的呈现选项，且要求同时设置 hideDock。
            options.insert(.disableScreenCornerInteractions)
        }
        return options
    }

    private static func displayID(for screen: NSScreen) -> UInt32? {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
    }
}
