import Foundation
import LiveWallCore

/// 把「拉远程版本信息」抽象出来，让检查逻辑可以脱离网络单测。
///
/// 与 `CatalogTransport` 同一套路（那里已经踩过一遍坑）：生产实现是同步的
/// （内部用信号量等 URLSession），调用方必须在后台队列调。
protocol UpdateTransport {
    func fetch(_ url: URL) throws -> Data
}

enum UpdateCheckError: LocalizedError {
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .requestFailed(let message): return message
        }
    }
}

struct DefaultUpdateTransport: UpdateTransport {

    func fetch(_ url: URL) throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadRevalidatingCacheData

        let semaphore = DispatchSemaphore(value: 0)
        var outcome: Result<Data, Error> = .failure(UpdateCheckError.requestFailed("请求未执行"))
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error {
                outcome = .failure(error)
                return
            }
            guard let http = response as? HTTPURLResponse else {
                outcome = .failure(UpdateCheckError.requestFailed("响应不是 HTTP"))
                return
            }
            guard (200..<300).contains(http.statusCode) else {
                outcome = .failure(UpdateCheckError.requestFailed("HTTP \(http.statusCode)"))
                return
            }
            guard let data, !data.isEmpty else {
                outcome = .failure(UpdateCheckError.requestFailed("响应为空"))
                return
            }
            outcome = .success(data)
        }
        task.resume()
        // 比 timeoutInterval 多留 5 秒：信号量卡住也必须能返回，否则整个后台队列被占住。
        _ = semaphore.wait(timeout: .now() + 20)
        return try outcome.get()
    }
}

/// 版本检查。**只在被调用时发起请求**，没有定时器、没有后台轮询 ——
/// 与进程占用采样同一条原则：一个常驻的菜单栏 App 不该为了「也许有新版本」反复唤醒自己。
///
/// 失败一律静默：更新是附加功能，检查不出来就当没有，真相写进 `warnings` 交给日志。
final class UpdateChecker {

    /// 两次检查之间的最短间隔。手动点「检查更新」可以无视它。
    static let throttleInterval: TimeInterval = 12 * 60 * 60

    private(set) var isChecking = false
    private var lastCheckAt: Date?

    private let queue = DispatchQueue(label: "com.meowv.livewall.update-checker", qos: .utility)

    /// 检查结果（主线程）。调用方按 `UpdateDecision` 分支处理：
    /// 只有 `.available` 值得在菜单里加一行，其余三态都不提示。
    ///
    /// `warnings` 是「为什么没有结果」，由调用方记日志；**手动**检查时也可以拿它当回执
    /// —— 那时用户正在等一个答复，静默等于没反应。
    var onResult: ((_ decision: UpdateDecision, _ warnings: [String]) -> Void)?

    /// 发起一次检查。**不会同时跑两次**：`isChecking` 期间再调用直接丢弃，
    /// 节流窗口内的自动检查同样丢弃（`force: true` 可无视，用于手动点击）。
    ///
    /// 前置条件不满足时**同步回调一次** `.unusable` 并附原因（不发请求）：
    /// 「没配地址」「读不到本地 build」属于配置问题，手动点击时用户需要知道原因。
    /// 而「并发/节流被丢弃」**不回调** —— 那不是失败，回调反而会让调用方误判成「检查结束」。
    func check(
        preferences: Preferences,
        localBuild: Int?,
        force: Bool = false,
        transport: UpdateTransport = DefaultUpdateTransport()
    ) {
        guard let url = preferences.resolvedUpdateURL else {
            onResult?(.unusable, ["未配置更新地址（remoteUpdateURL 为空）"])
            return
        }
        guard let localBuild else {
            onResult?(.unusable, ["读不到本地 build（Info.plist 的 CFBundleVersion）"])
            return
        }
        guard !isChecking else {
            // 并发的第二次**静默丢弃**：它不是失败，回调反而会让调用方把
            // 「检查中」的状态打回「无更新」。挡重复请求本来就是这里的职责。
            return
        }
        if !force, let lastCheckAt, Date().timeIntervalSince(lastCheckAt) < Self.throttleInterval {
            // 节流命中同上：只发生在自动检查，没人等结果，静默即可。
            return
        }

        isChecking = true

        // 两层的所有权必须一致：外层 `[weak self]` + `guard` 之后，内层就继承同一个强引用，
        // 不能再写 `[weak self]` —— 内外不一致会触发 `#ImplicitStrongCapture`。
        queue.async { [weak self] in
            guard let self else { return }
            var warnings: [String] = []
            var feed: UpdateFeed?
            do {
                let data = try transport.fetch(url)
                feed = UpdateFeedCoding.decode(data, into: &warnings)
            } catch {
                warnings.append("版本信息拉取失败：\(error.localizedDescription)")
                feed = nil
            }

            let decision = UpdateEvaluator.evaluate(localBuild: localBuild, feed: feed)

            DispatchQueue.main.async {
                self.isChecking = false
                self.lastCheckAt = Date()
                self.onResult?(decision, warnings)
            }
        }
    }
}
