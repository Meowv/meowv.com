/// 终端文本对齐工具。
///
/// 为什么不用 `String.count`：中文/全角字符在终端占两列，按字符数补齐会错位。
/// 为什么不用 `String(format: "%-28s", ...)`：`%s` 配 Swift 字符串会直接崩（已实测）。
public enum TextLayout {

    /// 终端显示宽度：CJK 与常见 emoji 记 2 列，其余记 1 列。
    public static func displayWidth(_ value: String) -> Int {
        value.unicodeScalars.reduce(0) { total, scalar in
            total + (isWide(scalar.value) ? 2 : 1)
        }
    }

    static func isWide(_ value: UInt32) -> Bool {
        switch value {
        case 0x1100...0x115F,      // 韩文字母
             0x2E80...0xA4CF,      // CJK 部首、假名、注音、汉字
             0xAC00...0xD7A3,      // 韩文音节
             0xF900...0xFAFF,      // CJK 兼容汉字
             0xFE30...0xFE6F,      // CJK 兼容形式
             0xFF00...0xFF60,      // 全角字符
             0xFFE0...0xFFE6,      // 全角符号
             0x1F300...0x1F64F,    // 杂项符号与绘文字
             0x1F900...0x1F9FF:    // 补充符号与绘文字
            return true
        default:
            return false
        }
    }

    /// 左对齐补齐到指定显示宽度。超宽时不截断（截断会丢信息，且要处理半个宽字符）。
    public static func pad(_ value: String, _ width: Int) -> String {
        let visible = displayWidth(value)
        guard visible < width else { return value }
        return value + String(repeating: " ", count: width - visible)
    }

    /// 右对齐补齐到指定显示宽度。
    public static func padLeft(_ value: String, _ width: Int) -> String {
        let visible = displayWidth(value)
        guard visible < width else { return value }
        return String(repeating: " ", count: width - visible) + value
    }
}
