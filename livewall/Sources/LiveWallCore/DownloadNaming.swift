import Foundation

/// 手动下载的文件名规则。
///
/// 抽成纯逻辑是为了能单测：标题来自数据库，含 `/`、`:`、换行都不奇怪，而这些
/// 正是文件名的非法字符。**所有落盘命名都必须走这里**，不要在别处手写一套。
public enum DownloadNaming {

    /// 需要替换掉的字符。macOS 上严格说只禁 `/` 与 NUL，但 `:` 在 Finder 里显示成 `/`、
    /// `\` 与 Windows 互换会出问题，一并替换更省心。
    private static let illegal: Set<Character> = [
        "/", ":", "\\", "*", "?", "\"", "<", ">", "|", "\n", "\r", "\t",
    ]

    /// 标题长度上限（按字符计）。太长会被文件系统截断，Finder 里也读不全。
    public static let maxTitleLength = 60

    /// 清洗标题：替换非法字符 → 压缩连续空白 → 去掉首尾空白与点 → 截断。
    ///
    /// 首尾的点必须去掉：`.` 与 `..` 是目录名，`..foo` 这类名字也容易被误读。
    public static func sanitize(_ title: String) -> String {
        var cleaned = String(title.map { illegal.contains($0) ? "_" : $0 })
        while cleaned.contains("  ") {
            cleaned = cleaned.replacingOccurrences(of: "  ", with: " ")
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        while cleaned.hasPrefix(".") { cleaned.removeFirst() }
        while cleaned.hasSuffix(".") { cleaned.removeLast() }
        if cleaned.count > maxTitleLength {
            cleaned = String(cleaned.prefix(maxTitleLength))
        }
        return cleaned.trimmingCharacters(in: .whitespaces)
    }

    /// 扩展名：从 URL 取，取不到或取出来的不是纯字母数字就用兜底。
    ///
    /// 实测清单里静态图既有 `.jpg` 也有 `.png`，所以**不能硬编码扩展名**。
    public static func fileExtension(for url: URL?, fallback: String) -> String {
        guard let raw = url?.pathExtension.lowercased(), !raw.isEmpty else { return fallback }
        let cleaned = String(raw.filter { $0.isLetter || $0.isNumber })
        return cleaned.isEmpty ? fallback : cleaned
    }

    /// 条目文件名：`<id>-<清洗后的标题>.<ext>`；标题清洗后为空则只用 id。
    ///
    /// 用 id 前缀有两个好处：不同条目重名不会互相覆盖；同一条目重复下载是覆盖同一路径
    /// （内容一致，没必要堆副本）。
    public static func fileName(id: Int, title: String, fileExtension: String) -> String {
        let cleaned = sanitize(title)
        let base = cleaned.isEmpty ? "\(id)" : "\(id)-\(cleaned)"
        return "\(base).\(fileExtension)"
    }
}
