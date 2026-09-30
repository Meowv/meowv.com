import Foundation

/// 「菜单栏图标该不该转」的输入信号。
///
/// 刻意做成**扁平结构体**，而不是让判定函数直接去读 `AppDelegate`：判定逻辑要能脱离
/// AppKit 穷举验证，而 `AppDelegate` 是 `@MainActor` 的，读一次就把测试绑死在 GUI 上。
///
/// 全部默认 `false`，测试里只需打开关心的那一个信号。
public struct MenuBarIconSignals: Equatable, Sendable {

    /// 配置开关（`Preferences.animateMenuBarIcon`）。总闸门。
    public var isEnabled: Bool
    /// 菜单当前是否展开。展开期间不动画。
    public var isMenuOpen: Bool
    /// 画面正在播放（① 播放即转）。
    public var isPlaying: Bool
    /// 正在下载当前壁纸（②）。
    public var isDownloading: Bool
    /// 正在检查更新（②）。
    public var isCheckingUpdate: Bool
    /// 有视频加载在飞 —— 即正在切换壁纸（②）。
    public var hasPendingLoads: Bool
    /// 正在把固定项铺满各槽位（②）。
    public var isPinApplying: Bool

    public init(
        isEnabled: Bool = false,
        isMenuOpen: Bool = false,
        isPlaying: Bool = false,
        isDownloading: Bool = false,
        isCheckingUpdate: Bool = false,
        hasPendingLoads: Bool = false,
        isPinApplying: Bool = false
    ) {
        self.isEnabled = isEnabled
        self.isMenuOpen = isMenuOpen
        self.isPlaying = isPlaying
        self.isDownloading = isDownloading
        self.isCheckingUpdate = isCheckingUpdate
        self.hasPendingLoads = hasPendingLoads
        self.isPinApplying = isPinApplying
    }
}

/// 菜单栏图标旋转的判定。
///
/// **唯一的生产调用点是 `AppDelegate.shouldRotateMenuBarIcon`。**
///
/// 判定表最怕的不是写错，而是「测试测的这一份、生产跑的是另一份」——
/// `PinnedPlayback.resolve` 就这么分叉过（测试全绿却毫无保证）。所以这里只留这一个
/// 纯函数，App 层**不得**再手写第二遍布尔组合，四个信号与两道闸门全部经结构体传入。
public enum MenuBarIconActivity {

    /// 是否应该让图标旋转。
    ///
    /// 两道闸门（配置开关、菜单展开）任一关闭就静止；否则只要有**一个**「在干活」的
    /// 信号为真就转。
    public static func shouldRotate(_ signals: MenuBarIconSignals) -> Bool {
        guard signals.isEnabled, !signals.isMenuOpen else { return false }
        return signals.isPlaying
            || signals.isDownloading
            || signals.isCheckingUpdate
            || signals.hasPendingLoads
            || signals.isPinApplying
    }
}
