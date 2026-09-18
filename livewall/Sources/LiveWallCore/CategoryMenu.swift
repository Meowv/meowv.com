import Foundation

/// 内容过滤子菜单的一行。
///
/// 刻意抽成纯数据：菜单是这次改造里唯一「正确性全靠肉眼」的地方
/// （置灰规则、单选勾选、标题里的计数），放进 `LiveWallCore` 才能单测。
public struct CategoryMenuEntry: Equatable, Sendable {
    public let id: Int
    public let title: String
    /// 条目数为 0 的分类置灰不可点 —— 可点会进空池，表现成「点了没反应」。
    public let isEnabled: Bool
    public let isSelected: Bool

    public init(id: Int, title: String, isEnabled: Bool, isSelected: Bool) {
        self.id = id
        self.title = title
        self.isEnabled = isEnabled
        self.isSelected = isSelected
    }
}

/// 内容过滤子菜单的内容。只有纯函数，不碰 `NSMenu`。
public enum CategoryMenu {

    /// 子菜单的行，顺序沿用索引里 `categories` 的顺序（默认分类在首位）。
    public static func entries(
        categories: [LivewallCategoryEntry],
        selectedID: Int?
    ) -> [CategoryMenuEntry] {
        categories.map { entry in
            CategoryMenuEntry(
                id: entry.id,
                // **只显示分类名**，不带条目数。`itemCount` 仍然参与判定：
                // 条目数为 0 的分类照样列出，但置灰不可点。
                title: entry.name,
                isEnabled: entry.itemCount > 0,
                isSelected: entry.id == selectedID
            )
        }
    }

    /// 根项标题。
    public static func rootTitle(
        categories: [LivewallCategoryEntry],
        selectedID: Int?
    ) -> String {
        "内容过滤（\(selectedName(categories: categories, selectedID: selectedID))）"
    }

    /// 当前分类的显示名。`selectedID` 为 nil（清单里没有分类信息，例如内置兜底）
    /// 时显示「不限」；id 不在清单里（分类被改名/删库）时退回 `id <n>`，
    /// 至少让人看出「选的是一个已经不存在的东西」，而不是显示成空白。
    public static func selectedName(
        categories: [LivewallCategoryEntry],
        selectedID: Int?
    ) -> String {
        guard let selectedID else { return "不限" }
        return categories.first { $0.id == selectedID }?.name ?? "id \(selectedID)"
    }
}
