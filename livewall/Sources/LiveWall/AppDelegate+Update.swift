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
    private func configureAvailableUpdateItem(_ root: NSMenuItem, feed: UpdateFeed) {
        root.title = UpdateMenu.rowTitle(version: feed.version, sizeBytes: feed.sizeBytes)
        root.action = nil
        root.target = nil
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
        root.isEnabled = true
    }

    func selector(for action: UpdateMenu.Action) -> Selector {
        switch action {
        case .updateNow: return #selector(downloadUpdate)
        }
    }

    /// 下载动作使用菜单当前显示的版本。
    var availableUpdate: UpdateFeed? { updateState.feed }

    /// 菜单展开时直接更新检查入口，整份菜单仍在收起后重建。
    func setUpdateState(_ newState: UpdateState) {
        guard newState != updateState else {
            // 后台检查结束时，图标的活动状态可能变了。
            updateMenuBarIconAnimation()
            return
        }
        let old = updateState
        updateState = newState
        log("更新状态：\(old.label) → \(newState.label)")
        if isMenuOpen, let item = updateCheckMenuItem {
            if let feed = newState.feed {
                configureAvailableUpdateItem(item, feed: feed)
                updateCheckMenuItem = nil
            } else {
                item.title = newState.checkItemTitle
                item.isEnabled = validateMenuItem(item)
            }
        }
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
            updateCheckMenuItem = item
            menu.addItem(item)
        }
        if let feed = updateState.feed {
            let item = NSMenuItem()
            configureAvailableUpdateItem(item, feed: feed)
            menu.addItem(item)
        }
    }

    func performUpdateCheck(trigger: UpdateChecker.Trigger) {
        guard network.isReachable || (trigger == .manual && updateChecker.isChecking) else {
            guard trigger == .manual else { return }
            let result = UpdateMenu.Receipt(
                text: "网络不可达，无法检查更新", isWarning: true, isOneShot: true)
            notice = .warning(result.text, oneShot: result.isOneShot)
            refreshStatusItem()
            presentUpdateFeedback(result)
            return
        }
        updateChecker.check(preferences: preferences, localBuild: Self.appBuild, trigger: trigger) {
            switch trigger {
            case .automatic:
                updateMenuBarIconAnimation()
            case .manual:
                setUpdateState(.checkingManually)
            }
        }
    }

    @objc func checkForUpdates() {
        guard updateState.checkItemEnabled else { return }
        performUpdateCheck(trigger: .manual)
    }

    func applyUpdateResult(_ decision: UpdateDecision, warnings: [String], trigger: UpdateChecker.Trigger) {
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
        if trigger == .manual {
            let result = UpdateMenu.feedback(
                decision, warnings: warnings, currentVersion: Self.appVersion)
            notice =
                result.isWarning
                ? .warning(result.text, oneShot: result.isOneShot)
                : .info(result.text, oneShot: result.isOneShot)
            log("手动检查回执：\(result.text)")
            refreshStatusItem()
            presentUpdateFeedback(result, canDownload: decision.showsUpdateRow)
        }
    }

    /// 手动检查完成后的即时回执。
    ///
    /// 菜单项的 action 执行后菜单会立即收起，而网络检查是异步的；只更新菜单里的
    /// `notice` 会把结果藏到下一次展开，用户感知就是「点了没反应」。原生 `NSAlert`
    /// 是菜单栏 App 不需要额外窗口生命周期管理的即时反馈；发现新版本时再提供
    /// 「立即下载更新」，复用现有下载与校验流程。菜单里的回执仍保留到下一次展开，
    /// 方便用户回看；自动检查不调用这里，避免后台行为打扰用户。
    func presentUpdateFeedback(_ result: UpdateMenu.Receipt, canDownload: Bool = false) {
        guard !isMenuOpen else {
            pendingUpdateFeedback = (result, canDownload)
            return
        }

        let alert = NSAlert()
        alert.messageText = result.isWarning ? "检查更新失败" : "检查更新"
        alert.informativeText = result.text
        alert.alertStyle = result.isWarning ? .warning : .informational
        if canDownload {
            alert.addButton(withTitle: "立即下载更新")
            alert.addButton(withTitle: "稍后")
            if alert.runModal() == .alertFirstButtonReturn {
                downloadUpdate()
            }
        } else {
            alert.addButton(withTitle: "好")
            alert.runModal()
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
        // 按 SE-0338 会 hop 到全局执行器（分块下载因此不占主线程）。
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
