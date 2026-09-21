import Foundation

/// 清单索引里的一个一级分类。
///
/// 条目数为 0 的分类**照样出现在索引里** —— 菜单要能显示它并置灰，
/// 让「哪些分类还没抓全」一眼可见；这种分类没有 `file`（服务端不会为它产出切片）。
public struct LivewallCategoryEntry: Codable, Sendable, Equatable {
    public let id: Int
    public let name: String
    /// 分类切片的**相对文件名**（如 `category.4001.json`）。
    /// nil 表示条目数为 0，没有可拉取的切片。
    public let file: String?
    /// 该分类（含其子树）下的条目数。**只用于把空分类置灰，不在菜单里显示。**
    public let itemCount: Int
    /// 该分类**切片文件的字节 sha256**（小写十六进制，64 字符）。
    ///
    /// 它写在**已验签的索引**里，客户端据此校验切片完整性 —— 于是一个
    /// `catalog.json.sig` 就传递性地保护了全部切片，不必给每个切片各配一个签名文件
    /// （那会让启动多打十来次请求）。见 `CatalogSignature`。
    ///
    /// `file` 为 nil（空分类）时**没有**这个字段：没有文件就没有摘要可言。
    /// 有文件却没有合法摘要的索引会被判**不可用**（见 `CatalogSignature.digestProblem`）。
    public let sha256: String?

    public init(id: Int, name: String, file: String?, itemCount: Int, sha256: String? = nil) {
        self.id = id
        self.name = name
        self.file = file
        self.itemCount = itemCount
        self.sha256 = sha256
    }

    /// 把索引里的相对文件名解析成与索引**同源**的 URL。
    ///
    /// 索引是远端数据，不能让它把请求指到别的地方去（任意域名、任意路径）。
    /// 因此只接受「一个纯文件名」：不含路径分隔符、不含 scheme 分隔符、不是 `.` / `..`。
    /// 解析完再校验一次 host 与 scheme 与索引一致。
    public func resolvedFileURL(relativeTo indexURL: URL) -> URL? {
        guard let file, Self.isSafeRelativeFileName(file) else { return nil }
        let resolved = indexURL.deletingLastPathComponent().appendingPathComponent(file)
        guard resolved.host?.lowercased() == indexURL.host?.lowercased(),
              resolved.scheme?.lowercased() == indexURL.scheme?.lowercased()
        else { return nil }
        return resolved
    }

    /// 是否是一个「安全的纯文件名」。见 `resolvedFileURL(relativeTo:)`。
    public static func isSafeRelativeFileName(_ name: String) -> Bool {
        guard !name.isEmpty, name.hasSuffix(".json") else { return false }
        guard !name.contains("/"), !name.contains("\\"), !name.contains(":") else { return false }
        guard name != ".", name != ".." else { return false }
        return true
    }
}

/// 清单索引（`livewall/catalog.json`）。
///
/// **刻意不含条目** —— 它是客户端启动时唯一必拉的文件，必须很小
/// （当前 10 个分类实测 901 字节）。条目按分类单独拉，见 `LivewallCategoryEntry.file`。
///
/// 这样切分类的代价是「一次请求」（而不是把全量 4.9 MB 一次下完），
/// 启动流量也从 4.9 MB 降到「索引 + 当前分类」约 0.6 MB。
public struct LivewallCatalogIndex: Codable, Sendable {
    public let schemaVersion: Int
    public let generatedAt: String
    public let source: CatalogSource
    public let defaultCategoryId: Int?
    public let categories: [LivewallCategoryEntry]

    public init(
        schemaVersion: Int,
        generatedAt: String,
        source: CatalogSource,
        defaultCategoryId: Int? = nil,
        categories: [LivewallCategoryEntry]
    ) {
        self.schemaVersion = schemaVersion
        self.generatedAt = generatedAt
        self.source = source
        self.defaultCategoryId = defaultCategoryId
        self.categories = categories
    }

    /// 清单里的默认分类：优先 `defaultCategoryId`（且必须确实存在于 `categories`），
    /// 否则退回列表首项。
    ///
    /// 生成侧已经把默认分类排到 `categories` 首位，两者正常情况下一致；
    /// 这里仍然显式读 `defaultCategoryId`，是为了让「默认分类」有唯一的权威来源 ——
    /// 否则它就完全由数据库的 `sort_order` 决定，而那个值当前恒为 0（顺序退化成插入顺序）。
    public var resolvedDefaultCategoryID: Int? {
        if let defaultCategoryId, categories.contains(where: { $0.id == defaultCategoryId }) {
            return defaultCategoryId
        }
        return categories.first?.id
    }

    public func entry(for id: Int) -> LivewallCategoryEntry? {
        categories.first { $0.id == id }
    }

    /// 解析出**可播放**的分类：记忆值 → 默认分类 → 第一个有内容的分类。
    ///
    /// 「有内容」（`itemCount > 0`）这一条是必需的，不是锦上添花：
    /// 菜单里条目数为 0 的分类本来就置灰不可点，客户端不该因为默认分类恰好落在
    /// 这种分类上（生成侧 `--default-category` 指过去、或那个分类还没抓过）
    /// 就以「没有可用的内容」收场 —— 索引里明明有别的分类有内容。
    ///
    /// 全部为空时返回 nil，调用方据此提示「没有可用的内容」。
    public func playableCategoryID(remembered: Int?) -> Int? {
        if let remembered, let entry = entry(for: remembered), entry.itemCount > 0 {
            return entry.id
        }
        if let declared = resolvedDefaultCategoryID,
           let entry = entry(for: declared), entry.itemCount > 0 {
            return entry.id
        }
        return categories.first { $0.itemCount > 0 }?.id
    }
}

/// 分类切片（`livewall/category.<一级分类 id>.json`）。
///
/// 结构沿用最早的 `livewall.json`：字段与 `wallpapers/src/wallpapers/export.py`
/// 一一对应，改动需两边同步。
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
    /// 分类名。索引里没有这一项（它是「多分类」的），切片里才有。
    public let categoryName: String?
    /// 该分类子树下的全部分类 id（含自身与各级子分类）。同上，索引里没有。
    public let categoryIds: [Int]

    public init(deviceType: String, contentType: String, categoryName: String?, categoryIds: [Int]) {
        self.deviceType = deviceType
        self.contentType = contentType
        self.categoryName = categoryName
        self.categoryIds = categoryIds
    }

    enum CodingKeys: String, CodingKey {
        case deviceType, contentType, categoryName, categoryIds
    }

    /// `categoryIds` 必须容错解码：**索引里的 `source` 只有 deviceType / contentType**
    /// （索引描述的是「所有分类」，没有单一分类名或子树可言）。
    /// `categoryName` 本身是可选，缺字段时合成解码已能回退，`categoryIds` 不能。
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        deviceType = try container.decode(String.self, forKey: .deviceType)
        contentType = try container.decode(String.self, forKey: .contentType)
        categoryName = try container.decodeIfPresent(String.self, forKey: .categoryName)
        categoryIds = (try? container.decodeIfPresent([Int].self, forKey: .categoryIds)) ?? []
    }
}

public struct WallpaperItem: Codable, Sendable, Equatable, Identifiable {
    public let id: Int
    public let title: String
    public let author: String
    public let url: String
    /// 静态图地址（数据库里的 `media_role='image'`）。供「锁屏预览」与
    /// 「下载当前壁纸」使用。可能为 nil：清单里没写、或该条目没有 image 资源 ——
    /// 此时调用方退回「抓当前帧」，**不要**在这里伪造地址。
    public let coverUrl: String?
    /// 数据库里的 `asset.duration_seconds` 当前全为 NULL，因此通常是 nil。
    /// 播放时由 AVAsset 自行探测，不要在这里伪造默认值。
    public let durationSeconds: Double?
    public let tags: [String]
    /// 该条目所属的**一级分类** id（升序、去重）。切片里每条都带，
    /// 客户端不再用它做切片（切片本身就是按分类切好的），留作排查与展示用。
    public let categoryIds: [Int]

    public init(
        id: Int,
        title: String,
        author: String,
        url: String,
        coverUrl: String? = nil,
        durationSeconds: Double? = nil,
        tags: [String] = [],
        categoryIds: [Int] = []
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.url = url
        self.coverUrl = coverUrl
        self.durationSeconds = durationSeconds
        self.tags = tags
        self.categoryIds = categoryIds
    }

    enum CodingKeys: String, CodingKey {
        case id, title, author, url, coverUrl, durationSeconds, tags, categoryIds
    }

    /// `categoryIds` 与 `coverUrl` 必须容错解码：**内置兜底条目**（代码里构造）与手写清单
    /// 都没有这两个字段，`coverUrl` 还可能是旧清单（加字段之前）里的缺失键。
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        author = try container.decode(String.self, forKey: .author)
        url = try container.decode(String.self, forKey: .url)
        coverUrl = try? container.decodeIfPresent(String.self, forKey: .coverUrl)
        durationSeconds = try container.decodeIfPresent(Double.self, forKey: .durationSeconds)
        tags = try container.decode([String].self, forKey: .tags)
        categoryIds = (try? container.decodeIfPresent([Int].self, forKey: .categoryIds)) ?? []
    }

    /// 解析后的播放地址。URL 非法时返回 nil —— 清单来自数据库，
    /// 不能假定每一条都是合法 URL。
    public var remoteURL: URL? {
        guard let url = URL(string: url), url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http" else {
            return nil
        }
        return url
    }

    /// 解析后的**播放**地址，接受 http(s) 与 `file://` 两种。
    ///
    /// 与 `remoteURL` 的分工：`remoteURL` 是「远端清单里的条目」这个概念的一部分
    /// （`CatalogCoding.sanitize` 与「下载当前壁纸」只认它），而播放侧要的是
    /// 「这条到底能不能开播」—— 本地文件夹数据源（`LocalVideoSource`）生成的条目
    /// 地址是 `file://`，用 `remoteURL` 判定会被一律判成非法：
    /// 候选池里灌进去却播不了、本地固定项还会被 `Preferences.sanitized()` 静默清掉。
    ///
    /// 因此**播放路径上的判定一律走这里**，不要再退回 `remoteURL`。
    public var playableURL: URL? {
        guard let url = URL(string: url), let scheme = url.scheme?.lowercased() else { return nil }
        if scheme == "file" { return url.isFileURL ? url : nil }
        return scheme == "https" || scheme == "http" ? url : nil
    }

    /// 解析后的静态图地址。与 `remoteURL` 同一套校验：空串与非 http(s) 一律视为不可用
    /// （清单来自数据库，不能假定字段内容合法）。
    public var coverImageURL: URL? {
        guard let raw = coverUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http"
        else {
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
    /// 索引与切片**各自独立判定**，共用这一个版本号。
    public static let supportedSchemaVersion = 1

    /// 解析索引（`catalog.json`）。索引不含条目，因此**不检查 items**。
    public static func decodeIndex(_ data: Data) throws -> LivewallCatalogIndex {
        let index: LivewallCatalogIndex
        do {
            index = try JSONDecoder().decode(LivewallCatalogIndex.self, from: data)
        } catch {
            throw CatalogError.decodeFailed(error.localizedDescription)
        }
        guard index.schemaVersion <= supportedSchemaVersion else {
            throw CatalogError.unsupportedSchema(index.schemaVersion)
        }
        guard !index.categories.isEmpty else {
            throw CatalogError.emptyCatalog
        }
        return index
    }

    /// 解析分类切片。切片必须带条目，空切片视为解析失败 ——
    /// 服务端也不会为 0 条的分类产出切片。
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
