import AppKit
import LiveWallCore

extension AppDelegate {
    func beginLibraryMutation() -> Bool {
        guard libraryReady, !isShuttingDown else {
            notice = .warning("壁纸条目库尚未准备好")
            refreshStatusItem()
            return false
        }
        guard !libraryMutationPending else { return false }
        libraryMutationPending = true
        browserWindowController?.refreshPinState()
        refreshStatusItem()
        return true
    }

    func finishLibraryMutation() {
        libraryMutationPending = false
        libraryMutationTask = nil
        browserWindowController?.refreshDisabledState()
        refreshStatusItem()
    }

    func applyLibraryChange(_ change: WallpaperLibraryStore.Change) {
        if let id = change.id {
            if change.isFavorite { favoriteItemIDs.insert(id) } else { favoriteItemIDs.remove(id) }
            if change.isDisabled { disabledItemIDsCache.insert(id) } else { disabledItemIDsCache.remove(id) }
            if !isLocalSource { pool.setExcluded(id: id, excluded: change.isDisabled) }
            if isFavoritesFilter, !isLocalSource { pool.updateID(id, present: change.isFavorite) }
        }
        if pinnedLibraryItem != change.pinned {
            pinApplyTask?.cancel()
            pinApplyTask = nil
            pinApplyGeneration &+= 1
            isPinApplyInFlight = false
        }
        let wasPinned = isPinned
        pinnedLibraryItem = change.pinned
        if wasPinned && !isPinned { didClearPin(reason: nil) }
        librarySourceGeneration &+= 1
    }

    func librarySaveFailure(_ context: String, error: Error) {
        let message = "\(context)未能保存：\(AppLog.sanitize(error.localizedDescription))"
        browserWindowController?.showLibraryFailure(message)
        notice = .warning(message)
        log("⚠️ \(message)")
        refreshStatusItem()
    }
}
