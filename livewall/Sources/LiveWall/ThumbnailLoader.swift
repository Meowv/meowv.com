import AppKit
import LiveWallCore

/// 缩略图异步加载 + 内存缓存。
///
/// ## 为什么需要它
///
/// 一个分类最多 3536 条，网格滚起来可见项在几十个量级。四件事必须一起做对：
///
/// 1. **走 OSS 缩略图**（`ThumbnailURL`）—— 原图实测 384 KB，缩略图 10.3 KB；
/// 2. **去重**：同一个 URL 只发一个请求。同一条被多个卡片要、或卡片被复用后
///    再次请求，都不该产生第二个请求；
/// 3. **限并发**（`ThumbnailRequestTracker`，上限 4）—— 快速滚动不该打出上百个连接；
/// 4. **失败兜底**：带处理参数的请求失败、或返回的不是图片，退回原图；再失败就交给
///    调用方显示占位图。
///
/// ## 兜底判定只看 `Content-Type`，不看体积
///
/// 用体积阈值判定会把「缩略图偏大的 PNG」（实测 115–193 KB）错判成失败，
/// 反而退回 4 MB 的原图 —— 越兜越重。只看类型就没这个问题：偏大也是对的图。
///
/// ## 第一版不落盘
///
/// 与「不做本地视频缓存」的既有取舍一致。内存缓存用 `NSCache` 并**按解码后的
/// 字节数设成本**（不是按条数）—— 360×203 的位图约 292 KB，只按条数算的话
/// 300 张就是 88 MB，在 8 GB 机器上不算小事。
///
/// 并发约定与项目其它组件一致：**只在主线程使用**。
final class ThumbnailLoader {

    /// 取哪一档图。两档的差别只在 OSS 参数与卡片尺寸，加载与缓存机制完全共用。
    enum Variant {
        /// 网格卡片（`w_360`，实测 10.3 KB）。
        case grid
        /// 右栏预览的静态图（`w_720`，实测 39 KB）。
        case preview

        func candidates(for item: WallpaperItem) -> [URL] {
            switch self {
            case .grid: return ThumbnailURL.gridCandidates(for: item)
            case .preview: return ThumbnailURL.previewCandidates(for: item)
            }
        }
    }

    var log: ((String) -> Void)?

    /// key 是**拼好的图 URL**（不是条目 id）—— 同一张图被不同条目引用时能命中同一份。
    private let cache = NSCache<NSString, NSImage>()
    private var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
    /// 已登记、还没拿到结果的 URL → 候选链（处理版 → 原图）。
    private var candidatesByKey: [String: [URL]] = [:]
    /// 已经真正发起 `URLSession` 请求的 URL。
    private var startedKeys: Set<String> = []
    /// 已发起请求的句柄。`cancelAll()` 必须真正取消网络任务，不能只清状态。
    private var tasksByKey: [String: URLSessionDataTask] = [:]
    /// 等同一个 URL 结果的回调。`candidatesByKey` 决定「要不要发请求」，
    /// 这里只决定「结果来了通知谁」—— 两者分开，才能让「滚回来」重新登记请求。
    private var waiters: [String: [(NSImage?) -> Void]] = [:]
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        cache.totalCostLimit = 96 * 1024 * 1024
    }

    // MARK: - 请求

    /// 为一批条目请求指定档位的图。回调在主线程，取不到传 nil（调用方显示占位图）。
    ///
    /// - Parameter replacingPending: 是否丢弃「已滚出屏幕、还没发出」的候选。
    ///   滚动结束后发新一批可见项时传 `true`：那些结果已经没人要，
    ///   却会占着并发位把可见项的请求挤到后面。
    ///   调用方应当**每次都传完整的可见集合**，否则仍留在屏幕上的卡片会被误丢。
    func load(
        _ items: [WallpaperItem],
        variant: Variant,
        replacingPending: Bool,
        completion: @escaping (WallpaperItem, NSImage?) -> Void
    ) {
        var fresh: Set<String> = []

        for item in items {
            guard let key = variant.candidates(for: item).first?.absoluteString else {
                // 没有可用的封面地址。**不伪造地址**，直接让卡片显示占位图。
                completion(item, nil)
                continue
            }
            if let cached = cache.object(forKey: key as NSString) {
                completion(item, cached)
                continue
            }
            if tracker.isFailed(key) {
                // 两级都试过了。**不重复请求** —— 坏地址反复重试只会占着并发位。
                completion(item, nil)
                continue
            }
            if candidatesByKey[key] != nil {
                // 已登记（在飞或排队）：挂上去等同一个结果，不再发第二个请求。
                waiters[key, default: []].append { image in completion(item, image) }
                continue
            }
            waiters[key] = [{ image in completion(item, image) }]
            candidatesByKey[key] = variant.candidates(for: item)
            fresh.insert(key)
        }

        guard !fresh.isEmpty else { return }
        pump(replacingPending: replacingPending, keeping: fresh)
    }

    /// 放弃所有在飞与等待中的请求（关窗、切分类）。
    ///
    /// **不清缓存，也不清失败表** —— 缓存是钱买来的流量，失败是「这个地址坏了」的
    /// 事实，两者都与窗口开关无关。清掉会让每次重开窗口都把坏地址再试一遍。
    func cancelAll() {
        tracker.cancelAll()
        for task in tasksByKey.values { task.cancel() }
        tasksByKey.removeAll()
        startedKeys.removeAll()
        candidatesByKey.removeAll()
        // 等待中的回调一并丢弃：调用方（卡片）此刻已经不在屏幕上了。
        waiters.removeAll()
    }

    // MARK: - 内部

    private func pump(replacingPending: Bool, keeping: Set<String>) {
        if replacingPending {
            // 丢掉「没发出、且这一批不再需要」的候选与其回调。卡片已经滚出屏幕，
            // 回调没人要；留着只会让它们排在可见项前面被发出去。
            let staleKeys = candidatesByKey.keys.filter {
                !startedKeys.contains($0) && !keeping.contains($0)
            }
            for key in staleKeys {
                candidatesByKey[key] = nil
                waiters[key] = nil
            }
            _ = tracker.submit([], replacingPending: true)
        }

        let ready = candidatesByKey.keys.filter { !startedKeys.contains($0) }
        guard !ready.isEmpty else { return }
        // `tracker.submit` 按并发上限决定现在发哪几个，其余排队；
        // 它自己会排掉已在飞 / 已失败的，所以这里直接拿返回值当「新发起的」。
        for key in tracker.submit(Array(ready)) {
            startedKeys.insert(key)
            startRequest(key)
        }
    }

    private func startRequest(_ key: String) {
        guard let candidates = candidatesByKey[key], !candidates.isEmpty else {
            finish(key, image: nil)
            return
        }
        attempt(key: key, candidates: candidates, index: 0)
    }

    /// 依次尝试候选链：先处理版、再原图。
    private func attempt(key: String, candidates: [URL], index: Int) {
        // 关窗/切分类后，`cancelAll()` 会清掉登记；旧回调回来时不能再发备用请求。
        guard candidatesByKey[key] != nil else { return }
        guard index < candidates.count else {
            log?("缩略图两级候选都失败：\(key)")
            finish(key, image: nil)
            return
        }

        var request = URLRequest(url: candidates[index])
        request.timeoutInterval = 15
        // 图片是不可变的，走本地 HTTP 缓存没问题。
        request.cachePolicy = .returnCacheDataElseLoad

        let task = session.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                // 请求可能在回调排队期间被取消；此时整个候选链已经失效。
                guard self.candidatesByKey[key] != nil else { return }
                self.tasksByKey[key] = nil
                guard error == nil,
                      let http = response as? HTTPURLResponse,
                      http.statusCode == 200,
                      let data, !data.isEmpty
                else {
                    self.attempt(key: key, candidates: candidates, index: index + 1)
                    return
                }
                // 兜底判定的**唯一**依据：返回的必须是图片。
                // 不看体积 —— PNG 缩略图 115–193 KB，用阈值会把它错判成失败。
                let contentType = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                guard contentType.hasPrefix("image/"), let image = NSImage(data: data) else {
                    self.attempt(key: key, candidates: candidates, index: index + 1)
                    return
                }
                self.finish(key, image: image)
            }
        }
        tasksByKey[key] = task
        task.resume()
    }

    private func finish(_ key: String, image: NSImage?) {
        tasksByKey[key] = nil
        startedKeys.remove(key)
        candidatesByKey[key] = nil
        let callbacks = waiters.removeValue(forKey: key) ?? []
        if let image {
            cache.setObject(image, forKey: key as NSString, cost: Self.estimatedBytes(of: image))
        }
        for callback in callbacks { callback(image) }
        // 空出一个并发位，接着发排队中的下一个。
        for next in tracker.finish(key, succeeded: image != nil) where !startedKeys.contains(next) {
            startedKeys.insert(next)
            startRequest(next)
        }
    }

    /// 解码后的位图大致字节数，用于 `NSCache` 的成本。
    private static func estimatedBytes(of image: NSImage) -> Int {
        guard let rep = image.representations.first else { return 256 * 1024 }
        return max(rep.pixelsWide * rep.pixelsHigh * 4, 64 * 1024)
    }
}
