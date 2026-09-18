import Foundation

/// 清单的来源，用于诊断与菜单栏显示。
public enum CatalogOrigin: String, Sendable {
    case remote
    case cachedRemote
    case builtin

    public var label: String {
        switch self {
        case .remote: return "远程清单"
        case .cachedRemote: return "远程清单（上次缓存）"
        case .builtin: return "内置兜底清单"
        }
    }
}

public struct CatalogLoadResult: Sendable {
    public let catalog: WallpaperCatalog
    public let origin: CatalogOrigin
    /// 降级过程中产生的说明，按发生顺序排列。
    public let warnings: [String]

    public init(catalog: WallpaperCatalog, origin: CatalogOrigin, warnings: [String]) {
        self.catalog = catalog
        self.origin = origin
        self.warnings = warnings
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
/// 调用方应在后台队列执行 `load`，避免阻塞主线程。
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

/// 清单加载。数据源只有线上 JSON 一份，降级链：
///
/// ```
/// 配置了远程地址？
///   ├─ 是 → 拉取 → 成功则使用，并写入本地副本（best effort）
///   │        失败 → 记 warning，继续往下
///   └─ 否 → 直接往下
/// 读远程副本缓存 → 成功则使用
///   失败 → 继续往下
/// 内置兜底条目 → 非空则使用
///   否则返回 nil（调用方需提示用户「无可用清单」）
/// ```
public struct CatalogService {

    public let remoteCatalogURL: URL?
    public let remoteCacheURL: URL
    public let builtinItems: [WallpaperItem]

    public init(
        remoteCatalogURL: URL?,
        remoteCacheURL: URL,
        builtinItems: [WallpaperItem] = []
    ) {
        self.remoteCatalogURL = remoteCatalogURL
        self.remoteCacheURL = remoteCacheURL
        self.builtinItems = builtinItems
    }

    public func load(transport: CatalogTransport = DefaultCatalogTransport()) -> CatalogLoadResult? {
        var warnings: [String] = []

        if let remoteURL = remoteCatalogURL {
            if let data = tryResult({ try transport.fetch(remoteURL) }, into: &warnings, label: "远程清单拉取失败") {
                if let catalog = tryDecode(data, into: &warnings, label: "远程清单解析失败") {
                    // 写入本地副本失败不影响本次使用，只是下次断网时没有兜底
                    do {
                        try transport.writeFile(data, to: remoteCacheURL)
                    } catch {
                        warnings.append("远程清单已使用，但写入本地副本失败：\(error.localizedDescription)")
                    }
                    return CatalogLoadResult(catalog: catalog, origin: .remote, warnings: warnings)
                }
            }
        }

        if let data = tryResult({ try transport.readFile(at: remoteCacheURL) }, into: &warnings, label: "远程清单副本读取失败") {
            if let catalog = tryDecode(data, into: &warnings, label: "远程清单副本解析失败") {
                return CatalogLoadResult(catalog: catalog, origin: .cachedRemote, warnings: warnings)
            }
        }

        if !builtinItems.isEmpty {
            let catalog = WallpaperCatalog(
                schemaVersion: CatalogCoding.supportedSchemaVersion,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                items: builtinItems
            )
            return CatalogLoadResult(catalog: catalog, origin: .builtin, warnings: warnings)
        }

        return nil
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

    private func tryDecode(
        _ data: Data,
        into warnings: inout [String],
        label: String
    ) -> WallpaperCatalog? {
        do {
            let catalog = CatalogCoding.sanitize(try CatalogCoding.decode(data))
            guard !catalog.items.isEmpty else {
                warnings.append("\(label)：清单里没有可用条目")
                return nil
            }
            return catalog
        } catch {
            warnings.append("\(label)：\(error.localizedDescription)")
            return nil
        }
    }
}
