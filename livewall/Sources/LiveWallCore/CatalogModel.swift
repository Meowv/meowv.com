import Foundation

/// `wallpapers export-livewall` 产出的清单结构。
///
/// 字段与 `wallpapers/src/wallpapers/export.py` 一一对应，改动需两边同步。
public struct WallpaperCatalog: Codable, Sendable {
    public let schemaVersion: Int
    public let generatedAt: String
    public let source: CatalogSource
    public let items: [WallpaperItem]

    public init(schemaVersion: Int, generatedAt: String, source: CatalogSource, items: [WallpaperItem]) {
        self.schemaVersion = schemaVersion
        self.generatedAt = generatedAt
        self.source = source
        self.items = items
    }
}

public struct CatalogSource: Codable, Sendable, Equatable {
    public let deviceType: String
    public let contentType: String
    public let categoryName: String?
    public let categoryIds: [Int]

    public init(deviceType: String, contentType: String, categoryName: String?, categoryIds: [Int]) {
        self.deviceType = deviceType
        self.contentType = contentType
        self.categoryName = categoryName
        self.categoryIds = categoryIds
    }
}

public struct WallpaperItem: Codable, Sendable, Equatable, Identifiable {
    public let id: Int
    public let title: String
    public let author: String
    public let url: String
    /// 数据库里的 `asset.duration_seconds` 当前全为 NULL，因此通常是 nil。
    /// 播放时由 AVAsset 自行探测，不要在这里伪造默认值。
    public let durationSeconds: Double?
    public let tags: [String]

    public init(
        id: Int,
        title: String,
        author: String,
        url: String,
        durationSeconds: Double? = nil,
        tags: [String] = []
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.url = url
        self.durationSeconds = durationSeconds
        self.tags = tags
    }

    /// 解析后的播放地址。URL 非法时返回 nil —— 清单来自数据库，
    /// 不能假定每一条都是合法 URL。
    public var remoteURL: URL? {
        guard let url = URL(string: url), url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http" else {
            return nil
        }
        return url
    }

    /// 菜单里显示的标题，作者非空时带上。
    public var displayName: String {
        author.isEmpty ? title : "\(title) — \(author)"
    }
}

public enum CatalogError: Error, LocalizedError {
    case fileNotFound(String)
    case emptyCatalog
    case unsupportedSchema(Int)
    case decodeFailed(String)

    public var errorDescription: String? {
        switch self {
        case .fileNotFound(let path): return "清单文件不存在：\(path)"
        case .emptyCatalog: return "清单里没有任何可用条目"
        case .unsupportedSchema(let version): return "不支持的清单版本：\(version)"
        case .decodeFailed(let detail): return "清单解析失败：\(detail)"
        }
    }
}

public enum CatalogCoding {

    /// 当前支持的清单版本。客户端遇到更高版本时拒绝加载而不是猜着解析。
    public static let supportedSchemaVersion = 1

    public static func decode(_ data: Data) throws -> WallpaperCatalog {
        let catalog: WallpaperCatalog
        do {
            catalog = try JSONDecoder().decode(WallpaperCatalog.self, from: data)
        } catch {
            throw CatalogError.decodeFailed(error.localizedDescription)
        }
        guard catalog.schemaVersion <= supportedSchemaVersion else {
            throw CatalogError.unsupportedSchema(catalog.schemaVersion)
        }
        guard !catalog.items.isEmpty else {
            throw CatalogError.emptyCatalog
        }
        return catalog
    }

    /// 过滤掉 URL 非法或重复的条目。重复以 URL 为准 —— 同一条视频出现两次
    /// 会让「一轮内不重复」的候选池失去意义。
    public static func sanitize(_ catalog: WallpaperCatalog) -> WallpaperCatalog {
        var seen = Set<String>()
        var kept: [WallpaperItem] = []
        for item in catalog.items {
            guard item.remoteURL != nil else { continue }
            guard seen.insert(item.url).inserted else { continue }
            kept.append(item)
        }
        return WallpaperCatalog(
            schemaVersion: catalog.schemaVersion,
            generatedAt: catalog.generatedAt,
            source: catalog.source,
            items: kept
        )
    }
}
