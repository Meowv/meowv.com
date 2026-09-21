import Network

/// 网络可达性监测。
///
/// 用系统级信号而不是「猜错误」：只有确知网络不通时，才能放心地
/// **不拉黑**失败的那条资源 —— 否则一次断网会把整池好资源全拉黑。
///
/// **`@MainActor`**：`isReachable` 与 `onChange` 本来就约定由主线程统一读写
/// （见 `start()` 里的注释），标注只是把那条约定的执行者从「约定」换成编译器。
@MainActor
final class NetworkMonitor {

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.meowv.livewall.network-monitor")

    private(set) var isReachable = true
    /// 可达性变化时回调（主线程）。
    var onChange: ((Bool) -> Void)?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            // 状态由主线程统一读写；路径监测队列只负责采样，避免与失败策略并发读写。
            //
            // 这里**不能**用 `DispatchQueue.main.async`：它的闭包同样是非隔离的，
            // 而 `isReachable` 已经是主线程隔离状态。`Task { @MainActor }` 才是
            // 「显式回到主 actor」的写法，投递目标与前者相同。
            Task { @MainActor [weak self] in
                guard let self, reachable != self.isReachable else { return }
                self.isReachable = reachable
                self.onChange?(reachable)
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }
}
