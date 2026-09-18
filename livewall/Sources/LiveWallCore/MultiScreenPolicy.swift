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

    /// 每屏独立模式下**最多**同时独立解码的屏幕数。
    ///
    /// 每多一块独立解码的屏就是多一路解码器加一份流量。超过这个数的屏幕
    /// 并进最后一个槽位（表现为镜像），避免接了 5 块屏的机器一开机就开 5 路解码。
    /// 默认 3 —— 覆盖绝大多数多屏配置；屏数更多时降级也只影响最后几块。
    public static let maxIndependentScreens = 3

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

    /// 把目标屏幕分组成若干播放槽位。
    ///
    /// 一个槽位 = 一路独立解码。镜像与仅主屏只有一个槽位（一组，组内可能多屏）；
    /// 每屏独立时一屏一组，但组数不超过 `maxIndependentScreens`，
    /// 超出的屏幕并进最后一组共用一路解码。
    ///
    /// **组的顺序就是主次顺序**：第 0 组是主屏所在组，状态区显示的就是它。
    public func slotPlan(from screens: [ScreenIdentity]) -> ScreenSlotPlan {
        let targets = targetScreens(from: screens)
        guard !targets.isEmpty else { return ScreenSlotPlan(slots: []) }

        switch self {
        case .mirror, .mainScreenOnly:
            return ScreenSlotPlan(slots: [targets])
        case .perScreen:
            let limit = max(1, Self.maxIndependentScreens)
            guard targets.count > limit else {
                return ScreenSlotPlan(slots: targets.map { [$0] })
            }
            // 前 limit-1 屏各自成组，剩下的（至少 2 屏）并进最后一组
            var slots = targets.prefix(limit - 1).map { [$0] }
            slots.append(Array(targets.dropFirst(limit - 1)))
            return ScreenSlotPlan(slots: slots)
        }
    }

    /// 该策略下需要几个独立播放槽位。
    ///
    /// 这是**未加上限**的理论值：每屏独立时等于屏幕数，但实际分配会受
    /// `maxIndependentScreens` 限制，真正的分组看 `slotPlan(from:)`。
    /// 镜像与仅主屏都只需要 1 个（窗口可以共用同一个 `AVPlayer`）。
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

/// 一次多屏部署的槽位分组结果。
///
/// 数组里每一项是一个槽位，槽位内是该槽位要覆盖的屏幕。
/// 组内多于一屏 = 这几屏共用一路解码（镜像）。
public struct ScreenSlotPlan: Equatable, Sendable {
    /// 槽位列表。顺序即主次：第 0 个是主槽位。
    public let slots: [[ScreenIdentity]]

    public init(slots: [[ScreenIdentity]]) {
        self.slots = slots
    }

    public var slotCount: Int { slots.count }

    /// 该槽位覆盖的屏幕数。> 1 表示这几屏共用一路解码。
    public func screenCount(inSlot index: Int) -> Int {
        guard slots.indices.contains(index) else { return 0 }
        return slots[index].count
    }

    /// 是否存在与其它屏共用解码的槽位。用于提示「有屏幕在复用别人的画面」。
    public var hasSharedSlot: Bool {
        slots.contains { $0.count > 1 }
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
