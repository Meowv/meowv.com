import Foundation

/// 全局热键的可持久化表示；键名使用 ANSI 字母或数字。
public struct HotKeyBinding: Codable, Sendable, Equatable, Hashable {
    public static let command: UInt8 = 1
    public static let option: UInt8 = 2
    public static let control: UInt8 = 4
    public static let shift: UInt8 = 8

    public let key: String
    public let modifiers: UInt8

    public init(key: String, modifiers: UInt8) {
        self.key = key
        self.modifiers = modifiers
    }

    public var isValid: Bool {
        guard key.utf8.count == 1, let scalar = key.utf8.first,
              (65...90).contains(scalar) || (48...57).contains(scalar)
        else { return false }
        guard modifiers & ~UInt8(15) == 0 else { return false }
        return modifiers & (Self.command | Self.control) != 0
    }

    public var display: String {
        let symbols: [(UInt8, String)] = [
            (Self.control, "⌃"), (Self.option, "⌥"), (Self.shift, "⇧"), (Self.command, "⌘"),
        ]
        return symbols.filter { modifiers & $0.0 != 0 }.map(\.1).joined() + key
    }
}
