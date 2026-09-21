import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

// MARK: - 浏览窗口的数据出口

/// 浏览窗口只通过这五个成员与 App 交互 —— 不把 `AppDelegate` 的四十来个私有成员
/// 暴露给它，也不给它第二套分类 / 固定状态的读法。
extension AppDelegate: WallpaperBrowserDataSource {

    var browserCategories: [LivewallCategoryEntry] { categories }

    var browserSelectedCategoryID: Int? { selectedCategoryID }

    /// 固定项的 id。UI 只**标记**它，不提供取消固定的入口（决策 11）。
    var browserPinnedItemID: Int? { preferences.pinnedItem?.id }

    /// 拉取某个分类的条目给浏览窗口。
    ///
    /// **复用 `CatalogService.loadSlice`，但绝不调 `cacheSlice` / `loadIndex`**：
    /// `sliceCacheURL` 只有一份，是播放的离线兜底。浏览窗口是第一个只读调用方，
    /// 一旦让它写缓存，离线启动就会读到「用户随手翻过的那个分类」，
    /// 而不是「上次真正在播的那个」。
    ///
    /// 已知限制（写进文档）：离线时 `loadSlice` 会回退读共享切片缓存，而
    /// `tryDecodeSlice` 的归属校验（`source.categoryIds.contains(entry.id)`）会返回 nil
    /// —— 于是**离线时只能浏览当前播放分类的条目**，其它分类显示「加载失败」。
    /// 不会显示错分类。
    func browserLoadItems(
        for categoryID: Int,
        completion: @escaping @MainActor @Sendable (Result<[WallpaperItem], BrowserLoadFailure>) ->
            Void
    ) {
        guard let entry = categories.first(where: { $0.id == categoryID }) else {
            completion(.failure(BrowserLoadFailure(message: "分类不存在（清单可能已经更新）")))
            return
        }
        let service = makeCatalogService()
        DispatchQueue.global(qos: .userInitiated).async {
            let result = service.loadSlice(entry)
            // 回跳用 `Task { @MainActor }` 而不是 `DispatchQueue.main.async`：
            // 后者在 Swift 6 下也能推断出主 actor 隔离，但 `Task` 是项目里统一的回跳写法，
            // 且不会与「主队列是否被 run loop 抽干」这类隐式前提纠缠。
            Task { @MainActor in
                guard let catalog = result.catalog else {
                    completion(
                        .failure(
                            BrowserLoadFailure(
                                message: result.warnings.first ?? "远程与本地副本都不可用"
                            )))
                    return
                }
                completion(.success(catalog.items))
            }
        }
    }

    /// 设为桌面壁纸。与菜单「固定」行走**同一条落实路径**。
    func browserSetPinned(_ item: WallpaperItem, categoryID: Int) {
        setPinned(item, categoryID: categoryID)
    }
}

