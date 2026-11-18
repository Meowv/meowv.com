import AppKit
import LiveWallCore

extension AppDelegate {

    // MARK: - 一键锁屏（软件内锁屏）

    var isInAppLocked: Bool { inAppLockCoordinator.isActive }

    /// 菜单入口：立即进入软件内锁屏。
    ///
    /// 与「立即开始休息」共用同一套全屏覆盖方式，但语义完全不同：
    /// 没有倒计时、不会自动结束，只能按空格或 ⌘W 退出。
    @objc func startInAppLock() {
        guard !isInAppLocked, !isShuttingDown, !backupOperationPending else {
            return
        }
        guard confirmInAppLockInputEnforcement() else { return }

        // 休息层与软件锁屏都是全屏覆盖层，叠在一起只会互相遮挡；
        // 锁屏意味着用户要离开，先把休息倒计时收掉。
        if restReminderCoordinator.isActive {
            restReminderCoordinator.end(reason: .user)
        }

        // 默认沿用「锁屏这一刻正在播的壁纸」：同一个条目 + 已加载的 asset，
        // 不重新下载。没在播（或用户选了纯黑）就是 nil → 纯黑屏。
        let primary = engine.primaryKey
        let item = preferences.inAppLockUsesCurrentWallpaper
            ? primary.flatMap { engine.item(on: $0) }
            : nil
        let preloaded = preferences.inAppLockUsesCurrentWallpaper
            ? primary.flatMap { engine.loadedVideo(on: $0) }
            : nil

        guard inAppLockCoordinator.start(item: item, preloaded: preloaded) else { return }
        governor.setInAppLocked(true)
        log(
            "一键锁屏开始：\(item?.displayName ?? "纯黑屏")，"
                + "输入拦截\(inAppLockCoordinator.isInputShieldActive ? "已启用" : "降级（缺少辅助功能权限）")"
        )
        refreshStatusItem()
    }

    /// 解锁。空格与 ⌘W 都落到这里；重复触发由 `isActive` 守卫吸收。
    func endInAppLock(reason: String) {
        guard isInAppLocked else { return }
        inAppLockCoordinator.end()
        governor.setInAppLocked(false)
        log("一键锁屏结束（\(reason)），恢复桌面播放")
        refreshStatusItem()
    }

    /// 严格拦截依赖辅助功能权限。缺权限时**不静默降级**：
    /// 说清楚哪部分拦不住，让用户自己决定是去授权还是照锁。
    private func confirmInAppLockInputEnforcement() -> Bool {
        guard !InAppLockInputShield.isTrusted, !didAcknowledgeDegradedInAppLock else {
            return true
        }
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "严格锁屏需要「辅助功能」权限"
        alert.informativeText = """
            授予后可以拦截 ⌘Tab、⌘Space、截图等由系统直接处理的快捷键。
            未授权时仍会全屏锁定并拦截鼠标、滚轮与键盘，但这些系统快捷键可能仍然生效。

            授权入口：系统设置 → 隐私与安全性 → 辅助功能。
            """
        alert.addButton(withTitle: "仍然锁屏")
        alert.addButton(withTitle: "打开系统设置")
        alert.addButton(withTitle: "取消")
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            didAcknowledgeDegradedInAppLock = true
            log("⚠️ 一键锁屏以降级模式启动：未授予辅助功能权限，系统级快捷键可能仍然生效")
            return true
        case .alertSecondButtonReturn:
            // 让出前台再去开系统设置：本 App 没有窗口，占着激活状态会让键盘输入无处可去。
            NSApp.deactivate()
            InAppLockInputShield.requestTrust()
            log("已请求辅助功能权限；授权后再次执行一键锁屏即可启用严格拦截")
            return false
        default:
            NSApp.deactivate()
            return false
        }
    }

    // MARK: - 锁屏壁纸

    @objc func useCurrentWallpaperForInAppLock() {
        setInAppLockUsesCurrentWallpaper(true)
    }

    @objc func useBlackInAppLockWallpaper() {
        setInAppLockUsesCurrentWallpaper(false)
    }

    private func setInAppLockUsesCurrentWallpaper(_ usesCurrent: Bool) {
        guard preferences.inAppLockUsesCurrentWallpaper != usesCurrent, !isInAppLocked else {
            return
        }
        preferences.inAppLockUsesCurrentWallpaper = usesCurrent
        guard persistPreferences("一键锁屏壁纸") else { return }
        log("一键锁屏壁纸改为\(usesCurrent ? "当前播放的壁纸" : "纯黑屏")")
        notice = .info(usesCurrent ? "一键锁屏将沿用当前壁纸" : "一键锁屏将使用纯黑屏")
        refreshStatusItem()
    }

    /// 设置区的「一键锁屏壁纸」子菜单。
    ///
    /// 与「锁屏预览」并列但互不相干：那个是 macOS 系统锁屏的静态图，
    /// 这个是 App 自己的锁屏层。两个选项互斥，勾选即生效。
    func buildInAppLockWallpaperMenu() -> NSMenuItem {
        let submenu = NSMenu()

        let useCurrent = NSMenuItem(
            title: "使用当前壁纸",
            action: #selector(useCurrentWallpaperForInAppLock),
            keyEquivalent: ""
        )
        useCurrent.target = self
        useCurrent.state = preferences.inAppLockUsesCurrentWallpaper ? .on : .off
        submenu.addItem(useCurrent)

        let black = NSMenuItem(
            title: "使用纯黑屏",
            action: #selector(useBlackInAppLockWallpaper),
            keyEquivalent: ""
        )
        black.target = self
        black.state = preferences.inAppLockUsesCurrentWallpaper ? .off : .on
        submenu.addItem(black)

        let root = NSMenuItem(
            title: "一键锁屏壁纸（\(preferences.inAppLockUsesCurrentWallpaper ? "当前壁纸" : "纯黑")）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }
}
