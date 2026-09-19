import Foundation

/// 清单的来源，用于诊断与菜单栏显示。
public enum CatalogOrigin: String, Sendable {
    case remote
    case cachedRemote

    public var label: String {
        switch self {
        case .remote: return "远程"
        case .cachedRemote: return "上次缓存"
        }
    }
}

/// 索引加载结果。
///
/// **`index` 为 nil 表示失败**，此时 `warnings` 里就是失败原因 —— 这个设计是必要的：
/// 失败原因（DNS / TLS / 超时 / 解析）是排障时唯一有用的信息，
/// 早期版本用「返回 nil」把原因丢掉了，线上出问题时只能看到一句「都不可用」。
public struct CatalogIndexLoadResult: Sendable {
    public let index: LivewallCatalogIndex?
    /// `index` 为 nil 时也是 nil。
    public let origin: CatalogOrigin?
    /// 降级过程中产生的说明，按发生顺序排列。
    public let warnings: [String]

    public init(index: LivewallCatalogIndex?, origin: CatalogOrigin?, warnings: [String]) {
        self.index = index
        self.origin = origin
        self.warnings = warnings
    }
}

/// 分类切片加载结果。`catalog` 为 nil 表示失败，原因在 `warnings` 里。
public struct CatalogSliceLoadResult: Sendable {
    public let catalog: WallpaperCatalog?
    public let origin: CatalogOrigin?
    public let warnings: [String]
    /// 远程成功时返回原始数据，由调用方在请求代次确认后再写入共享副本。
    public let cacheData: Data?

    public init(catalog: WallpaperCatalog?, origin: CatalogOrigin?, warnings: [String], cacheData: Data? = nil) {
        self.catalog = catalog
        self.origin = origin
        self.warnings = warnings
        self.cacheData = cacheData
    }
}

/// 把「读文件 / 写文件 / 拉远程」抽象出来，让 `CatalogService` 的降级逻辑
/// 可以脱离网络与文件系统单测。
///
/// 刻意不要求 `Sendable`：测试替身需要携带可变状态（记录写入了什么、注入了什么错误），
/// 强制 Sendable 会让替身写得很别扭。
public protocol CatalogTransport {
    func readFile(at url: URL) throws -> Data
    func writeFile(_ data: Data, to url: URL) throws
    func fetch(_ url: URL) throws -> Data
}

/// 生产实现。`fetch` 是同步的（内部用信号量等待 URLSession），
/// 调用方应在后台队列执行，避免阻塞主线程。
public struct DefaultCatalogTransport: CatalogTransport {
    public init() {}

    public func readFile(at url: URL) throws -> Data {
        try Data(contentsOf: url)
    }

    public func writeFile(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: url, options: .atomic)
    }

    public func fetch(_ url: URL) throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadRevalidatingCacheData

        let semaphore = DispatchSemaphore(value: 0)
        var outcome: Result<Data, Error> = .failure(CatalogError.decodeFailed("请求未执行"))
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error {
                outcome = .failure(error)
                return
            }
            guard let http = response as? HTTPURLResponse else {
                outcome = .failure(CatalogError.decodeFailed("响应不是 HTTP"))
                return
            }
            guard (200..<300).contains(http.statusCode) else {
                outcome = .failure(CatalogError.decodeFailed("HTTP \(http.statusCode)"))
                return
            }
            guard let data, !data.isEmpty else {
                outcome = .failure(CatalogError.decodeFailed("响应为空"))
                return
            }
            outcome = .success(data)
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 20)
        return try outcome.get()
    }
}

/// 清单加载。数据源是线上**两个文件**，各自有独立的降级链：
///
/// ```
/// 索引 livewall/catalog.json（几百字节，必拉）
///   配置了远程地址？
///     ├─ 是 → 拉取 → 成功则使用，并写入本地副本（best effort）
///     │        失败 → 记 warning，继续往下
///     └─ 否 → 直接往下
///   读索引副本缓存 → 成功则使用
///     失败 → 返回 nil（调用方提示「无可用清单」）
///
/// 分类切片 livewall/category.<id>.json（只拉当前选中的那一个）
///   地址由「索引地址 + 索引里的相对文件名」拼出，**同源校验**在
///   `LivewallCategoryEntry.resolvedFileURL` 里做
///   远程 → 成功则使用并写副本；失败 → 读副本
///     副本还要校验分类归属（见 `tryDecodeSlice`），不符则返回 nil
/// ```
///
/// 切分类因此是「再拉一个文件」，不是「在本地全量里筛」—— 换来的是启动流量
/// 从 4.9 MB 降到约 0.6 MB（索引 901 B + 当前分类）。
///
/// **切片缓存只有一份**（`sliceCacheURL`），不是每个分类一份：配置里记的
/// `selectedCategoryID` 就是「上次成功加载的那个分类」，所以启动时读回来的
/// 那一份必然对得上。缓存里带了 `source.categoryIds`，加载时会校验它确实属于
/// 被请求的分类 —— 换过分类之后离线启动不会把别的分类的内容当成目标分类。
public struct CatalogService {

    public let remoteIndexURL: URL?
    public let indexCacheURL: URL
    public let sliceCacheURL: URL

    public init(remoteIndexURL: URL?, indexCacheURL: URL, sliceCacheURL: URL) {
        self.remoteIndexURL = remoteIndexURL
        self.indexCacheURL = indexCacheURL
        self.sliceCacheURL = sliceCacheURL
    }

    // MARK: - 索引

    public func loadIndex(transport: CatalogTransport = DefaultCatalogTransport()) -> CatalogIndexLoadResult {
        var warnings: [String] = []

        if let remoteURL = remoteIndexURL {
            if let data = tryResult({ try transport.fetch(remoteURL) }, into: &warnings, label: "索引拉取失败") {
                if let index = tryDecodeIndex(data, into: &warnings, label: "索引解析失败") {
                    // 写入本地副本失败不影响本次使用，只是下次断网时没有兜底
                    do {
                        try transport.writeFile(data, to: indexCacheURL)
                    } catch {
                        warnings.append("索引已使用，但写入本地副本失败：\(error.localizedDescription)")
                    }
                    return CatalogIndexLoadResult(index: index, origin: .remote, warnings: warnings)
                }
            }
        }

        if let data = tryResult({ try transport.readFile(at: indexCacheURL) }, into: &warnings, label: "索引副本读取失败") {
            if let index = tryDecodeIndex(data, into: &warnings, label: "索引副本解析失败") {
                return CatalogIndexLoadResult(index: index, origin: .cachedRemote, warnings: warnings)
            }
        }

        return CatalogIndexLoadResult(index: nil, origin: nil, warnings: warnings)
    }

    // MARK: - 分类切片

    public func loadSlice(
        _ entry: LivewallCategoryEntry,
        transport: CatalogTransport = DefaultCatalogTransport()
    ) -> CatalogSliceLoadResult {
        var warnings: [String] = []

        if let remoteURL = remoteIndexURL {
            if entry.file == nil {
                // 条目数为 0 的分类**没有切片文件** —— 服务端不会为它产出。
                // 这不是「文件名不合法」，别把两件事混成一句 warning（会把人带偏）。
                warnings.append("分类「\(entry.name)」没有切片文件（条目数为 0）")
            } else if let fileURL = entry.resolvedFileURL(relativeTo: remoteURL) {
                if let data = tryResult({ try transport.fetch(fileURL) }, into: &warnings, label: "分类切片拉取失败") {
                    if let catalog = tryDecodeSlice(data, matching: entry, into: &warnings, label: "分类切片解析失败") {
                        return CatalogSliceLoadResult(
                            catalog: catalog,
                            origin: .remote,
                            warnings: warnings,
                            cacheData: data
                        )
                    }
                }
            } else {
                // 索引里的文件名不合法（含路径分隔符 / scheme / 不是 .json）。
                // 这是远端数据，宁可不加载也不能照着它发请求。
                warnings.append("索引里的分类文件名不合法，拒绝请求：\(entry.file ?? "nil")")
            }
        }

        if let data = tryResult({ try transport.readFile(at: sliceCacheURL) }, into: &warnings, label: "分类切片副本读取失败") {
            if let catalog = tryDecodeSlice(data, matching: entry, into: &warnings, label: "分类切片副本解析失败") {
                return CatalogSliceLoadResult(catalog: catalog, origin: .cachedRemote, warnings: warnings)
            }
        }

        return CatalogSliceLoadResult(catalog: nil, origin: nil, warnings: warnings)
    }

    /// 把已经通过请求代次校验的远程切片写入共享副本。
    public func cacheSlice(
        _ data: Data,
        transport: CatalogTransport = DefaultCatalogTransport()
    ) throws {
        try transport.writeFile(data, to: sliceCacheURL)
    }

    // MARK: - 辅助

    private func tryResult(
        _ body: () throws -> Data,
        into warnings: inout [String],
        label: String
    ) -> Data? {
        do {
            return try body()
        } catch {
            warnings.append("\(label)：\(error.localizedDescription)")
            return nil
        }
    }

    private func tryDecodeIndex(
        _ data: Data,
        into warnings: inout [String],
        label: String
    ) -> LivewallCatalogIndex? {
        do {
            return try CatalogCoding.decodeIndex(data)
        } catch {
            warnings.append("\(label)：\(error.localizedDescription)")
            return nil
        }
    }

    private func tryDecodeSlice(
        _ data: Data,
        matching entry: LivewallCategoryEntry,
        into warnings: inout [String],
        label: String
    ) -> WallpaperCatalog? {
        do {
            let catalog = CatalogCoding.sanitize(try CatalogCoding.decode(data))
            guard !catalog.items.isEmpty else {
                warnings.append("\(label)：清洗后没有可用条目")
                return nil
            }
            // 切片必须确实属于被请求的分类。缓存是「最后一份成功的切片」，
            // 不校验的话，换过分类之后离线启动会把上一个分类的内容当成目标分类。
            guard catalog.source.categoryIds.contains(entry.id) else {
                warnings.append("\(label)：切片的分类归属与请求不符（\(catalog.source.categoryIds) 不含 \(entry.id)）")
                return nil
            }
            return catalog
        } catch {
            warnings.append("\(label)：\(error.localizedDescription)")
            return nil
        }
    }
}
