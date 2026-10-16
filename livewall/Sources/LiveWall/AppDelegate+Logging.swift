import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 自身完整性

    /// 启动时校验自身签名，把结论写进日志。
    ///
    /// **只写日志**：不弹提示、不阻断启动。ad-hoc 签名下这个检查能被重签绕过，
    /// 而误判的代价（用户以为 App 被动过手脚）远大于收益。详见 `Seal`。
    func reportSeal() {
        switch Seal.readBundle() {
        case .trusted:
            log("自身完整性校验通过")
        case .modified(let reason):
            log("⚠️ 自身完整性校验失败：\(reason) —— 本副本可能被改动过且未重新签名")
        case .undetermined(let reason):
            log("自身完整性无法判定（不影响运行）：\(reason)")
        }
    }

    // MARK: - 日志

    /// 日志轮转阈值。要调整改这里，单位见各字段注释。
    static let logRotation = LogRotationConfig()


    /// 落盘到 `~/Library/Logs/com.meowv.livewall/livewall.log`，同时输出到 stdout。
    /// 出问题时先看这个文件 —— 壁纸应用是后台进程，没有控制台可看。
    ///
    /// 时间戳格式与「追加一行」的落盘逻辑在 `AppLog`（Core）：启动早期
    /// （`main.swift` 里判单实例、那时 `AppDelegate` 还没建起来）也要写同一个文件，
    /// 各抄一份迟早会漂移。**轮转仍留在本地**：它是播放期的高频路径。
    func log(_ message: String) {
        let line = "[\(AppLog.stamp())] \(AppLog.sanitize(message))"
        print(line)
        fflush(stdout)

        logLock.lock()
        defer { logLock.unlock() }

        guard let file = LiveWallPaths.logFileURL else { return }

        // 先判断要不要轮转，再写当前这条。
        // 顺序不能反：反过来的话，刚追加的这条会被随后的清空一起抹掉。
        var rotationLimit: UInt64?
        let now = Date()
        if Self.logRotation.shouldCheck(
            writesSinceCheck: logWritesSinceCheck,
            elapsedSeconds: now.timeIntervalSince(logLastCheck)
        ) {
            logWritesSinceCheck = 0
            logLastCheck = now
            rotationLimit = Self.logRotation.maxFileSizeBytes
        } else {
            logWritesSinceCheck += 1
        }

        AppLog.append(line, to: file, rotationLimit: rotationLimit)
    }

}
