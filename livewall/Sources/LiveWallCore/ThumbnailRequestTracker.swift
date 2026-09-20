/// 缩略图请求的调度器：**去重 + 并发上限 + 失败不重试**。
///
/// 纯状态机，不碰 `URLSession` —— 这样「并发不超过 4」「同一 URL 只发一次」
/// 「失败的不再自动重发」这三条都能单测，而不用起网络。
///
/// ## 为什么需要它
///
/// 一个分类最多 3536 条，网格滚起来可见项在几十个量级。如果每个可见卡片各发一个请求、
/// 不复用也不限流，快速滚动会瞬间打出上百个连接，而其中大多数结果还没显示就已经滚出屏幕。
/// 所以：**去重**（同一 URL 只有一个请求在飞）+ **上限**（同时在飞最多 4 个）+
/// **失败即终止**（记住失败，不再自动重试，避免坏地址反复占着并发位）。
///
/// 「滚动中不发请求、滚动停止后 debounce 再发」不在这里 —— 那是视图层的时机问题，
/// 这里只管「给定一批 URL，现在该发哪几个」。
public struct ThumbnailRequestTracker {

    /// 同时在飞的请求上限。4 是保守值：本机 `URLSession` 对同一 host 的连接数本来也有限，
    /// 再高只会让先回来的结果排在更长的队列后面。
    public let concurrencyLimit: Int

    private var inFlight: Set<String> = []
    private var failed: Set<String> = []
    /// 等待队列。用数组保序（可见顺序 = 优先级），另配一个 Set 做 O(1) 去重判断。
    private var pending: [String] = []
    private var pendingSet: Set<String> = []
    /// 头部游标，避免 `removeFirst()` 每次移动剩余字符串。
    private var pendingHead = 0

    public init(concurrencyLimit: Int = 4) {
        self.concurrencyLimit = max(1, concurrencyLimit)
    }

    // MARK: - 查询

    public var inFlightCount: Int { inFlight.count }
    public var pendingCount: Int { pending.count - pendingHead }
    public var failedCount: Int { failed.count }

    public func isInFlight(_ url: String) -> Bool { inFlight.contains(url) }
    public func isPending(_ url: String) -> Bool { pendingSet.contains(url) }
    public func isFailed(_ url: String) -> Bool { failed.contains(url) }

    // MARK: - 驱动

    /// 提交一批请求，返回**现在就该发**的 URL（按传入顺序）。
    ///
    /// 已在飞、已失败、已排队的一律跳过 —— 重复调用同一个列表是幂等的。
    ///
    /// - Parameter replacingPending: 是否丢弃尚未发出的等待项。
    ///   滚动之后又换了一批可见项时传 `true`：旧的那批已经滚出屏幕，
    ///   排在它们身上只是白等（结果会被代次校验丢掉）。
    @discardableResult
    public mutating func submit(_ urls: [String], replacingPending: Bool = false) -> [String] {
        if replacingPending {
            pending.removeAll()
            pendingSet.removeAll()
            pendingHead = 0
        }
        for url in urls {
            guard !url.isEmpty else { continue }
            guard !inFlight.contains(url), !failed.contains(url) else { continue }
            guard pendingSet.insert(url).inserted else { continue }
            pending.append(url)
        }
        return drain()
    }

    /// 一个请求结束。返回可以接着发的 URL。
    ///
    /// - Parameter succeeded: 失败会被记下来，之后 `submit` 不会再自动带上它。
    ///   这是有意的：坏地址反复重试只会占着并发位、把可见项的请求挤到后面。
    ///   要重试就显式调 `resetFailures()`（「重试」按钮走这条路）。
    @discardableResult
    public mutating func finish(_ url: String, succeeded: Bool) -> [String] {
        inFlight.remove(url)
        if !succeeded { failed.insert(url) }
        return drain()
    }

    /// 放弃所有在飞与等待中的请求（关窗、切分类时用）。
    ///
    /// **不清失败表**：失败是「这个地址坏了」的事实，与窗口开关无关；
    /// 清掉会让每次重开窗口都把坏地址再试一遍。
    public mutating func cancelAll() {
        inFlight.removeAll()
        pending.removeAll()
        pendingSet.removeAll()
        pendingHead = 0
    }

    /// 清空失败表，并把等待队列里能发的发出去。返回现在就该发的 URL。
    public mutating func resetFailures() -> [String] {
        failed.removeAll()
        return drain()
    }

    // MARK: - 内部

    private mutating func drain() -> [String] {
        var started: [String] = []
        while inFlight.count < concurrencyLimit, pendingHead < pending.count {
            let url = pending[pendingHead]
            pendingHead += 1
            pendingSet.remove(url)
            // 队列里理论上不会有重复项，也理论上不会撞上已失败的（submit 已拦），
            // 但 `finish` 可能在排队期间把它标成失败 —— 这里再核一次，代价可忽略。
            guard !inFlight.contains(url), !failed.contains(url) else { continue }
            inFlight.insert(url)
            started.append(url)
        }
        // 队列完全消费后释放旧字符串；部分消费时保留顺序并避免频繁搬移。
        if pendingHead == pending.count {
            pending.removeAll(keepingCapacity: true)
            pendingHead = 0
        } else if pendingHead > 64 && pendingHead * 2 >= pending.count {
            pending.removeFirst(pendingHead)
            pendingHead = 0
        }
        return started
    }
}
