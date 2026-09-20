/// 每屏独立模式下，各屏幕「上次播的是哪一条」的记录。
///
/// **存条目 id 而不是 URL**：视频源是远程清单里的条目，CDN 路径里带日期目录，
/// 会随内容轮换而变。存 URL 的话下次启动多半指向一个已经 404 的地址，
/// 而条目 id 在同一份清单内是稳定的。
///
/// key 是 `displayID` 的字符串形式 —— JSON 的键只能是字符串。
public struct ScreenSourceStore: Codable, Sendable, Equatable {

    /// 最多记住多少块屏。
    ///
    /// 上限不是为了省空间（这点数据可以忽略），而是防止「换过很多台显示器」
    /// 之后这个字典无意义地增长。
    public static let maxEntries = 16

    /// displayID（字符串）→ 清单条目 id。
    private var sources: [String: Int]

    public static let empty = ScreenSourceStore()

    public init(sources: [String: Int] = [:]) {
        self.sources = sources
    }

    /// 记录的屏幕数。
    public var count: Int { sources.count }

    public func itemID(for displayID: UInt32) -> Int? {
        sources[String(displayID)]
    }

    /// 全部记录：displayID → 条目 id。
    ///
    /// 恢复时要遍历整张表而不是逐个 `itemID(for:)` —— 「这台机器有几块屏」在启动时
    /// 才知道，而表里可能还留着已经拔掉的屏（它们由 `prune` 在下次保存时清理）。
    /// 键解析不出 `UInt32` 的记录直接跳过（配置被手改过时可能这样）。
    public var entries: [UInt32: Int] {
        var result: [UInt32: Int] = [:]
        for (key, itemID) in sources {
            guard let displayID = UInt32(key) else { continue }
            result[displayID] = itemID
        }
        return result
    }

    public mutating func setItemID(_ itemID: Int, for displayID: UInt32) {
        sources[String(displayID)] = itemID
        trimToLimit()
    }

    /// 剔除已经不在当前屏幕列表里的记录，返回被剔除的条数。
    ///
    /// 显示器拔掉后它的 displayID 往往不会再出现，留着就是死数据；
    /// 而它指向的条目也可能已经从清单里消失。
    /// 拔了又插回来的情况不特殊照顾 —— macOS 可能给同一个 ID 也可能给新的，
    /// 记错了最多是「这块屏换了张壁纸」，比指向一个失效条目安全。
    @discardableResult
    public mutating func prune(keeping displayIDs: Set<UInt32>) -> Int {
        let before = sources.count
        let keep = Set(displayIDs.map(String.init))
        sources = sources.filter { keep.contains($0.key) }
        return before - sources.count
    }

    /// 超出上限时按 key 排序保留前 N 个。
    ///
    /// 取舍本身是任意的，但必须**确定** —— 否则同一份配置 prune 两次结果不同，
    /// 配置就会在每次保存时抖动。
    private mutating func trimToLimit() {
        guard sources.count > Self.maxEntries else { return }
        let kept = Set(sources.keys.sorted().prefix(Self.maxEntries))
        sources = sources.filter { kept.contains($0.key) }
    }
}
