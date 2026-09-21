import Foundation

/// 把一次 `URLSession` 请求**同步**取回。
///
/// 供 `CatalogService` 与 `UpdateChecker` 使用 —— 两者的降级链都是同步的
/// （`loadIndex()` / `loadSlice()` / `fetch()` 都是 `throws -> Data`），
/// 改 async 会牵动整条调用链与调用方，收益不抵改动面。
///
/// ## 为什么不继续用「局部 `var` + 信号量」
///
/// 那是这个项目最初的写法，有两个真实缺陷：
///
/// 1. **数据竞争**：局部 `var outcome` 被 `dataTask` 的逃逸闭包捕获，超时后主调线程读它，
///    而网络回调稍后仍会在 URLSession 的队列上写它 —— 全程没有任何同步。
///    Swift 6 严格并发下这会直接编译失败；
/// 2. **任务不取消**：超时分支既不 `cancel()` 也不释放，那个请求会继续跑完，
///    白占一个连接与一份内存。
///
/// 这里用一把锁保护「结果 + 是否已定案」，并且**超时一定取消任务**，
/// 同时把「已定案」置真 —— 这样随后回来的回调不会再写 `outcome`，竞争面归零。
///
/// ## 为什么带 `session` 参数
///
/// 原来的写法把 `URLSession.shared` 写死在函数体里，导致「超时竞态」这类缺陷
/// **结构上不可测**（没有注入点，测试造不出「先超时、后回调」的时序）。
/// 生产仍用 `.shared`，测试可注入带 `URLProtocol` 桩的会话。
public enum SynchronousFetch {

    public enum Failure: Error, LocalizedError, Equatable {
        case notHTTP
        case httpStatus(Int)
        case emptyResponse
        /// **等待上限**到期（不是 `URLRequest.timeoutInterval` 到期）—— 任务已被取消。
        ///
        /// 这是**安全网**而不是主路径：`URLRequest.timeoutInterval` 通常先触发，
        /// 那时 URLSession 会自己报 `URLError(.timedOut)`，落到 `.transport`。
        /// 本 case 只在「URLSession 没兑现自己的超时」时兜底 —— 那种情况真实存在，
        /// 而它一旦发生，不设上限就会把调用方所在的后台队列永久占住。
        case timedOut
        case transport(String)

        public var errorDescription: String? {
            switch self {
            case .notHTTP: return "响应不是 HTTP"
            case .httpStatus(let status): return "HTTP \(status)"
            case .emptyResponse: return "响应为空"
            case .timedOut: return "请求超时（已取消）"
            case .transport(let detail): return detail
            }
        }
    }

    /// 同步取回 `url` 的响应体（仅接受 2xx 且非空）。失败抛 `Failure`。
    ///
    /// - Parameters:
    ///   - timeout: 单次请求超时。**实际等待上限默认是它 +5 秒** —— 多留的余量是为了
    ///     「即使信号量没被唤醒也必须能返回」，否则调用方所在的后台队列会被永久占住。
    ///   - cachePolicy: 默认 `reloadRevalidatingCacheData`（条件请求，省流量）。
    ///   - maximumWait: 覆盖实际等待上限。**只给测试用** —— 默认的 `timeout + 5` 意味着
    ///     想测「超时后有没有取消任务」得等 5 秒，那没人会去测。生产不要传。
    ///   - session: 生产用 `.shared`；测试可注入桩会话。
    public static func data(
        from url: URL,
        timeout: TimeInterval = 15,
        cachePolicy: URLRequest.CachePolicy = .reloadRevalidatingCacheData,
        maximumWait: TimeInterval? = nil,
        session: URLSession = .shared
    ) throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.cachePolicy = cachePolicy

        let semaphore = DispatchSemaphore(value: 0)
        let box = OutcomeBox()

        let task = session.dataTask(with: request) { data, response, error in
            let result: Result<Data, Error>
            if let error {
                result = .failure(Failure.transport(error.localizedDescription))
            } else if !(response is HTTPURLResponse) {
                result = .failure(Failure.notHTTP)
            } else if let http = response as? HTTPURLResponse,
                !(200..<300).contains(http.statusCode)
            {
                result = .failure(Failure.httpStatus(http.statusCode))
            } else if let data, !data.isEmpty {
                result = .success(data)
            } else {
                result = .failure(Failure.emptyResponse)
            }

            box.settle(result)
            // 即使在锁外也必须发信号：等待方可能已经超时离开，多一次 signal 无害
            // （没有等待者时只是把计数加一）。
            semaphore.signal()
        }
        task.resume()

        let waitLimit = maximumWait ?? (timeout + 5)
        if semaphore.wait(timeout: .now() + waitLimit) == .timedOut {
            // **先定案再取消**：这样随后（因取消而触发）的回调不会再写结果，
            // 我们下面读到的一定是 `.timedOut` 或回调更早写入的那个。
            box.settleTimedOut()
            task.cancel()
        }

        return try box.final().get()
    }
}

/// 一次请求的结果盒。
///
/// **用引用类型而不是捕获局部 `var`**：后者在 Swift 6 语言模式下会报
/// `mutation of captured var in concurrently-executing code [#SendableClosureCaptures]`
/// —— 那正是本类型要消灭的那类问题。`@unchecked Sendable` 是显式断言：
/// 内部状态全部经 `lock` 访问。
private final class OutcomeBox: @unchecked Sendable {

    private let lock = NSLock()
    /// 是否已定案（超时或回调二选一）。回调只在它为假时写 `outcome`。
    private var settled = false
    private var outcome: Result<Data, Error> = .failure(SynchronousFetch.Failure.timedOut)

    /// 回调侧：只在未定案时写入（超时先到就丢弃这个结果）。
    func settle(_ result: Result<Data, Error>) {
        lock.lock()
        defer { lock.unlock() }
        guard !settled else { return }
        settled = true
        outcome = result
    }

    /// 超时侧：抢先定案，让随后回来的回调不再写。
    func settleTimedOut() {
        lock.lock()
        defer { lock.unlock() }
        settled = true
    }

    /// 最终结果。
    func final() -> Result<Data, Error> {
        lock.lock()
        defer { lock.unlock() }
        return outcome
    }
}
