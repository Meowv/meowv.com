import Foundation
import LiveWallCore

/// 采集**本进程**的 CPU 与内存占用。
///
/// 只回答「我自己用了多少」：数值全部取自本进程的 `proc_pid_rusage(getpid(), …)`，
/// 不遍历其它进程、不读整机统计（`host_statistics` / `host_statistics64` 一类刻意不用）。
/// 为什么是 `proc_pid_rusage` 而不是 mach 的 `task_info`，见文件末尾的实测说明。
///
/// **采样只由展示触发** —— 调用方在菜单展开时调 `sample`，收起时调 `cancel`。
/// 这里没有定时器、没有后台轮询：菜单收起期间进程不会被唤醒去刷新数字，
/// 于是「实时」这个要求在物理上不成立，代价是零常驻开销。
///
/// 主线程不会被阻塞：采样跑在 utility 队列上，结果回主线程；
/// 菜单已经收起时回调直接丢弃（见 `AppDelegate.applyUsageReport`）。
final class ProcessMonitor {

    /// 一次采样的结果（已算好，可直接进菜单）。
    struct Report: Equatable {
        /// nil = 这一次的占用率算不出来（没有基线、墙钟没走，或区间太短）。
        /// 与整个 `Report` 为 nil 不是一回事：后者是**采样本身失败**，连内存都没有。
        var cpuPercent: Double?
        var memoryBytes: UInt64
        /// 自基线以来的最大值，用来看有没有泄漏。
        var peakBytes: UInt64
        /// 这次 CPU 百分比对应的真实区间。必须由菜单显示出来，否则数字会被误读。
        var windowSeconds: Double?
        /// 基线来自启动（第一次查看）还是上一次查看。
        var sinceLaunch: Bool
    }

    private let queue = DispatchQueue(label: "com.meowv.livewall.process-monitor", qos: .utility)
    private var pending: DispatchWorkItem?
    /// 采样代号。取消时递增，回主线程的旧结果据此丢弃 ——
    /// `DispatchWorkItem.cancel()` 挡不住「已经在跑」的那一个。
    private var generation = 0

    /// 上次采样的原始值。**只在主线程读写**：交给后台时按值拷贝，
    /// 结果回到主线程后才更新 —— 因此不需要锁。
    private var baseline: ProcessUsageSample?
    /// 上一次成功给出的结果。区间太短时原样交回，免得把噪音显示成读数。
    private var lastReport: Report?
    /// 基线是否来自启动（决定文案写「自启动」还是「近」）。
    private var baselineIsLaunch = true
    private var peakBytes: UInt64 = 0

    /// 启动时采一次基线。**一次性**调用，不是定时器。
    ///
    /// 没有它，第一次展开菜单就没有任何可比较的起点 —— 而「采一次」这件事
    /// 在启动路径上只花几十微秒，比「第一次查看永远显示测量中」划算得多。
    func prepareBaseline() {
        guard let sample = Self.currentSample() else { return }
        baseline = sample
        peakBytes = sample.memoryBytes
        baselineIsLaunch = true
    }

    /// 采一次，结果回主线程。**nil 表示采样失败**（mach 调用没拿到数据）。
    ///
    /// 失败也必须回调：不回调的话调用方那两行会永远停在「测量中…」，
    /// 而用户没有任何办法知道真相是「取不到」。
    ///
    /// 重复调用会取消上一次未完成的采样 —— 菜单可能被连点，而两次采样之间
    /// 只差几毫秒，留着两个只会让回调互相覆盖。
    func sample(completion: @escaping (Report?) -> Void) {
        pending?.cancel()
        generation += 1

        let token = generation
        let base = baseline
        let sinceLaunch = baselineIsLaunch
        let peakBefore = peakBytes

        // 两层都是 `[weak self]`：这个任务在菜单收起后仍可能短暂存活，
        // 没必要让它把 monitor 一直留住。
        let work = DispatchWorkItem { [weak self] in
            // 显式写类型名而不是 `Self`：闭包里用 `Self` 会连带强捕获 self。
            guard let latest = ProcessMonitor.currentSample() else {
                DispatchQueue.main.async { [weak self] in
                    guard let self, token == self.generation else { return }
                    completion(nil)
                }
                return
            }
            let window = base.map { Double(latest.wallNanos - $0.wallNanos) / 1_000_000_000 }
            let peak = ProcessUsage.peakBytes(peakBefore, latest.memoryBytes)
            let percent = base.flatMap { ProcessUsage.cpuPercent(from: $0, to: latest) }
            let canReportCPU = percent != nil && window.map(ProcessUsage.isWindowUsable) ?? false

            DispatchQueue.main.async { [weak self] in
                guard let self, token == self.generation else { return }
                self.peakBytes = peak
                guard canReportCPU, let window else {
                    // 没有基线，或区间太短 —— **都不推进基线**：推进了的话，下一次查看
                    // 也会退化成「距上一次几乎为 0」，一连串假数据（实测 0.0005 秒的区间
                    // 算出 134%）。只有「压根没有基线」时才顺手补一个，否则永远算不出来。
                    if base == nil { self.baseline = latest }
                    completion(
                        self.lastReport
                            ?? Report(
                                cpuPercent: nil,
                                memoryBytes: latest.memoryBytes,
                                peakBytes: peak,
                                windowSeconds: nil,
                                sinceLaunch: sinceLaunch
                            )
                    )
                    return
                }
                // 基线在这里才推进：它只在主线程被写，后台拿到的永远是拷贝。
                self.baseline = latest
                self.baselineIsLaunch = false
                let report = Report(
                    cpuPercent: percent,
                    memoryBytes: latest.memoryBytes,
                    peakBytes: peak,
                    windowSeconds: window,
                    sinceLaunch: sinceLaunch
                )
                self.lastReport = report
                completion(report)
            }
        }
        pending = work
        queue.async(execute: work)
    }

    /// 菜单收起时调用：取消未完成的采样并释放它。
    ///
    /// 基线快照与峰值**刻意保留** —— 它们是下一次计算 CPU 增量与泄漏判定的必需输入，
    /// 不是采样过程本身；连它们一起清空，就等于每次查看都退回「第一次」。
    func cancel() {
        generation += 1
        pending?.cancel()
        pending = nil
    }

    // MARK: - 采样

    /// 一次 `proc_pid_rusage`，同时拿到 CPU 累计时间与物理内存足迹。
    ///
    /// **为什么不是 `task_info(MACH_TASK_BASIC_INFO)`**（网上流传最广的那种写法）：
    /// 本机实测（macOS 27.0 / arm64）它的 `user_time` / `system_time` **恒为 0**，
    /// 而同一结构体里的 `virtual_size` / `resident_size` 是有值的 —— 不是调用失败
    /// （返回 KERN_SUCCESS），就是这两个字段没填。直接用它会得到一个永远 0% 的占用率，
    /// 而「0%」看起来完全合理，极难发现。别改回那种写法。
    ///
    /// 只跑一次系统调用（几十微秒级），仍然放到后台队列上执行 —— 它落在「菜单正在展开」
    /// 这条路径上，那段时间主线程在跑菜单的 tracking run loop，任何同步等待都会表现为菜单卡顿。
    private static func currentSample() -> ProcessUsageSample? {
        var usage = rusage_info_v2()
        let buffer = withUnsafeMutablePointer(to: &usage) { UnsafeMutableRawPointer($0) }
        // 第三个参数在 C 里是 `rusage_info_t *`（`rusage_info_t` 本身是指针类型），
        // Swift 侧因此是 `UnsafeMutablePointer<rusage_info_t?>` —— 照字面 rebinding 会报类型不符。
        let code = buffer.withMemoryRebound(to: Optional<rusage_info_t>.self, capacity: 1) {
            proc_pid_rusage(getpid(), Self.rusageInfoV2, $0)
        }
        // 成功返回 0，失败返回 -1（不是 kern_return_t，别拿 KERN_* 去比）
        guard code == 0 else { return nil }
        return ProcessUsageSample(
            cpuNanos: nanos(ticks: usage.ri_user_time + usage.ri_system_time),
            wallNanos: DispatchTime.now().uptimeNanoseconds,
            memoryBytes: usage.ri_phys_footprint
        )
    }

    /// `RUSAGE_INFO_V2` 是 C 宏（值 2），Swift 导入不了，只能写常量。
    private static let rusageInfoV2: Int32 = 2

    /// 每个 mach 滴答多少纳秒。取一次就够 —— 运行期不会变。
    ///
    /// `ri_user_time` / `ri_system_time` 的单位是 **mach 绝对时间**，不是纳秒：
    /// 本机时间基 125/3（≈41.67 ns/滴答）。实测对照（烧 1.0 秒 CPU）：
    /// 原始值 23,596,390 → 换算 0.983 秒，与 `clock()` 的 0.983 秒一致；
    /// 不换算会得到 0.024 秒，差 41 倍。**别忘了换算。**
    private static let nanosPerTick: Double = {
        var info = mach_timebase_info_data_t()
        guard mach_timebase_info(&info) == KERN_SUCCESS, info.denom > 0 else { return 1 }
        return Double(info.numer) / Double(info.denom)
    }()

    private static func nanos(ticks: UInt64) -> UInt64 {
        UInt64((Double(ticks) * nanosPerTick).rounded())
    }
}
