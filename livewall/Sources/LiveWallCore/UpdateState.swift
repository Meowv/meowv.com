/// 更新功能在菜单里的**唯一状态**。
///
/// 自动检查只在收到结果时更新菜单。手动检查期间，菜单显示进度。
public enum UpdateState: Equatable, Sendable {

    /// 没有可提示的更新：还没查过、查了没有、或查失败。
    /// 显示「检查更新」入口。
    case idle
    /// 正在等待用户主动查询的结果。
    case checkingManually
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

    /// 手动检查时在入口原位显示进度。
    public var checkItemTitle: String {
        self == .checkingManually ? "正在检查更新…" : "检查更新"
    }

    public var checkItemEnabled: Bool { self == .idle }

    // MARK: - 迁移

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
        case .checkingManually: return "检查中"
        case .available(let feed): return "有新版本 \(feed.version)"
        }
    }
}
