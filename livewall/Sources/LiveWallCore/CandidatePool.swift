import Foundation

/// 候选池：保证「一轮之内不重复」，并支持把失效条目拉黑。
///
/// 工作方式是把整个候选集打乱后逐个取出，取空再重排。这样比「每次随机抽一条、
/// 抽到重复就重抽」更可预期：一轮的长度恒等于可用条目数，不会出现连续抽到同一条。
public struct CandidatePool {

    /// 全量候选（未过滤）。
    private var allItems: [WallpaperItem] = []
    /// 过滤后的候选（未经打乱）。
    private var source: [WallpaperItem] = []
    /// 待取队列。
    private var queue: [WallpaperItem] = []
    /// 失效条目的 id（CDN 404 / 解码失败等）。
    private var blacklist: Set<Int> = []

    /// 内容过滤。改动会立即重建候选集并清空待取队列 ——
    /// 队列里可能还有被过滤掉的条目，不清就会在切换时「漏」出来。
    /// 黑名单**不清**：那是「资源失效」的记录，与用户选了什么无关。
    public var filter: CandidateFilter = CandidateFilter() {
        didSet {
            guard filter != oldValue else { return }
            rebuildSource()
        }
    }

    /// 当前正在播放的条目 id，重排时会被排除，避免刚切走又切回来。
    public private(set) var currentID: Int?
    /// 黑名单重置次数。> 0 说明出现过「全部候选都失效」并已自动重试一轮。
    public private(set) var blacklistResetCount = 0

    /// 全量候选的作者选项（按条目数降序）。在 `setItems` 时算好 —— 菜单每次重建
    /// 都会读它，不该每次重新遍历 2,600 条。
    public private(set) var authorOptions: [FilterOption] = []

    public init(items: [WallpaperItem] = [], filter: CandidateFilter = CandidateFilter()) {
        self.filter = filter
        setItems(items)
    }

    /// 替换候选集。会清空待取队列，但保留黑名单、过滤条件与当前播放项。
    public mutating func setItems(_ items: [WallpaperItem]) {
        allItems = items
        authorOptions = FilterOptions.authors(from: items)
        rebuildSource()
    }

    /// 按当前过滤条件重建候选集，并清空待取队列（下一次 `next()` 会重新洗牌）。
    private mutating func rebuildSource() {
        source = filter.apply(to: allItems)
        queue = []
    }

    /// 清单里的全部条目数（过滤前）。
    public var catalogCount: Int { allItems.count }

    /// 被过滤掉的条目数。
    public var filteredOutCount: Int { allItems.count - source.count }

    public var totalCount: Int { source.count }

    public var availableCount: Int {
        source.filter { !blacklist.contains($0.id) }.count
    }

    public var blacklistedCount: Int { blacklist.count }

    public var isExhausted: Bool {
        source.isEmpty || availableCount == 0
    }

    /// 标记某条失效。若它正排在待取队列里，一并移除。
    public mutating func blacklist(id: Int) {
        blacklist.insert(id)
        queue.removeAll { $0.id == id }
    }

    /// 取下一个候选。队列空时自动重排。
    ///
    /// 返回 nil 只有一种情况：候选集本身为空。
    public mutating func next<G: RandomNumberGenerator>(using generator: inout G) -> WallpaperItem? {
        if queue.isEmpty {
            refill(using: &generator)
        }
        guard !queue.isEmpty else { return nil }
        let item = queue.removeFirst()
        currentID = item.id
        return item
    }

    public mutating func next() -> WallpaperItem? {
        var generator = SystemRandomNumberGenerator()
        return next(using: &generator)
    }

    /// 重排待取队列。
    public mutating func refill<G: RandomNumberGenerator>(using generator: inout G) {
        var pool = source.filter { !blacklist.contains($0.id) }

        // 黑名单覆盖了全部候选 —— 说明清单整体失效（例如 CDN 换域名），
        // 清空黑名单重试一轮，总好过彻底停摆。
        if pool.isEmpty && !blacklist.isEmpty {
            blacklist.removeAll()
            blacklistResetCount += 1
            pool = source
        }

        // 只剩一条时不能把它排除掉，否则永远取不出东西
        if pool.count > 1, let currentID {
            pool.removeAll { $0.id == currentID }
        }

        pool.shuffle(using: &generator)
        queue = pool
    }

    public mutating func refill() {
        var generator = SystemRandomNumberGenerator()
        refill(using: &generator)
    }

    /// 待取队列的剩余长度，用于诊断。
    public var pendingCount: Int { queue.count }
}
