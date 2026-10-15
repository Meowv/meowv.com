import AppKit
import LiveWallCore

extension AppDelegate {
    var disabledItemIDs: Set<Int> { Set(preferences.disabledItems.map(\.id)) }

    /// 菜单和浏览窗口共用禁用状态、播放候选与持久化。
    func toggleDisabled(_ item: WallpaperItem) -> String? {
        guard item.remoteURL != nil else { return "这条壁纸的线上地址不可用" }
        let wasDisabled = disabledItemIDs.contains(item.id)
        preferences.toggleDisabled(item)
        if !wasDisabled {
            if preferences.pinnedItem?.id == item.id {
                // 固定项可能还在异步铺满；先让所有旧结果失效，再解钉。
                for key in engine.slotKeys() {
                    loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1
                }
                clearPin(reason: nil, persist: false)
            }
        }
        pool.excludedIDs = isLocalSource ? [] : disabledItemIDs
        let restoreCategory = updateFavoritePlaybackItems()
        let saved = persistPreferences("禁用壁纸")

        if !wasDisabled {
            let loadingKeys = loadingItemIDsBySlot.filter { $0.value == item.id }.map(\.key)
            for key in loadingKeys {
                loadTasksBySlot[key]?.cancel()
                loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1
                loadTasksBySlot[key] = nil
                loadingItemIDsBySlot[key] = nil
                if governor.state.isPlaying, !pool.isExhausted { advanceOne(key) }
            }
        }
        if restoreCategory { restoreFilterAfterEmptyFavorites() }
        resumeAfterDisabledChange()
        if !wasDisabled && pool.isExhausted && !restoreCategory {
            notice = .warning("当前过滤下没有可播放的壁纸，请恢复禁用或更换内容过滤")
        }
        browserWindowController?.refreshDisabledState()
        log("\(wasDisabled ? "取消禁用" : "禁用")壁纸：\(item.id) \(item.title)")
        refreshStatusItem()
        return saved ? nil : (persistenceFailure ?? "禁用更改未保存")
    }

    /// 暂留已禁用条目的最后一帧；有候选时只替换受影响的屏幕。
    /// 返回 true 表示主槽位等待补片，或候选已耗尽，无需立即重排全局定时器。
    @discardableResult
    func replaceDisabledSlots() -> Bool {
        let affected = engine.slotKeys().filter {
            engine.item(on: $0).map { $0.remoteURL != nil && disabledItemIDs.contains($0.id) } ?? false
        }
        guard !affected.isEmpty else { return false }
        for key in affected { engine.pause(on: key) }
        guard !pool.isExhausted else {
            scheduleTimer?.invalidate()
            scheduleTimer = nil
            notice = .warning("当前过滤下没有可播放的壁纸，请恢复禁用或更换内容过滤")
            refreshStatusItem()
            return true
        }
        guard governor.state.isPlaying else { return true }
        for key in affected where loadTasksBySlot[key] == nil { advanceOne(key) }
        return affected.contains { $0 == engine.primaryKey }
    }

    func resumeAfterDisabledChange() {
        guard governor.state.isPlaying else { return }
        engine.resume(excluding: disabledItemIDs)
        if replaceDisabledSlots() { return }
        if scheduleTimer == nil, !pool.isExhausted {
            if engine.isEmpty { advance() }
            else { scheduleNext(after: engine.primaryDuration) }
        }
    }
}
