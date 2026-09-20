import Network

/// 网络可达性监测。
///
/// 用系统级信号而不是「猜错误」：只有确知网络不通时，才能放心地
/// **不拉黑**失败的那条资源 —— 否则一次断网会把整池好资源全拉黑。
final class NetworkMonitor {

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.meowv.livewall.network-monitor")

    private(set) var isReachable = true
    /// 可达性变化时回调（主线程）。
    var onChange: ((Bool) -> Void)?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let reachable = path.status == .satisfied
            // 状态由主线程统一读写；路径监测队列只负责采样，避免与失败策略并发读写。
            DispatchQueue.main.async {
                guard reachable != self.isReachable else { return }
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
