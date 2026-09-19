import Foundation

/// 版本检查的判定结果。三态，纯逻辑、可穷举验证。
///
/// 曾有过 `.ignored`（用户忽略过这个 build），随「忽略此版本」一起删掉了 ——
/// 那个状态一旦进入就没有出口，属于死胡同。
public enum UpdateDecision: Equatable, Sendable {

    /// 本地已是最新（远程 build ≤ 本地 build）。
    case upToDate
    /// 有新版本可提示。
    case available(UpdateFeed)
    /// 判不出来：本地 build 读不到、远程信息不可用，或当前系统版本低于最低要求。
    ///
    /// **这类一律不提示** —— 提示一个「也许有、但不知道从哪下」的更新
    /// 比不提示更烦人，而失败的真相已经写进日志了。
    case unusable

    /// 该不该在菜单里显示更新入口。
    public var showsUpdateRow: Bool {
        if case .available = self { return true }
        return false
    }
}

public enum UpdateEvaluator {

    /// 判定是否有新版本。**顺序即优先级**，改顺序等于改语义。
    ///
    /// 1. 本地 build 读不到 → `.unusable`（直接跑 `.build/` 里的可执行文件就是这种情况）；
    /// 2. 远程信息不可用 → `.unusable`；
    /// 3. 当前系统低于 `minOSVersion` → `.unusable`（装了也跑不起来）；
    /// 4. 远程 build ≤ 本地 → `.upToDate`；
    /// 5. 其余 → `.available`。
    ///
    /// - Parameter currentOS: 默认取当前系统，测试时显式传入即可脱离真机验证。
    public static func evaluate(
        localBuild: Int?,
        feed: UpdateFeed?,
        currentOS: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion
    ) -> UpdateDecision {
        guard let localBuild else { return .unusable }
        guard let feed else { return .unusable }
        guard isOSAtLeast(feed.minOSVersion, current: currentOS) else { return .unusable }
        guard feed.build > localBuild else { return .upToDate }
        return .available(feed)
    }

    /// 当前系统是否满足最低要求。`minOSVersion` 为 nil 时一律满足。
    ///
    /// 逐段比较（`13.0` → 13.0.0），缺段补 0。解析不出来时**当作满足** ——
    /// 服务端填了个看不懂的值，不该让用户因此看不到更新（最坏情况是装完跑不起来，
    /// 而那是发布流程该拦的事，不是客户端该猜的事）。
    public static func isOSAtLeast(_ required: String?, current: OperatingSystemVersion) -> Bool {
        guard let required else { return true }
        let parts = required.split(separator: ".").compactMap { Int($0) }
        guard !parts.isEmpty else { return true }
        let target = (
            parts[0],
            parts.count > 1 ? parts[1] : 0,
            parts.count > 2 ? parts[2] : 0
        )
        // 逐段比，不靠元组比较（Swift 3 起元组没有 `<` 了）。
        let targetParts = [target.0, target.1, target.2]
        let actualParts = [current.majorVersion, current.minorVersion, current.patchVersion]
        for index in 0..<3 where targetParts[index] != actualParts[index] {
            return targetParts[index] < actualParts[index]
        }
        return true
    }
}
