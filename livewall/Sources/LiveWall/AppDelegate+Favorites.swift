import AppKit
import LiveWallCore

extension AppDelegate {
    /// 收藏或取消收藏一条线上壁纸。浏览窗口和快捷入口共用这条路径，确保播放候选、
    /// 收藏过滤和持久化始终同步。
    func toggleFavorite(_ item: WallpaperItem) -> String? {
        guard item.remoteURL != nil else { return "这条壁纸的线上地址不可用" }
        guard let wallpaperLibrary else { return "壁纸条目库尚未准备好" }
        guard beginLibraryMutation() else { return "条目库正在保存，请稍后重试" }
        let wasFavorite = favoriteItemIDs.contains(item.id)
        notice = .info("正在保存收藏更改…", oneShot: true)
        refreshStatusItem()
        libraryMutationTask = Task { @MainActor in
            defer { finishLibraryMutation() }
            do {
                let change = try await wallpaperLibrary.setFavorite(item, enabled: !wasFavorite)
                applyLibraryChange(change)
                log("\(wasFavorite ? "取消收藏" : "收藏")壁纸：\(item.id)")
                let restoreCategory = updateFavoritePlaybackItems()
                if restoreCategory { restoreFilterAfterEmptyFavorites() }
                if !wasFavorite { resumeAfterDisabledChange() }
                notice = .info(wasFavorite ? "已取消收藏" : "已收藏", oneShot: true)
                refreshStatusItem()
            } catch {
                librarySaveFailure("收藏更改", error: error)
            }
        }
        return nil
    }

    @objc func selectFavorites() {
        guard !isLocalSource, !favoriteItemIDs.isEmpty else { return }
        if isFavoritesFilter {
            // 再次点回收藏也要取消正在加载的普通分类，最后一次选择才生效。
            sliceRequestGeneration += 1
            let hadPendingLoads = !loadTasksBySlot.isEmpty
            cancelFavoriteRotationLoads()
            if hadPendingLoads || engine.isEmpty { advance() }
            notice = nil
            refreshStatusItem()
            return
        }
        applyFavoriteItems(isFirstLoad: pool.totalCount == 0)
    }

    /// 收藏与普通分类共用候选池、暂停规则、切换间隔和多屏调度。
    func applyFavoriteItems(isFirstLoad: Bool) {
        guard !isLocalSource, !favoriteItemIDs.isEmpty else { return }
        guard let wallpaperLibrary else { return }
        sliceRequestGeneration += 1
        let generation = sliceRequestGeneration
        let libraryGeneration = librarySourceGeneration
        Task { @MainActor in
            do {
                let ids = try await wallpaperLibrary.orderedIDs(kind: .favorites)
                guard generation == sliceRequestGeneration, !isLocalSource, !isShuttingDown else { return }
                guard libraryGeneration == librarySourceGeneration else {
                    applyFavoriteItems(isFirstLoad: isFirstLoad)
                    return
                }
                commitFavoriteSource(ids, isFirstLoad: isFirstLoad)
            } catch { librarySaveFailure("加载收藏", error: error) }
        }
    }

    private func commitFavoriteSource(_ ids: [Int], isFirstLoad: Bool) {
        guard !ids.isEmpty else { return }
        isFavoritesFilter = true
        selectedCategoryID = preferences.selectedCategoryID
        if !preferences.playFavorites {
            preferences.playFavorites = true
            persistPreferences("内容过滤：收藏")
        }
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        pendingRestore.removeAll()
        notice = nil
        consumePendingSourceNotice()
        pool.order = preferences.playbackOrder
        pool.excludedIDs = disabledItemIDs
        pool.setIDs(ids)

        if isFirstLoad && !isPinned {
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: favoriteItemIDs
            )
        }
        let mode = isPinned ? "固定" : preferences.playbackOrder.label
        log("内容：收藏（\(pool.totalCount) 条），选片顺序：\(mode)")
        refreshStatusItem()
        guard !isPinned else {
            applyPinToMissingSlots()
            return
        }
        cancelFavoriteRotationLoads()
        scheduleTimer?.invalidate()
        scheduleTimer = nil
        advance()
    }

    /// 不打断已在播放的画面；更新下一次轮换候选，并取消尚未完成的旧选片。
    /// 返回 true 表示收藏已清空，需要恢复普通分类。
    func updateFavoritePlaybackItems() -> Bool {
        guard isFavoritesFilter, !isLocalSource else { return false }
        pendingRestore.removeAll()
        let hadPendingLoads = !loadTasksBySlot.isEmpty
        if !isPinned { cancelFavoriteRotationLoads() }
        guard !favoriteItemIDs.isEmpty else {
            sliceRequestGeneration += 1
            preferences.playFavorites = false
            persistPreferences("收藏清空")
            isFavoritesFilter = false
            if !isPinned {
                scheduleTimer?.invalidate()
                scheduleTimer = nil
            }
            return true
        }
        if !isPinned && (hadPendingLoads || engine.slotKeys().contains(where: { engine.item(on: $0) == nil })) {
            advance()
        }
        return false
    }

    func restoreFilterAfterEmptyFavorites() {
        log("收藏已清空，恢复原内容过滤")
        notice = .info("收藏已清空，正在恢复原内容过滤…")
        refreshStatusItem()
        if index != nil {
            loadSelectedCatalogItems(service: makeCatalogService(), requested: preferences.selectedCategoryID)
        } else {
            loadCatalogAndStart()
        }
    }

    /// 槽位中已播放的内容继续保留，取消中的任务由代次校验阻止迟到覆盖。
    private func cancelFavoriteRotationLoads() {
        for key in loadTasksBySlot.keys {
            loadTasksBySlot[key]?.cancel()
            loadGenerationBySlot[key] = (loadGenerationBySlot[key] ?? 0) + 1
        }
        loadTasksBySlot.removeAll()
        loadingItemIDsBySlot.removeAll()
        updateMenuBarIconAnimation()
    }
}
