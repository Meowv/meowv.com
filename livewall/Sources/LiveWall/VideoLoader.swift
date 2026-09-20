import AVFoundation
import LiveWallCore

/// 视频准入校验的结果。
///
/// 刻意把 `asset` 带出来给播放器复用：实测每个 `AVURLAsset` 都会把整个文件拉一遍，
/// 校验建一个、播放再建一个就是**双倍流量**（6.28MB 的视频实测下载 12.55MB）。
struct LoadedVideo {
    let asset: AVURLAsset
    let url: URL
    let durationSeconds: Double
    let width: Int
    let height: Int
    let codec: String

    var resolutionText: String { "\(width)×\(height)" }
}

/// 播放前的准入校验。
///
/// 目的有两个：一是尽早把坏资源挡在播放器之外（AVPlayer 的失败回调来得晚且信息少），
/// 二是拿到真实时长 —— 清单里的 `durationSeconds` 当前恒为 nil，
/// 「播完即切」模式需要这个值。
enum VideoLoader {

    static func load(_ url: URL) async throws -> LoadedVideo {
        // 先做一次 HEAD 探测拿真实 HTTP 状态码。
        //
        // 为什么必须单独探测：实测 AVFoundation 对 404 的本地化描述是
        // 「在此服务器上找不到所请求的URL。」，**不含数字状态码**，
        // 无法据此区分「资源失效」（该拉黑）和「服务器临时故障」（不该拉黑）。
        // HEAD 只取响应头不下载正文，代价可忽略。
        let status = try await probeHTTPStatus(url)
        guard status == 200 || status == 206 else {
            throw VideoLoadError.httpStatus(status)
        }

        let asset = AVURLAsset(url: url, options: [
            AVURLAssetPreferPreciseDurationAndTimingKey: true,
        ])

        let isPlayable: Bool
        do {
            isPlayable = try await asset.load(.isPlayable)
        } catch {
            throw VideoLoadError.network(error.localizedDescription)
        }
        guard isPlayable else { throw VideoLoadError.notPlayable }

        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = tracks.first else { throw VideoLoadError.noVideoTrack }

        let duration = try await asset.load(.duration)
        let seconds = CMTimeGetSeconds(duration)
        guard seconds.isFinite, seconds > 0 else { throw VideoLoadError.badDuration }

        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let transformed = size.applying(transform)

        var codec = "未知"
        if let description = try await track.load(.formatDescriptions).first {
            let subtype = CMFormatDescriptionGetMediaSubType(description)
            let bytes = withUnsafeBytes(of: subtype.bigEndian) { Data($0) }
            codec = String(data: bytes, encoding: .ascii)?.trimmingCharacters(in: .whitespaces) ?? "未知"
        }

        return LoadedVideo(
            asset: asset,
            url: url,
            durationSeconds: seconds,
            width: Int(abs(transformed.width).rounded()),
            height: Int(abs(transformed.height).rounded()),
            codec: codec
        )
    }

    /// HEAD 探测，只取响应头。
    ///
    /// **刻意不包装 `URLError`**：`FailurePolicy` 要靠 `NSURLErrorDomain` 的错误码
    /// 区分「完全没网」和「临时超时」，包装成自定义错误会把这条信息丢掉，
    /// 导致断网被误判成临时故障。
    private static func probeHTTPStatus(_ url: URL) async throws -> Int {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw VideoLoadError.network("响应不是 HTTP")
        }
        return http.statusCode
    }
}
