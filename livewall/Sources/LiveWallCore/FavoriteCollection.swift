import Foundation

/// 收藏保存完整的线上条目，顺序即收藏时间由新到旧。
public enum FavoriteCollection {
    public static func sanitized(_ items: [WallpaperItem]) -> [WallpaperItem] {
        var seen = Set<Int>()
        return items.filter { $0.id > 0 && $0.remoteURL != nil && seen.insert($0.id).inserted }
    }

    public static func toggling(_ item: WallpaperItem, in items: [WallpaperItem]) -> [WallpaperItem] {
        let current = sanitized(items)
        if current.contains(where: { $0.id == item.id }) {
            return current.filter { $0.id != item.id }
        }
        return sanitized([item] + current)
    }
}
