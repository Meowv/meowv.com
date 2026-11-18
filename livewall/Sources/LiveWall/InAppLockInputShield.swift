import ApplicationServices
import CoreGraphics
import LiveWallCore

/// 「一键锁屏」的全局输入拦截。
///
/// 窗口只能拦住**投递给本 App** 的事件；⌘Tab、⌘Space、截图快捷键这类由系统直接
/// 处理的事件必须靠会话级事件 tap 才能吞掉。tap 需要「辅助功能」授权，
/// 未授权时 `CGEvent.tapCreate` 返回 nil —— 这时仍然锁屏（窗口层兜底），
/// 但调用方必须把降级情况告诉用户。
///
/// ## 线程
///
/// `start` / `stop` 只在主线程调用；tap 的 source 挂在**主 run loop** 的 common modes 上，
/// 所以回调也在主线程。`@unchecked Sendable` 断言的正是这条线程契约：
/// 回调里只读不可变的 `requestUnlock`，可变句柄只在主线程读写。
final class InAppLockInputShield: @unchecked Sendable {

    /// 系统是否已授予辅助功能权限。
    static var isTrusted: Bool { AXIsProcessTrusted() }

    /// 弹出系统授权提示。只在用户明确选择「打开系统设置」时调用 ——
    /// 锁屏动作本身不该附带一个系统级授权弹窗。
    static func requestTrust() {
        // 用字面量而不是 `kAXTrustedCheckOptionPrompt`：那个常量在 Swift 6 里是
        // 可变全局变量，直接引用会被判「非并发安全」。它的值就是这句字符串。
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    /// 需要吞掉的事件类型。
    ///
    /// 刻意不含 `mouseMoved`：鼠标移动不产生任何操作，冻住光标只会让人以为系统卡死。
    private static let eventMask: CGEventMask = {
        var mask: CGEventMask = 0
        for type in [
            CGEventType.keyDown, .keyUp, .flagsChanged, .scrollWheel,
            .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
            .otherMouseDown, .otherMouseUp,
            .leftMouseDragged, .rightMouseDragged, .otherMouseDragged,
        ] {
            mask |= CGEventMask(1) << CGEventMask(type.rawValue)
        }
        // NX_SYSDEFINED（14）：媒体键、亮度键等，`CGEventType` 没有对应成员。
        mask |= CGEventMask(1) << CGEventMask(InAppLockInputShield.systemDefinedRawValue)
        return mask
    }()

    private static let systemDefinedRawValue: UInt32 = 14

    private let requestUnlock: @Sendable () -> Void
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?

    init(requestUnlock: @escaping @Sendable () -> Void) {
        self.requestUnlock = requestUnlock
    }

    /// 创建并启用 tap。返回 false 表示当前进程没有辅助功能权限（或系统拒绝创建）。
    @discardableResult
    func start() -> Bool {
        guard tap == nil else { return true }
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: Self.eventMask,
            callback: inAppLockEventTapCallback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            return false
        }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            CFMachPortInvalidate(tap)
            return false
        }
        self.tap = tap
        self.source = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        return true
    }

    func stop() {
        if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        if let tap { CFMachPortInvalidate(tap) }
        source = nil
        tap = nil
    }

    /// 返回 nil 即吞掉事件。除「空格 / ⌘W」的按下之外，一律不放行。
    fileprivate func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            // 系统会因回调超时或用户强制禁用而关掉 tap；锁屏期间必须立刻抢回来，
            // 否则用户只要按住某个键把回调拖慢，锁定就静默失效了。
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        if type.rawValue == Self.systemDefinedRawValue { return nil }
        if type == .keyDown {
            let keyCode = UInt16(
                truncatingIfNeeded: event.getIntegerValueField(.keyboardEventKeycode)
            )
            var modifiers: InAppLockModifiers = []
            let flags = event.flags
            if flags.contains(.maskCommand) { modifiers.insert(.command) }
            if flags.contains(.maskControl) { modifiers.insert(.control) }
            if flags.contains(.maskAlternate) { modifiers.insert(.option) }
            if flags.contains(.maskShift) { modifiers.insert(.shift) }
            if InAppLockInputPolicy.keyDecision(keyCode: keyCode, modifiers: modifiers) == .unlock {
                requestUnlock()
            }
        }
        return nil
    }
}

/// C 回调。只做转发：判定与副作用都在 `InAppLockInputShield` 里。
private func inAppLockEventTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard let userInfo else { return Unmanaged.passUnretained(event) }
    let shield = Unmanaged<InAppLockInputShield>.fromOpaque(userInfo).takeUnretainedValue()
    return shield.handle(type: type, event: event)
}
