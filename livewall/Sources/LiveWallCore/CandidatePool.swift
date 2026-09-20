/// 选片顺序。两种模式**都**满足两条共同性质：
///
/// 1. **一轮内不重复** —— 一轮的长度等于可用条目数（黑名单除外）；
/// 2. **走完一轮才重排** —— 不是「每次随机抽一条、抽到重复就重抽」，
///    所以不会出现连着两次抽到同一条。
///
/// 差别只在「一轮的排列怎么来」：随机是每轮重新洗牌，顺序是按清单原序。
public enum PlaybackOrder: String, Codable, Sendable, CaseIterable {
    /// 每轮把候选集重新打乱。
    case shuffle
    /// 按清单原序循环。清单本身由 `wallpapers export-livewall` 决定，顺序稳定。
    case sequential

    /// 短名，用于菜单父项标题（「选片顺序（随机）」）。
    public var label: String {
        switch self {
        case .shuffle: return "随机"
        case .sequential: return "顺序"
        }
    }

    /// 菜单项标题。说明直接写进标题 —— 只有两个选项时，单独一行的说明是噪音。
    public var menuTitle: String {
        switch self {
        case .shuffle: return "随机（每轮重洗，一轮内不重复）"
        case .sequential: return "顺序（按清单原序循环）"
        }
    }

    /// 日志用的一句话说明。
    public var detail: String {
        switch self {
        case .shuffle: return "每轮重新洗牌"
        case .sequential: return "按清单原序循环"
        }
    }
}

/// 候选池：保证「一轮之内不重复」，并支持把失效条目拉黑。
///
/// 工作方式是把整个候选集排好序后逐个取出，取空再重排。这样比「每次随机抽一条、
/// 抽到重复就重抽」更可预期：一轮的长度恒等于可用条目数，不会出现连续抽到同一条。
///
/// **候选集由调用方备好再灌进来**：内容分类的切片由 `AppDelegate` 异步拉取
/// （每个分类一个 `category.<id>.json`），这里不关心条目是怎么来的。
public struct CandidatePool {

    /// 当前候选集（未经排序）。
    private var source: [WallpaperItem] = []
    /// 待取队列。
    private var queue: [WallpaperItem] = []
    /// 头部游标，避免每次 `next()` 都移动整个数组。
    private var queueHead = 0
    /// 失效条目的 id（CDN 404 / 解码失败等）。
    private var blacklist: Set<Int> = []

    /// 选片顺序。改动会清空待取队列 —— **换模式等于重新开始一轮**，
    /// 不然「本轮已经播过哪些」会在两种顺序之间串味。
    public var order: PlaybackOrder = .shuffle {
        didSet {
            guard order != oldValue else { return }
            rebuild()
        }
    }

    /// 当前正在播放的条目 id，重排时会被排除，避免刚切走又切回来。
    public private(set) var currentID: Int?
    /// 黑名单重置次数。> 0 说明出现过「全部候选都失效」并已自动重试一轮。
    public private(set) var blacklistResetCount = 0

    public init(
        items: [WallpaperItem] = [],
        order: PlaybackOrder = .shuffle
    ) {
        self.order = order
        setItems(items)
    }

    /// 替换候选集（换分类、或重新加载清单）。会清空待取队列，但**保留黑名单**与当前播放项 ——
    /// 黑名单是「资源失效」的记录，与用户选了哪个分类无关。
    public mutating func setItems(_ items: [WallpaperItem]) {
        source = items
        rebuild()
    }

    /// 候选集变了，本轮作废：下一次 `next()` 会重新排一轮。
    ///
    /// 队列里可能还有已经不在候选集里的条目，不清就会在切换时「漏」出来。
    private mutating func rebuild() {
        queue = []
        queueHead = 0
    }

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
        // 失败处理是低频路径；先丢掉已经消费的前缀，保持游标与数组索引一致。
        if queueHead > 0 {
            queue.removeFirst(queueHead)
            queueHead = 0
        }
        queue.removeAll { $0.id == id }
    }

    /// 取回**指定**条目（用于「恢复各屏上次播的内容」）。条目不在候选集里时返回 nil。
    ///
    /// 与 `next()` 的区别：不按顺序排队、直接点名。但**同样要把它从待取队列里拿掉**，
    /// 并把 `currentID` 指过去 —— 否则它会在同一轮里再被取一次。
    ///
    /// 「下一轮」的语义按 `order` 分，这一点容易误读：随机模式重排时会排除 `currentID`，
    /// 顺序模式则**刻意不排除**（排除会让每轮短一条，见 `refill` 的注释）。
    /// 因此**队列还空着时恢复**（启动时的真实场景）在顺序模式下，被恢复的条目仍留在本轮里，
    /// 只是不会紧接着重复 —— 这是既有设计，不是这里漏了。
    ///
    /// 查不到就返回 nil（调用方退回 `next()`）：条目可能属于别的分类，
    /// 或生成侧重新导出过清单把它去掉了。
    public mutating func restore(id: Int) -> WallpaperItem? {
        guard let item = source.first(where: { $0.id == id }) else { return nil }
        if queueHead > 0 {
            queue.removeFirst(queueHead)
            queueHead = 0
        }
        queue.removeAll { $0.id == id }
        currentID = item.id
        return item
    }

    /// 取下一个候选。队列空时自动重排。
    ///
    /// 返回 nil 只有一种情况：候选集本身为空。
    public mutating func next<G: RandomNumberGenerator>(using generator: inout G) -> WallpaperItem? {
        if queue.isEmpty {
            refill(using: &generator)
        }
        guard queueHead < queue.count else { return nil }
        let item = queue[queueHead]
        queueHead += 1
        currentID = item.id
        if queueHead == queue.count {
            queue.removeAll(keepingCapacity: true)
            queueHead = 0
        }
        return item
    }

    public mutating func next() -> WallpaperItem? {
        var generator = SystemRandomNumberGenerator()
        return next(using: &generator)
    }

    /// 重排待取队列。两种顺序**都不会紧接着重复上一条**，但做法不同：
    ///
    /// - 随机：把当前这条排除掉再洗牌。一轮因此少一条，但下一轮的起点完全随机。
    /// - 顺序：整段原序照排，只在新一轮的第一条**恰好是当前这条**时向后让一位。
    ///   不能沿用「排除当前项」：那样每轮都会少一条尾巴，实际播放序列会变成
    ///   `A…Z → A…Y → A…X`（第二轮不是从清单开头重新开始，看起来像漏播）。
    ///   绕回开头时上一条本来就是清单最后一条，不会紧挨着重复 —— 除非只剩一条，
    ///   那种情况下面已有守卫。
    public mutating func refill<G: RandomNumberGenerator>(using generator: inout G) {
        var pool = source.filter { !blacklist.contains($0.id) }

        // 黑名单覆盖了全部候选 —— 说明清单整体失效（例如 CDN 换域名），
        // 清空黑名单重试一轮，总好过彻底停摆。
        if pool.isEmpty && !blacklist.isEmpty {
            blacklist.removeAll()
            blacklistResetCount += 1
            pool = source
        }

        // 顺序模式：一轮的第一条正好是当前正在播的那条（典型场景是刚换了分类、
        // 改了顺序或重载了清单，队列被清空重建）时向后让一位 —— 否则用户会以为没生效。
        // 这只在「新一轮的第一条 == 当前项」时触发：自然轮边界上当前项是上一轮的
        // 最后一条，两者不相等，不会误让。
        if order == .sequential, pool.count > 1, let currentID, pool.first?.id == currentID {
            pool.append(pool.removeFirst())
        }

        // 只剩一条时不能把它排除掉，否则永远取不出东西
        if order == .shuffle, pool.count > 1, let currentID {
            pool.removeAll { $0.id == currentID }
        }

        if order == .shuffle {
            pool.shuffle(using: &generator)
        }
        queue = pool
        queueHead = 0
    }

    public mutating func refill() {
        var generator = SystemRandomNumberGenerator()
        refill(using: &generator)
    }

    /// 待取队列的剩余长度，用于诊断。
    public var pendingCount: Int { queue.count - queueHead }
}
