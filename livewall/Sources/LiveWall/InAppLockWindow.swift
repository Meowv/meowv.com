import AppKit
import AVFoundation
import LiveWallCore

/// 软件内「一键锁屏」的全屏覆盖窗。
///
/// 与 `RestReminderWindow` 的区别：
/// - 没有按钮、没有倒计时 —— 解锁只认空格与 ⌘W（事件 tap 优先，窗口兜底）；
/// - 画面默认沿用锁屏那一刻正在播放的壁纸（复用同一份 `LoadedVideo`）；
///   配置为纯黑、没有在播条目或加载失败时是纯黑，**不会**退回到桌面正在播放的画面；
/// - 用户输入不进入响应链：鼠标、滚轮、手势与键盘事件在 `sendEvent` 就被吞掉，
///   既不触发本 App 的任何默认行为，也不会穿透到下层窗口。
@MainActor
final class InAppLockWindow: NSWindow {

    private let videoLayer: AVPlayerLayer

    /// 请求解锁。事件 tap 不可用时，窗口层的兜底路径也走这里。
    var onUnlockRequest: (() -> Void)?

    init(screen: NSScreen, player: AVPlayer?) {
        let content = InAppLockContentView(frame: CGRect(origin: .zero, size: screen.frame.size))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.black.cgColor

        videoLayer = AVPlayerLayer(player: player)
        videoLayer.videoGravity = .resizeAspectFill

        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        // 与休息层同层：位于系统壁纸与桌面图标之上，覆盖菜单栏与 Dock。
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        ignoresMouseEvents = false
        hasShadow = false
        isOpaque = true
        backgroundColor = .black
        isMovable = false
        isReleasedWhenClosed = false
        isExcludedFromWindowsMenu = true
        // 失去前台时也必须留在屏幕上：事件 tap 会拦住 ⌘Tab，但系统仍可能因其它
        // 原因让本 App 失活，锁屏画面不能跟着消失。
        hidesOnDeactivate = false

        contentView = content
        content.layer?.addSublayer(videoLayer)
        videoLayer.frame = content.bounds
        videoLayer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        makeFirstResponder(content)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载", file: "", line: 0) }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// 用户输入到此为止：键盘里的空格 / ⌘W 会被认作解锁请求，其余一律丢弃。
    /// 系统内部事件（`appKitDefined` 等）仍交给 `super`，避免破坏窗口自身的机制。
    override func sendEvent(_ event: NSEvent) {
        guard Self.isBlockedEvent(event.type) else {
            super.sendEvent(event)
            return
        }
        handleLockedKeyEvent(event)
    }

    /// 带 ⌘ 的按键会先走这里（菜单快捷键路径），同样只认 ⌘W，其余吞掉。
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        handleLockedKeyEvent(event)
        return true
    }

    func handleLockedKeyEvent(_ event: NSEvent) {
        guard event.type == .keyDown else { return }
        var modifiers: InAppLockModifiers = []
        if event.modifierFlags.contains(.command) { modifiers.insert(.command) }
        if event.modifierFlags.contains(.control) { modifiers.insert(.control) }
        if event.modifierFlags.contains(.option) { modifiers.insert(.option) }
        if event.modifierFlags.contains(.shift) { modifiers.insert(.shift) }
        guard InAppLockInputPolicy.keyDecision(
            keyCode: event.keyCode,
            modifiers: modifiers
        ) == .unlock else { return }
        onUnlockRequest?()
    }

    private static func isBlockedEvent(_ type: NSEvent.EventType) -> Bool {
        switch type {
        case .keyDown, .keyUp, .flagsChanged, .scrollWheel,
             .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
             .otherMouseDown, .otherMouseUp,
             .leftMouseDragged, .rightMouseDragged, .otherMouseDragged,
             .mouseMoved, .mouseEntered, .mouseExited, .cursorUpdate,
             .magnify, .rotate, .swipe, .gesture, .smartMagnify, .pressure:
            return true
        default:
            return false
        }
    }
}

/// 锁屏窗的内容视图。
///
/// 窗口的 `sendEvent` 已经吞掉全部事件，这里再覆写一遍是**兜底**：
/// 万一某条路径绕过窗口直接把事件送进响应链，也不能出现按键穿透或系统提示音。
private final class InAppLockContentView: NSView {

    override var acceptsFirstResponder: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func keyDown(with event: NSEvent) {
        (window as? InAppLockWindow)?.handleLockedKeyEvent(event)
    }

    override func keyUp(with event: NSEvent) {}
    override func flagsChanged(with event: NSEvent) {}
    override func performKeyEquivalent(with event: NSEvent) -> Bool { true }

    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {}
    override func rightMouseDown(with event: NSEvent) {}
    override func rightMouseUp(with event: NSEvent) {}
    override func otherMouseDown(with event: NSEvent) {}
    override func otherMouseUp(with event: NSEvent) {}
    override func scrollWheel(with event: NSEvent) {}
    override func magnify(with event: NSEvent) {}
    override func rotate(with event: NSEvent) {}
    override func swipe(with event: NSEvent) {}
}
