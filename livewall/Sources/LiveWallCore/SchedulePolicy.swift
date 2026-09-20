/// 切换节奏策略。
///
/// 默认 5 分钟切一张。原因：可用的视频都是 10 秒预览片，若「播完即切」
/// 会每 10 秒换一张，视觉上过于频繁；而候选池有 2600 多条，
/// 5 分钟间隔下大约 9 天才会轮完一轮，重复感被充分稀释。
public struct SchedulePolicy {

    /// 固定间隔（秒）。**非正数或非有限值一律退回 `defaultIntervalSeconds`** ——
    /// 注意不是「播完即切」：那样要显式开 `switchWhenFinished`。
    /// 正常路径上这个值已由 `Preferences.sanitized()` 夹进 `SwitchInterval` 的合法区间，
    /// 这里的兜底是为了挡住直接构造 `SchedulePolicy` 的调用方。
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

/// 切换间隔：菜单预设、取值范围与人读文案。
///
/// **单位是秒**（落在 `Preferences.intervalSeconds`，`Double`，JSON 里也是秒）。
/// 范围与理由：
/// - 下限 **10 秒** ≈ 一条预览片的时长。再短就是在视频播到一半时切走，
///   解码器反复重建、每张都要重新拉流，纯属浪费；而画面本身也没来得及看清。
/// - 上限 **24 小时**。再长等同「几乎不换」，那是「暂停播放」要解决的问题。
///
/// 范围外的值在这里**夹紧**而不是退回默认 —— 手改配置的人多半是「填得太短/太长」，
/// 夹到最近的合法值更接近他的本意。
public enum SwitchInterval {

    public static let minSeconds: Double = 10
    public static let maxSeconds: Double = 86_400

    /// 菜单预设（秒），必须严格升序 —— 菜单顺序直接取自它。
    /// 必须包含 `SchedulePolicy.defaultIntervalSeconds`，否则菜单里没有任何一项被勾选。
    public static let presets: [Double] = [30, 60, 120, 300, 600, 1800, 3600]

    /// 夹进合法区间。非有限值（NaN / ±∞）夹不了，退回默认间隔。
    public static func clamp(_ seconds: Double) -> Double {
        guard seconds.isFinite else { return SchedulePolicy.defaultIntervalSeconds }
        return Swift.min(Swift.max(seconds, minSeconds), maxSeconds)
    }

    /// 菜单文案。入参先夹紧，所以不会出现「关闭」「非法」这类与语境不符的字眼。
    public static func label(_ seconds: Double) -> String {
        let clamped = clamp(seconds)
        return DurationText.concise(clamped, fallback: "\(Int(clamped)) 秒")
    }
}
