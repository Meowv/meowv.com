import AppKit
import IOKit.ps
import LiveWallCore
import LiveWallDesktop

/// `PlaybackGovernor` 里「要在析构时清理的句柄」盒。
///
/// ## 为什么值得单独一个类型
///
/// `PlaybackGovernor` 是 `@MainActor` 的，而 Swift 6 里 **`deinit` 是非隔离的** ——
/// 不允许在其中访问「主 actor 隔离、且类型不是 `Sendable`」的存储属性，
/// `Timer` 与 `NSObjectProtocol` 都不是 `Sendable`，所以把清理直接写在外层的
/// `deinit` 里会被判错（`cannot access property 'timer' with a non-Sendable type
/// 'Timer?' from nonisolated deinit`）。
///
/// 把句柄收进一个**普通 class**，清理就交给它自己的 `deinit`：外层类不再需要
/// `deinit`，也就不必用 `nonisolated(unsafe)` 去永久放宽那两个属性的访问检查
/// （那会让「从后台线程误改定时器」这类错误彻底静默）。
///
/// ## 为什么不用加锁
///
/// 写入只发生在主 actor 上；而这个 `deinit` 能跑到，就说明此刻已经没有其它引用了。
/// 之所以非要自动清理、而不是只在 `stop()` 里清：`stop()` 目前**没有生产调用点**
/// （`AppDelegate` 只调 `start()`），析构是唯一的兜底路径。
private final class CleanupBox {
    var timer: Timer?
    var observers: [NSObjectProtocol] = []

    deinit {
        timer?.invalidate()
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}

/// 采集系统信号，驱动 `PlaybackStateResolver` 求值，并在状态翻转时通知外部。
///
/// 设计上刻意把「采集」和「判定」分开：判定是 `LiveWallCore` 里的纯函数，可以穷举验证；
/// 这里只负责把系统状态读出来，不掺杂任何决策逻辑。
///
/// 采集分两类：
///  - **事件驱动**（热压力）：系统发通知时立刻重算；
///  - **轮询**（遮挡、空闲、电池、低电量）：只有画面可能可见时才每 2 秒采一次。
///    遮挡判定要遍历窗口列表，挂在通知上没有对应事件；低电量模式的常量在 macOS SDK
///    里不存在，也只能轮询。2 秒的延迟对「暂停壁纸」这个用途完全够用。
///  - **免轮询暂停**（手动暂停、锁屏、息屏）：这三项优先级最高，进入后停掉定时器，
///    不再读电池、空闲时间或窗口列表；恢复由对应的用户操作 / 系统通知立即触发。
///
/// **`@MainActor`**：定时器挂在 `RunLoop.main`、通知回调在主队列、
/// 遮挡判定要读 `NSScreen.screens` —— 三者都要求主线程。
///
/// ⚠️ 标了 `@MainActor` 之后，`Timer` 与通知观察者的闭包**必须显式回跳主 actor**
/// （`Task { @MainActor in }`）。`RunLoop.main` 与 `queue: .main` 只管「投递到主
/// 线程」，不改变闭包本身的隔离 —— 闭包类型是 `@Sendable`，直接调隔离方法会被判错。
@MainActor
final class PlaybackGovernor {

    /// 轮询间隔。遮挡与空闲都靠它。
    private let sampleInterval: TimeInterval = 2

    private let resolverProvider: () -> PlaybackStateResolver
    /// 定时器与观察者句柄。装进引用类型是为了给**析构清理**一个落点（见 `CleanupBox`）。
    private let cleanup = CleanupBox()

    private(set) var signals: PlaybackSignals
    private(set) var state: PlaybackState = .playing
    private var isStarted = false

    /// 状态翻转时回调（主线程）。只在真的变化时触发，不会每 2 秒刷一次。
    var onStateChange: ((PlaybackState, PlaybackSignals) -> Void)?

    init(resolverProvider: @escaping () -> PlaybackStateResolver, userPaused: Bool = false) {
        self.resolverProvider = resolverProvider
        self.signals = PlaybackSignals(userPaused: userPaused)
    }

    // MARK: - 生命周期

    func start() {
        guard !isStarted else { return }
        isStarted = true
        observeSystemNotifications()
        updatePollingTimer()
        sampleAndResolve()
    }

    func stop() {
        isStarted = false
        cleanup.timer?.invalidate()
        cleanup.timer = nil
        for observer in cleanup.observers {
            NotificationCenter.default.removeObserver(observer)
        }
        cleanup.observers.removeAll()
    }

    // MARK: - 外部设置的信号

    /// 用户手动暂停。优先级最高，不被任何其他信号撤销。
    func setUserPaused(_ paused: Bool) {
        guard signals.userPaused != paused else { return }
        signals.userPaused = paused
        sampleAndResolve()
        updatePollingTimer()
    }

    func setSessionLocked(_ locked: Bool) {
        guard signals.sessionLocked != locked else { return }
        signals.sessionLocked = locked
        sampleAndResolve()
        updatePollingTimer()
    }

    func setDisplaySleeping(_ sleeping: Bool) {
        guard signals.displaySleeping != sleeping else { return }
        signals.displaySleeping = sleeping
        sampleAndResolve()
        updatePollingTimer()
    }

    /// 休息提醒显示期间继续播放壁纸，即使用户没有操作输入；其它暂停原因仍然有效。
    func setResting(_ resting: Bool) {
        guard signals.resting != resting else { return }
        signals.resting = resting
        sampleAndResolve()
    }

    /// 立即重新采集并求值（例如刚改了配置）。
    func refresh() {
        sampleAndResolve()
    }

    // MARK: - 采集与求值

    private func sampleAndResolve() {
        let resolver = resolverProvider()
        if signals.userPaused || signals.sessionLocked || signals.displaySleeping {
            // 这三项必然暂停，且恢复都有明确的事件入口。继续扫描窗口、电池和空闲时间
            // 只会制造无意义的常驻唤醒。
            signals.thermalPressure = .nominal
            signals.lowPowerMode = false
            signals.idleSeconds = 0
            signals.onBattery = false
            signals.screenFullyCovered = false
        } else {
            // 配置关闭时跳过对应的系统调用，尤其是遮挡检测的全局窗口扫描。
            signals.thermalPressure = resolver.pauseOnThermalPressure ? Self.currentThermalPressure() : .nominal
            signals.lowPowerMode = resolver.pauseOnLowPowerMode
                ? ProcessInfo.processInfo.isLowPowerModeEnabled
                : false
            signals.idleSeconds = resolver.pauseWhenIdle && resolver.idleThresholdSeconds > 0
                ? Self.systemIdleSeconds()
                : 0
            signals.onBattery = resolver.pauseOnBattery ? Self.isOnBattery() : false
            signals.screenFullyCovered = resolver.pauseWhenCovered ? Self.areAwakeScreensCovered() : false
        }

        let resolved = resolver.resolve(signals)
        guard resolved != state else { return }
        state = resolved
        onStateChange?(resolved, signals)
    }

    private func updatePollingTimer() {
        let shouldPoll = isStarted && !signals.userPaused && !signals.sessionLocked && !signals.displaySleeping
        if shouldPoll {
            startPollingTimerIfNeeded()
        } else {
            cleanup.timer?.invalidate()
            cleanup.timer = nil
        }
    }

    private func startPollingTimerIfNeeded() {
        guard cleanup.timer == nil else { return }
        let timer = Timer(timeInterval: sampleInterval, repeats: true) { [weak self] _ in
            // `Timer` 的 block 是 `@Sendable`（非隔离），而 `sampleAndResolve` 是
            // 主线程隔离的 —— 必须显式回跳，不能直接调。定时器本来就挂在
            // `RunLoop.main` 上，所以这次回跳只是把「编译器需要的那次声明」补上。
            Task { @MainActor [weak self] in self?.sampleAndResolve() }
        }
        // .common 模式：菜单打开时也要继续采样
        RunLoop.main.add(timer, forMode: .common)
        cleanup.timer = timer
    }

    private func observeSystemNotifications() {
        let center = NotificationCenter.default
        cleanup.observers.append(
            center.addObserver(
                forName: ProcessInfo.thermalStateDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                // 与定时器同理：`queue: .main` 只保证投递到主队列，
                // 不改变闭包本身的隔离 —— 仍要显式回跳。
                Task { @MainActor [weak self] in self?.sampleAndResolve() }
            }
        )
        // 低电量模式没有可用通知：`NSProcessInfoPowerStateDidChange` 只在 iOS 声明，
        // macOS SDK 里查不到，`ProcessInfo` 也没有对应静态成员。改由 2 秒轮询兜住
        // （采样时直接读 `isLowPowerModeEnabled`），代价可忽略。
    }

    // MARK: - 具体信号

    private static func currentThermalPressure() -> ThermalPressure {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: return .nominal
        case .fair: return .fair
        case .serious: return .serious
        case .critical: return .critical
        @unknown default: return .nominal
        }
    }

    /// 系统空闲秒数（距离最后一次键鼠输入）。
    ///
    /// `kCGAnyInputEventType` 是 `0xFFFFFFFF`，Swift 里没有对应的枚举成员，
    /// 只能自己构造。已实测 `CGEventType(rawValue: ~0)` 不为 nil。
    private static func systemIdleSeconds() -> Double {
        guard let anyEvent = CGEventType(rawValue: ~0) else { return 0 }
        let seconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyEvent)
        return seconds.isFinite && seconds >= 0 ? seconds : 0
    }

    /// 是否正在用电池供电。
    /// 台式机取不到电池条目 → 视为接电源，永不触发「电池暂停」。
    private static func isOnBattery() -> Bool {
        guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(blob)?.takeRetainedValue() as? [CFTypeRef] else {
            return false
        }
        for source in list {
            guard let description = IOPSGetPowerSourceDescription(blob, source)?
                .takeUnretainedValue() as? [String: Any] else { continue }
            let isBattery = (description[kIOPSTypeKey] as? String) == kIOPSInternalBatteryType
            let onBattery = (description[kIOPSPowerSourceStateKey] as? String) == kIOPSBatteryPowerValue
            if isBattery && onBattery { return true }
        }
        return false
    }

    /// 所有**处于唤醒状态**的显示器是否都被不透明窗口盖满。
    ///
    /// 必须要求「全部」，只要有一块屏还露着壁纸就不该暂停。
    /// 休眠中的显示器会被跳过 —— 它的壁纸本来就看不见，而且休眠屏上
    /// 也没有 on-screen 窗口，不跳过的话会永远判成「未遮挡」。
    private static func areAwakeScreensCovered() -> Bool {
        let ourPID = Int(ProcessInfo.processInfo.processIdentifier)
        // 一次采样只取一份全局窗口快照；逐屏重新调用 CGWindowListCopyWindowInfo
        // 会重复产生系统 IPC 和窗口字典分配。
        let snapshot = WindowInspector.snapshot()
        var checked = 0

        for screen in NSScreen.screens {
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                continue
            }
            let displayID = CGDirectDisplayID(number.uint32Value)
            if CGDisplayIsAsleep(displayID) != 0 { continue }

            checked += 1
            let bounds = CGDisplayBounds(displayID)
            if !WindowInspector.isScreenFullyCovered(
                displayBounds: bounds,
                snapshot: snapshot,
                excludingPIDs: [ourPID]
            ) {
                return false
            }
        }
        return checked > 0
    }
}
