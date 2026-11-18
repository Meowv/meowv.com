import AppKit
import LiveWallCore
import UniformTypeIdentifiers

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

        let videoURL = preferences.resolvedInAppLockVideoURL
        guard inAppLockCoordinator.start(videoURL: videoURL) else { return }
        governor.setInAppLocked(true)
        log(
            "一键锁屏开始：\(videoURL?.lastPathComponent ?? "纯黑屏")，"
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

    /// 选择「一键锁屏」专用视频。与桌面壁纸来源完全独立。
    @objc func chooseInAppLockVideo() {
        guard !isInAppLocked, !isShuttingDown else { return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.mpeg4Movie, .quickTimeMovie, .movie]
        panel.prompt = "选用"
        panel.message = "选择一键锁屏时播放的视频（未配置时使用纯黑屏）"
        if let current = preferences.resolvedInAppLockVideoURL {
            panel.directoryURL = current.deletingLastPathComponent()
        }
        NSApp.activate()
        let response = panel.runModal()
        // 面板关闭后本 App 没有窗口，继续占着激活状态会让键盘输入无处可去。
        NSApp.deactivate()
        guard response == .OK, let url = panel.url else { return }

        preferences.inAppLockVideoPath = url.path
        guard persistPreferences("一键锁屏壁纸") else { return }
        log("一键锁屏壁纸改为 \(url.path)")
        notice = .info("一键锁屏壁纸已设为 \(url.lastPathComponent)")
        refreshStatusItem()
    }

    /// 清除锁屏壁纸，回到纯黑屏。
    @objc func useBlackInAppLockWallpaper() {
        guard preferences.inAppLockVideoPath != nil, !isInAppLocked else { return }
        preferences.inAppLockVideoPath = nil
        guard persistPreferences("一键锁屏壁纸") else { return }
        log("一键锁屏壁纸已清除，锁屏使用纯黑屏")
        notice = .info("一键锁屏将使用纯黑屏")
        refreshStatusItem()
    }

    /// 设置区的「一键锁屏壁纸」子菜单。
    ///
    /// 与「锁屏预览」并列但互不相干：那个是 macOS 系统锁屏的静态图，
    /// 这个是 App 自己的锁屏层。标题里带上当前状态，省得点进子菜单才知道。
    func buildInAppLockWallpaperMenu() -> NSMenuItem {
        let submenu = NSMenu()

        let info = NSMenuItem(
            title: "当前：\(preferences.inAppLockVideoName ?? "纯黑屏")",
            action: nil,
            keyEquivalent: ""
        )
        info.isEnabled = false
        submenu.addItem(info)
        submenu.addItem(.separator())

        let choose = NSMenuItem(
            title: "选择视频…",
            action: #selector(chooseInAppLockVideo),
            keyEquivalent: ""
        )
        choose.target = self
        submenu.addItem(choose)

        // 可用性在 `validateMenuItem(_:)` 里判：没配置时置灰，避免点到一个必然无效的动作。
        let black = NSMenuItem(
            title: "使用纯黑屏",
            action: #selector(useBlackInAppLockWallpaper),
            keyEquivalent: ""
        )
        black.target = self
        submenu.addItem(black)

        let root = NSMenuItem(
            title: "一键锁屏壁纸（\(preferences.inAppLockVideoName == nil ? "纯黑" : "动态")）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }
}
