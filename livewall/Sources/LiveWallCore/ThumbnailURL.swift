import Foundation

/// 由 `coverUrl` 拼出**缩略图**地址。
///
/// ## 为什么必须拼
///
/// `coverUrl` 指向的是**全尺寸静态图**，不是缩略图。实测风景分类 3536 条全部是 `.jpg`、
/// 单张 384 KB —— 网格一屏 12 个就是 4.6 MB，滚完一个分类 1.3 GB，直接加载原图不可行。
///
/// 该 CDN（阿里云 OSS）支持图片处理查询参数，实测同一张图：
///
/// | 请求 | 体积 | 尺寸 |
/// | --- | --- | --- |
/// | 原图 | 384 KB | 原尺寸 |
/// | `?x-oss-process=image/resize,w_360/quality,q_80` | 10.3 KB | 360×203 |
/// | `?x-oss-process=image/resize,w_720/quality,q_80` | 39 KB | 720×405 |
///
/// ## 这是对第三方能力的依赖，没有文档保证
///
/// 所以**不硬编码 host 白名单**：换 CDN 时新域名可能同样支持，硬编码只会让新域名
/// 永远拿不到缩略图。取而代之的是「候选链 + 内容类型兜底」（见 `ThumbnailLoader`）：
/// 带参数的请求失败、或返回的不是 `image/*`，就退回原图。
/// 上游关掉这个能力时的表现是「能显示但变慢变重」，**不会破图**。
public enum ThumbnailURL {

    /// 网格卡片用的宽度。卡片固定 186pt，按 2x 屏取 360px 足够；
    /// 再大只是让流量翻倍（`w_720` 是 39 KB，`w_360` 是 10.3 KB）。
    public static let gridWidth = 360

    /// 右栏预览静态图用的宽度。预览区约 232pt 宽，720px 足够覆盖 2x 屏。
    public static let previewWidth = 720

    /// 压缩质量。80 是「肉眼看不出、体积掉一个数量级」的常见档位。
    public static let quality = 80

    /// 给一个图片地址加上处理参数。
    ///
    /// 刻意**用字符串拼接而不是 `URLComponents`**：`x-oss-process` 的值里有 `/` 和 `,`，
    /// `URLComponents` 会把它们百分号编码（`image%2Fresize`），而 OSS 对编码后的值
    /// 行为没有保证。直接拼在 `absoluteString` 后面能保证字节原样。
    ///
    /// 地址里已有 query（`?v=2`）时用 `&` 追加，不覆盖既有参数。
    public static func resized(_ cover: URL, width: Int, quality: Int = ThumbnailURL.quality) -> URL? {
        guard width > 0, quality > 0 else { return nil }
        let raw = cover.absoluteString
        guard !raw.isEmpty else { return nil }
        let separator = raw.contains("?") ? "&" : "?"
        let processed = raw + separator + "x-oss-process=image/resize,w_\(width)/quality,q_\(quality)"
        guard let url = URL(string: processed),
              url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http"
        else { return nil }
        return url
    }

    /// 原图地址（不带处理参数）。缩略图请求失败时的兜底。
    /// 复用 `WallpaperItem.coverImageURL` 的既有校验，不另写一套。
    public static func original(for item: WallpaperItem) -> URL? {
        item.coverImageURL
    }

    /// 网格缩略图地址。`coverUrl` 缺失或非法时返回 nil ——
    /// **不伪造地址**，调用方显示占位图。
    public static func grid(for item: WallpaperItem) -> URL? {
        guard let cover = item.coverImageURL else { return nil }
        return resized(cover, width: gridWidth)
    }

    /// 右栏预览静态图地址。同上。
    public static func preview(for item: WallpaperItem) -> URL? {
        guard let cover = item.coverImageURL else { return nil }
        return resized(cover, width: previewWidth)
    }

    /// 网格缩略图的候选链：先试处理参数，失败再退回原图。空数组 = 没有可用地址。
    public static func gridCandidates(for item: WallpaperItem) -> [URL] {
        candidates(processed: grid(for: item), original: original(for: item))
    }

    /// 预览静态图的候选链。
    public static func previewCandidates(for item: WallpaperItem) -> [URL] {
        candidates(processed: preview(for: item), original: original(for: item))
    }

    /// 组装候选链。处理版与原图相同时（理论上不会，参数一定不同）去重，
    /// 避免对同一个地址连发两次必然相同的请求。
    private static func candidates(processed: URL?, original: URL?) -> [URL] {
        guard let processed else { return original.map { [$0] } ?? [] }
        guard let original, original != processed else { return [processed] }
        return [processed, original]
    }
}
