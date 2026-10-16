import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 调度

    /// 切到下一条。
    ///
    /// 每屏独立时**一次给所有槽位各挑一条**，先挑完再统一开始加载。
    /// 不能「加载完一个再挑下一个」—— 两次 `pool.next()` 之间隔着一个网络往返，
    /// 期间屏幕可能已经变化，槽位集合也就变了。
    func advance() {
        guard libraryReady, !isShuttingDown else { return }
        // 恢复计划只对「紧接着加载完清单的那一次」有效：**先取出再清空**，
        // 这样即使下面因暂停/耗尽提前 return，它也不会泄漏到之后某一次定时切换。
        let restorePlan = pendingRestore
        pendingRestore.removeAll()

        // 固定态：**不取新片**。这是「停止轮换」的落点 —— 放在这里而不是每个调用点，
        // 是因为 `advance()` 是全局切换的唯一入口，同时覆盖：轮换定时器、网络恢复
        // （`network.onChange`）、`holdCurrent` 的 60 秒重试、`scheduleRecoveryAttempt`、
        // 「下一张」按钮与 ⌥⌘N 热键。
        //
        // 固定态下**不存在定时切换**（`scheduleNext` 已拦截），所以能走到这里的
        // 只剩恢复类请求。它们要的是「把固定项重新拉一遍」，而不是「什么都不做」——
        // 槽位里虽然还挂着固定项（`item(on:)` 非空），但那正是加载 / 播放失败的那条。
        // 所以这里用 `force`：忽略「URL 相同就算已就位」的短路。
        if isPinned {
            log("固定模式：不轮换，重新铺满固定项 \(pinnedLibraryItem?.id ?? -1)")
            applyPinToMissingSlots(force: true)
            return
        }

        // 暂停期间不加载任何新内容：既省流量，也避免「恢复时发现画面是刚拉的」。
        // 这不只是手动暂停 —— 遮挡、锁屏、息屏等任何暂停原因都算，否则网络恢复
        // 之类的旁路触发会在没人看见的时候把视频拉下来。
        // 恢复路径由 `applyPlaybackState(.playing)` 重新驱动，不会漏掉。
        guard governor.state.isPlaying else {
            let reason = governor.state.reason?.label ?? "未知"
            log("处于暂停状态（\(reason)），跳过切换")
            return
        }
        guard !pool.isExhausted else {
            notice = .warning("候选池已耗尽")
            log("候选池耗尽，停止调度")
            refreshStatusItem()
            return
        }

        let keys = engine.slotKeys()
        guard !keys.isEmpty else {
            log("没有可播放的槽位，跳过切换")
            return
        }

        if isFavoritesFilter, !isLocalSource {
            var picked: [(PlaybackSlotKey, Int)] = []
            for key in keys {
                if let displayID = key.displayID, let id = restorePlan[displayID], pool.restoreID(id) {
                    picked.append((key, id))
                } else if let id = pool.nextID() { picked.append((key, id)) }
            }
            for (key, id) in picked { loadLibraryItem(id, on: key) }
            return
        }

        var picked: [(key: PlaybackSlotKey, item: WallpaperItem)] = []
        for key in keys {
            // 恢复优先：这块屏上次播的那条还在候选集里就直接接着播。
            // 取不到（条目已不属于当前分类 / 已被清单移除）就落下去正常取片 ——
            // 绝不能因为查不到就让这块屏空着。
            if let displayID = key.displayID,
                let remembered = restorePlan[displayID],
                let item = pool.restore(id: remembered)
            {
                log("恢复 \(key.label) 上次播放的条目 \(item.id)")
                picked.append((key, item))
                continue
            }
            guard let item = pool.next() else { break }
            picked.append((key, item))
        }
        guard let fallback = picked.first else {
            notice = .warning("候选池为空")
            refreshStatusItem()
            return
        }
        // 候选比槽位少时（池里就剩一两条），后面的槽位分不到片 ——
        // 宁可几屏同片，也不要有一屏黑着。
        for key in keys.dropFirst(picked.count) {
            picked.append((key, fallback.item))
        }

        for pair in picked {
            loadAndPlay(pair.item, attempt: 0, on: pair.key)
        }
    }

    /// 只给一个槽位补一张。
    ///
    /// 与 `advance()` 的区别：那个是全局切换，这个是某槽位自己的条目失败后的补救 ——
    /// 其它槽位正在正常播放，不该被牵连着一起换片。
    func advanceOne(_ key: PlaybackSlotKey) {
        guard libraryReady, !isShuttingDown else { return }
        guard governor.state.isPlaying else { return }
        // 固定态：不给这个槽位取新片，改成补固定项。覆盖三条路径 ——
        // `syncPlaybackSlots` 的新增槽位、拉黑后的补片、以及单槽位的恢复请求。
        // 放在 `isPlaying` 判断**之后**：暂停期间不加载任何新内容，与 `advance()` 同一条规则
        // （恢复时 `applyPlaybackState(.playing)` 会兜住这些空槽位）。
        if isPinned {
            applyPinToMissingSlots()
            return
        }
        guard !pool.isExhausted else {
            notice = .warning("候选池已耗尽")
            refreshStatusItem()
            return
        }
        if isFavoritesFilter, !isLocalSource {
            if let id = pool.nextID() { loadLibraryItem(id, on: key) }
        } else if let item = pool.next() {
            loadAndPlay(item, attempt: 0, on: key)
        }
    }

    /// ID 在主 actor 上先分配，解密完成后重查槽位代次与来源，迟到结果不得开播。
    private func loadLibraryItem(_ id: Int, on key: PlaybackSlotKey) {
        guard let wallpaperLibrary else { return }
        loadTasksBySlot[key]?.cancel()
        let generation = (loadGenerationBySlot[key] ?? 0) + 1
        let sourceGeneration = sliceRequestGeneration
        loadGenerationBySlot[key] = generation
        loadingItemIDsBySlot[key] = id
        loadTasksBySlot[key] = Task { @MainActor in
            defer {
                if loadGenerationBySlot[key] == generation {
                    loadTasksBySlot[key] = nil
                    loadingItemIDsBySlot[key] = nil
                }
                updateMenuBarIconAnimation()
            }
            do {
                let item = try await wallpaperLibrary.item(id: id)
                guard !Task.isCancelled, !isShuttingDown, governor.state.isPlaying,
                      generation == loadGenerationBySlot[key], sourceGeneration == sliceRequestGeneration,
                      isFavoritesFilter, !isLocalSource, !isPinned, favoriteItemIDs.contains(id),
                      !disabledItemIDs.contains(id), engine.slotKeys().contains(key) else { return }
                guard let item else { throw WallpaperLibraryStore.StoreError.malformedRecord }
                loadTasksBySlot[key] = nil
                loadAndPlay(item, attempt: 0, on: key)
            } catch { librarySaveFailure("加载收藏条目", error: error) }
        }
        updateMenuBarIconAnimation()
    }

    /// 加载并播放指定条目。失败时按 `FailurePolicy` 决定重试、拉黑还是保持画面。
    func loadAndPlay(_ item: WallpaperItem, attempt: Int, on key: PlaybackSlotKey) {
        guard libraryReady, !isShuttingDown else { return }
        loadTasksBySlot[key]?.cancel()
        let generation = (loadGenerationBySlot[key] ?? 0) + 1
        loadGenerationBySlot[key] = generation

        // 播放地址用 `playableURL`（http(s) 或 file://），**不是** `remoteURL` ——
        // 后者只认 http(s)，本地文件夹数据源的条目会被一律判成非法。
        guard let url = item.playableURL else {
            log("跳过 URL 非法的条目 \(item.id)（\(key.label)）")
            pool.blacklist(id: item.id)
            // 失效的正是固定项 → 自动解钉（决策 8），然后**全局** `advance()`
            // 而不是只补这一个槽位：固定是对所有屏生效的，失效也该所有屏一起回轮换。
            if !unpinIfInvalidated(item) {
                advanceOne(key)
            }
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                // 失败重试可能已经替换了任务；不要误删新任务的句柄。
                if self.loadGenerationBySlot[key] == generation {
                    self.loadTasksBySlot[key] = nil
                    self.loadingItemIDsBySlot[key] = nil
                }
                // 加载结束（成功 / 失败 / 被丢弃）后立刻重算一次，让旋转当场停下 ——
                // 不靠它也行（定时器每帧会重判），但那样停止最多滞后一帧。
                self.updateMenuBarIconAnimation()
            }
            do {
                let loaded = try await self.loadVideo(url)
                guard !Task.isCancelled else { return }
                // 加载是异步的，期间槽位可能已经被拆掉（屏拔了 / 策略切了）。
                // 往一个不存在的槽位里塞内容只会让播放器空转。
                guard self.engine.slotKeys().contains(key) else {
                    self.log("槽位 \(key.label) 在加载完成前已失效，丢弃 \(item.id)")
                    return
                }
                guard self.loadGenerationBySlot[key] == generation else {
                    self.log("槽位 \(key.label) 的旧加载结果已过期，丢弃 \(item.id)")
                    return
                }
                guard item.remoteURL == nil || !self.disabledItemIDs.contains(item.id) else {
                    self.log("槽位 \(key.label) 的条目已禁用，丢弃 \(item.id)")
                    self.advanceOne(key)
                    return
                }
                self.engine.play(
                    item,
                    loaded: loaded,
                    on: key,
                    captureStillFrame: self.preferences.lockScreenPreview
                        && item.coverImageURL == nil
                        && key == self.engine.primaryKey
                )
                self.failuresBySlot[key] = 0
                self.retriesBySlot[key] = 0
                self.isHoldingForNetwork = false
                self.namesBySlot[key] = item.displayName
                self.refreshCurrentName()
                // 成功加载会清掉上一次的异常提示。但**解钉提示要留住** ——
                // 用户需要知道画面为什么突然换了（固定项失效），而那句话正是在
                // 本次加载之前写下的，直接 `= nil` 会让它一次都看不见。
                // 「来源切换」的说明同理（本地文件夹失效 → 已回到线上清单）。
                if let unpin = self.pendingUnpinNotice {
                    self.notice = .warning(unpin)
                    self.pendingUnpinNotice = nil
                    self.pendingSourceNotice = nil
                } else {
                    self.notice = nil
                    self.consumePendingSourceNotice()
                }
                self.log(
                    "播放 \(item.id) \(item.title)(\(loaded.resolutionText)) 时长 "
                        + "\(String(format: "%.2f", loaded.durationSeconds))s 编码 \(loaded.codec)"
                        + " [\(key.label)]")
                // 锁屏预览：把这张的静态图同步成系统墙纸。**只跟随主槽位** ——
                // 系统墙纸全局只有一张，多槽位（每屏独立）时以主槽位为准。
                // 必须在**播放中**发起：抓帧兜底要求播放器在播，而锁屏通知到达时
                // governor 已经把播放器暂停了，那一刻只复用已缓存的图。
                if self.preferences.lockScreenPreview, key == self.engine.primaryKey {
                    self.refreshLockScreenPreview(for: item, on: key)
                }
                self.refreshStatusItem()
                // 加载是异步的，期间状态可能已翻成暂停。播放器必须服从当前状态，
                // 否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。
                // 画面保持就位（已解码缓冲），恢复时能立刻无缝续上。
                if !self.governor.state.isPlaying {
                    self.engine.pause()
                    self.log("加载完成时已处于暂停状态，画面就位但不播放")
                }
                // 只有主槽位排下一次切换：多个槽位各排一个定时器会互相覆盖。
                if key == self.engine.primaryKey {
                    self.scheduleNext(after: loaded.durationSeconds)
                    self.persistScreenSources()
                }
            } catch {
                guard !Task.isCancelled else { return }
                guard self.loadGenerationBySlot[key] == generation else {
                    self.log("槽位 \(key.label) 的旧加载失败结果已过期，忽略 \(item.id)")
                    return
                }
                self.handleLoadFailure(error, item: item, attempt: attempt, on: key)
            }
        }
        loadingItemIDsBySlot[key] = item.id
        loadTasksBySlot[key] = task
        // 切壁纸的加载是②里最频繁的一种：图标当场转起来，用户才知道
        // 「按了下一张之后现在在加载」而不是「按了没反应」。
        updateMenuBarIconAnimation()
    }

    /// 共享同一 URL 的并发准入校验。最后一个调用方取消或完成后，释放任务并取消无人等待的加载。
    func loadVideo(_ url: URL) async throws -> LoadedVideo {
        let lease = sharedVideoLoadStore.acquire(for: url)
        return try await withTaskCancellationHandler {
            defer { sharedVideoLoadStore.release(lease) }
            return try await lease.task.value
        } onCancel: {
            // 取消回调可能与 await 并发；租约释放是幂等且由锁保护的。
            sharedVideoLoadStore.release(lease)
        }
    }

    /// 加载失败的统一出口。
    func handleLoadFailure(
        _ error: Error, item: WallpaperItem, attempt: Int, on key: PlaybackSlotKey
    ) {
        let kind = FailurePolicy.classify(error)
        let failures = (failuresBySlot[key] ?? 0) + 1
        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: failures,
            retriesForItem: attempt
        )
        log("加载失败 \(item.id) [\(key.label)]：\(kind.label) → \(Self.describe(action))")

        switch action {
        case .stopScheduling:
            failuresBySlot[key] = failures
            stopSchedulingForFailedSlot(key)

        case .holdCurrent:
            holdCurrent(reason: kind.label)

        case .retrySame:
            retriesBySlot[key] = attempt + 1
            loadAndPlay(item, attempt: attempt + 1, on: key)

        case .blacklistAndAdvance:
            // 只有确认是资源本身的问题才拉黑。网络类失败绝不拉黑，
            // 否则一次断网会把整池好资源全丢进黑名单。
            pool.blacklist(id: item.id)
            failuresBySlot[key] = failures
            // 拉黑的如果正是固定项 → 自动解钉（决策 8）。
            // 注意 `.holdCurrent` / `.retrySame` / `.stopScheduling` 三个分支**保持原样**：
            // 前两个是网络类问题（不该解钉），第三个是连续失败（画面还在，也没到解钉的程度）。
            if !unpinIfInvalidated(item) {
                advanceOne(key)
            }
        }
    }

    /// 某个槽位连续失败到阈值时的处理。
    ///
    /// **只有所有槽位都失败才停全局调度**：每屏独立时副屏挂掉就把主屏也停掉，
    /// 等于把「某一块屏的问题」放大成「壁纸没了」。单槽位失败只让它自己保持画面，
    /// 全局定时器照常走，下次切换时它会重新取片。
    func stopSchedulingForFailedSlot(_ key: PlaybackSlotKey) {
        let keys = engine.slotKeys()
        let allFailed =
            !keys.isEmpty
            && keys.allSatisfy {
                (failuresBySlot[$0] ?? 0) >= failurePolicy.maxConsecutiveFailures
            }
        guard allFailed else {
            notice = .warning("\(key.label)连续失败，保持其画面")
            log("\(key.label)连续失败 \(failuresBySlot[key] ?? 0) 次，保持当前画面，其余槽位不受影响")
            if key == engine.primaryKey {
                scheduleRecoveryAttempt()
            }
            refreshStatusItem()
            return
        }
        stopScheduling(reason: "全部 \(keys.count) 个槽位连续失败")
    }

    /// 保持当前画面不动，过一会儿再试。
    ///
    /// 这里**刻意不动播放器**：当前视频已经被 AVFoundation 缓冲，继续循环即可。
    /// 一旦清空播放器或换成黑帧，就违反了「任何失败都不能黑屏」的硬约束。
    func holdCurrent(reason: String) {
        isHoldingForNetwork = true
        notice = .warning("\(reason)，保持当前画面")
        log("保持当前画面（\(reason)），60 秒后重试")
        refreshStatusItem()

        scheduleTimer?.invalidate()
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) {
            [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.failuresBySlot.removeAll()
                self.advance()
            }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    func stopScheduling(reason: String) {
        scheduleTimer?.invalidate()
        scheduleTimer = nil
        notice = .warning("\(reason)，已暂停调度")
        log("停止调度（\(reason)）—— 保留当前画面，不黑屏")
        refreshStatusItem()
    }

    /// 主槽位失败但副屏仍正常时，保留全局调度，稍后重新尝试取片。
    func scheduleRecoveryAttempt() {
        scheduleTimer?.invalidate()
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) {
            [weak self] _ in
            Task { @MainActor in self?.advance() }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    /// 播放中途失败（`AVPlayerLooper` 或实际 `AVPlayerItem` 副本报告失败）。
    func handlePlaybackFailure(_ key: PlaybackSlotKey, _ error: Error) {
        guard let item = engine.item(on: key) else { return }
        let kind = FailurePolicy.classify(error)
        log("播放失败 \(item.id) [\(key.label)]：\(kind.label)")
        // 只有主槽位管调度定时器，非主槽位失败不该把它的下一次切换也取消掉
        if key == engine.primaryKey {
            scheduleTimer?.invalidate()
        }

        let failures = (failuresBySlot[key] ?? 0) + 1
        let action = failurePolicy.action(
            for: kind,
            networkReachable: network.isReachable,
            consecutiveFailures: failures,
            retriesForItem: retriesBySlot[key] ?? 0
        )
        switch action {
        case .stopScheduling:
            failuresBySlot[key] = failures
            stopSchedulingForFailedSlot(key)
        case .holdCurrent:
            holdCurrent(reason: kind.label)
        case .retrySame:
            let attempt = (retriesBySlot[key] ?? 0) + 1
            retriesBySlot[key] = attempt
            loadAndPlay(item, attempt: attempt, on: key)
        case .blacklistAndAdvance:
            pool.blacklist(id: item.id)
            failuresBySlot[key] = failures
            if !unpinIfInvalidated(item) {
                advanceOne(key)
            }
        }
    }

    func scheduleNext(after videoDuration: Double?) {
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        // 固定态：**不排下一次切换**。放这里而不是各调用点，是为了同时覆盖
        // 定时切换、恢复播放、改切换间隔（`rescheduleAfterIntervalChange`）、
        // 以及「播完即切」（`switchWhenFinished`）四条路径 —— 少覆盖一条就会出现
        // 「固定了几分钟后自己换了一张」。
        //
        // 日志必须写明：否则排障时看到「播完了却没有下一行」会误判成播完即切坏了。
        guard !isPinned else {
            log("固定模式：不安排下一次切换（固定项 \(pinnedLibraryItem?.id ?? -1) 一直播）")
            return
        }

        // 暂停期间不排切换：既看不到画面，也没必要消耗带宽
        guard governor.state.isPlaying else {
            log("当前处于暂停状态，暂不安排下一次切换")
            return
        }
        guard !pool.isExhausted else { return }

        let policy = preferences.schedulePolicy
        let delay = policy.nextDelaySeconds(videoDuration: videoDuration)
        // 把生效的间隔设置一起打出来 —— 验证「改了间隔有没有生效」只看这一行就够
        log(
            "下次切换在 \(String(format: "%.1f", delay)) 秒后"
                + "（间隔设置 \(SwitchInterval.label(policy.intervalSeconds))，抖动 ±\(Int(policy.jitterRatio * 100))%）"
        )
        scheduleTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) {
            [weak self] _ in
            // 与其它定时器 / 观察者闭包同一处理：块的类型是 `@Sendable`，
            // 回跳一层让编译器看见「这一定在主 actor 上」（定时器挂在 `RunLoop.main`）。
            Task { @MainActor in self?.advance() }
        }
        RunLoop.main.add(scheduleTimer!, forMode: .common)
    }

    // MARK: - 省电状态

    /// 状态机翻转时的唯一落点。**播放器的暂停与恢复只在这里发生**，
    /// 各处系统通知只负责更新信号，不直接碰播放器 —— 否则多路信号会互相打架。
    func applyPlaybackState(_ state: PlaybackState, signals: PlaybackSignals) {
        switch state {
        case .playing:
            log("恢复播放")
            engine.resume(excluding: disabledItemIDs)
            tryStartDueRestReminder()
            // 固定态：不排下一次切换，但**要把缺片的槽位补齐** ——
            // 暂停期间新增的槽位（热插拔 / 策略切换）、以及加载失败留下的空槽位，
            // 都靠这一句收口。幂等，已铺满时是 no-op。
            if isPinned {
                applyPinToMissingSlots()
                break
            }
            if replaceDisabledSlots() { break }
            // 暂停期间定时器已被取消，恢复时要重新排一次
            if scheduleTimer == nil || !(scheduleTimer?.isValid ?? false) {
                if engine.isEmpty {
                    // 启动时就被暂停（或首次加载尚未成功），此时窗口还是空白：
                    // 排下一次切换等于白等 4~6 分钟，应当立刻加载。
                    advance()
                } else {
                    scheduleNext(after: engine.primaryDuration)
                }
            }
        case .paused(let reason):
            log("暂停播放：\(reason.label)")
            engine.pause()
            scheduleTimer?.invalidate()
            scheduleTimer = nil
        }
        refreshStatusItem()
    }

    static func describe(_ action: FailureAction) -> String {
        switch action {
        case .blacklistAndAdvance: return "拉黑并切下一条"
        case .retrySame: return "重试同一条"
        case .holdCurrent: return "保持当前画面"
        case .stopScheduling: return "停止调度"
        }
    }

}
