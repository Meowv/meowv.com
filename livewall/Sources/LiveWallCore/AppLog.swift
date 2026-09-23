import Foundation

/// 日志落盘的**最小公共部分**：时间戳格式与「追加一行」。
///
/// 为什么放在 Core：启动早期就要用它。单实例判定发生在 `main.swift` 里、`AppDelegate`
/// 还没建起来的时候，而「已有实例在运行，本次退出」这件事**必须留下痕迹** ——
/// 否则用户看到的就是「点了没反应」。时间戳格式与追加逻辑各抄一份，迟早会漂移
/// （`AGENTS.md`：同一事实只在一处维护）。
///
/// **轮转与写入锁仍在 `AppDelegate` 里**：那是播放期的高频路径，逻辑（按写入次数与
/// 间隔抽样、截断复用同一文件）比这里复杂得多，且只有进程内一个写者会用到它。
public enum AppLog {

    /// 时间戳格式。**改这里就是改全局**，不要在两处各写一个 `dateFormat`。
    public static let timeFormat = "MM-dd HH:mm:ss.SSS"

    /// 一行日志的前缀时间戳，例如 `09-21 08:49:37.951`。
    public static func stamp(for date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = timeFormat
        return formatter.string(from: date)
    }

    /// 追加一行（自动补换行）到日志文件。
    ///
    /// - Parameter file: 目标文件；传 nil 表示「只输出到 stdout」的场合（取不到 Logs 目录）。
    /// - Note: **不加锁** —— 调用方负责串行化。`AppDelegate` 在 `logLock` 内调用；
    ///   `main.swift` 在启动早期调用（那时只有一个写者，且进程马上要退出）。
    public static func append(_ message: String, to file: URL? = LiveWallPaths.logFileURL) {
        guard let file, let data = (message + "\n").data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: file.path) {
            guard let handle = try? FileHandle(forWritingTo: file) else { return }
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
            try? PrivateFileAccess.secureFile(at: file)
        } else {
            // 只有文件还不存在时才走整体写入 —— `write(to:)` 会截断，
            // 对已存在的文件用它会把已有内容抹掉。
            try? PrivateFileAccess.secureDirectory(at: file.deletingLastPathComponent())
            if (try? data.write(to: file)) != nil {
                try? PrivateFileAccess.secureFile(at: file)
            }
        }
    }

    /// 带时间戳追加一行（`AppLog.stamp()` 的便捷组合，供启动早期使用）。
    public static func appendStamped(_ message: String, to file: URL? = LiveWallPaths.logFileURL) {
        append("[\(stamp())] \(message)", to: file)
    }
}
