import AppKit
import LiveWallCore

// 动态壁纸 正式 App 入口。
//
// 菜单栏常驻、不占 Dock（Info.plist 里 LSUIElement=true）。
// 窗口层级的启动自检与降级在 AppDelegate 里做 —— 那是这套方案唯一的脆弱点。

// 单实例判定**必须排在 `NSApplication` 之前**：建覆盖窗口、注册全局热键、写配置
// 都是有副作用的动作，等启动完再退出就已经晚了（热键被抢走、配置被覆盖、日志被清）。
//
// 判据是 `flock`（内核级、进程退出自动释放），不是 PID 文件也不是 `NSRunningApplication`
// —— 理由、以及「同时跑两个会出什么事」都写在 `SingleInstance` 里。
//
// 返回值必须**持有到进程结束**：`InstanceLock` 一旦被释放就等于放锁，
// 所以这里用顶层 `let`（会变成全局变量，活到进程退出）。豁免启动时它是 nil。
do {
    let removed = try LiveWallPaths.preparePrivateStorage()
    if !removed.isEmpty {
        AppLog.appendStamped("已清理 \(removed.count) 个旧版缓存文件")
    }
} catch {
    let message = "LiveWall 无法保护本地数据目录，启动已中止：\(error.localizedDescription)\n"
    FileHandle.standardError.write(Data(message.utf8))
    exit(EXIT_FAILURE)
}

let instanceLock: InstanceLock? = {
    if SingleInstance.allowsMultiple(environment: ProcessInfo.processInfo.environment) {
        AppLog.appendStamped("⚠️ 已按 \(SingleInstance.allowMultipleEnvKey) 允许重复启动（开发用途）")
        return nil
    }
    let url = LiveWallPaths.instanceLockURL(identity: LiveWallPaths.instanceIdentity())
    do {
        return try InstanceLock.acquire(at: url)
    } catch let error as InstanceLock.AcquireError {
        switch error {
        case .alreadyRunning(let holder):
            // 已有实例在跑：留回执（stdout + 日志 + 通知老实例）后**静默退出**，
            // 不碰桌面、不改配置、不注册热键。
            SingleInstance.announceDuplicateLaunch(holder: holder)
            exit(0)
        case .unavailable(let reason):
            // 锁不可用**不该拦住用户用 App**（目录权限、只读盘…）：记一行日志照常启动。
            AppLog.appendStamped("⚠️ 单实例锁不可用，本次不设防：\(reason)")
            return nil
        }
    } catch {
        AppLog.appendStamped("⚠️ 单实例判定失败，本次不设防：\(error.localizedDescription)")
        return nil
    }
}()

do {
    if let log = LiveWallPaths.logFileURL { _ = try AppLog.sanitizeFile(at: log) }
} catch {
    FileHandle.standardError.write(Data("LiveWall 历史日志脱敏失败：\(AppLog.sanitize(error.localizedDescription))\n".utf8))
    exit(EXIT_FAILURE)
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
