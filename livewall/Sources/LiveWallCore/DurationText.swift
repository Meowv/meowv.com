import Foundation

/// 时长文案：把「秒」写成人能一眼读懂的形式（`30 秒` / `5 分钟` / `1.5 小时`）。
///
/// 单独抽出来是因为有两个消费方 —— 省电的「空闲阈值」与播放的「切换间隔」。
/// 文案规则必须一致，否则同一个 300 会在一处显示成「5 分钟」、另一处显示成「300 秒」，
/// 用户会以为它们是两个不同的量。
public enum DurationText {

    /// 写成人读文案。**非法输入（非有限、非正数）返回 `nil`** ——
    /// 由调用方决定「0 秒」在它那个语境里该叫「关闭」还是别的，这里不替它下结论。
    public static func concise(_ seconds: Double) -> String? {
        guard seconds.isFinite, seconds > 0 else { return nil }
        if seconds < 60 {
            return "\(Int(seconds.rounded())) 秒"
        }
        let minutes = seconds / 60
        if minutes < 60 {
            return minutes == minutes.rounded()
                ? "\(Int(minutes)) 分钟"
                : String(format: "%.1f 分钟", minutes)
        }
        let hours = minutes / 60
        return hours == hours.rounded()
            ? "\(Int(hours)) 小时"
            : String(format: "%.1f 小时", hours)
    }

    /// 带兜底文案的版本，用于「非法值也有意义」的场景（如空闲阈值里的「关闭」）。
    public static func concise(_ seconds: Double, fallback: String) -> String {
        concise(seconds) ?? fallback
    }
}
