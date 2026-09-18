import Foundation

/// 日志轮转的配置与判定。
///
/// 轮转方式是**清空并复用同一个文件**：不生成 `.1` / `.2` / 日期后缀 / `.gz` 归档，
/// 旧内容也不再保留。壁纸是后台常驻进程，日志只是排障用的，攒一堆历史文件只是白占空间。
///
/// 这里只放**判定**，不放文件 IO —— IO 在 `AppDelegate` 里，
/// 这样阈值与边界条件能脱离文件系统穷举验证。
public struct LogRotationConfig: Sendable, Equatable {

    // MARK: - 单文件大小上限

    /// 单个日志文件的大小上限，**单位：字节**。
    ///
    /// 文件达到或超过这个值就触发轮转（清空复用同一个文件）。
    /// 默认 2 MB —— 按实测约 288 次切换/天、每次 2~3 行估算，大约是一个月的量。
    /// 设为 0 表示**不限制**（永不因体积触发轮转）。
    public var maxFileSizeBytes: UInt64 = 2 * 1024 * 1024

    // MARK: - 轮转检查间隔

    /// 按**写入次数**触发检查的间隔，**单位：次**。
    ///
    /// 每累计写入这么多条才去 stat 一次文件大小。判的是「写了多少条」而不是「写了多少字节」：
    /// 单条长度不定，按条数更能预测检查频率。默认 64 条。
    /// 设为 0 表示**不按次数检查**（只按时间）。
    public var checkIntervalWrites: Int = 64

    /// 按**时间**触发检查的兜底间隔，**单位：秒**。
    ///
    /// 日志很稀疏时（例如一天只有几条）次数间隔可能很久攒不够，
    /// 由这个间隔保证仍然会定期检查。默认 300 秒（5 分钟）。
    /// 设为 0 表示**不按时间检查**（只按次数）。
    ///
    /// 两个间隔是「满足其一即检查」，不是「同时满足」。
    public var checkIntervalSeconds: TimeInterval = 300

    public init(
        maxFileSizeBytes: UInt64 = 2 * 1024 * 1024,
        checkIntervalWrites: Int = 64,
        checkIntervalSeconds: TimeInterval = 300
    ) {
        self.maxFileSizeBytes = maxFileSizeBytes
        self.checkIntervalWrites = checkIntervalWrites
        self.checkIntervalSeconds = checkIntervalSeconds
    }
}

extension LogRotationConfig {

    /// 是否该做一次文件大小检查。
    ///
    /// - Parameters:
    ///   - writesSinceCheck: 距上次检查后累计写入的**条数**。
    ///   - elapsedSeconds: 距上次检查经过的**秒数**。
    public func shouldCheck(writesSinceCheck: Int, elapsedSeconds: TimeInterval) -> Bool {
        if checkIntervalWrites > 0, writesSinceCheck >= checkIntervalWrites { return true }
        if checkIntervalSeconds > 0, elapsedSeconds >= checkIntervalSeconds { return true }
        return false
    }

    /// 是否该轮转。取等号：达到上限即轮转，不等到超出的下一条。
    public func shouldRotate(fileSizeBytes: UInt64) -> Bool {
        guard maxFileSizeBytes > 0 else { return false }
        return fileSizeBytes >= maxFileSizeBytes
    }

    /// 轮转发生时写进日志的那条说明。
    ///
    /// 抽出来是为了让文案可测 —— 更重要的是，轮转后文件是空的，
    /// 没有这条说明的话，打开文件的人只会看到内容「从半截开始」，不知道前面是被清掉的。
    public static func rotationNoticeText(clearedBytes: UInt64, limitBytes: UInt64) -> String {
        "日志轮转：文件已达 \(byteCountText(clearedBytes))（上限 \(byteCountText(limitBytes))），"
            + "已清空并复用同一个文件，旧内容不再保留"
    }

    /// 字节数的可读文本。
    ///
    /// 两个刻意的取舍：
    /// 1. **不用 `ByteCountFormatter`** —— 它跟随系统语言与地区，输出不稳定，没法在测试里断言；
    /// 2. **不用 `String(format: "%.1f")`** —— 浮点格式化同样受地区影响（小数点可能是逗号），
    ///    这里改用整数运算，先取整再取十分位，全程不碰浮点。
    ///
    /// 取余后再乘 10 而不是先乘 10 再除：后者在 `bytes` 极大时会整数溢出。
    public static func byteCountText(_ bytes: UInt64) -> String {
        let kb: UInt64 = 1024
        let mb = kb * 1024

        if bytes >= mb { return "\(bytes / mb).\((bytes % mb) * 10 / mb) MB" }
        if bytes >= kb { return "\(bytes / kb).\((bytes % kb) * 10 / kb) KB" }
        return "\(bytes) B"
    }
}
