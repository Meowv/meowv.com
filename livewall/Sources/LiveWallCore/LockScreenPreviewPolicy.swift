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

    /// 同上，但**避开** `previousName`：算出来跟上次写入同名就顺延一个槽位。
    ///
    /// 退出固化会用到：那时可能刚换片、当前张的静态图还没写过，只能抓帧补一张，
    /// 而抓帧恰好轮到与「上一张」相同的文件名 —— 系统按 URL 判断内容是否变化，
    /// 同路径重复设置不一定触发刷新，于是桌面看不出换过图。
    public func cacheFileName(
        generation: Int,
        fileExtension: String,
        avoiding previousName: String?
    ) -> String {
        let first = cacheFileName(generation: generation, fileExtension: fileExtension)
        guard let previousName, first == previousName else { return first }
        return cacheFileName(generation: generation + 1, fileExtension: fileExtension)
    }

    /// `url` 是不是本 App 自己写进缓存目录的那张图。
    ///
    /// 用来分辨「用户真正的原墙纸」和「上一轮退出时留下的封面」—— 后者会被
    /// `NSWorkspace.desktopImageURL(for:)` 如实读回来，当成原墙纸记下就永远
    /// 恢复不到真原图了（关闭锁屏预览时尤其明显：恢复完还是 App 留下的那张）。
    public static func isOwnCacheFile(_ url: URL, cacheDirectory: URL) -> Bool {
        let path = url.standardizedFileURL.path
        let directory = cacheDirectory.standardizedFileURL.path
        let prefix = directory.hasSuffix("/") ? directory : directory + "/"
        return path.hasPrefix(prefix)
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

    /// 从「上一次写入的目标屏」到「这一次的目标屏」，**哪些屏被移除了**。
    ///
    /// 抽成纯函数是为了能单测：这一段原先长在 `LockScreenPreviewer.restoreRemovedDisplays`
    /// 里，而那个类型在 App target（测试 target 只依赖 `LiveWallCore`）——
    /// 于是「多屏策略从全部屏幕切到仅主屏时，副屏该不该恢复成用户原墙纸」
    /// 这条路径**一个断言都没有**。
    ///
    /// ⚠️ 被移除的屏要恢复成原墙纸，否则它会一直顶着一张不属于它的锁屏预览图。
    ///
    /// 边界：`lastDisplayIDs` 只在**写入成功后**更新，所以「第一次写入就失败」时它是空的，
    /// 那时不会有任何屏被判定为「被移除」→ 不恢复。这是既有行为、不是这里漏了：
    /// 没成功写过，就不存在「我们改过那块屏」这个前提。
    public static func removedDisplayIDs(previous: [UInt32], current: [UInt32]) -> Set<UInt32> {
        Set(previous).subtracting(current)
    }
}
