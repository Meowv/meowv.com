import Foundation

/// 更新功能在菜单里的**唯一状态**。
///
/// 菜单的显隐、可点性、文案全部由这一个字段派生 —— 不允许别处再单独判
/// `availableUpdate != nil` 或 `isChecking`：两个独立布尔量能组合出「既在检查中、
/// 又有新版本」这种不存在的状态，而菜单只能二选一，迟早对不上。
///
/// 迁移规则（**幂等**：同一个事件重复到达，结果不变）：
///
/// | 当前 | 事件 | 迁移到 | 说明 |
/// | --- | --- | --- | --- |
/// | `.idle` | 开始检查（启动自动 / 手动点击） | `.checking` | |
/// | `.checking` | 又开始一次（并发点击） | `.checking` | 不发第二个请求 |
/// | `.checking` | 结果 `.available(f)` | `.available(f)` | 隐藏入口，显示更新行 |
/// | `.checking` | 结果 `.upToDate` / `.unusable` | `.idle` | **失败按无更新处理**，入口不动 |
/// | `.available` | 结果非 available（再次检查时） | `.idle` | 线上撤下后入口要还回来 |
///
/// 没有「忽略 / 稍后」这类从 `.available` 手动退回 `.idle` 的迁移：那两个动作已删除，
/// 留着迁移函数也只是没有调用点的死代码。
public enum UpdateState: Equatable, Sendable {

    /// 没有可提示的更新：还没查过、查了没有、或查失败。
    /// 显示「检查更新」入口。
    case idle
    /// 正在检查。入口**保留但禁用**，标题带省略号 —— 让用户看见在跑，同时挡掉重复请求。
    case checking
    /// 有新版本。**隐藏「检查更新」入口**，只显示「有新版本」那一行（子菜单里是下载动作）。
    case available(UpdateFeed)

    // MARK: - 显隐（菜单只认这三个属性）

    /// 是否显示「检查更新」入口。有新版本时隐藏 —— 更新行里已经有下一步动作，
    /// 再留一个「检查更新」会让人以为「点了才是真的」。
    public var showsCheckItem: Bool {
        if case .available = self { return false }
        return true
    }

    /// 是否显示「有新版本」那一行。
    public var showsUpdateRow: Bool {
        if case .available = self { return true }
        return false
    }

    /// 「检查更新」入口的标题。检查中带省略号，是唯一的进度反馈
    /// （菜单栏 App 不该为了进度弹窗）。
    public var checkItemTitle: String {
        self == .checking ? "检查更新…" : "检查更新"
    }

    /// 检查中的入口禁用 —— 与 `UpdateChecker` 的 `isChecking` 双保险，
    /// 键盘触发或菜单没来得及重建时也挡得住。
    public var checkItemEnabled: Bool { self != .checking }

    // MARK: - 迁移

    /// 开始一次检查。已经在检查中就**保持不变**（幂等）—— 调用方据此不必先判 `isChecking`。
    public var afterCheckStarted: UpdateState {
        self == .checking ? self : .checking
    }

    /// 检查结束后的状态。**只有 `.available` 才离开 `.idle`**，其余（已是最新 /
    /// 判不出来）一律回 `.idle` —— 失败与「没有更新」对菜单是同一件事。
    ///
    /// 重复喂同一个 `decision` 结果不变，所以「结果回来了两次」不会把菜单搞乱。
    public func afterCheckFinished(_ decision: UpdateDecision) -> UpdateState {
        if case .available(let feed) = decision { return .available(feed) }
        return .idle
    }

    /// 当前待更新的版本。`.available` 之外都是 nil。
    public var feed: UpdateFeed? {
        if case .available(let feed) = self { return feed }
        return nil
    }

    /// 日志用的名字。状态迁移都要打一条 —— 「为什么菜单变成这样」只能靠它回溯。
    public var label: String {
        switch self {
        case .idle: return "无更新"
        case .checking: return "检查中"
        case .available(let feed): return "有新版本 \(feed.version)"
        }
    }
}
