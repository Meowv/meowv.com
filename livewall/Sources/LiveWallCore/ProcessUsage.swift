import Foundation

/// 进程自身的运行数据（CPU / 内存）—— 只描述**本进程**，不涉及其它进程，也不读整机统计。
///
/// 采样是**惰性**的：只在需要展示时采一次，不与任何定时器绑定（见 `LiveWall/ProcessMonitor`）。
/// 由此推出一条硬约束：**CPU 占用率是区间量，不是瞬时量** —— 单次采样只能拿到累计值，
/// 必须两次采样求差。所以这里的入口几乎都吃「基线 + 最新」一对值。

/// 一次采样的原始值。
public struct ProcessUsageSample: Equatable, Sendable {
    /// 累计 CPU 时间（纳秒，user + system）。
    public var cpuNanos: UInt64
    /// 采样时刻的墙钟（纳秒，取自 `DispatchTime.uptimeNanoseconds`）。
    ///
    /// 用 uptime 而不是 `Date()`：后者会随系统时钟调整回退，一退缩就会算出负的占用率。
    public var wallNanos: UInt64
    /// 物理内存足迹（字节），口径与活动监视器「内存」列一致。
    public var memoryBytes: UInt64

    public init(cpuNanos: UInt64, wallNanos: UInt64, memoryBytes: UInt64) {
        self.cpuNanos = cpuNanos
        self.wallNanos = wallNanos
        self.memoryBytes = memoryBytes
    }
}

public enum ProcessUsage {

    /// 两次采样之间的平均 CPU 占用率（百分数，1.0 = 1%）。
    ///
    /// **上限不夹到 100**：多核下这个数本来就可以超过 100（活动监视器也是这么显示的），
    /// 夹住会把「两个核跑满」显示成「一个核跑满」。下限夹到 0，因为负数只能是采样出错。
    ///
    /// 墙钟没走（同一时刻算了两次）或回退时返回 nil —— 此时「占用率」没有定义，
    /// 返回 0 会被当成「这个进程完全不占 CPU」，是错的。
    public static func cpuPercent(from base: ProcessUsageSample, to latest: ProcessUsageSample) -> Double? {
        guard latest.wallNanos > base.wallNanos else { return nil }
        let wall = latest.wallNanos - base.wallNanos
        let cpu = latest.cpuNanos >= base.cpuNanos ? latest.cpuNanos - base.cpuNanos : 0
        let percent = Double(cpu) / Double(wall) * 100
        guard percent.isFinite, percent >= 0 else { return nil }
        return percent
    }

    /// 峰值取两者较大。刻意不做衰减 —— 峰值的用途是看有没有泄漏，衰减会把它抹平。
    public static func peakBytes(_ a: UInt64, _ b: UInt64) -> UInt64 { max(a, b) }

    /// 能算出有意义占用率的**最短区间**（秒）。
    ///
    /// 实测：区间 0.0005 秒时算出 134% —— 分子分母都极小，比值完全是噪音，
    /// 而「134%」看起来像一个真读数。**宁可不显示，也不要显示噪音。**
    public static let minimumWindowSeconds = 0.25

    /// 区间够不够算占用率。
    public static func isWindowUsable(_ seconds: Double) -> Bool {
        seconds.isFinite && seconds >= minimumWindowSeconds
    }
}

/// 状态区两行的文案。
///
/// 文案规则集中在这里，因为「同一个数字在菜单里该长什么样」只应有一处定义；
/// 也因为这些规则没有系统调用，可以穷举验证。
public enum ProcessUsageText {

    /// 采样还没回来时的占位。
    public static let measuring = "测量中…"
    /// 采样失败（mach 调用返回非 KERN_SUCCESS）。
    public static let unavailable = "暂不可用"

    /// 字节写成人读文案。1024 进制，与活动监视器一致。
    ///
    /// 小于 10 时保留一位小数（`8.4 MB`），否则取整（`128 MB`）——
    /// 小数值正是需要看变化的地方，大数值的小数位是噪音。
    public static func bytes(_ value: UInt64) -> String {
        if value < 1024 { return "\(value) B" }
        let kb = Double(value) / 1024
        if kb < 1024 { return scaled(kb, "KB") }
        let mb = kb / 1024
        if mb < 1024 { return scaled(mb, "MB") }
        return String(format: "%.2f GB", mb / 1024)
    }

    /// 占用率写成人读文案。nil（拿不到）显示 `—` 而不是 `0%` —— 后者是假数据。
    public static func percent(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        if value < 10 { return String(format: "%.1f%%", value) }
        return "\(Int(value.rounded()))%"
    }

    /// 状态区第一行。
    ///
    /// **必须带上区间**（`近 3 分钟` / `自启动 1 小时`）：这是两次查看之间的平均，
    /// 不写区间就会被读成瞬时值，而瞬时值根本没采。
    public static func cpuRow(percent: Double?, windowSeconds: Double?, sinceLaunch: Bool = false) -> String {
        let value = Self.percent(percent)
        guard let seconds = windowSeconds, seconds > 0 else { return "CPU \(value)" }
        let prefix = sinceLaunch ? "自启动" : "近"
        let span = DurationText.concise(seconds) ?? "刚刚"
        return "CPU \(value)（\(prefix) \(span)）"
    }

    /// 状态区第二行。峰值只在真的更高时才显示 —— 刚启动时两者相等，那就没信息。
    public static func memoryRow(bytes: UInt64, peakBytes: UInt64) -> String {
        let current = Self.bytes(bytes)
        guard peakBytes > bytes else { return "内存 \(current)" }
        return "内存 \(current)（峰值 \(Self.bytes(peakBytes))）"
    }

    /// 状态区的**一行**：内存在前、CPU 在后，中间用 ` · ` 分隔。
    ///
    /// 两行并一行是为了省菜单高度（状态区本来还有片名、暂停原因、网络状态、附注、
    /// 热键冲突等行）。CPU 的**区间说明必须保留**：不写区间会被读成瞬时值，
    /// 而瞬时值根本没采 —— 见本文件顶部的说明。
    public static func combinedRow(
        percent: Double?,
        windowSeconds: Double?,
        sinceLaunch: Bool = false,
        bytes: UInt64,
        peakBytes: UInt64
    ) -> String {
        memoryRow(bytes: bytes, peakBytes: peakBytes)
            + " · "
            + cpuRow(percent: percent, windowSeconds: windowSeconds, sinceLaunch: sinceLaunch)
    }

    private static func scaled(_ value: Double, _ unit: String) -> String {
        guard value < 10 else { return "\(Int(value.rounded())) \(unit)" }
        return String(format: "%.1f %@", value, unit)
    }
}
