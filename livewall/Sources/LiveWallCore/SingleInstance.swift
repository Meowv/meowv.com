import Darwin
import Foundation

/// 单实例：同一个「程序身份」只允许一个进程在跑。
///
/// ## 为什么必须有这一层
///
/// `run.sh` 是 `exec build/LiveWall.app/Contents/MacOS/LiveWall` —— **直接执行可执行文件**，
/// 绕过了 LaunchServices 的「同 bundle id 复用已有实例」（那条只对 Finder 双击 / `open -a` 生效）。
/// 于是「登录项拉起的打包版」与「手动 `./run.sh` 起的开发版」能同时活着，而两者身份**完全相同**
/// （bundle id 都是 `com.meowv.livewall`），后果是：
///
/// - 共用 `config.json`：两个进程各持一份内存副本，保存是**全量覆盖** → 设置互相盖掉；
/// - 共用**唯一一份**分类切片缓存：一个实例切了分类就改写了「离线兜底用的那一片」；
/// - 共用同一个日志文件（轮转是**截断为 0 字节**）→ 互相抹掉排障现场；
/// - 抢同一个窗口层级（同层前后顺序由 WindowServer 决定）与同一组全局热键
///   （Carbon 进程独占，后启动的那个**静默失效**）。
///
/// ## 判据用 `flock`，不用 PID 文件
///
/// 锁由**内核**持有，进程一退出（包括 `kill -9`）自动释放 —— 没有「PID 文件指向一个
/// 已经不存在的进程」这种 stale 问题，也就不需要「PID 复用」那套校验。
/// `NSRunningApplication.runningApplications(withBundleIdentifier:)` 只用来**查出对面是谁**
/// 以便提示，**不作判据**：两个进程同时启动时，两边都可能还没看到对方。
public enum SingleInstance {

    /// 新实例被挡掉时通知**已在运行**的那个实例，让它给用户一句回执。
    public static let duplicateLaunchNotification = Notification.Name("com.meowv.livewall.duplicateLaunch")

    /// 显式允许重复启动的环境变量（开发时对比 debug / release 行为用）。
    public static let allowMultipleEnvKey = "LIVEWALL_ALLOW_MULTIPLE"

    // MARK: - 身份与路径（纯逻辑，可单测）

    /// 「程序身份」。**bundle id 优先**：dev 版与打包版同 id，本来就该互斥；
    /// 裸跑可执行文件（`.build/debug/LiveWall`，没有 bundle）时退回可执行文件名。
    public static func identity(bundleIdentifier: String?, executableName: String) -> String {
        if let bundleIdentifier, !bundleIdentifier.trimmingCharacters(in: .whitespaces).isEmpty {
            return bundleIdentifier
        }
        return "exe-\(executableName)"
    }

    /// 锁文件路径。按身份分文件：同一个程序的不同副本共用一个锁，不同程序互不干扰。
    public static func lockFileURL(directory: URL, identity: String) -> URL {
        let safe = identity.replacingOccurrences(of: "/", with: "_")
        return directory.appendingPathComponent("instance-\(safe).lock")
    }

    /// 环境变量是否要求豁免。只认明确的真值：`0` / 空串 / 没设都算**不豁免**
    /// （「设了但写错」不该意外打开多实例）。
    public static func allowsMultiple(environment: [String: String]) -> Bool {
        guard let raw = environment[allowMultipleEnvKey]?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            !raw.isEmpty else { return false }
        return ["1", "true", "yes", "on"].contains(raw)
    }

    /// 把锁文件里的持有者信息整理成人读形式：`pid 1234（/path/LiveWall.app）`。
    ///
    /// 只用于提示，**不参与判活**（判活是 `flock` 的事）。读不到或格式不对时返回 nil ——
    /// 解析失败不该让提示变成错误。
    public static func describeHolder(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        var pid: String?
        var path: String?
        for line in raw.split(separator: "\n") {
            if line.hasPrefix("pid=") { pid = String(line.dropFirst(4)) }
            if line.hasPrefix("path=") { path = String(line.dropFirst(5)) }
        }
        switch (pid, path) {
        case let (pid?, path?): return "pid \(pid)（\(path)）"
        case let (pid?, nil): return "pid \(pid)"
        case let (nil, path?): return path
        default: return nil
        }
    }

    // MARK: - 被挡掉时的回执

    /// 新实例被挡掉时的收尾：stdout + 日志各留一行，并通知已在运行的实例。
    ///
    /// 三条都要有：`run.sh` 是前台 `exec`，**stdout 就是用户唯一能立刻看到的东西**；
    /// 日志是事后排障的依据（用户可能从 Finder 或登录项启动，没有终端可看）；
    /// 通知则让老实例在状态区给一句回执，免得用户以为「第二个点了没反应」。
    public static func announceDuplicateLaunch(holder: String?) {
        let detail = describeHolder(holder).map { "，占用者 \($0)" } ?? ""
        let message = "⚠️ 已有实例在运行\(detail)，本次启动退出"
        print(message)
        fflush(stdout)
        AppLog.appendStamped(message)
        DistributedNotificationCenter.default().post(name: duplicateLaunchNotification, object: nil)
    }
}

/// 已经拿到手的实例锁。
///
/// **必须在整个进程生命周期内持有**：对象被释放（或 `release()`）就等于放锁。
/// 因此调用方要把它存进一个活得和进程一样久的变量里（`main.swift` 的顶层 `let`）。
public final class InstanceLock {

    public enum AcquireError: Error, LocalizedError, Equatable {
        /// 已经有进程拿着这把锁。`holder` 是对方写下的自述信息，可能为 nil。
        case alreadyRunning(holder: String?)
        /// 锁不可用（目录不存在、打不开、权限不足…）。**调用方应当继续启动**，只记日志。
        case unavailable(String)

        public var errorDescription: String? {
            switch self {
            case .alreadyRunning(let holder):
                return describeHolder(holder).map { "已有实例在运行（\($0)）" } ?? "已有实例在运行"
            case .unavailable(let reason): return "单实例锁不可用：\(reason)"
            }
        }

        /// 与 `SingleInstance.describeHolder` 同一口径。
        private func describeHolder(_ raw: String?) -> String? {
            SingleInstance.describeHolder(raw)
        }
    }

    public let url: URL
    /// 拿到锁之后一直持有；`-1` 表示已释放。
    private var descriptor: Int32

    private init(url: URL, descriptor: Int32) {
        self.url = url
        self.descriptor = descriptor
    }

    /// 尝试取锁。成功返回持有者对象；失败抛错（两种情况见 `AcquireError`）。
    public static func acquire(at url: URL) throws -> InstanceLock {
        // 目录可能还不存在（全新安装、还没写过配置），先建出来。
        // 失败不在这里报错 —— 紧随其后的 open 会给出真正的 errno。
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        // O_CREAT：不存在就建。锁文件收紧为仅当前用户可读写。
        let fd = open(url.path, O_CREAT | O_RDWR, mode_t(PrivateFileAccess.filePermissions))
        guard fd >= 0 else {
            throw AcquireError.unavailable("无法打开 \(url.path)（errno \(errno)）")
        }
        _ = fchmod(fd, mode_t(PrivateFileAccess.filePermissions))
        // LOCK_NB：拿不到立刻返回，**绝不阻塞启动**。
        if flock(fd, LOCK_EX | LOCK_NB) == 0 {
            writeHolderInfo(to: fd)
            return InstanceLock(url: url, descriptor: fd)
        }
        let holder = (try? String(contentsOf: url, encoding: .utf8))
        close(fd)
        throw AcquireError.alreadyRunning(holder: holder)
    }

    /// 把自己的 pid 与可执行文件路径写进锁文件，供下一个实例提示用。
    ///
    /// 写失败无所谓（文件可能只读），**锁已经拿到了**，这条信息纯属便利。
    private static func writeHolderInfo(to descriptor: Int32) {
        let path = Bundle.main.bundleURL.path
        let payload = "pid=\(getpid())\npath=\(path)\n"
        ftruncate(descriptor, 0)
        _ = payload.withCString { pointer in
            Darwin.write(descriptor, pointer, strlen(pointer))
        }
    }

    /// 放锁。正常退出路径不需要显式调用（进程结束内核自动释放），
    /// 留着是为了**测试**能验证「放锁之后别人能拿到」。
    public func release() {
        guard descriptor >= 0 else { return }
        flock(descriptor, LOCK_UN)
        close(descriptor)
        descriptor = -1
    }

    deinit { release() }
}
