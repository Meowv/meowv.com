import Foundation

/// 一次「锁屏该显示什么」的完整签名。
///
/// 三项里任何一项变了都要重写系统墙纸：换片、目标屏变化、清单里的静态图地址变化。
/// 三项都没变就不该重复写 —— 同一张图反复设墙纸纯属浪费，还会触发系统墙纸的过渡动画。
public struct PreviewSignature: Equatable, Sendable {
    public let itemID: Int
    /// 已排序，保证「同一组屏幕」不因顺序不同被判成变化。
    public let displayIDs: [UInt32]
    /// 清单里的静态图地址（可能为 nil）。
    public let coverURL: String?

    public init(itemID: Int, displayIDs: [UInt32], coverURL: String?) {
        self.itemID = itemID
        self.displayIDs = displayIDs.sorted()
        self.coverURL = coverURL
    }
}

/// 本次实际写进系统墙纸的是哪张图。
public enum CoverSource: Equatable, Sendable {
    /// 清单里的静态图（下载成功）。
    case remote
    /// 抓当前播放帧。
    case frame
    /// 两者都不行 —— 保持系统墙纸不动，不要清空它。
    case none
}

/// 锁屏预览的纯逻辑：写入节流、缓存文件名槽位、目标屏、来源决策。
///
/// 所有系统调用（下载、抓帧、设墙纸）都在 `LiveWall` 那一侧，这里只做判定 ——
/// 这样「什么时候写、写哪张、写到哪些屏」可以脱离 GUI 穷举验证。
public struct LockScreenPreviewPolicy: Equatable, Sendable {

    /// 缓存文件名的槽位数。**两个槽位交替**：同一路径重复设置系统墙纸不一定触发刷新
    /// （系统按 URL 判断内容是否变化），换个文件名最省事。
    public static let slotCount = 2

    /// 签名**没变**时的最小重写间隔。
    ///
    /// 签名变了（换片 / 换屏 / 静态图地址变了）一律立刻写；这个间隔只用来挡住
    /// 「短时间内反复触发」，例如屏幕参数抖动引起的连续窗口重建。
    public let minimumInterval: TimeInterval

    public init(minimumInterval: TimeInterval = 60) {
        self.minimumInterval = minimumInterval
    }

    /// 是否需要写入。
    public func shouldWrite(
        previous: PreviewSignature?,
        next: PreviewSignature,
        now: Date,
        lastWriteAt: Date?
    ) -> Bool {
        guard let previous else { return true }
        if previous != next { return true }
        guard let lastWriteAt else { return true }
        return now.timeIntervalSince(lastWriteAt) >= minimumInterval
    }

    /// 缓存文件名，形如 `cover-0.jpg` / `cover-1.png`。
    ///
    /// 扩展名由调用方给出而**不在这里硬编码**：静态图实测有 `.jpg` 也有 `.png`，
    /// 抓帧则统一是 JPEG。
    public func cacheFileName(generation: Int, fileExtension: String) -> String {
        let count = Self.slotCount
        let slot = ((generation % count) + count) % count
        let ext = fileExtension.isEmpty ? "jpg" : fileExtension
        return "cover-\(slot).\(ext)"
    }

    /// 目标屏。复用多屏策略的语义：镜像与每屏独立都覆盖全部目标屏，
    /// 「仅主屏」只写主屏 —— 否则副屏会顶着一张不属于它的静态图。
    public func targetDisplayIDs(
        policy: MultiScreenPolicy,
        screens: [ScreenIdentity]
    ) -> [UInt32] {
        policy.targetScreens(from: screens).map(\.displayID)
    }

    /// 决定本次写哪张图。静态图优先，抓帧只作兜底。
    public func decide(coverDownloadSucceeded: Bool, frameAvailable: Bool) -> CoverSource {
        if coverDownloadSucceeded { return .remote }
        return frameAvailable ? .frame : .none
    }
}
