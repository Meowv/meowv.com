import Foundation

/// 软件内锁屏的修饰键集合。
///
/// 刻意不用 `NSEvent.ModifierFlags`：`LiveWallCore` 不依赖 AppKit，
/// 事件 tap 的 `CGEventFlags` 与窗口层的 `NSEvent.ModifierFlags` 都映射到这里，
/// 判定规则只写一份，三处（tap / 窗口 / 测试）不会各写一套。
public struct InAppLockModifiers: OptionSet, Sendable, Equatable {
    public let rawValue: UInt8

    public init(rawValue: UInt8) {
        self.rawValue = rawValue
    }

    public static let command = InAppLockModifiers(rawValue: 1 << 0)
    public static let control = InAppLockModifiers(rawValue: 1 << 1)
    public static let option = InAppLockModifiers(rawValue: 1 << 2)
    public static let shift = InAppLockModifiers(rawValue: 1 << 3)
}

public enum InAppLockKeyDecision: Equatable, Sendable {
    case unlock
    case block
}

/// 「一键锁屏」的输入判定。
///
/// 严格锁定期间只有两种组合能退出：
/// - **空格**（不叠加 ⌘ / ⌃ / ⌥）；
/// - **⌘W**（不叠加 ⌃ / ⌥）。
///
/// `⇧` 被刻意忽略：误按 ⇧ 不该让用户以为解锁失灵，而 ⇧ 单独不产生任何系统动作。
/// 其余按键、鼠标与滚轮一律吞掉，默认行为也不放行。
public enum InAppLockInputPolicy {

    /// 空格键的虚拟键码（`kVK_Space`）。
    public static let spaceKeyCode: UInt16 = 49
    /// W 键的虚拟键码（`kVK_ANSI_W`）。
    public static let wKeyCode: UInt16 = 13

    /// 菜单与日志里的解锁说明。文案只维护这一份。
    public static let unlockHint = "空格或 ⌘W"

    public static func keyDecision(
        keyCode: UInt16,
        modifiers: InAppLockModifiers
    ) -> InAppLockKeyDecision {
        switch keyCode {
        case spaceKeyCode:
            // 空格只认「干净」的那一下：⌘Space 是 Spotlight，⌃Space / ⌥Space 是输入法切换。
            return modifiers.isDisjoint(with: [.command, .control, .option]) ? .unlock : .block
        case wKeyCode:
            return modifiers.contains(.command)
                && modifiers.isDisjoint(with: [.control, .option]) ? .unlock : .block
        default:
            return .block
        }
    }
}
