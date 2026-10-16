import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

// MARK: - 菜单项的实际可用性

/// 菜单项的**实际**可用性由这里决定，而不是 `buildXxxMenu` 里写的 `isEnabled`。
///
/// ## 为什么
///
/// `NSMenu.autoenablesItems` 默认为 `true`：菜单展开时，**带 target/action 的项**会被
/// AppKit 重新校验一遍；没实现 `NSMenuItemValidation` 时，判定退化成「target 能不能响应
/// 这个 action」，于是构建时写的 `isEnabled = false` **被静默覆盖**。
/// 实测（2026-09-21）：本地来源下「打开动态壁纸」看起来仍可点，点了才被守卫拦下 ——
/// 用户看到的是「点了没反应」，比一开始就置灰更糟。
///
/// 同一个坑此前还悄悄影响另外五处：`下载当前壁纸`（没有可下载条目时）、`固定`（没有正在
/// 播的条目时）、`内容过滤`（条目数为 0 的分类）、`空闲阈值`（总开关关着时）、
/// `检查更新`（`updateState` 说不可点时）。它们当时**都没有真正置灰**。
///
/// ## 约定
///
/// - 带 action 的项：判据写在这里，`buildXxxMenu` 里**不要再写 `isEnabled`**（写了不生效，
///   只会让人以为改那里就够了）。
/// - `action: nil` 的说明行（状态区、更新详情、`关于` 里的信息行）不受影响 ——
///   它们的 target 是 nil，不会被自动校验碰到，仍在构建时置灰。
extension AppDelegate: NSMenuItemValidation {

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(openDebugDirectory(_:)), #selector(dumpWindows):
            return preferences.developerToolsEnabled

        case #selector(openWallpaperBrowser):
            // 本地来源下不可用：那个窗口列的是线上分类的条目。
            return libraryReady && WallpaperSourceMenu.isEnabled(.wallpaperBrowser, isLocalSource: isLocalSource)

        case #selector(downloadCurrentWallpaper):
            // 本地来源下没有可下载的东西；下载中、或当前没有在播的条目时同样不可点。
            return WallpaperSourceMenu.isEnabled(.downloadCurrent, isLocalSource: isLocalSource)
                && !downloader.isDownloading
                && currentDownloadableItem != nil

        case #selector(toggleCurrentFavorite):
            return libraryReady && !libraryMutationPending && currentFavoriteableItem != nil

        case #selector(toggleCurrentDisabled):
            return libraryReady && !libraryMutationPending && currentFavoriteableItem != nil

        case #selector(nextNow), #selector(switchPlaybackOrder(_:)):
            return libraryReady && !libraryMutationPending

        case #selector(selectFavorites):
            return !isLocalSource && !favoriteItemIDs.isEmpty

        case #selector(selectCategory(_:)):
            // 本地来源下没有分类；条目数为 0 的分类本来就该置灰（可点会进空池）。
            // 「0 条置灰」的判据复用 `CategoryMenu.entries` 这个已单测的纯函数，
            // 不在这里另写一遍 `itemCount > 0`（同一条规则写两处，迟早会漂移）。
            guard WallpaperSourceMenu.isEnabled(.categoryFilter, isLocalSource: isLocalSource)
            else { return false }
            let id = menuItem.representedObject as? Int
            return CategoryMenu.entries(
                categories: categories,
                selectedID: selectedCategoryID,
                allEnabled: (index?.allSlice?.itemCount ?? 0) > 0
            ).first { $0.id == id }?.isEnabled ?? false

        case #selector(pinCurrentItem):
            // 当前没有正在播的条目时不可固定。已固定时仍可点（幂等）。
            return libraryReady && !libraryMutationPending && canPinCurrent && !(engine.primaryKey.flatMap { engine.item(on: $0) }
                .map { pool.excludedIDs.contains($0.id) } ?? false)

        case #selector(setIdleThreshold(_:)):
            // 「无操作时」总开关关着时，子项没有意义（置灰而不是隐藏，保留可发现性）。
            return preferences.pauseWhenIdle

        case #selector(startRestReminderNow):
            return canStartRestReminderNow

        case #selector(checkForUpdates):
            return updateState.checkItemEnabled

        default:
            // 其余带 action 的项没有额外条件。回落到构建时写的值：`action: nil` 的说明行
            // 若某天被自动校验碰到，也仍按「构建时置灰」处理，不会被误开。
            return menuItem.isEnabled
        }
    }
}
