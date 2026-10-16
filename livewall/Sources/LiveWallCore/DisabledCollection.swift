import Foundation

/// 禁用项保存完整线上条目，最近禁用的排在最前面。
public enum DisabledCollection {
    public static func sanitized(_ items: [WallpaperItem]) -> [WallpaperItem] {
        FavoriteCollection.sanitized(items)
    }
}
