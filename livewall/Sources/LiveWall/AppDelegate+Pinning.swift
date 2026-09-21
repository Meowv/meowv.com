import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 固定为桌面壁纸

    /// 落实固定：把某条设为桌面壁纸，**所有屏幕**都播它、停止轮换（决策 2 / 3）。
    ///
    /// UI 的「设为桌面壁纸」与菜单的「固定」行都走这里 —— 只有一条落实路径，
    /// 两条路径各写一份早晚会分叉（一边记得同步内容过滤、另一边忘了）。
    ///
    /// - Parameters:
    ///   - item: 要固定的条目。
    ///   - categoryID: 该条所属的一级分类。与当前 `selectedCategoryID` 不同时会
    ///     **同步切换内容过滤**（决策 7），让「解钉之后的轮换」落在用户刚挑的那个
    ///     分类里，而不是回到某个不相干的分类。传 nil 表示不改内容过滤。
    func setPinned(_ item: WallpaperItem, categoryID: Int?) {
        guard PinnedPlayback.isPlayable(item) else {
            notice = .warning("这条壁纸的地址不可用，无法设为桌面壁纸")
            log("⚠️ 固定失败：条目 \(item.id) 的播放地址非法")
            refreshStatusItem()
            return
        }

        // 1) 单一真源先立即可用。**顺序很重要**：这一写下去 `isPinned` 就为真，
        //    后面所有分支（`advance` / `advanceOne` / `scheduleNext`）自动进入固定态。
        //    整个落实流程因此**不依赖切片加载是否成功** —— 这是「存整条而非 id」
        //    带来的直接好处（只存 id 就得等切片到手才能定位，中间态会悬挂）。
        preferences.pinnedItem = item
        pendingUnpinNotice = nil

        // 2) best-effort 让候选池记住它：在池里就设成 `currentID` 并从待取队列移除，
        //    解钉后不会紧接着又把它取一遍。不在池里（用户固定的是别的分类的条目）
        //    也无所谓 —— 固定本身不依赖候选池。
        _ = pool.restore(id: item.id)

        // 3) 决策 7：同步内容过滤。只在真的不同、且索引里确实有该分类时才拉切片 ——
        //    同分类下重复拉一次 0.6 MB 纯属浪费。
        //    **本地来源下整段跳过**：本地模式没有分类可言，而这条路径会被浏览窗口
        //    （列的是线上内容）触发 —— 拉一个线上切片灌进池子，会让「来源是本地、
        //    池子里却是线上条目」，重启后又变回本地，前后不一致。
        //    固定项本身是自包含的（存整条），不依赖池子，所以跳过它照样能播。
        if !isLocalSource, let categoryID, categoryID != selectedCategoryID,
            categories.contains(where: { $0.id == categoryID })
        {
            preferences.selectedCategoryID = categoryID
            log("固定项属于分类 \(categoryID)，同步切换内容过滤")
            loadSlice(for: categoryID, service: makeCatalogService(), isFirstLoad: false)
        }

        // 4) 固定态下 `advance()` 被拦截、`pendingRestore` 不会被消费，
        //    留着只会在解钉后突然生效 —— 表现成「解钉后莫名跳回开机时那条」。
        pendingRestore.removeAll()
        persistPreferences("固定为桌面壁纸")

        pendingPinAnnouncement = true
        notice = .info("正在设为桌面壁纸…")
        log("设为桌面壁纸：\(item.id) \(item.title)（\(item.displayName)）")
        refreshStatusItem()

        // 5) 所有屏铺满。定时器由 `applyPinToMissingSlots` 与 `scheduleNext` 共同保证不排。
        applyPinToMissingSlots()
        // 浏览窗口若开着，让它把「当前」徽标与右栏按钮同步过来 ——
        // 用户可能是从**菜单**固定的，窗口里得跟着变。
        browserWindowController?.refreshPinState()
    }

    /// 解除固定，回到轮换。
    ///
    /// - Parameter reason: 非 nil 时作为状态区提示。**用户主动解钉传 nil** ——
    ///   画面立刻变了就是回执，多说一句反而像出了错。
    func clearPin(reason: String?) {
        guard isPinned else { return }
        preferences.pinnedItem = nil
        pendingPinAnnouncement = false
        persistPreferences("解除固定")
        // 固定期间不填、也不消费恢复计划；这里再清一次，防止它跨过固定期生效。
        pendingRestore.removeAll()
        if let reason {
            notice = .warning(reason)
            // 成功加载下一条时 `loadAndPlay` 会把 `notice` 重写掉，留一份让它写回来 ——
            // 用户恰恰需要知道「画面为什么突然换了」。
            pendingUnpinNotice = reason
        }
        log("解除固定：\(reason ?? "用户主动恢复轮换")")
        // 解钉可能是从菜单触发的（下一张 / 选顺序），窗口里要把徽标与按钮撤回原样。
        browserWindowController?.refreshPinState()
        refreshStatusItem()
    }

    /// 某个条目被判失效（拉黑）后的检查：失效的正是固定项就自动解钉（决策 8）。
    ///
    /// **只有「资源本身不可用」才算失效** —— 切分类、重载清单、网络断开都不算，
    /// 而那些路径本来也不会走到这里（它们不拉黑条目）。
    ///
    /// - Returns: 是否真的解了钉。为 `true` 时调用方应当走**全局** `advance()`：
    ///   固定对所有屏生效，失效也该所有屏一起回到轮换，而不是只补一个槽位。
    @discardableResult
    func unpinIfInvalidated(_ itemID: Int) -> Bool {
        guard preferences.pinnedItem?.id == itemID else { return false }
        clearPin(reason: "固定项已失效（资源不可用），已恢复轮换")
        return true
    }

    /// 把固定项铺到**所有**没在播它的槽位上（决策 3：固定对所有屏生效）。
    ///
    /// **幂等**：已经铺满时是 no-op。四种场景共用这一个函数 ——
    /// 启动首次铺满、新增槽位、空引擎恢复、落实固定。
    ///
    /// 之所以要「铺满」而不是「播一条」：多屏策略是「每屏独立」时槽位不止一个，
    /// 固定语义要求它们**同片**；而 `PlaybackEngine` 没有「一条铺所有槽位」的 API，
    /// 循环只能写在这里。
    ///
    /// - Parameter force: 忽略「URL 相同就算已就位」的短路，所有槽位都重新加载。
    ///   只给**恢复类**路径用（`advance()` 在固定态下只剩这一种来源）：那时槽位里
    ///   挂着的固定项正是加载 / 播放失败的那条，不重拉就永远卡在坏状态上。
    ///   常规路径（新增槽位、切片应用、恢复播放）不要传 —— 那些场景下
    ///   「已经在播了」是真的不用再拉一遍。
    func applyPinToMissingSlots(force: Bool = false) {
        guard let item = preferences.pinnedItem, PinnedPlayback.isPlayable(item),
            let url = item.playableURL
        else { return }

        let targets = engine.slotKeys().filter { force || engine.item(on: $0)?.url != item.url }
        guard !targets.isEmpty else {
            // 已经全部就位（典型场景：从菜单固定「当前正在播的那条」，镜像策略下
            // 那一个槽位本来就在播它）。这时**也必须把回执发掉** ——
            // 否则状态区会一直挂着「正在设为桌面壁纸…」。
            announcePinIfPending()
            return
        }
        // 防重入：这一批还没铺完又来一次请求的话，同一条视频会被并发拉两遍。
        guard !isPinApplyInFlight else { return }
        isPinApplyInFlight = true

        // **必须先递增代次**：可能正有一个「旧条目」的加载在飞，它完成后会把画面
        // 换成旧条目（`loadAndPlay` 里比对的就是这个代次）。递增之后那个结果会被
        // 判为过期而丢弃 —— 这是整个固定功能里最容易漏、后果最直接的一步。
        for key in targets { loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1 }
        let generations = targets.map { ($0, loadGenerationBySlot[$0] ?? 0) }

        // 固定态不排定时器。这里再保险一次：从「正在轮换」切到固定的那一瞬间，
        // 可能已经有一个在飞的定时器。
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        log("铺满固定项 \(item.id) \(item.title) → \(targets.map(\.label).joined(separator: "、"))")

        Task { @MainActor in
            do {
                // **只加载一次**，再把同一个 `LoadedVideo` 给所有槽位 ——
                // 每个槽位各加载一遍会让同一条视频被拉 N 遍，流量按屏数翻倍。
                let loaded = try await VideoLoader.load(url)
                var applied = 0
                for (key, generation) in generations {
                    // 加载是异步的，期间槽位可能已经被拆掉（屏拔了 / 策略切了）。
                    guard engine.slotKeys().contains(key) else {
                        log("槽位 \(key.label) 在固定项加载完成前已失效，跳过")
                        continue
                    }
                    guard loadGenerationBySlot[key] == generation else {
                        log("槽位 \(key.label) 的固定项加载结果已过期，跳过")
                        continue
                    }
                    engine.play(item, loaded: loaded, on: key)
                    namesBySlot[key] = item.displayName
                    failuresBySlot[key] = 0
                    retriesBySlot[key] = 0
                    applied += 1
                }
                isHoldingForNetwork = false
                refreshCurrentName()
                // 加载期间状态可能已翻成暂停（锁屏 / 遮挡 / 息屏）。播放器必须服从
                // 当前状态，否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。
                if !governor.state.isPlaying {
                    engine.pause()
                    log("固定项就位时已处于暂停状态，画面就位但不播放")
                }
                if preferences.lockScreenPreview, let primary = engine.primaryKey,
                    engine.item(on: primary)?.id == item.id
                {
                    refreshLockScreenPreview(for: item, on: primary)
                }
                announcePinIfPending()
                log("固定项已铺满 \(applied) 个槽位：\(item.id) \(item.title)")
                refreshStatusItem()
            } catch {
                log("⚠️ 固定项加载失败：\(error.localizedDescription)")
                // 决策 8：固定项连加载都失败 → 解钉回轮换，绝不黑屏。
                clearPin(reason: "固定项加载失败，已恢复轮换")
                advance()
            }

            isPinApplyInFlight = false
            // 收尾再核一次：加载期间可能新增了槽位（屏幕热插拔 / 策略切换），
            // 那一批不在本次的 `generations` 里。**放在释放标志之后**，
            // 否则会被上面的防重入守卫挡掉。
            // 不会无限递归：铺满后 `targets` 为空直接返回；失败路径已解钉。
            if isPinned { applyPinToMissingSlots() }
        }
    }

    /// 消费「设为桌面壁纸」的回执。
    ///
    /// 单独抽出来是因为有**两条**消费路径：真正铺满之后（异步、要等视频加载完），
    /// 以及「已经全部就位、不需要铺」的短路路径（从菜单固定当前正在播的那条）。
    /// 少了后者，状态区会一直挂着「正在设为桌面壁纸…」。
    func announcePinIfPending() {
        guard pendingPinAnnouncement, let item = preferences.pinnedItem else { return }
        notice = .info("已设为桌面壁纸：\(item.displayName)")
        pendingPinAnnouncement = false
        refreshStatusItem()
    }
}
