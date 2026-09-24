import Foundation

/// 休息提醒的间隔预设、合法范围与用户文案。
///
/// 休息提醒的间隔与壁纸切换间隔是两种不同的节奏：这里使用固定间隔，
/// 不叠加壁纸调度的随机抖动。
public enum RestReminderInterval {

    public static let defaultSeconds: Double = 3_600
    public static let minSeconds: Double = 1_800
    public static let maxSeconds: Double = 86_400

    /// 菜单顺序必须保持升序。
    public static let presets: [Double] = [1_800, 3_600, 7_200, 14_400]

    public static func clamp(_ seconds: Double) -> Double {
        guard seconds.isFinite else { return defaultSeconds }
        return Swift.min(Swift.max(seconds, minSeconds), maxSeconds)
    }

    public static func label(_ seconds: Double) -> String {
        let value = clamp(seconds)
        return DurationText.concise(value, fallback: String(Int(value)) + " 秒")
    }
}

/// 休息时长的预设、合法范围与用户文案。
public enum RestReminderDuration {

    public static let defaultSeconds: Double = 60
    public static let minSeconds: Double = 60
    public static let maxSeconds: Double = 3_600

    /// 菜单顺序必须保持升序。
    public static let presets: [Double] = [60, 120, 180, 300, 600]

    public static func clamp(_ seconds: Double) -> Double {
        guard seconds.isFinite else { return defaultSeconds }
        return Swift.min(Swift.max(seconds, minSeconds), maxSeconds)
    }

    public static func label(_ seconds: Double) -> String {
        let value = clamp(seconds)
        return DurationText.concise(value, fallback: String(Int(value)) + " 秒")
    }
}

/// 休息提醒的活跃时间累计状态机。
///
/// 这里不读取系统时钟，也不依赖 AppKit。调用方把单调时钟算出的时间增量和
/// 「当前是否允许累计」传进来，因此可以在无 GUI 的测试进程里验证边界与重置。
public struct RestReminderClock: Equatable, Sendable {

    /// 最后一次系统输入或明确的 App 活动后，仍视为活跃的最长时间。
    public static let inactivityTimeoutSeconds: Double = 300

    public private(set) var accumulatedSeconds: Double
    public private(set) var isDue: Bool

    public init(accumulatedSeconds: Double = 0, isDue: Bool = false) {
        self.accumulatedSeconds = max(0, accumulatedSeconds.isFinite ? accumulatedSeconds : 0)
        self.isDue = isDue
    }

    /// 累计一段活跃时间。到达间隔时只把 `isDue` 从 false 翻到 true 一次。
    ///
    /// - Returns: 本次调用是否刚好产生了到期事件。
    @discardableResult
    public mutating func advance(
        by seconds: Double,
        intervalSeconds: Double,
        enabled: Bool,
        canAccumulate: Bool
    ) -> Bool {
        guard enabled, canAccumulate, !isDue else { return false }
        guard seconds.isFinite, seconds > 0 else { return false }

        let interval = RestReminderInterval.clamp(intervalSeconds)
        accumulatedSeconds = min(interval, accumulatedSeconds + seconds)
        guard accumulatedSeconds >= interval else { return false }
        isDue = true
        return true
    }

    /// 休息层真正显示后清零，开始下一轮累计。
    public mutating func markRestStarted() {
        accumulatedSeconds = 0
        isDue = false
    }

    /// 关闭提醒时清空当前累计与待触发状态。
    public mutating func reset() {
        accumulatedSeconds = 0
        isDue = false
    }
}
