import Foundation

/// 播放失败的分类。分类的目的只有一个：区分「这条资源坏了」和「网络暂时不通」——
/// 前者要拉黑并换一条，后者拉黑就会把好资源白白丢掉。
public enum PlaybackFailureKind: Equatable, Sendable {
    /// 完全没有网络（系统级判断，不靠猜）。
    case networkUnreachable
    /// 网络层临时故障：超时、连接被重置、DNS 失败等。
    case transientNetwork(String)
    /// 资源已失效：HTTP 403 / 404。
    case resourceGone(status: Int)
    /// 服务端错误：HTTP 5xx，通常是临时的。
    case serverError(status: Int)
    /// 资源存在但不可解码（编码不支持、文件损坏）。
    case notPlayable(String)
    /// 无法归类。
    case unknown(String)

    public var isResourceProblem: Bool {
        switch self {
        case .resourceGone, .notPlayable: return true
        case .networkUnreachable, .transientNetwork, .serverError, .unknown: return false
        }
    }

    public var label: String {
        switch self {
        case .networkUnreachable: return "网络不可达"
        case .transientNetwork(let detail): return "网络临时故障（\(detail)）"
        case .resourceGone(let status): return "资源失效（HTTP \(status)）"
        case .serverError(let status): return "服务端错误（HTTP \(status)）"
        case .notPlayable(let detail): return "不可解码（\(detail)）"
        case .unknown(let detail): return "未知错误（\(detail)）"
        }
    }
}

/// 失败后该做什么。
public enum FailureAction: Equatable, Sendable {
    /// 把这条拉黑，立即切下一条。
    case blacklistAndAdvance
    /// 重试同一条。
    case retrySame
    /// **保持当前画面不动**，过一会儿再试。这是「任何失败都不能黑屏」的落点。
    case holdCurrent
    /// 停止本轮调度并提示用户。
    case stopScheduling
}

/// 失败处理策略。纯逻辑，不碰网络与播放器，便于穷举验证。
public struct FailurePolicy: Sendable {

    /// 连续失败达到这个数就停止调度。
    public var maxConsecutiveFailures: Int
    /// 单条资源最多重试几次。
    public var maxRetriesPerItem: Int

    public init(maxConsecutiveFailures: Int = 3, maxRetriesPerItem: Int = 1) {
        self.maxConsecutiveFailures = maxConsecutiveFailures
        self.maxRetriesPerItem = maxRetriesPerItem
    }

    /// 判定顺序是有讲究的，不能随意调换：
    /// 1. 先看是否已经连续失败到阈值 —— 此时无论什么原因都该停下来，避免无限重试；
    /// 2. 再看网络是否可达 —— 不可达时**绝不拉黑**，因为问题不在资源本身；
    /// 3. 临时网络故障优先重试同一条；
    /// 4. 其余一律拉黑换下一条。
    public func action(
        for kind: PlaybackFailureKind,
        networkReachable: Bool,
        consecutiveFailures: Int,
        retriesForItem: Int
    ) -> FailureAction {
        if consecutiveFailures >= maxConsecutiveFailures {
            return .stopScheduling
        }
        if !networkReachable || kind == .networkUnreachable {
            return .holdCurrent
        }
        if case .transientNetwork = kind, retriesForItem < maxRetriesPerItem {
            return .retrySame
        }
        if case .serverError = kind, retriesForItem < maxRetriesPerItem {
            return .retrySame
        }
        if case .unknown = kind, retriesForItem < maxRetriesPerItem {
            return .retrySame
        }
        return .blacklistAndAdvance
    }

    /// 从 HTTP 状态码分类。这是**首选入口** ——
    /// 实测 AVFoundation 对 404 的本地化描述是「在此服务器上找不到所请求的URL。」，
    /// 里面根本不含数字状态码，靠解析错误文本判断状态码是不可靠的。
    /// 所以 `VideoLoader` 在播放前会先做一次 HEAD 探测，拿到真实状态码再走这里。
    public static func classify(httpStatus status: Int) -> PlaybackFailureKind {
        switch status {
        case 403, 404, 410:
            return .resourceGone(status: status)
        case 400..<500:
            // 其余 4xx 也按资源问题处理：重试通常没意义
            return .resourceGone(status: status)
        case 500..<600:
            return .serverError(status: status)
        default:
            return .unknown("HTTP \(status)")
        }
    }

    /// 从错误推断分类。
    ///
    /// 只认两类**可靠**信号：`URLError` 的网络错误码，以及我们自己抛出的 `VideoLoadError`。
    /// 不去解析错误文本找 HTTP 状态码 —— 那条路已被实测证伪。
    public static func classify(_ error: Error) -> PlaybackFailureKind {
        let nsError = error as NSError

        if nsError.domain == NSURLErrorDomain {
            let code = URLError.Code(rawValue: nsError.code)
            switch code {
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
                return .networkUnreachable
            default:
                return .transientNetwork(nsError.localizedDescription)
            }
        }

        if let loadError = error as? VideoLoadError {
            switch loadError {
            case .httpStatus(let status):
                return classify(httpStatus: status)
            case .notPlayable, .noVideoTrack, .badDuration:
                return .notPlayable(loadError.localizedDescription)
            case .network(let detail):
                return .transientNetwork(detail)
            }
        }

        return .unknown(nsError.localizedDescription)
    }
}
