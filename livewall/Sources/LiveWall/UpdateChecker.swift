import Foundation
import LiveWallCore

/// 把「拉远程版本信息」抽象出来，让检查逻辑可以脱离网络单测。
///
/// 与 `CatalogTransport` 同一套路：生产实现是**同步**的
/// （内部走 `LiveWallCore.SynchronousFetch`），调用方必须在后台队列调。
///
/// **要求 `Sendable`**：实现会被 `@Sendable` 的后台闭包捕获着去取数。
/// 生产实现只持有一个 `URLSession`（本身 `Sendable`），这条约束不增加负担；
/// 它换来的是「取数在后台跑」这件事能在 Swift 6 下编译通过 —— 不去后台，
/// 同步阻塞的信号量等待就会占住主线程最长 20 秒。
protocol UpdateTransport: Sendable {
    func fetch(_ url: URL) throws -> Data
}

struct DefaultUpdateTransport: UpdateTransport {

    /// 注入点。生产用 `.shared`；测试可注入带 `URLProtocol` 桩的会话 ——
    /// 与 `DefaultCatalogTransport` 同一理由（见 `SynchronousFetch` 的说明）：
    /// 把 `URLSession.shared` 写死在函数体里，会让「超时竞态」结构上不可测。
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetch(_ url: URL) throws -> Data {
        try SynchronousFetch.data(from: url, timeout: 15, session: session)
    }
}

/// 版本检查。**只在被调用时发起请求**，没有定时器、没有后台轮询 ——
/// 与进程占用采样同一条原则：一个常驻的菜单栏 App 不该为了「也许有新版本」反复唤醒自己。
///
/// 请求状态与回调在主 actor 上处理，取数在后台队列上执行。
@MainActor
final class UpdateChecker {

    enum Trigger {
        case automatic
        case manual
    }

    /// 两次检查之间的最短间隔。手动点「检查更新」可以无视它。
    static let throttleInterval: TimeInterval = 12 * 60 * 60

    /// 用户点进一次后台检查后，这次检查也需要给手动回执。
    private var activeTrigger: Trigger?
    var isChecking: Bool { activeTrigger != nil }
    private var lastCheckAt: Date?

    private let queue = DispatchQueue(label: "com.meowv.livewall.update-checker", qos: .utility)

    var onResult: ((_ decision: UpdateDecision, _ warnings: [String], _ trigger: Trigger) -> Void)?

    /// 新请求启动或手动加入后台检查时调用 `onStarted`。节流和重复触发不产生回调。
    /// 配置不完整时通过 `onResult` 同步返回失败原因。
    func check(
        preferences: Preferences,
        localBuild: Int?,
        trigger: Trigger,
        transport: UpdateTransport = DefaultUpdateTransport(),
        onStarted: () -> Void
    ) {
        if let activeTrigger {
            if trigger == .manual, activeTrigger == .automatic {
                self.activeTrigger = .manual
                onStarted()
            }
            return
        }
        guard let url = preferences.resolvedUpdateURL else {
            onResult?(.unusable, ["未配置更新地址（remoteUpdateURL 为空）"], trigger)
            return
        }
        guard let localBuild else {
            onResult?(.unusable, ["读不到本地 build（Info.plist 的 CFBundleVersion）"], trigger)
            return
        }
        if trigger == .automatic, let lastCheckAt, Date().timeIntervalSince(lastCheckAt) < Self.throttleInterval {
            return
        }

        activeTrigger = trigger
        onStarted()

        // 两层闭包各自的所有权：
        //  - 外层跑在专用 utility 队列上（`resolveFeed` 内部是**同步阻塞**的取数，
        //    最长等 20 秒；丢进 Swift 并发的协作线程池会占住一条协作线程）；
        //  - 内层用 `Task { @MainActor }` 回主 actor。
        // `resolveFeed` 标了 `nonisolated`，所以后台可以直接调它。
        queue.async { [weak self] in
            guard let self else { return }
            let outcome = self.resolveFeed(url: url, transport: transport)
            let decision = UpdateEvaluator.evaluate(localBuild: localBuild, feed: outcome.feed)
            let warnings = outcome.warnings

            Task { @MainActor [weak self] in
                guard let self, let trigger = self.activeTrigger else { return }
                self.activeTrigger = nil
                self.lastCheckAt = Date()
                self.onResult?(decision, warnings, trigger)
            }
        }
    }

    /// 取回版本信息，**先验签、再解析**。
    ///
    /// 顺序不能反：签名不过的清单属于**不可信数据**，不该进解析、更不该参与更新判定。
    ///
    /// 失败一律把原因写进返回值里的 `warnings`，`feed` 为 nil，**刻意没有
    /// 「验不过就退回只看 sha256」这条路** —— 那种降级等于没做签名：攻击者把签名文件
    /// 删掉即可绕过。与 `sha256` 必填是同一条原则：宁可这次不提示更新，
    /// 也不认一份来源不明的清单。
    ///
    /// **`nonisolated`**：它只读入参、不碰本类型的任何状态，因此可以在后台队列上
    /// 直接调用 —— 这是「同步阻塞的取数不跑在主线程」得以成立的前提。
    ///
    /// 用返回值而不是 `inout` 收集原因：这两个值要被 `@Sendable` 的后台闭包捕获着
    /// 跨 actor 传递，`inout` 那种写法得先冻结成 `let` 才能编译，不如直接返回。
    nonisolated private func resolveFeed(
        url: URL,
        transport: UpdateTransport
    ) -> (feed: UpdateFeed?, warnings: [String]) {
        var warnings: [String] = []

        let payload: Data
        do {
            payload = try transport.fetch(url)
        } catch {
            warnings.append("版本信息拉取失败：\(error.localizedDescription)")
            return (nil, warnings)
        }

        guard let signatureURL = UpdateSignature.documentURL(for: url) else {
            warnings.append("更新信息签名校验失败：更新地址推不出签名文件地址")
            return (nil, warnings)
        }

        let document: Data
        do {
            document = try transport.fetch(signatureURL)
        } catch {
            // 单独说清是**签名文件**的问题。最常见的成因是发版时漏传 `.sig`，
            // 与「版本信息本身 404」是两个完全不同的排障方向 —— 混在一起会被读成
            // 「线上没更新」，然后去翻版本号，方向全错。
            warnings.append("签名文件拉取失败（\(signatureURL.lastPathComponent)）：\(error.localizedDescription)")
            return (nil, warnings)
        }

        // 验签与解析的顺序由 `decodeVerified` 内部钉死，这里不自己拼两步。
        let feed = UpdateFeedCoding.decodeVerified(
            payload: payload,
            signatureDocument: document,
            into: &warnings
        )
        return (feed, warnings)
    }
}
