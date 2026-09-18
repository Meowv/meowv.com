import Foundation

/// 切换节奏策略。
///
/// 默认 5 分钟切一张。原因：可用的视频都是 10 秒预览片，若「播完即切」
/// 会每 10 秒换一张，视觉上过于频繁；而候选池有 2600 多条，
/// 5 分钟间隔下大约 9 天才会轮完一轮，重复感被充分稀释。
public struct SchedulePolicy {

    /// 固定间隔（秒）。设为 0 或负数时退化为「播完即切」。
    public var intervalSeconds: Double
    /// 抖动比例，0.2 表示实际间隔在 ±20% 之间随机。
    /// 纯固定间隔会让人产生「什么时候会变」的预期，加抖动更自然。
    public var jitterRatio: Double
    /// 是否播完当前视频就切换，忽略固定间隔。
    public var switchWhenFinished: Bool

    public static let defaultIntervalSeconds: Double = 300
    public static let defaultJitterRatio: Double = 0.2

    public init(
        intervalSeconds: Double = SchedulePolicy.defaultIntervalSeconds,
        jitterRatio: Double = SchedulePolicy.defaultJitterRatio,
        switchWhenFinished: Bool = false
    ) {
        self.intervalSeconds = intervalSeconds
        self.jitterRatio = jitterRatio
        self.switchWhenFinished = switchWhenFinished
    }

    /// 下一次切换的等待时长。
    ///
    /// - Parameter videoDuration: 当前视频时长；仅「播完即切」模式用到。
    ///   取不到时长时（`nil` 或非正数）退回固定间隔，避免退化成 0 秒死循环。
    public func nextDelaySeconds<G: RandomNumberGenerator>(
        videoDuration: Double? = nil,
        using generator: inout G
    ) -> Double {
        if switchWhenFinished, let duration = videoDuration, duration > 0, duration.isFinite {
            return duration
        }
        return jitteredInterval(using: &generator)
    }

    public func nextDelaySeconds(videoDuration: Double? = nil) -> Double {
        var generator = SystemRandomNumberGenerator()
        return nextDelaySeconds(videoDuration: videoDuration, using: &generator)
    }

    private func jitteredInterval<G: RandomNumberGenerator>(using generator: inout G) -> Double {
        let base = intervalSeconds > 0 ? intervalSeconds : SchedulePolicy.defaultIntervalSeconds
        let ratio = max(0, min(jitterRatio, 1))
        guard ratio > 0 else { return base }
        let factor = 1 + Double.random(in: -ratio...ratio, using: &generator)
        return base * factor
    }
}
