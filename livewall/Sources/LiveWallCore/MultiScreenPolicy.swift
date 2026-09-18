import Foundation

/// 多屏策略。
///
/// 三种策略的差别不只是「显示什么」，还包括**解码与流量的量级**：
/// 镜像只解一份，每屏独立则按屏数翻倍（实测单屏 288 次/天 ≈ 1.9 GB/天）。
public enum MultiScreenPolicy: String, Codable, Sendable, CaseIterable {
    /// 所有屏幕显示同一张。共用一个播放器，只解一份 —— 最省资源，也是默认。
    case mirror
    /// 只在主屏播放，其余屏幕保留系统壁纸。
    case mainScreenOnly
    /// 每块屏各自取片。观感最丰富，但流量与解码开销按屏数翻倍。
    case perScreen

    public var label: String {
        switch self {
        case .mirror: return "全部同片"
        case .mainScreenOnly: return "仅主屏"
        case .perScreen: return "每屏独立"
        }
    }

    /// 菜单里跟在选项后面的说明。流量差异必须写出来 —— 这是用户选择时唯一要权衡的东西。
    public var detail: String {
        switch self {
        case .mirror: return "所有屏幕同一张，共用一个播放器"
        case .mainScreenOnly: return "只在主屏播放，其余屏保留系统壁纸"
        case .perScreen: return "每块屏各自取片，流量与解码按屏数翻倍"
        }
    }

    /// 是否已落地。
    ///
    /// `perScreen` 需要「每屏一个独立播放槽位」（各自的播放器、候选池、调度定时器），
    /// 而当前 App 是单槽位结构，尚未改造。菜单只列已实现的 —— 否则用户会选到一个
    /// 与「全部同片」表现完全一样的选项，还以为功能坏了。
    public var isImplemented: Bool {
        self != .perScreen
    }

    /// 该策略下需要几个独立播放槽位。
    ///
    /// 镜像与仅主屏都只需要 1 个（窗口可以共用同一个 `AVPlayer`），
    /// 每屏独立则需要与屏幕数相同的数量。
    public func slotCount(screenCount: Int) -> Int {
        switch self {
        case .mirror, .mainScreenOnly:
            return screenCount > 0 ? 1 : 0
        case .perScreen:
            return max(0, screenCount)
        }
    }

    /// 该策略下要建窗口的屏幕。
    ///
    /// **不用 `NSScreen.main`**：它返回的是「当前键盘焦点所在的屏幕」，会随用户拖窗口
    /// 而漂移 —— 用它做「仅主屏」会导致窗口建到副屏上。主屏应当是列表第一项
    /// （macOS 文档：`screens[0]` 是含菜单栏的那块）。
    public func targetScreens(from screens: [ScreenIdentity]) -> [ScreenIdentity] {
        switch self {
        case .mirror, .perScreen:
            return screens
        case .mainScreenOnly:
            return screens.first.map { [$0] } ?? []
        }
    }
}

/// 屏幕的最小标识。抽出来是为了让 `targetScreens` 能脱离 AppKit 单测 ——
/// `NSScreen` 在无 GUI 的测试进程里取不到。
public struct ScreenIdentity: Equatable, Sendable {
    /// `NSScreenNumber` 对应的显示 ID。
    public let displayID: UInt32
    /// 该屏在 `NSScreen.screens` 中的位置，0 = 主屏。
    public let index: Int

    public init(displayID: UInt32, index: Int) {
        self.displayID = displayID
        self.index = index
    }
}
