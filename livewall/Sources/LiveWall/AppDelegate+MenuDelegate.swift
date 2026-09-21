import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

// MARK: - 菜单展开期的惰性采样

/// 进程自身的占用**只在菜单展开时采一次**，收起即停 —— 没有后台轮询、没有常驻定时器。
///
/// 三个回调的分工：
///  - `menuNeedsUpdate`：菜单显示前，AppKit 来要内容 —— 这是**最早**的时机，在这里
///    发起采样，结果最可能在菜单出现前就填好；
///  - `menuWillOpen`：确认展开，置 `isMenuOpen`。只在 `menuNeedsUpdate` 没被回调时
///    才兜底发起一次（正常路径上 `menuNeedsUpdate` 一定先于本回调触发）；
///  - `menuDidClose`：收起 —— 立刻取消未完成的采样并释放它。
extension AppDelegate: NSMenuDelegate {

    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        sampledThisOpen = true
        requestUsageSample()
    }

    func menuWillOpen(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        isMenuOpen = true
        // 只在 `menuNeedsUpdate` 没被回调时兜底 —— 正常路径上它一定会先于本回调触发。
        if !sampledThisOpen { requestUsageSample() }
    }

    func menuDidClose(_ menu: NSMenu) {
        guard menu === statusItem?.menu else { return }
        isMenuOpen = false
        sampledThisOpen = false
        // 采样到此为止：`ProcessMonitor` 会取消后台队列上未执行的任务，
        // 已经跑完的也会因为代号不匹配被丢弃。
        processMonitor.cancel()

        // 一次性回执（手动「检查更新」的应答）**展示过之后**收起即作废。
        //
        // **必须重建菜单**：`item.menu` 持有的是上一次构建的 `NSMenu` 对象，
        // 只把 `notice` 置 nil 的话，下次展开显示的还是旧的那份 —— 回执照样在。
        // 而重建放在下一个 runloop：本回调还在关闭流程里，此刻换掉 `item.menu`
        // 有与 AppKit 抢状态的风险。
        if notice?.isOneShot == true, noticeShown {
            notice = nil
            DispatchQueue.main.async { [weak self] in self?.refreshStatusItem() }
        }

        // 展开期间被推迟的菜单重建在这里补上。
        // 同样放到下一个 runloop：本回调还在关闭流程里，此刻换掉 `item.menu`
        // 有与 AppKit 抢状态的风险。
        if isMenuRebuildPending {
            isMenuRebuildPending = false
            DispatchQueue.main.async { [weak self] in self?.refreshStatusItem() }
        }
    }
}
