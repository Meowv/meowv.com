import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {


    @objc func toggleLaunchAtLogin() {
        let target = !LaunchAtLogin.isEnabled
        if let error = LaunchAtLogin.setEnabled(target) {
            notice = .warning("开机自启设置失败")
            log("⚠️ 开机自启\(target ? "开启" : "关闭")失败：\(error)")
        } else {
            notice = .info("开机自启已\(target ? "开启" : "关闭")")
            log("开机自启已\(target ? "开启" : "关闭")，系统状态：\(LaunchAtLogin.statusLabel)")
            // requiresApproval 是成功注册但还没批准 —— 不说清楚用户会以为没生效
            if LaunchAtLogin.requiresApproval {
                notice = .warning("开机自启待批准（系统设置 → 通用 → 登录项）")
                log("需在「系统设置 → 通用 → 登录项」里手动批准后才会生效")
            }
        }
        refreshStatusItem()
    }

    @objc func togglePowerOption(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let option = PowerOption(rawValue: raw)
        else { return }
        setOption(option, enabled: sender.state != .on)
        persistPreferences("省电设置")
        log("省电设置：\(option.label)暂停 → \(isOptionEnabled(option) ? "开" : "关")")
        // 立刻重算，否则要等下一次 2 秒轮询才生效，用户会以为没点上
        governor.refresh()
        refreshStatusItem()
    }

    /// 锁屏预览开关。
    ///
    /// 关掉时立刻把系统墙纸恢复成用户原来的那张 —— 否则「关掉」之后锁屏仍是最后
    /// 一张静态图，用户会以为开关没生效。
    @objc func toggleLockScreenPreview() {
        preferences.lockScreenPreview.toggle()
        persistPreferences("锁屏预览开关")
        log("锁屏预览 → \(preferences.lockScreenPreview ? "开" : "关")")
        if preferences.lockScreenPreview {
            notice = .info("锁屏预览已开启")
            if let primary = engine.primaryKey, let item = engine.item(on: primary) {
                refreshLockScreenPreview(for: item, on: primary)
            }
        } else {
            notice = .info("锁屏预览已关闭，当前动态素材保留")
            lockScreenPreviewer.restoreUserWallpaper()
            aerialLockScreenManager.stopPreparation()
        }
        refreshStatusItem()
    }

    /// 当前可下载的条目（主槽位正在播的那张）。没有就置灰菜单项 ——
    /// 让用户点到一个必然失败的动作比置灰更糟。
    var currentDownloadableItem: WallpaperItem? {
        // 本地来源下没有可下载的东西 —— 文件本来就在用户自己的文件夹里，
        // 「下载」只会把它从自己硬盘拷回自己硬盘。置灰而不是让用户点到必然失败的动作。
        // 判据与「内容过滤」「打开动态壁纸」共用一处登记（`WallpaperSourceMenu.OnlineOnlyEntry`）。
        guard WallpaperSourceMenu.isEnabled(.downloadCurrent, isLocalSource: isLocalSource) else { return nil }
        guard let primary = engine.primaryKey else { return nil }
        return engine.item(on: primary)
    }

    /// 当前可收藏的线上条目。收藏不支持本地视频，判据与实际收藏操作保持一致。
    var currentFavoriteableItem: WallpaperItem? {
        guard !isLocalSource, let primary = engine.primaryKey,
              let item = engine.item(on: primary), item.remoteURL != nil
        else { return nil }
        return item
    }

    /// 当前是否有正在播放的条目可供「固定」。
    ///
    /// 菜单构建（`PlaybackOrderMenu.entries(canPinCurrent:)`）与可用性校验
    /// （`validateMenuItem(_:)`）共用这一个判据，两处不会打架。
    var canPinCurrent: Bool {
        engine.primaryKey.flatMap { engine.item(on: $0) } != nil
    }

    /// 下载当前壁纸（视频 + 静态预览图）到 `~/Downloads/livewall/`。
    ///
    /// 入口在维护段：它不改播放、不改配置，属于低频的一次性动作。
    @objc func downloadCurrentWallpaper() {
        guard !downloader.isDownloading else {
            notice = .info("正在下载，请稍候")
            refreshStatusItem()
            return
        }
        guard let item = currentDownloadableItem else {
            notice = .warning("当前没有正在播放的壁纸")
            refreshStatusItem()
            return
        }

        notice = .info("正在下载 \(item.displayName)…")
        refreshStatusItem()

        Task { @MainActor in
            do {
                guard let result = try await self.downloader.download(item) else { return }
                let names = result.files.map(\.lastPathComponent).joined(separator: "、")
                if result.skippedCover {
                    // 视频成功、静态图失败：这是「部分成功」，必须说清楚，否则用户
                    // 只会看到「下载失败」而以为视频也没存下来。
                    self.notice = .warning("视频已下载（\(names)），静态图未保存")
                } else {
                    self.notice = .info("已下载：\(names)")
                }
                self.log("下载当前壁纸完成 → \(self.downloader.destinationDirectory.path)")
            } catch {
                self.notice = .warning("下载失败：\(error.localizedDescription)")
                self.log("⚠️ 下载当前壁纸失败：\(error.localizedDescription)")
            }
            self.refreshStatusItem()
        }
    }

    @objc func setIdleThreshold(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.idleThresholdSeconds = seconds
        persistPreferences("空闲阈值")
        log("空闲阈值改为 \(IdleThreshold.label(seconds))")
        governor.refresh()
        refreshStatusItem()
    }

    /// 「下一张」：**解钉触发点 1**（菜单项与 ⌥⌘N 热键都落到这里，见 `handleHotKey`）。
    @objc func nextNow() {
        // 解钉刻意**不给提示**：画面立刻换了就是回执。而且 `loadAndPlay` 成功时会把
        // `notice` 重写成 nil，那句提示本来也留不住；菜单里「选片顺序」父项同步变回
        // 「随机 / 顺序」，那是更可靠的指示。
        if isPinned { clearPin(reason: nil) }
        failuresBySlot.removeAll()
        advance()
    }

    @objc func togglePause() {
        // 只切信号，暂停/恢复与定时器由 governor 的状态机统一处理，避免两条路径各改一次。
        // 这里也不改状态区文案：暂停原因由菜单里的状态行直接读 governor 显示，
        // 写入一个「已手动暂停」反而会在恢复后残留。
        governor.setUserPaused(!isUserPaused)
        refreshStatusItem()
    }

    /// 收藏或取消收藏当前主屏壁纸。菜单与全局热键都落到这里，避免两套状态更新路径。
    @objc func toggleCurrentFavorite() {
        guard let item = currentFavoriteableItem else {
            notice = .warning("当前没有可收藏的线上壁纸", oneShot: true)
            refreshStatusItem()
            return
        }
        let wasFavorite = preferences.favoriteItems.contains(where: { $0.id == item.id })
        if let message = toggleFavorite(item) {
            notice = .warning(message)
            refreshStatusItem()
            return
        }
        notice = .info(wasFavorite ? "已取消收藏：\(item.displayName)" : "已收藏：\(item.displayName)")
        log("\(wasFavorite ? "取消收藏" : "收藏")当前壁纸：\(item.displayName)")
        refreshStatusItem()
    }

    /// 切换选片顺序。**刻意不立刻换片** —— 当前这张在新顺序下依然合法，
    /// 换模式只决定「下一张是谁」（顺序模式下就是清单第一条）。
    /// 候选池的待取队列会因 `order` 的 didSet 被清空，等于重新开始一轮。
    ///
    /// 固定态下选「随机 / 顺序」＝ **解钉触发点 3**。
    @objc func switchPlaybackOrder(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let order = PlaybackOrder(rawValue: raw)
        else { return }

        let wasPinned = isPinned
        // `|| wasPinned` 不能省：固定前是「随机」、固定后点「随机」时，
        // `order` 与配置里的值相同，原 guard 会把这次点击整个吞掉 ——
        // 于是「点随机解钉」失效，用户只会觉得「固定之后点不回来了」。
        guard order != preferences.playbackOrder || wasPinned else { return }

        if wasPinned { clearPin(reason: nil) }

        preferences.playbackOrder = order
        persistPreferences("选片顺序")
        pool.order = order

        log(
            "选片顺序改为\(order.label)（\(order.detail)）：候选 \(pool.totalCount) 条，"
                + "下一张起按新顺序，本轮重新开始")

        // 固定期间 `scheduleNext` 被拦截，定时器一直是空的。解钉后必须重排一次，
        // 否则「恢复轮换」只体现在菜单文案上 —— 画面会一直停在固定项上不动。
        if wasPinned { rescheduleAfterIntervalChange() }
        refreshStatusItem()
    }

    /// 切换自动切换间隔。立即按新间隔重新计时，不换片。
    @objc func setSwitchInterval(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.intervalSeconds = seconds
        persistPreferences("切换间隔")
        log("切换间隔改为 \(SwitchInterval.label(seconds))")

        // 不重新计时的话，改完要等旧定时器到期才生效 —— 用户改完盯着看却毫无变化，
        // 只会以为没点上。旧定时器作废，从此刻起按新间隔重新算。
        rescheduleAfterIntervalChange()
        refreshStatusItem()
    }

    /// 间隔变化后重排下一次切换。**当前这张继续播**，只重置「还剩多久切」。
    func rescheduleAfterIntervalChange() {
        // 正在等网络恢复时不要插队 —— 那条 60 秒重试有自己的节奏，
        // 抢过来会变成「每改一次间隔就立刻重试一次加载」，反而把重试次数刷满。
        guard !isHoldingForNetwork else {
            log("正在等待网络恢复，新间隔将在下一次成功加载后生效")
            return
        }
        guard governor.state.isPlaying else {
            log("当前处于暂停状态，新间隔将在恢复播放后生效")
            return
        }
        scheduleNext(after: engine.primaryDuration)
    }

}
