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

    public var errorDescription: String? {
        switch self {
        case .httpStatus(let status): return "HTTP \(status)"
        case .notPlayable: return "资源不可播放"
        case .noVideoTrack: return "没有视频轨道"
        case .badDuration: return "时长不可解析"
        case .network(let detail): return "网络错误：\(detail)"
        }
    }
}
