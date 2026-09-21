import Foundation

/// 视频加载失败的原因。
///
/// 放在 `LiveWallCore` 而不是 App 里：`FailurePolicy` 需要按它分类来决定
/// 「拉黑换一条」还是「保持当前画面」，那段逻辑必须能单测。
/// 这个枚举本身是纯数据，不依赖 AVFoundation。
public enum VideoLoadError: Error, LocalizedError, Equatable {
    /// HEAD 探测拿到了非成功状态码。
    case httpStatus(Int)
    case notPlayable
    case noVideoTrack
    case badDuration
    case network(String)
    /// 本地文件不存在或不可读（`file://` 专用）。
    ///
    /// 单独一个 case 而不是复用 `notPlayable`：它要能落进「资源问题」那一类
    /// （拉黑换下一条），而**绝不能**被当成网络问题 —— 本地文件读不到与网络无关，
    /// 按网络处理会让失效条目留在池子里反复重试。
    case fileUnreadable(String)

    public var errorDescription: String? {
        switch self {
        case .httpStatus(let status): return "HTTP \(status)"
        case .notPlayable: return "资源不可播放"
        case .noVideoTrack: return "没有视频轨道"
        case .badDuration: return "时长不可解析"
        case .network(let detail): return "网络错误：\(detail)"
        case .fileUnreadable(let path): return "本地文件不可读：\(path)"
        }
    }
}
