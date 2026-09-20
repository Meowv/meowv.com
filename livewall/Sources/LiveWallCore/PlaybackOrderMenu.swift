/// 「选片顺序」子菜单的内容。与 `CategoryMenu` / `AboutMenu` 同一定位：
/// 只产出数据、不碰 `NSMenu`，这样标题、顺序、置灰与勾选规则能脱离 GUI 单测。
///
/// ## 为什么「固定」在这里而不是 `PlaybackOrder` 的第三个 case
///
/// 见 `PinnedPlayback` 的注释：`CandidatePool` 不感知固定，固定是正交状态。
/// 因此「固定」这一行是**派生显示** —— `pinnedItem != nil` 时勾选它，
/// 而 `order` 仍然是 `shuffle` / `sequential` 之一，天然提供「解钉后恢复哪个顺序」。
/// 父项标题同理：固定态下显示 `选片顺序（固定）`，解钉后自动变回
/// `选片顺序（随机）` / `选片顺序（顺序）`，**不另存任何布尔量**。
public enum PlaybackOrderMenu {

    /// 一行对应的动作。
    public enum Kind: Equatable, Sendable {
        /// 随机 / 顺序：写进 `Preferences.playbackOrder`，同时**解钉**（解钉触发点 3）。
        case order(PlaybackOrder)
        /// 固定：把当前正在播的那条固定为桌面壁纸（幂等，已固定时再点无副作用）。
        case pin
    }

    /// 子菜单的一行。
    public struct Entry: Equatable, Sendable {
        public let kind: Kind
        public let title: String
        /// 置灰不可点。
        ///
        /// 「固定」行的置灰条件是**当前没有正在播放的条目** —— 菜单里没有可点的东西时
        /// 置灰，而不是让人点了之后收到一句「当前没有正在播放的壁纸」（`AGENTS.md` 的
        /// 既有取舍：能做主的就置灰，不靠提示补救）。
        public let isEnabled: Bool
        /// 是否勾选。
        public let isSelected: Bool

        public init(kind: Kind, title: String, isEnabled: Bool, isSelected: Bool) {
            self.kind = kind
            self.title = title
            self.isEnabled = isEnabled
            self.isSelected = isSelected
        }
    }

    /// 「固定」行的标题。说明直接写进标题 —— 与随机/顺序两行保持一致的口径。
    public static let pinTitle = "固定（只播当前这条，所有屏都不再轮换）"

    /// 子菜单的行，自上而下：随机 → 顺序 → 固定。
    ///
    /// - Parameters:
    ///   - order: 当前选片顺序（只有两值）。
    ///   - isPinned: 是否处于固定态。为 `true` 时随机/顺序两行**都不勾选**，
    ///     勾选落在固定行上 —— 这是「固定是派生显示」的直接体现。
    ///   - canPinCurrent: 当前是否有正在播放的条目可供固定。
    public static func entries(
        order: PlaybackOrder,
        isPinned: Bool,
        canPinCurrent: Bool
    ) -> [Entry] {
        PlaybackOrder.allCases.map { candidate in
            Entry(
                kind: .order(candidate),
                title: candidate.menuTitle,
                isEnabled: true,
                // 固定态下两个顺序行都不勾：此时画面与 order 无关，
                // 勾上任何一行都会让人以为「现在播的是这个顺序挑出来的」。
                isSelected: !isPinned && candidate == order
            )
        } + [
            Entry(
                kind: .pin,
                title: pinTitle,
                isEnabled: canPinCurrent,
                isSelected: isPinned
            )
        ]
    }

    /// 父项标题。括号里**只放值**，与 `CategoryMenu.rootTitle` 的口径一致。
    public static func rootTitle(order: PlaybackOrder, isPinned: Bool) -> String {
        "选片顺序（\(isPinned ? "固定" : order.label)）"
    }
}
