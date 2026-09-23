import Foundation

/// 运行期落盘位置的**唯一来源**。
///
/// 这些路径原先散在 `AppDelegate` 的 `private static` 里。单实例锁也要往同一个目录写文件，
/// 而启动早期的日志（`main.swift` 里，`AppDelegate` 还没建起来）也要写同一个日志文件 ——
/// 路径出现了第二个需要它的地方，抄一份就等于埋下「改了一处、另一处没改」的坑
/// （`AGENTS.md`：同一事实只在一处维护）。
///
/// **刻意与 bundle id 无关地硬编码 `com.meowv.livewall`**：dev 版（`run.sh` 跑的
/// `build/LiveWall.app`）与打包版是**同一个程序**，本来就该共用配置、缓存与日志。
/// 共用是有意的，不该发生的是「同时跑两个」—— 那由 `SingleInstance` 挡。
public enum LiveWallPaths {

    /// 配置、锁屏恢复数据与单实例锁的私有落点。
    public static let applicationSupportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("com.meowv.livewall", isDirectory: true)
    }()

    /// 可再生成的远端清单与锁屏封面缓存；与配置和系统恢复备份分开。
    public static let dataCacheDirectory = applicationSupportDirectory
        .appendingPathComponent("DataCache", isDirectory: true)

    /// 日志文件。nil 表示取不到 Logs 目录，此时只输出到 stdout。
    public static let logFileURL: URL? =
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Logs/com.meowv.livewall", isDirectory: true)
            .appendingPathComponent("livewall.log")

    /// 在日志与单实例锁开始写入前清理旧缓存并收紧已有权限。
    public static func preparePrivateStorage() throws -> [String] {
        try PrivateFileAccess.secureDirectory(at: applicationSupportDirectory)
        if let logDirectory = logFileURL?.deletingLastPathComponent() {
            try PrivateFileAccess.secureDirectory(at: logDirectory)
        }
        try PrivateFileAccess.secureDirectory(at: dataCacheDirectory)
        let removed = try PrivateFileAccess.removeLegacyDataCache(from: applicationSupportDirectory)
        try PrivateFileAccess.secureTree(at: applicationSupportDirectory)
        if let logFileURL, FileManager.default.fileExists(atPath: logFileURL.path) {
            try PrivateFileAccess.secureFile(at: logFileURL)
        }
        return removed
    }

    /// 单实例锁文件。按身份分文件，见 `SingleInstance.lockFileURL`。
    public static func instanceLockURL(identity: String) -> URL {
        SingleInstance.lockFileURL(directory: applicationSupportDirectory, identity: identity)
    }

    /// 本进程的「程序身份」。启动早期（`main.swift`）与需要展示的地方共用这一个口径。
    public static func instanceIdentity(executableName: String? = nil) -> String {
        SingleInstance.identity(
            bundleIdentifier: Bundle.main.bundleIdentifier,
            executableName: executableName ?? ProcessInfo.processInfo.processName
        )
    }
}
