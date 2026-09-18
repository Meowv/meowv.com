import AppKit
import LiveWallCore
import LiveWallDesktop

/// 层级标定结果，含每一次尝试，便于排查「为什么降级了」。
struct CalibrationResult {
    let preset: LevelPreset
    let verdict: LayerVerdict
    let attempts: [(preset: LevelPreset, verdict: LayerVerdict)]
}

/// 管理「每块屏幕一个覆盖窗口」，并负责窗口层级的启动自检与降级。
///
/// 层级是这套方案唯一的脆弱点：它依赖 WindowServer 的实际排序，
/// 只能真机验证。所以每次重建窗口后都要跑一次判定，不合格就换下一个候选层级。
final class ScreenCoordinator {

    private(set) var windows: [DesktopOverlayWindow] = []
    private(set) var level: Int
    /// 多屏策略。决定在哪些屏幕上建窗口。
    private(set) var policy: MultiScreenPolicy

    /// 当前的槽位分组。每屏独立时一组一屏，镜像时只有一组。
    ///
    /// 单独存一份而不是每次现算：窗口是按它建的，之后屏幕变化前它不该变。
    private(set) var slotPlan = ScreenSlotPlan(slots: [])

    /// 窗口按 displayID 索引。
    ///
    /// 播放端要按屏绑定槽位（每屏独立时各挂各的 player），
    /// 而 `windows` 只是个数组，重建后顺序与屏幕的对应关系就断了。
    private(set) var windowsByDisplayID: [UInt32: DesktopOverlayWindow] = [:]

    /// 每个窗口号**期望**覆盖的区域，用 `CGWindowBounds` 的坐标系（原点在主屏左上）。
    ///
    /// 不能拿 `NSWindow.frame` 直接比 —— 它用的是「原点在主屏左下」的坐标系，
    /// 副屏上两者会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98`
    /// 而 `CGWindowBounds.y = 0`）。
    private var expectedBounds: [Int: CGRect] = [:]

    init(level: Int, policy: MultiScreenPolicy = .mirror) {
        self.level = level
        self.policy = policy
    }

    var windowNumbers: Set<Int> {
        Set(windows.map(\.windowNumber))
    }

    var screenCount: Int { NSScreen.screens.count }

    /// 当前建了窗口的屏幕 ID。写回每屏独立源记录时要按它裁剪。
    var displayIDs: Set<UInt32> { Set(windowsByDisplayID.keys) }

    /// 当前策略下需要独立取片的槽位，按主次顺序（第 0 个是主屏）。
    ///
    /// 镜像与仅主屏都只有一个 `.shared`；每屏独立时每块屏一个，
    /// 但受 `MultiScreenPolicy.maxIndependentScreens` 限制。
    func playbackSlotKeys() -> [PlaybackSlotKey] {
        guard slotPlan.slotCount > 0 else { return [] }
        switch policy {
        case .mirror, .mainScreenOnly:
            return [.shared]
        case .perScreen:
            return slotPlan.slots.compactMap { group in
                group.first.map { PlaybackSlotKey.display($0.displayID) }
            }
        }
    }

    /// 窗口 → 播放槽位的绑定关系。建窗口、切策略、屏幕变化后都要照它重新绑定。
    var windowBindings: [(window: DesktopOverlayWindow, key: PlaybackSlotKey)] {
        var bindings: [(DesktopOverlayWindow, PlaybackSlotKey)] = []
        for group in slotPlan.slots {
            let key: PlaybackSlotKey
            if policy == .perScreen, let first = group.first {
                key = .display(first.displayID)
            } else {
                key = .shared
            }
            for screen in group {
                guard let window = windowsByDisplayID[screen.displayID] else { continue }
                bindings.append((window, key))
            }
        }
        return bindings
    }

    /// 按当前屏幕列表与策略创建窗口。**不等待上屏** —— 由调用方决定何时做判定。
    ///
    /// 刻意不在这里等待：等待会自旋 run loop，而在 `applicationDidFinishLaunching`
    /// 里自旋可能影响窗口的初始 frame（实测会被系统加上对称边距）。
    func createWindows() {
        for window in windows {
            window.orderOut(nil)
            window.close()
        }
        windows.removeAll()
        expectedBounds.removeAll()

        // 屏幕与显示 ID 的配对。`NSScreen.screens` 的数组顺序就是「主屏在前」，
        // 策略要用它来判断主屏，所以 index 必须一起带上。
        let paired = NSScreen.screens.enumerated().compactMap { index, screen -> (NSScreen, ScreenIdentity)? in
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                return nil
            }
            return (screen, ScreenIdentity(displayID: number.uint32Value, index: index))
        }
        let identities = paired.map(\.1)
        slotPlan = policy.slotPlan(from: identities)
        let targets = Set(policy.targetScreens(from: identities).map(\.displayID))
        windowsByDisplayID.removeAll()

        for (screen, identity) in paired where targets.contains(identity.displayID) {
            let window = DesktopOverlayWindow(screen: screen, level: level)
            windows.append(window)
            windowsByDisplayID[identity.displayID] = window
            expectedBounds[window.windowNumber] = CGDisplayBounds(identity.displayID)
        }
    }

    /// 切换多屏策略并重建窗口，返回重建后的判定。
    @discardableResult
    func apply(policy newPolicy: MultiScreenPolicy) -> LayerVerdict {
        guard newPolicy != policy else {
            return WindowInspector.evaluate(ourLevel: level, ourWindowNumbers: windowNumbers)
        }
        policy = newPolicy
        return rebuild()
    }

    /// 只设定策略，不重建窗口。
    ///
    /// 专供启动路径使用：那时必须先定好策略再 `createWindows()`，而 `apply(policy:)`
    /// 会 `rebuild()` 并自旋等待上屏 —— 在 `applicationDidFinishLaunching` 里自旋
    /// 会让窗口被系统加上对称边距（见 `createWindows` 的注释）。
    func setPolicyWithoutRebuild(_ newPolicy: MultiScreenPolicy) {
        policy = newPolicy
    }

    /// 重建窗口并等待上屏，返回判定。用于屏幕变化、唤醒等运行期场景。
    @discardableResult
    func rebuild() -> LayerVerdict {
        createWindows()
        waitForWindowsToAppear()
        return WindowInspector.evaluate(ourLevel: level, ourWindowNumbers: windowNumbers)
    }

    /// 运行时切换层级，返回切换后的判定。
    @discardableResult
    func apply(level newLevel: Int) -> LayerVerdict {
        level = newLevel
        for window in windows { window.apply(level: newLevel) }
        waitForWindowsToAppear()
        return WindowInspector.evaluate(ourLevel: newLevel, ourWindowNumbers: windowNumbers)
    }

    /// 等待窗口真正上屏，**且覆盖区域已经稳定**。
    ///
    /// `orderFrontRegardless()` 是异步的：创建窗口后立刻查询列表会**查不到自己的窗口**，
    /// 判定因此返回「未覆盖整屏」，进而触发一连串无意义的降级。
    /// 这个坑在探针里没暴露，是因为探针隔了 2 秒才做首次判定。
    ///
    /// **只判断「窗口号出现了」是不够的**：窗口上屏时有一段对称缩放的进入动画，
    /// 动画期间 WindowServer 报的 bounds 是内缩的 —— 实测 1512×982 的窗口会被报成
    /// `9,6 1494x970`、`5,3 1502x976`（两次采样值不同，说明是动画而不是真实 frame）。
    /// 那时跑 `evaluate` 会得到「未覆盖整屏」。所以必须等到 bounds 与屏幕一致。
    ///
    /// 自旋上限 1 秒（动画实测 400 ms 内结束），只在启动与切层级/切策略时调用。
    @discardableResult
    private func waitForWindowsToAppear(timeout: TimeInterval = 1.0) -> Bool {
        guard !windows.isEmpty else { return false }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let snapshot = WindowInspector.snapshot()
            let settled = expectedBounds.allSatisfy { number, expected in
                guard let record = snapshot.first(where: { $0.windowNumber == number }) else { return false }
                return Self.isSameRect(record.bounds, expected)
            }
            if settled { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.03))
        }
        return false
    }

    /// 亚像素误差不该让「稳定」判定失败。
    private static func isSameRect(_ lhs: CGRect, _ rhs: CGRect, tolerance: CGFloat = 1) -> Bool {
        abs(lhs.minX - rhs.minX) < tolerance
            && abs(lhs.minY - rhs.minY) < tolerance
            && abs(lhs.width - rhs.width) < tolerance
            && abs(lhs.height - rhs.height) < tolerance
    }

    /// 按候选顺序逐个尝试，返回第一个判定合格的层级。
    ///
    /// 找不到合格层级时返回最后一次的判定 —— 调用方据此提示用户，
    /// 而不是静默用一个「可能挡住图标」的层级。
    func calibrate(startingFrom preset: LevelPreset) -> CalibrationResult {
        let candidates = [preset] + LevelPreset.fallbackOrder.filter { $0 != preset }
        var attempts: [(preset: LevelPreset, verdict: LayerVerdict)] = []
        var lastVerdict = LayerVerdict()

        for candidate in candidates {
            let verdict = apply(level: candidate.level)
            lastVerdict = verdict
            attempts.append((candidate, verdict))
            // 同层竞争不算层级选错，换层级也解决不了，因此不因此降级
            if verdict.isAboveWallpaper == true && verdict.isBelowIcons == true && verdict.coversScreen {
                return CalibrationResult(preset: candidate, verdict: verdict, attempts: attempts)
            }
        }
        return CalibrationResult(preset: preset, verdict: lastVerdict, attempts: attempts)
    }
}
