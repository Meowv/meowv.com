/// 「固定为桌面壁纸」状态机的**纯逻辑**部分。
///
/// ## 为什么「固定」不是第三种 `PlaybackOrder`
///
/// 这是本次改造里最容易走错的一步。`CandidatePool.next()` 完全不读 `order`，
/// `refill()` 里 `order` 的分支是非穷举 `if` —— 给 `PlaybackOrder` 加第三个 case 后，
/// `next()` 照常取片、`refill()` 静默落到「按 source 原序」，**固定根本拦不住**，
/// 而三个穷举 switch 还会先编译报错。所以：
///
/// - `PlaybackOrder` 保持 `shuffle` / `sequential` 两值不变；
/// - 固定是**正交于选片顺序**的一层状态，由 `AppDelegate` 在候选池**之上**拦截；
/// - 好处是 `order` 仍然只有一个含义（解钉后恢复哪个顺序），不需要第三个值。
///
/// ## 这个文件的职责
///
/// 把「哪个驱动事件 + 当前是否固定」映射成「该做什么」。`PinDriveEvent` 是**穷举**的 ——
/// 以后新增旁路驱动点必须来这里加 case，这样「漏了一个旁路」会变成编译错误或测试失败，
/// 而不是画面被悄悄换走（那是这类 bug 最典型的形态）。
public enum PinDriveEvent: Equatable, Sendable, CaseIterable {
    /// 轮换定时器到点，或全局切换请求。`advance()` 的主要入口，
    /// 同时覆盖「网络恢复」「holdCurrent 重试」「scheduleRecoveryAttempt」等旁路。
    case scheduledAdvance
    /// 网络恢复后的补片（`NetworkMonitor.onChange`）。
    case networkRestored
    /// 恢复播放且引擎为空（`applyPlaybackState(.playing)` 的 `engine.isEmpty` 分支）。
    case resumeWithEmptyEngine
    /// 新增槽位：屏幕热插拔、多屏策略切换、唤醒重建。
    case newSlotAdded
    /// 切片加载成功（`applySliceResult`）。
    case sliceApplied
    /// 槽位补片（`advanceOne`）—— 正常轮换与拉黑后补片都走这里。
    case slotRecovery
    /// 播放中途失败后的补片。
    case playbackFailureRecovery
    /// 用户主动解钉：菜单「下一张」、⌥⌘N 热键、选片顺序里选「随机」或「顺序」。
    /// **这是唯一的解钉出口**（决策 11：UI 里只标记当前壁纸，不提供取消固定按钮）。
    case userRequestedUnpin
}

/// 固定态下对一个驱动事件的裁决。
public enum PinResolution: Equatable, Sendable {
    /// 什么都不做，画面不动。
    case hold
    /// 用固定项补满缺片的槽位（幂等：已铺满就是 no-op）。
    case reapplyPin
    /// 不固定（或本来就没固定），按原逻辑正常取片。
    case unpinAndAdvance
}

public enum PinnedPlayback {

    /// 裁决一个驱动事件。
    ///
    /// 判定表（`pinnedItem == nil` 时**一律** `.unpinAndAdvance`）：
    ///
    /// | event | 固定态下 |
    /// | --- | --- |
    /// | `.userRequestedUnpin` | `.unpinAndAdvance` |
    /// | `.newSlotAdded` / `.resumeWithEmptyEngine` / `.sliceApplied` | `.reapplyPin` |
    /// | 其余（定时器、网络恢复、槽位补片、失败补片） | `.hold` |
    ///
    /// 关键区别在最后两行：**「定时器到点」必须 `.hold`**（固定就是不再轮换），
    /// 而**「引擎空了」必须 `.reapplyPin`**（否则固定态下遇到空引擎会一直黑着）。
    public static func resolve(pinnedItem: WallpaperItem?, event: PinDriveEvent) -> PinResolution {
        guard pinnedItem != nil else { return .unpinAndAdvance }
        switch event {
        case .userRequestedUnpin:
            return .unpinAndAdvance
        case .newSlotAdded, .resumeWithEmptyEngine, .sliceApplied:
            return .reapplyPin
        case .scheduledAdvance, .networkRestored, .slotRecovery, .playbackFailureRecovery:
            return .hold
        }
    }

    /// 固定项的播放地址是否可用。
    ///
    /// 判定复用 `WallpaperItem.remoteURL` 的既有校验（空串 / 非 http(s) 一律非法），
    /// **不另写一套规则** —— 配置里手改过的 `pinnedItem` 与清单里的条目必须同一口径，
    /// 否则会出现「菜单显示已固定、实际播不出来」。
    public static func isPlayable(_ item: WallpaperItem) -> Bool {
        item.remoteURL != nil
    }
}
