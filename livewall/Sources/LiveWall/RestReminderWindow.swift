import AppKit
import AVFoundation
import QuartzCore

enum RestReminderEndReason {
    case user
    case countdown
}

/// 「结束休息」按钮。
///
/// 系统高亮会把按钮文字置灰，所以这里关掉它，只把按压状态上报给窗口，
/// 由窗口在文字下方叠一层浅色反馈。
private final class RestEndButton: NSButton {

    var onPressChange: ((Bool) -> Void)?

    override func mouseDown(with event: NSEvent) {
        onPressChange?(true)
        // `super` 会一直跟踪到本次按压结束（松开或移出按钮）才返回。
        super.mouseDown(with: event)
        onPressChange?(false)
    }
}

/// 全屏休息层。它接收屏幕上的点击，只有底部的结束按钮会执行动作。
@MainActor
final class RestReminderWindow: NSWindow {

    /// 休息层进出场使用同一时长，避免结束操作看起来像突然消失。
    static let transitionDuration: TimeInterval = 1.2

    /// 按压反馈色：很浅的白色。透明度刻意压得很低，叠加后只让底板略微提亮，
    /// 不会盖住文字，也不会让白色文字失去对比。
    private static let pressFeedbackColor = NSColor.white.withAlphaComponent(0.18)
    /// 松开后反馈淡出的时长，让点击有「按下再抬起」的层次。
    private static let pressFeedbackReleaseDuration: TimeInterval = 0.22

    private let videoLayer: AVPlayerLayer
    private let buttonMaterial: NSVisualEffectView
    private let endButton: RestEndButton
    /// 按压反馈层：位于按钮文字下方，出现时不会遮挡文字。
    private let pressFeedback: NSView
    var onEnd: (() -> Void)?

    init(screen: NSScreen, player: AVPlayer?, onEnd: @escaping () -> Void) {
        let content = NSView(frame: CGRect(origin: .zero, size: screen.frame.size))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.black.cgColor

        videoLayer = AVPlayerLayer(player: player)
        videoLayer.videoGravity = .resizeAspectFill

        buttonMaterial = NSVisualEffectView()
        endButton = RestEndButton(title: "结束休息(60s)", target: nil, action: nil)
        pressFeedback = NSView()

        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        self.onEnd = onEnd
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        ignoresMouseEvents = false
        hasShadow = false
        isOpaque = true
        backgroundColor = .black
        isMovable = false
        isReleasedWhenClosed = false
        isExcludedFromWindowsMenu = true
        alphaValue = 0

        contentView = content
        content.layer?.addSublayer(videoLayer)
        videoLayer.frame = content.bounds
        videoLayer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]

        buttonMaterial.material = .hudWindow
        buttonMaterial.blendingMode = .withinWindow
        buttonMaterial.state = .active
        buttonMaterial.wantsLayer = true
        buttonMaterial.layer?.cornerRadius = 12
        buttonMaterial.layer?.masksToBounds = true
        buttonMaterial.layer?.borderWidth = 0.8
        buttonMaterial.layer?.borderColor = NSColor.white.withAlphaComponent(0.5).cgColor
        buttonMaterial.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(buttonMaterial)

        endButton.target = self
        endButton.action = #selector(endRest(_:))
        endButton.isBordered = false
        // 点击时不改变按钮内容颜色，避免「结束休息」文字被系统置灰后难以辨认；
        // 点击反馈改由下方 pressFeedback 承担。
        (endButton.cell as? NSButtonCell)?.highlightsBy = []
        endButton.contentTintColor = .white
        endButton.translatesAutoresizingMaskIntoConstraints = false
        buttonMaterial.addSubview(endButton)
        endButton.setContentCompressionResistancePriority(.required, for: .horizontal)

        pressFeedback.wantsLayer = true
        pressFeedback.layer?.backgroundColor = Self.pressFeedbackColor.cgColor
        pressFeedback.alphaValue = 0
        pressFeedback.translatesAutoresizingMaskIntoConstraints = false
        // 插到按钮下方：反馈只提亮底板，永远不会盖住文字。
        buttonMaterial.addSubview(pressFeedback, positioned: .below, relativeTo: endButton)
        endButton.onPressChange = { [weak self] isPressed in
            self?.setPressFeedback(visible: isPressed)
        }

        updateEndButton(remainingSeconds: 60)
        NSLayoutConstraint.activate([
            buttonMaterial.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            buttonMaterial.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -36),
            buttonMaterial.widthAnchor.constraint(equalToConstant: 160),
            buttonMaterial.heightAnchor.constraint(equalToConstant: 40),
            endButton.leadingAnchor.constraint(equalTo: buttonMaterial.leadingAnchor, constant: 6),
            endButton.trailingAnchor.constraint(equalTo: buttonMaterial.trailingAnchor, constant: -6),
            endButton.topAnchor.constraint(equalTo: buttonMaterial.topAnchor),
            endButton.bottomAnchor.constraint(equalTo: buttonMaterial.bottomAnchor),
            pressFeedback.leadingAnchor.constraint(equalTo: buttonMaterial.leadingAnchor),
            pressFeedback.trailingAnchor.constraint(equalTo: buttonMaterial.trailingAnchor),
            pressFeedback.topAnchor.constraint(equalTo: buttonMaterial.topAnchor),
            pressFeedback.bottomAnchor.constraint(equalTo: buttonMaterial.bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载", file: "", line: 0) }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    func update(player: AVPlayer?, remainingSeconds: Int) {
        videoLayer.player = player
        updateEndButton(remainingSeconds: remainingSeconds)
    }

    /// 按下瞬间出现，松开后淡出。反馈只改变底板明度，不触碰文字颜色。
    private func setPressFeedback(visible: Bool) {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = visible ? 0 : Self.pressFeedbackReleaseDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            pressFeedback.animator().alphaValue = visible ? 1 : 0
        }
    }

    private func updateEndButton(remainingSeconds: Int) {
        let title = "结束休息(\(max(0, remainingSeconds))s)"
        endButton.attributedTitle = NSAttributedString(
            string: title,
            attributes: [
                .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                .foregroundColor: NSColor.white,
            ]
        )
    }

    func fadeIn() {
        orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = Self.transitionDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            animator().alphaValue = 1
        }
    }

    func fadeOut() {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = Self.transitionDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            animator().alphaValue = 0
        }
    }

    func hideImmediately() {
        orderOut(nil)
        alphaValue = 0
    }

    @objc private func endRest(_ sender: Any?) {
        onEnd?()
    }
}

/// 管理每屏休息窗口与一份全局倒计时。
///
/// 所有时间判断使用 `systemUptime`，系统时钟调整不会改变剩余休息时间。
@MainActor
final class RestReminderCoordinator {

    private(set) var isActive = false
    private(set) var isSuspended = false
    private(set) var remainingSeconds: TimeInterval = 0

    private var deadlineUptime: TimeInterval?
    private var pausedRemaining: TimeInterval?
    private var timer: Timer?
    private var windowsByDisplayID: [UInt32: RestReminderWindow] = [:]
    private var playersByDisplayID: [UInt32: AVPlayer] = [:]

    var onEnd: ((RestReminderEndReason) -> Void)?

    @discardableResult
    func start(durationSeconds: TimeInterval, playersByDisplayID: [UInt32: AVPlayer]) -> Bool {
        guard !isActive, durationSeconds.isFinite, durationSeconds > 0,
              !playersByDisplayID.isEmpty else { return false }
        isActive = true
        isSuspended = false
        remainingSeconds = durationSeconds
        deadlineUptime = ProcessInfo.processInfo.systemUptime + durationSeconds
        self.playersByDisplayID = playersByDisplayID
        rebuildWindows(visible: true)
        updateCountdown()
        startTimer()
        return true
    }

    /// 播放槽位或显示器有变化时只替换图层绑定，不重置倒计时。
    func refresh(playersByDisplayID: [UInt32: AVPlayer]) {
        guard isActive else { return }
        self.playersByDisplayID = playersByDisplayID
        let displayIDs = Set(NSScreen.screens.compactMap(Self.displayID(for:)))
        guard displayIDs == Set(windowsByDisplayID.keys) else {
            rebuildWindows(visible: !isSuspended)
            return
        }
        for (displayID, window) in windowsByDisplayID {
            window.update(player: playersByDisplayID[displayID], remainingSeconds: displayedSeconds)
        }
    }

    /// 锁屏或显示器休眠时隐藏覆盖层，并冻结剩余时长。
    func pauseForSystemInterruption() {
        guard isActive, !isSuspended else { return }
        remainingSeconds = max(0, (deadlineUptime ?? ProcessInfo.processInfo.systemUptime)
            - ProcessInfo.processInfo.systemUptime)
        pausedRemaining = remainingSeconds
        deadlineUptime = nil
        isSuspended = true
        stopTimer()
        for window in windowsByDisplayID.values { window.hideImmediately() }
    }

    /// 解锁且显示器唤醒后恢复原来的剩余时长。
    func resumeAfterSystemInterruption() {
        guard isActive, isSuspended else { return }
        let remaining = pausedRemaining ?? remainingSeconds
        guard remaining > 0 else {
            end(reason: .countdown)
            return
        }
        remainingSeconds = remaining
        deadlineUptime = ProcessInfo.processInfo.systemUptime + remaining
        pausedRemaining = nil
        isSuspended = false
        for window in windowsByDisplayID.values { window.fadeIn() }
        updateCountdown()
        startTimer()
    }

    /// 任意一屏的按钮都会结束全部休息窗口。
    func end(reason: RestReminderEndReason) {
        guard isActive else { return }
        isActive = false
        isSuspended = false
        remainingSeconds = 0
        deadlineUptime = nil
        pausedRemaining = nil
        stopTimer()
        let windows = Array(windowsByDisplayID.values)
        windowsByDisplayID.removeAll()
        playersByDisplayID.removeAll()
        guard !windows.isEmpty else {
            onEnd?(reason)
            return
        }
        for window in windows { window.fadeOut() }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(Int(RestReminderWindow.transitionDuration * 1_000)))
            for window in windows {
                window.orderOut(nil)
                window.close()
            }
            self?.onEnd?(reason)
        }
    }

    func stopImmediately() {
        guard isActive || !windowsByDisplayID.isEmpty else { return }
        isActive = false
        isSuspended = false
        remainingSeconds = 0
        deadlineUptime = nil
        pausedRemaining = nil
        stopTimer()
        for window in windowsByDisplayID.values {
            window.onEnd = nil
            window.orderOut(nil)
            window.close()
        }
        windowsByDisplayID.removeAll()
        playersByDisplayID.removeAll()
    }

    private var displayedSeconds: Int {
        Int(ceil(max(0, remainingSeconds)))
    }

    private func startTimer() {
        stopTimer()
        let newTimer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(newTimer, forMode: .common)
        timer = newTimer
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        guard isActive, !isSuspended,
              let deadlineUptime else { return }
        remainingSeconds = max(0, deadlineUptime - ProcessInfo.processInfo.systemUptime)
        if remainingSeconds <= 0 {
            end(reason: .countdown)
        } else {
            updateCountdown()
        }
    }

    private func updateCountdown() {
        let seconds = displayedSeconds
        for (displayID, window) in windowsByDisplayID {
            window.update(player: playersByDisplayID[displayID], remainingSeconds: seconds)
        }
    }

    private func rebuildWindows(visible: Bool) {
        for window in windowsByDisplayID.values {
            window.onEnd = nil
            window.orderOut(nil)
            window.close()
        }
        windowsByDisplayID.removeAll()
        for screen in NSScreen.screens {
            guard let displayID = Self.displayID(for: screen) else { continue }
            let window = RestReminderWindow(
                screen: screen,
                player: playersByDisplayID[displayID],
                onEnd: { [weak self] in self?.end(reason: .user) }
            )
            window.update(player: playersByDisplayID[displayID], remainingSeconds: displayedSeconds)
            windowsByDisplayID[displayID] = window
            if visible {
                window.fadeIn()
            } else {
                window.hideImmediately()
            }
        }
    }

    private static func displayID(for screen: NSScreen) -> UInt32? {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
    }
}
