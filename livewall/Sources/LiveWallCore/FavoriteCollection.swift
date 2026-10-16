import Foundation

/// 收藏保存完整的线上条目，顺序即收藏时间由新到旧。
public enum FavoriteCollection {
    public static func sanitized(_ items: [WallpaperItem]) -> [WallpaperItem] {
        var seen = Set<Int>()
        return items.filter { $0.id > 0 && $0.remoteURL != nil && seen.insert($0.id).inserted }
    }
}
