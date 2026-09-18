import Foundation

/// 内容过滤条件。
///
/// **为什么按作者而不是按标签**：数据源（`device_type='desktop' AND content_type='dynamic'`）
/// 在采集侧**根本没有标签** —— 实测 2,614 条候选里带 tag 的是 0 条，
/// 而全库的 tag 只挂在桌面静态壁纸（32,430 条）与手机端壁纸上。
/// 相比之下 `author` 100% 非空、共 50 个，是现成可用的分类维度。
/// 标签维度保留在结构里，等数据源补齐后无需改调用方。
public struct CandidateFilter: Equatable, Sendable {

    /// 允许的作者。空集表示不限。
    public var authors: Set<String>
    /// 允许的标签（任意命中即可）。空集表示不限。
    public var tags: Set<String>

    public init(authors: Set<String> = [], tags: Set<String> = []) {
        self.authors = authors
        self.tags = tags
    }

    /// 是否处于「不限」状态。
    public var isActive: Bool {
        !authors.isEmpty || !tags.isEmpty
    }

    /// 一条目是否通过过滤。
    ///
    /// 两个维度之间是**与**：同时选了作者和标签时，两个条件都要满足。
    /// 维度内部是**或**：选了 3 位作者，任一命中即可 —— 否则多选毫无意义。
    public func matches(_ item: WallpaperItem) -> Bool {
        if !authors.isEmpty, !authors.contains(item.author) {
            return false
        }
        if !tags.isEmpty, !item.tags.contains(where: { tags.contains($0) }) {
            return false
        }
        return true
    }

    /// 过滤后的条目。
    public func apply(to items: [WallpaperItem]) -> [WallpaperItem] {
        guard isActive else { return items }
        return items.filter(matches)
    }

    /// 人读摘要，用于菜单标题。空过滤显示「不限」。
    public var summary: String {
        switch (authors.isEmpty, tags.isEmpty) {
        case (true, true):
            return "不限"
        case (false, true):
            return "\(authors.count) 位作者"
        case (true, false):
            return "\(tags.count) 个标签"
        case (false, false):
            return "\(authors.count) 位作者 + \(tags.count) 个标签"
        }
    }
}

/// 过滤选项：一个可选值及其在清单里的条目数。
public struct FilterOption: Equatable, Sendable {
    public let value: String
    public let count: Int

    public init(value: String, count: Int) {
        self.value = value
        self.count = count
    }
}

public enum FilterOptions {

    /// 统计作者选项，按条目数降序；同数按 **Unicode 码点**升序。
    ///
    /// 刻意不用 `localizedStandardCompare`（那更符合中文语感）：它的结果随系统语言
    /// 变化，会让「顺序稳定可复现」这条性质失效，测试也会在不同机器上飘。
    ///
    /// 空作者名不参与 —— 菜单里出现一个空白选项没有任何意义。
    /// 注意当前数据源 author 100% 非空，这个过滤是为数据退化时留的保险。
    public static func authors(from items: [WallpaperItem]) -> [FilterOption] {
        counts(from: items, key: \.author)
    }

    /// 统计标签选项。同一条目的多个标签各自计数一次。
    public static func tags(from items: [WallpaperItem]) -> [FilterOption] {
        var counter: [String: Int] = [:]
        for item in items {
            for tag in Set(item.tags) where !tag.isEmpty {
                counter[tag, default: 0] += 1
            }
        }
        return sorted(counter)
    }

    private static func counts(
        from items: [WallpaperItem],
        key: KeyPath<WallpaperItem, String>
    ) -> [FilterOption] {
        var counter: [String: Int] = [:]
        for item in items {
            let value = item[keyPath: key]
            guard !value.isEmpty else { continue }
            counter[value, default: 0] += 1
        }
        return sorted(counter)
    }

    private static func sorted(_ counter: [String: Int]) -> [FilterOption] {
        counter
            .map { FilterOption(value: $0.key, count: $0.value) }
            .sorted { lhs, rhs in
                lhs.count == rhs.count ? lhs.value < rhs.value : lhs.count > rhs.count
            }
    }
}
