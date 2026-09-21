import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 版本更新

    /// 「有新版本」那一行 + 它的子菜单。只在真的检测到新版本时才被加进菜单。
    ///
    /// 动作不带 `representedObject`：同一时刻只可能有一个待更新版本，读
    /// `availableUpdate` 即可 —— 挂上去反而要处理「引用的是上一版」的问题。
    func buildUpdateItem(_ feed: UpdateFeed) -> NSMenuItem {
        let root = NSMenuItem(
            title: UpdateMenu.rowTitle(version: feed.version, sizeBytes: feed.sizeBytes),
            action: nil,
            keyEquivalent: ""
        )

        let submenu = NSMenu()
        for line in UpdateMenu.detailLines(feed: feed) {
            let item = NSMenuItem(title: line, action: nil, keyEquivalent: "")
            item.isEnabled = false
            submenu.addItem(item)
        }
        submenu.addItem(.separator())
        for action in [UpdateMenu.Action.updateNow] {
            let item = NSMenuItem(
                title: UpdateMenu.actionTitle(action), action: selector(for: action),
                keyEquivalent: "")
            item.target = self
            submenu.addItem(item)
        }
        root.submenu = submenu
        return root
    }

    func selector(for action: UpdateMenu.Action) -> Selector {
        switch action {
        case .updateNow: return #selector(downloadUpdate)
        }
    }

    /// 当前待更新的版本。**只读** —— 状态本身由 `updateState` 持有，
    /// 三个动作用它拿 feed，不改状态。
    var availableUpdate: UpdateFeed? { updateState.feed }

    /// **唯一的写入口**：改状态 + 重建菜单都在这一处。
    ///
    /// 幂等：值没变就直接返回，不重建菜单 —— 于是「同一个结果到了两次」
    /// 「状态没变却重复刷新」都不会让菜单闪一下。
    func setUpdateState(_ newState: UpdateState) {
        guard newState != updateState else { return }
        let old = updateState
        updateState = newState
        log("更新状态：\(old.label) → \(newState.label)")
        // 「展开中不重建」现在由 `refreshStatusItem` 统一处理（展开期记待办、收起后补一次）。
        // 这里不再自己判一次 —— 同一条约束写两处迟早会分叉，而它此前确实只在这一处分叉着。
        refreshStatusItem()
    }

    /// 按状态往菜单里加更新段。**两者互斥**：有新版本时只加更新行（隐藏入口），
    /// 其余只加「检查更新」入口。
    func appendUpdateSection(to menu: NSMenu) {
        if updateState.showsCheckItem {
            let item = NSMenuItem(
                title: updateState.checkItemTitle,
                action: #selector(checkForUpdates),
                keyEquivalent: ""
            )
            item.target = self
            // 置灰判据在 `validateMenuItem(_:)`（构建时写 `isEnabled` 会被自动校验覆盖）。
            menu.addItem(item)
        }
        if let feed = updateState.feed {
            menu.addItem(buildUpdateItem(feed))
        }
    }

    /// 发起检查。网络不可达时**根本不发请求**（状态区已经有「网络不可达」那一行了）。
    func performUpdateCheck(force: Bool, manual: Bool = false) {
        guard network.isReachable else { return }
        // 先置位再发起：`check` 在「压根没发请求」时是**同步**回调的。
        pendingManualUpdateCheck = manual
        setUpdateState(updateState.afterCheckStarted)
        updateChecker.check(preferences: preferences, localBuild: Self.appBuild, force: force)
    }

    /// 手动检查：无视节流，且**必须给回执**。
    ///
    /// 点完菜单立刻收起，结果要下次展开才看得见 —— 不给一句「已是最新版本」
    /// 或「检查失败：xxx」，用户看到的就是「点了没反应」。
    @objc func checkForUpdates() {
        guard network.isReachable else {
            notice = .warning("网络不可达，无法检查更新", oneShot: true)
            refreshStatusItem()
            return
        }
        guard updateState != .checking else {
            // 这一项在检查中是禁用的；走到这里多半是键盘等别的途径触发的，
            // 那就只回一句「在查了」，**不再发第二个请求**。
            notice = .info("正在检查更新…", oneShot: true)
            refreshStatusItem()
            return
        }
        notice = .info("正在检查更新…", oneShot: true)
        performUpdateCheck(force: true, manual: true)
    }

    func applyUpdateResult(_ decision: UpdateDecision, warnings: [String]) {
        let manual = pendingManualUpdateCheck
        pendingManualUpdateCheck = false
        for warning in warnings { log("更新检查：\(warning)") }

        // 状态迁移只有这一行：**非 available 一律回 idle**（失败按无更新处理，
        // 入口原样保留），可用则隐藏入口、显示更新行。
        setUpdateState(updateState.afterCheckFinished(decision))

        switch decision {
        case .available(let feed):
            log("发现新版本 \(feed.version)（build \(feed.build)）")
        case .upToDate:
            log("已是最新版本（本地 build \(Self.appBuild.map(String.init) ?? "?")）")
        case .unusable:
            log("更新检查判不出结果（原因见上），按无更新处理")
        }

        // 回执只给手动检查：自动检查没人在等结果，弹提示是打扰。
        if manual {
            let result = UpdateMenu.feedback(
                decision, warnings: warnings, currentVersion: Self.appVersion)
            notice =
                result.isWarning
                ? .warning(result.text, oneShot: result.isOneShot)
                : .info(result.text, oneShot: result.isOneShot)
            log("手动检查回执：\(result.text)")
            refreshStatusItem()
        }
    }

    /// 只下载到 `~/Downloads` 并在 Finder 里选中，**绝不安装**。
    /// 理由见 `UpdateInstaller` 顶部。
    @objc func downloadUpdate() {
        guard let feed = availableUpdate else { return }
        log("开始下载更新：\(feed.fileURL.absoluteString)")
        // `Task { }` 写在 `@MainActor` 方法里会**继承主 actor**，闭包体（含 `self` 的读写）
        // 就在主线程上，`AppDelegate` 本身也已隐式 `Sendable` —— 因此不需要
        // `nonisolated(unsafe) let delegate = self` 那种「我确认安全」的手工标记。
        //
        // 真正的重活不在主线程：`UpdateInstaller.download` 是 **nonisolated async**，
        // 按 SE-0338 会 hop 到全局执行器（逐字节下载循环因此不占主线程）。
        Task { @MainActor [weak self] in
            do {
                let outcome = try await UpdateInstaller.download(feed)
                guard let self else { return }
                NSWorkspace.shared.activateFileViewerSelecting([outcome.file])
                notice = .info(UpdateMenu.installHint)
                log("更新已下载：\(outcome.file.path)（\(outcome.byteCount) 字节）")
                // 清单里的 `sizeBytes` 只用于菜单显示，**摘要才是权威**。
                // 对不上时只记日志、不阻断 —— 用户拿到的是校验通过的文件，
                // 该修的是发布流程里那个数字。
                if let declared = feed.sizeBytes, declared > 0, declared != outcome.byteCount {
                    log(
                        "⚠️ 清单里的 sizeBytes（\(declared)）与实际下载大小"
                            + "（\(outcome.byteCount)）不符")
                }
                refreshStatusItem()
            } catch {
                let message = error.localizedDescription
                guard let self else { return }
                notice = .warning("更新下载失败：\(message)")
                log("更新下载失败：\(message)")
                refreshStatusItem()
            }
        }
    }

    @objc func openAuthorBlog() {
        guard let url = URL(string: AboutMenu.blogURLString) else { return }
        log("打开作者博客：\(url.absoluteString)")
        NSWorkspace.shared.open(url)
    }

    /// 赞助支持：打开 studio 首页。
    ///
    /// 不直接打开二维码图片、也不在 App 内做二维码弹窗：studio 页脚本来就有「赞助支持」
    /// 入口（点开是二维码弹窗），送到那里就够了。客户端因此不必存二维码，也不必为了它
    /// 写一个 UI 窗口 —— 那会是本项目第一个普通窗口，还要在 `LSUIElement` 下自己处理
    /// 激活（不激活窗口会开在别的 App 后面）、焦点与关闭行为。
    @objc func openDonationPage() {
        guard let url = URL(string: AboutMenu.donationURLString) else { return }
        log("打开赞助支持页：\(url.absoluteString)")
        NSWorkspace.shared.open(url)
    }

    /// 状态区里的一行占用数据。标记用于 `menuNeedsUpdate` 里定位它。
    func usageRow(id: String, text: String) -> NSMenuItem {
        let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
        item.isEnabled = false
        item.representedObject = id
        return item
    }

    /// 状态区那一行占用数据：**内存在前、CPU 在后**（两行并一行，省菜单高度）。
    var usageText: String {
        guard let report = usageReport else {
            // 四态的前两态：还没采到（测量中…）/ 采过但失败（暂不可用）。
            // 两者都写成「测量中」会让失败被永远掩盖 —— 用户没有任何办法知道真相。
            // 后两态（有报告但算不出占用率 / 有数据）走下面的 `combinedRow`。
            let placeholder =
                usageFailed ? ProcessUsageText.unavailable : ProcessUsageText.measuring
            return "内存 \(placeholder) · CPU \(placeholder)"
        }
        return ProcessUsageText.combinedRow(
            percent: report.cpuPercent,
            windowSeconds: report.windowSeconds,
            sinceLaunch: report.sinceLaunch,
            bytes: report.memoryBytes,
            peakBytes: report.peakBytes
        )
    }

}
