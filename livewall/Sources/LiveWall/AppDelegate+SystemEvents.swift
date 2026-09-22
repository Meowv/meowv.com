import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 系统事件

    /// ## 为什么每个闭包都包了一层 `Task { @MainActor }`
    ///
    /// 这些观察者闭包都是 `@Sendable` 的，而 `queue: .main` **不参与隔离推断** ——
    /// 直接在主 actor 隔离的方法体内写逻辑会被判「在非隔离上下文里调用主 actor 方法」。
    /// 包一层回跳是唯一不改语义的写法：`queue: .main` 保证闭包在主线队列上执行，
    /// 回跳只是让编译器看得见这件事（实测：这些闭包确实在主线程，回跳不会换线程）。
    func registerNotifications() {
        let workspace = NSWorkspace.shared.notificationCenter

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.log("屏幕参数变化 → 重建窗口")
                self.rebuildWindows(reason: "屏幕变化")
            }
        }
        workspace.addObserver(
            forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setDisplaySleeping(true) }
        }
        workspace.addObserver(
            forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setDisplaySleeping(false) }
        }
        workspace.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) {
            [weak self] _ in
            Task { @MainActor in self?.rebuildWindows(reason: "系统唤醒") }
        }

        // 锁屏 / 解锁同样只更新信号，不直接碰播放器 ——
        // 暂停与恢复统一由 governor 的状态机决定，避免多路信号互相打架。
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.governor.setSessionLocked(true)
                // 把最近一次成功的静态图**再设一遍**：`setDesktopImageURL` 生效有延迟，
                // 而锁屏正是「用户马上要看」的时刻。这里绝不现抓帧 —— 播放器已被
                // governor 暂停，复用锁屏预览自己缓存的静态图即可。
                self?.lockScreenPreviewer.reapplyCached()
            }
        }
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.governor.setSessionLocked(false) }
        }
    }

    /// 重建窗口并把播放端对齐到新的屏幕/策略。
    ///
    /// ## 为什么需要重入守卫
    ///
    /// `screenCoordinator.rebuild()` 内部会自旋 run loop 等窗口上屏（上限 1 秒），
    /// 而自旋期间**主队列上的其它 block 会照常执行** —— 包括再来一条屏幕参数变化 /
    /// 系统唤醒通知。没有守卫时那会嵌套进第二次 `rebuildWindows`，而 `createWindows()`
    /// 的第一步就是 `close()` 现有窗口 —— 于是「重建中重建」，外层拿到的是半成品状态。
    ///
    /// 后到的请求**合并成一次尾部重建**而不是丢弃：屏幕确实变了，不重建就是错的。
    func rebuildWindows(reason: String) {
        guard !isRebuilding else {
            pendingRebuildReason = reason
            log("\(reason)：正在重建中，合并为一次尾部重建")
            return
        }
        isRebuilding = true

        let verdict = screenCoordinator.rebuild()
        lastLayerVerdict = verdict
        syncPlaybackSlots()
        log("\(reason)后重建 \(screenCoordinator.windows.count) 个窗口：\(verdict.summary)")
        refreshStatusItem()
        persistScreenSources()

        // **先释放守卫再执行尾部重建**：不释放的话那次调用会立刻撞上守卫、
        // 把原因又记一遍而什么都不做 —— 表现为「屏幕变了但窗口一直不重建」。
        isRebuilding = false
        if let pending = pendingRebuildReason {
            pendingRebuildReason = nil
            rebuildWindows(reason: pending)
        }
    }

    /// 让播放端的槽位集合与当前屏幕/策略对齐，并重新绑定窗口。
    ///
    /// 屏幕热插拔、系统唤醒、策略切换都走这里。槽位是**按 key 复用**的：
    /// 没变化的那块屏不会重新拉视频，只有新出现的槽位才需要补一张。
    func syncPlaybackSlots() {
        let keys = screenCoordinator.playbackSlotKeys()
        let previous = Set(engine.slotKeys())
        for key in previous where !keys.contains(key) {
            loadTasksBySlot[key]?.cancel()
            loadTasksBySlot[key] = nil
            loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1
        }
        engine.useSlots(keys)

        // 重建窗口后必须重新绑定 —— 新窗口没有 playerLayer，不 attach 就是一片黑
        for binding in screenCoordinator.windowBindings {
            engine.attach(binding.window, to: binding.key, gravity: gravity)
        }

        // 拆掉的槽位不该再占着状态区。先收集再删：遍历字典时改字典会崩。
        let staleKeys = namesBySlot.keys.filter { !keys.contains($0) }
        for key in staleKeys { namesBySlot[key] = nil }
        refreshCurrentName()

        // 策略或屏幕变了，锁屏预览的目标屏也可能变了（例如切到「仅主屏」）——
        // 不刷新的话副屏会一直顶着一张不属于它的静态图。
        if preferences.lockScreenPreview, let primary = engine.primaryKey,
            let item = engine.item(on: primary)
        {
            refreshLockScreenPreview(for: item, on: primary)
        }

        let added = keys.filter { !previous.contains($0) }
        guard !added.isEmpty else { return }
        log("新增槽位 \(added.map(\.label).joined(separator: "、"))，各取一张")
        for key in added { advanceOne(key) }
    }

    /// 状态区第二行：把所有槽位的条目名拼成一行。
    func refreshCurrentName() {
        let names = engine.slotKeys().compactMap { namesBySlot[$0] }
        currentName = names.isEmpty ? "启动中" : names.joined(separator: " · ")
    }

    /// 把某张壁纸的静态图同步成系统墙纸（锁屏预览）。
    ///
    /// 用独立 Task：内部要下载几百 KB（最长 15 秒超时），不能挡住切换排期。
    /// `frameProvider` 只在静态图不可用时才会被调用；它复用播放引擎异步缓存的帧，
    /// 不会在主线程轮询等待。
    func refreshLockScreenPreview(for item: WallpaperItem, on key: PlaybackSlotKey) {
        let previewer = lockScreenPreviewer
        let policy = screenCoordinator.policy
        Task { @MainActor [weak self] in
            await previewer.update(
                for: item,
                multiScreenPolicy: policy,
                frameProvider: { [weak self] in
                    await self?.engine.currentFrame(on: key)
                }
            )
        }
    }

    /// 把各屏当前播放的条目 id 写回配置，下次启动接着播（恢复见 `advance()` 里的
    /// `pendingRestore`）。
    ///
    /// 只在每屏独立模式下写 —— 另外两种策略共用一张，没有「每屏」可记。
    func persistScreenSources() {
        guard preferences.multiScreenPolicy == .perScreen else { return }
        // 固定态不写：此时每屏播的都是同一条固定项，写进去会**覆盖用户固定前
        // 「每屏各不相同」的记忆**，解钉后重启就变成「各屏都恢复成固定项」。
        // 固定项本身另有真源（`pinnedItem`），不需要这里帮忙记。
        guard !isPinned else { return }
        var store = preferences.perScreenSources
        for key in engine.slotKeys() {
            guard let displayID = key.displayID, let item = engine.item(on: key) else { continue }
            store.setItemID(item.id, for: displayID)
        }
        let removed = store.prune(keeping: screenCoordinator.displayIDs)
        guard store != preferences.perScreenSources || removed > 0 else { return }
        preferences.perScreenSources = store
        persistPreferences("每屏源记忆")
        if removed > 0 {
            log("清理 \(removed) 条已拔掉屏幕的源记录")
        }
    }

}
