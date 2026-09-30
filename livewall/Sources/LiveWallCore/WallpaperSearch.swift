import Foundation

/// 仅筛选已加载的列表；关键词可分别命中标题、作者和标签。
public enum WallpaperSearch {
    public static func filter(_ items: [WallpaperItem], query: String) -> [WallpaperItem] {
        let terms = query.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !terms.isEmpty else { return items }
        return items.filter { item in
            let fields = [item.title, item.author] + item.tags
            return terms.allSatisfy { term in
                fields.contains { $0.range(of: term, options: .caseInsensitive) != nil }
            }
        }
    }
}
