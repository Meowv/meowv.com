import Darwin
import Foundation

private final class AppLogState: @unchecked Sendable {
    let lock = NSLock()
    var sanitizedFiles: Set<String> = []
}

/// 启动与播放期共用脱敏、文件锁和轮转路径。
public enum AppLog {
    private static let state = AppLogState()
    private static let urls = try! NSRegularExpression(
        pattern: #"(?:https?|file):(?:\\?/){2}[^\s\]\[\)\}\"'<>]+|https?%3a%2f%2f[^\s\]\[\)\}\"'<>]+"#,
        options: [.caseInsensitive]
    )

    /// 使用 UTF-16 范围替换，支持 emoji、组合字符及 JSON 转义后的地址。结果可重复脱敏。
    public static func sanitize(_ message: String) -> String {
        urls.stringByReplacingMatches(in: message, range: NSRange(message.startIndex..., in: message), withTemplate: "<redacted-url>")
    }

    public static let timeFormat = "MM-dd HH:mm:ss.SSS"

    public static func stamp(for date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = timeFormat
        return formatter.string(from: date)
    }

    /// 原子替换历史日志与追加共用跨进程锁；新写入也统一脱敏。
    public static func append(_ message: String, to file: URL? = LiveWallPaths.logFileURL, rotationLimit: UInt64? = nil) {
        guard let file else { return }
        do {
            try withFileLock(file) {
                if !state.sanitizedFiles.contains(file.path) {
                    _ = try sanitizeUnlocked(file)
                    state.sanitizedFiles.insert(file.path)
                }
                if let limit = rotationLimit, limit > 0,
                   let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                   UInt64(size) >= limit {
                    let handle = try FileHandle(forWritingTo: file)
                    try handle.truncate(atOffset: 0)
                    try handle.close()
                    try appendUnlocked("[\(stamp())] " + LogRotationConfig.rotationNoticeText(clearedBytes: UInt64(size), limitBytes: limit), file)
                }
                try appendUnlocked(sanitize(message), file)
            }
        } catch {
            let line = "LiveWall 日志写入失败：\(sanitize(error.localizedDescription))\n"
            FileHandle.standardError.write(Data(line.utf8))
        }
    }

    public static func appendStamped(_ message: String, to file: URL? = LiveWallPaths.logFileURL) {
        append("[\(stamp())] \(message)", to: file)
    }

    @discardableResult
    public static func sanitizeFile(at file: URL) throws -> Bool {
        try withFileLock(file) {
            let changed = try sanitizeUnlocked(file)
            state.sanitizedFiles.insert(file.path)
            return changed
        }
    }

    private static func withFileLock<T>(_ file: URL, body: () throws -> T) throws -> T {
        state.lock.lock()
        defer { state.lock.unlock() }
        try PrivateFileAccess.secureDirectory(at: file.deletingLastPathComponent())
        let lockURL = file.deletingLastPathComponent().appendingPathComponent(".livewall-log.lock")
        let descriptor = Darwin.open(lockURL.path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { throw CocoaError(.fileWriteUnknown) }
        defer { Darwin.close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw CocoaError(.fileWriteUnknown) }
        defer { flock(descriptor, LOCK_UN) }
        return try body()
    }

    private static func sanitizeUnlocked(_ file: URL) throws -> Bool {
        guard FileManager.default.fileExists(atPath: file.path) else { return false }
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw CocoaError(.fileReadNoPermission) }
        let data = try Data(contentsOf: file)
        guard let text = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadInapplicableStringEncoding) }
        let output = sanitize(text)
        if output != text { try Data(output.utf8).write(to: file, options: .atomic) }
        try PrivateFileAccess.secureFile(at: file)
        return output != text
    }

    private static func appendUnlocked(_ message: String, _ file: URL) throws {
        if !FileManager.default.fileExists(atPath: file.path) {
            guard FileManager.default.createFile(atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
                throw CocoaError(.fileWriteUnknown)
            }
        }
        let handle = try FileHandle(forWritingTo: file)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: Data((message + "\n").utf8))
    }
}
