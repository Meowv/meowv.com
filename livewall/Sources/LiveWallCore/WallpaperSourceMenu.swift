/// 「壁纸来源」子菜单的内容。与 `CategoryMenu` / `PlaybackOrderMenu` 同一定位：
/// 只产出数据、不碰 `NSMenu`，这样标题、顺序与勾选规则能脱离 GUI 单测。
///
/// ## 为什么它是独立的一项，而不是塞进「选片顺序」
///
/// 来源（线上 / 本地）与选片顺序（随机 / 顺序）是**正交**的两件事：
/// 来源决定「候选集从哪来」，顺序决定「这一轮怎么排」。
/// 混进同一个子菜单会变成四行同级的单选，而其中「随机」与「本地」根本不是一类东西 ——
/// 用户没法表达「本地 + 随机」这个完全合理的组合。
///
/// 勾选规则与「固定」同理是**派生显示**：本地态由 `localFolderPath != nil` 派生，
/// 不另存「当前选的是哪个来源」的布尔量。
public enum WallpaperSourceMenu {

    /// 一行对应的动作。
    public enum Kind: String, Equatable, Sendable, CaseIterable {
        /// 用线上清单（索引 + 分类切片）。默认值。
        case remote
        /// 用一个本地文件夹里的 mp4。点它即打开选择面板。
        case local
    }

    /// **只服务线上内容**的菜单入口。本地文件夹来源下它们一律置灰。
    ///
    /// 三个入口都列在这里而不是各自散在 `AppDelegate` 里判一次 `isLocalSource`：
    /// 这类「新增一个线上专属入口、忘了跟着置灰」的漏改不会有编译错误，只会让用户
    /// 点到一个必然无反应的动作。集中一处之后，加新入口必须来这里登记。
    ///
    /// 为什么本地来源下它们都没意义：
    /// - `categoryFilter`：本地文件夹没有分类概念；
    /// - `downloadCurrent`：文件本来就在用户自己的文件夹里，下载等于从自己硬盘拷回自己硬盘；
    /// - `wallpaperBrowser`：那个窗口列的是**线上分类的条目**，本地来源下没有可浏览的目录。
    public enum OnlineOnlyEntry: String, Equatable, Sendable, CaseIterable {
        case categoryFilter
        case downloadCurrent
        case wallpaperBrowser

        /// 菜单里那一项的标题（只用于日志与测试断言，不参与构建菜单）。
        public var label: String {
            switch self {
            case .categoryFilter: return "内容过滤"
            case .downloadCurrent: return "下载当前壁纸"
            case .wallpaperBrowser: return "打开动态壁纸"
            }
        }
    }

    /// 某个「只服务线上内容」的入口在当前来源下是否可点。
    ///
    /// 用**穷举 switch** 而不是直接写 `!isLocalSource`：三个入口的判据目前一致，
    /// 但将来若某个入口的规则要分化（例如「本地来源下也允许打开浏览窗口」），
    /// 这里会**编译报错**提醒补分支，而不是静默沿用旧规则。
    public static func isEnabled(_ entry: OnlineOnlyEntry, isLocalSource: Bool) -> Bool {
        switch entry {
        case .categoryFilter, .downloadCurrent, .wallpaperBrowser:
            return !isLocalSource
        }
    }

    /// 子菜单的一行。
    public struct Entry: Equatable, Sendable {
        public let kind: Kind
        public let title: String
        /// 是否勾选。两行**互斥**：本地态勾本地行，否则勾线上行。
        public let isSelected: Bool

        public init(kind: Kind, title: String, isSelected: Bool) {
            self.kind = kind
            self.title = title
            self.isSelected = isSelected
        }
    }

    /// 线上行标题。「默认」两个字要留着 —— 它是用户第一次展开菜单时
    /// 唯一能看出「不选也照样能播」的线索。
    public static let remoteTitle = "线上（默认）"

    /// 本地行标题。标题里带省略号是刻意的：点它就是「选一个文件夹」这个动作，
    /// 而不是「立刻切到某个已经选好的文件夹」（没选过的时候后者无意义）。
    public static let localTitle = "本地（MP4）"

    /// 子菜单的行，自上而下：线上 → 本地。
    public static func entries(isLocal: Bool) -> [Entry] {
        [
            Entry(kind: .remote, title: remoteTitle, isSelected: !isLocal),
            Entry(kind: .local, title: localTitle, isSelected: isLocal),
        ]
    }

    /// 父项标题。括号里**只放值**，与 `CategoryMenu.rootTitle` 的口径一致。
    ///
    /// 本地态带上文件夹名：菜单里唯一能回答「现在播的是哪个文件夹」的地方就是这一行，
    /// 名字太长会把它撑得很宽，所以截断（不换行、不加第二行说明）。
    public static func rootTitle(isLocal: Bool, localFolderName: String?) -> String {
        guard isLocal else { return "壁纸来源（线上）" }
        guard let name = localFolderName, !name.isEmpty else { return "壁纸来源（本地文件夹）" }
        return "壁纸来源（本地：\(truncated(name))）"
    }

    /// 文件夹名的显示上限。
    static func truncated(_ name: String, limit: Int = 24) -> String {
        name.count <= limit ? name : String(name.prefix(limit)) + "…"
    }
}
