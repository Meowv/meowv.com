/// 内容过滤子菜单的一行。
///
/// 刻意抽成纯数据：菜单是这次改造里唯一「正确性全靠肉眼」的地方
/// （置灰规则、单选勾选、标题里的计数），放进 `LiveWallCore` 才能单测。
public struct CategoryMenuEntry: Equatable, Sendable {
    /// 普通分类 id；「全部」与「收藏」为 nil，由 isFavorites 区分。
    public let id: Int?
    public let title: String
    /// 条目数为 0 的分类置灰不可点 —— 可点会进空池，表现成「点了没反应」。
    public let isEnabled: Bool
    public let isSelected: Bool
    public let isFavorites: Bool

    public init(id: Int?, title: String, isEnabled: Bool, isSelected: Bool, isFavorites: Bool = false) {
        self.id = id
        self.title = title
        self.isEnabled = isEnabled
        self.isSelected = isSelected
        self.isFavorites = isFavorites
    }
}

/// 内容过滤子菜单的内容。只有纯函数，不碰 `NSMenu`。
public enum CategoryMenu {

    /// 本地文件夹来源下的根项标题。
    ///
    /// 本地文件夹没有分类概念，整项置灰，标题如实说明**为什么**不可点 ——
    /// 灰着一行什么都不写，用户只会以为功能坏了。
    public static let localSourceRootTitle = "内容过滤（本地文件夹）"

    /// 「全部」固定第一行，有收藏时紧随「收藏」，其余分类沿用索引顺序。
    /// `allEnabled` 表示索引是否提供可用的全部切片。
    public static func entries(
        categories: [LivewallCategoryEntry],
        selectedID: Int?,
        allEnabled: Bool = true,
        favoriteCount: Int = 0,
        favoritesSelected: Bool = false
    ) -> [CategoryMenuEntry] {
        let favorites = favoriteCount > 0 ? [
            CategoryMenuEntry(
                id: nil, title: "收藏", isEnabled: true,
                isSelected: favoritesSelected, isFavorites: true
            )
        ] : []
        return [
            CategoryMenuEntry(
                id: nil,
                title: "全部",
                isEnabled: allEnabled,
                isSelected: selectedID == nil && !favoritesSelected
            )
        ] + favorites + categories.map { entry in
            CategoryMenuEntry(
                id: entry.id,
                // **只显示分类名**，不带条目数。`itemCount` 仍然参与判定：
                // 条目数为 0 的分类照样列出，但置灰不可点。
                title: entry.name,
                isEnabled: entry.itemCount > 0,
                isSelected: entry.id == selectedID && !favoritesSelected
            )
        }
    }

    /// 根项标题。
    public static func rootTitle(
        categories: [LivewallCategoryEntry],
        selectedID: Int?,
        favoritesSelected: Bool = false
    ) -> String {
        "内容过滤（\(favoritesSelected ? "收藏" : selectedName(categories: categories, selectedID: selectedID))）"
    }

    /// 当前筛选的显示名。`selectedID` 为 nil 时表示不过滤分类，显示「全部」；
    /// id 不在清单里（分类被改名/删库）时退回 `id <n>`，
    /// 至少让人看出「选的是一个已经不存在的东西」，而不是显示成空白。
    public static func selectedName(
        categories: [LivewallCategoryEntry],
        selectedID: Int?
    ) -> String {
        guard let selectedID else { return "全部" }
        return categories.first { $0.id == selectedID }?.name ?? "id \(selectedID)"
    }
}
