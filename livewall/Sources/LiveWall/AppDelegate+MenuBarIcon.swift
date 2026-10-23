import AppKit
import LiveWallCore

/// 菜单栏图标的旋转：判定、接入与开关动作。
///
/// 与 `AppDelegate+MenuBar.swift` 的分工：那边负责**建状态项、建菜单、换图标**，
/// 这里只负责**决定图标该是什么样**，并把结果交给 `MenuBarIconAnimator`。
extension AppDelegate {

    /// 「该不该转」的**唯一生产调用点**。
    ///
    /// 四个动作信号与两道闸门在这里一次性组装成 `MenuBarIconSignals`，
    /// 判定本身全在 `LiveWallCore.MenuBarIconActivity`（可穷举验证）。
    /// **不要**在别处再写一遍这组布尔运算 —— 那正是 `PinnedPlayback` 分叉的成因。
    var shouldRotateMenuBarIcon: Bool {
        MenuBarIconActivity.shouldRotate(
            MenuBarIconSignals(
                isEnabled: preferences.animateMenuBarIcon,
                isMenuOpen: isMenuOpen,
                isPlaying: engine.isPlaying,
                isDownloading: downloader.isDownloading,
                isCheckingUpdate: updateState == .checking,
                hasPendingLoads: !loadTasksBySlot.isEmpty,
                isPinApplying: isPinApplyInFlight
            )
        )
    }

    /// 把动画器的三个回调接到状态项上。启动时调用一次。
    func configureMenuBarIconAnimator() {
        menuBarIconAnimator.onFrame = { [weak self] image in
            self?.statusItem?.button?.image = image
            self?.statusItem?.button?.title = ""
        }
        // 定时器自行停止时（每帧重判发现不该转了）回写静态图。
        menuBarIconAnimator.onStop = { [weak self] in self?.updateMenuBarIconAnimation() }
        menuBarIconAnimator.shouldContinue = { [weak self] in
            self?.shouldRotateMenuBarIcon ?? false
        }
    }

    /// 菜单栏图标的**唯一写入口**。`refreshStatusItem()` 与菜单开合都走这里。
    ///
    /// 三种结果：动画接管 / 冻结当前角度 / 回写静态图。三者互斥，顺序不能换 ——
    /// 菜单展开期必须**先**尝试冻结，否则下面的 `update` 会按「不该转」把图标
    /// 顶回静态图，展开菜单时图标就会从当前角度跳回 0°。
    func updateMenuBarIconAnimation() {
        guard let item = statusItem else { return }
        // 退出流程末尾还有一段 `RunLoop.main.run(until:)`，期间仍可能有在飞的刷新
        // （下载完成、菜单收起补刷）回调进来。那时不该再把动画定时器拉起来。
        guard !isShuttingDown else { return }

        // 暂停态用另一张统一中灰的图（见 `menuBarIcon(named:)` 的说明）：
        // 颜色区分播放与暂停，旋转另表示正在播放或有活动进行中。
        let base = engine.isPlaying ? Self.playingIcon : Self.pausedIcon
        if isMenuOpen, menuBarIconAnimator.freeze(base: base) { return }

        if menuBarIconAnimator.update(isActive: shouldRotateMenuBarIcon, base: base) { return }

        if let base {
            item.button?.image = base
            item.button?.title = ""
        } else {
            // 图标资源缺失时的兜底（例如不经 .app 直接跑 .build 里的可执行文件）。
            item.button?.image = nil
            item.button?.title = engine.isPlaying ? "◉" : "◐"
        }
    }

    /// 菜单里的「图标旋转」开关。
    ///
    /// 刻意**不给 `notice` 回执**：图标当场开始转 / 停下来就是回执，
    /// 状态区再多一行纯属噪音。
    @objc func toggleMenuBarIconRotation() {
        preferences.animateMenuBarIcon.toggle()
        persistPreferences("图标旋转开关")
        log("菜单栏图标旋转 → \(preferences.animateMenuBarIcon ? "开" : "关")")
        refreshStatusItem()
    }
}
