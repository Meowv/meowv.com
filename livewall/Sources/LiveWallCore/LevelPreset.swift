import CoreGraphics
import Foundation

/// 候选窗口层级。数值全部由 `CGWindowLevelForKey` 派生，不硬编码魔数 ——
/// 不同 macOS 版本的实际值不同，硬编码会在系统升级后静默失效。
///
/// 实测基线（macOS 26.6.2 / 双屏，来自本机正在运行的 Dynamic Wallpaper）：
///   CGWindowLevelForKey(.desktopWindow)     = -2147483623
///   CGWindowLevelForKey(.desktopIconWindow) = -2147483603
///   系统壁纸进程「墙纸」实际占用             = -2147483625
///   Dynamic Wallpaper 实际使用               = -2147483623  ← 等于 .desktopWindow
///
/// 有效区间是 (系统壁纸层, 图标层) 开区间，本机为 (-2147483625, -2147483603)，共 21 层。
public enum LevelPreset: String, CaseIterable, Codable, Sendable {
    case desktopWindow
    case desktopWindowPlus1
    case desktopWindowPlus2
    case iconMinus1
    case iconMinus2
    case iconAboveGap1
    case iconAboveGap2

    /// 推荐基线：与商业实现一致，且绑定「桌面窗口层」这个语义，
    /// 比「图标层 -1」更不容易受图标层变动影响。
    public static let recommended: LevelPreset = .desktopWindow

    /// 基线失效时的降级候选，按顺序尝试。
    public static let fallbackOrder: [LevelPreset] = [.desktopWindow, .iconMinus1, .desktopWindowPlus1, .iconMinus2]

    public var label: String {
        switch self {
        case .desktopWindow: return "桌面窗口层 (推荐基线)"
        case .desktopWindowPlus1: return "桌面窗口层 +1"
        case .desktopWindowPlus2: return "桌面窗口层 +2"
        case .iconMinus1: return "图标层 -1 (理论值)"
        case .iconMinus2: return "图标层 -2"
        case .iconAboveGap1: return "图标层 +1 (覆盖图标)"
        case .iconAboveGap2: return "图标层 +2 (覆盖图标·越过 WindowServer)"
        }
    }

    public var shortLabel: String {
        switch self {
        case .desktopWindow: return "desktopWindow"
        case .desktopWindowPlus1: return "desktopWindow+1"
        case .desktopWindowPlus2: return "desktopWindow+2"
        case .iconMinus1: return "icon-1"
        case .iconMinus2: return "icon-2"
        case .iconAboveGap1: return "icon+1"
        case .iconAboveGap2: return "icon+2"
        }
    }

    /// 相对 CGWindowLevelForKey 的偏移表达式，用于报告里自证来源。
    public var derivation: String {
        switch self {
        case .desktopWindow: return "CGWindowLevelForKey(.desktopWindow)"
        case .desktopWindowPlus1: return "CGWindowLevelForKey(.desktopWindow) + 1"
        case .desktopWindowPlus2: return "CGWindowLevelForKey(.desktopWindow) + 2"
        case .iconMinus1: return "CGWindowLevelForKey(.desktopIconWindow) - 1"
        case .iconMinus2: return "CGWindowLevelForKey(.desktopIconWindow) - 2"
        case .iconAboveGap1: return "CGWindowLevelForKey(.desktopIconWindow) + 1"
        case .iconAboveGap2: return "CGWindowLevelForKey(.desktopIconWindow) + 2"
        }
    }

    /// 该预设是否会盖住桌面图标（用于「专注模式」这类功能）。
    public var coversDesktopIcons: Bool {
        self == .iconAboveGap1 || self == .iconAboveGap2
    }

    public var level: Int {
        let desktop = Int(CGWindowLevelForKey(.desktopWindow))
        let icon = Int(CGWindowLevelForKey(.desktopIconWindow))
        switch self {
        case .desktopWindow: return desktop
        case .desktopWindowPlus1: return desktop + 1
        case .desktopWindowPlus2: return desktop + 2
        case .iconMinus1: return icon - 1
        case .iconMinus2: return icon - 2
        case .iconAboveGap1: return icon + 1
        case .iconAboveGap2: return icon + 2
        }
    }
}

/// 层级判定的有效区间。左开右开：必须严格在系统壁纸层之上、图标层之下。
public struct LevelBand: Equatable, Sendable {
    public let lowerBoundExclusive: Int
    public let upperBoundExclusive: Int

    public init(desktopLevel: Int, iconLevel: Int) {
        // 系统壁纸实测位于 desktopWindow - 2，这里保守取 desktopWindow - 2 作为下界
        self.lowerBoundExclusive = desktopLevel - 2
        self.upperBoundExclusive = iconLevel
    }

    public init() {
        self.init(
            desktopLevel: Int(CGWindowLevelForKey(.desktopWindow)),
            iconLevel: Int(CGWindowLevelForKey(.desktopIconWindow))
        )
    }

    public func contains(_ level: Int) -> Bool {
        level > lowerBoundExclusive && level < upperBoundExclusive
    }

    public var width: Int { upperBoundExclusive - lowerBoundExclusive - 1 }
}
