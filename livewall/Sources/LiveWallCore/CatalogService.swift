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

/// 生产实现。`fetch` 是同步的（内部用 `SynchronousFetch` 等待 URLSession），
/// 调用方应在后台队列执行，避免阻塞主线程。
public struct DefaultCatalogTransport: CatalogTransport {

    /// 注入点。生产用 `.shared`；测试可注入带 `URLProtocol` 桩的会话。
    ///
    /// 没有它，「超时竞态」这类缺陷**结构上不可测**（造不出「先超时、后回调」的时序），
    /// 修完也无法用回归测试锁住 —— 见 `SynchronousFetch` 的说明。
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func readFile(at url: URL) throws -> Data {
        try Data(contentsOf: url)
    }

    public func writeFile(_ data: Data, to url: URL) throws {
        try PrivateFileAccess.secureDirectory(at: url.deletingLastPathComponent())
        try data.write(to: url, options: .atomic)
        try PrivateFileAccess.secureFile(at: url)
    }

    public func fetch(_ url: URL) throws -> Data {
        try SynchronousFetch.data(from: url, timeout: 15, session: session)
    }
}

/// 清单加载。数据源是线上**索引 + 签名 + 多份切片**，各自有独立的降级链：
///
/// ```
/// 索引 livewall/catalog.json（几百字节，必拉）+ livewall/catalog.json.sig
///   配置了远程地址？
///     ├─ 是 → 拉「索引 + 签名」两个文件
///     │        ├─ 验签通过 → 校验索引里的切片摘要是否齐全
///     │        │     ├─ 齐全 → 使用，并把**索引与签名一起**写入本地副本
///     │        │     └─ 缺摘要 → 判不可用，记 warning，继续往下
///     │        └─ 验签失败 / 少一个文件 → 判不可用，记 warning，继续往下
///     └─ 否 → 直接往下
///   读索引副本 + 签名副本 → **同样验签** → 成功则使用
///     失败 → 返回 nil（调用方提示「无可用清单」）
///
/// 内容切片 livewall/all.json 或 livewall/category.<id>.json（只拉当前筛选对应的一份）
///   地址由「索引地址 + 索引里的相对文件名」拼出，并在对应 entry 的
///   `resolvedFileURL` 里做**同源校验**
///   远程 → 成功 → **比对字节摘要与索引里记的那个**（见 `CatalogSignature`）
///     ├─ 相符 → 使用并写副本
///     └─ 不符 → 判不可用，记 warning，继续往下
///     失败 → 读副本（同样要过摘要这一关）
///       分类副本校验归属；全部副本校验摘要、条目数与分类集合，不符则返回 nil
/// ```
///
/// **每个「继续往下」都只降级到「另一份同样验过签/对过摘要的数据」**，
/// 不存在「验不过就退回不校验」那条路 —— 见 `CatalogSignature` 的说明。
/// 代价是发布顺序有硬约束：**先部署 `.sig`，再发新版客户端**（老客户端只拉
/// `catalog.json`，不受影响）。
///
/// 选择「全部」或切换分类都只拉当前筛选的一份切片；首次默认「全部」会拉完整去重清单，
/// 后续重启可用单份缓存离线启动。
///
/// **切片缓存只有一份**（`sliceCacheURL`），不是每个筛选一份：分类切片按归属校验，
/// 全部切片按已验签索引中的摘要、条目数和分类清单校验。切换筛选成功后再覆盖缓存，
/// 离线启动不会把上一个筛选的内容当成目标内容。
/// **`Sendable` 是它的真实性质，不是为消警加的**：成员全是 `let` 的 `URL`，
/// 没有任何共享可变状态 —— 这正是它能在后台队列上安全调用的原因
/// （`loadIndex` / `loadSlice` 都是同步的，由调用方决定跑在哪个线程）。
/// 不标的话，App 层把它捕获进 `DispatchQueue.global().async` 闭包时会被判为
/// 「捕获非 Sendable 值」（实测 3 条 warning）。
public struct CatalogService: Sendable {

    public let remoteIndexURL: URL?
    public let indexCacheURL: URL
    public let sliceCacheURL: URL

    public init(remoteIndexURL: URL?, indexCacheURL: URL, sliceCacheURL: URL) {
        self.remoteIndexURL = remoteIndexURL
        self.indexCacheURL = indexCacheURL
        self.sliceCacheURL = sliceCacheURL
    }

    /// 索引**签名文件**的本地副本路径，由索引副本路径推导（`…/index.json` → `…/index.json.sig`）。
    ///
    /// 刻意**不新增初始化参数**：签名与索引是一对，跟着索引走才不会被某个调用点漏配。
    /// 少了它，断网时读回来的副本就是一串无法判来源的字节，只能整份丢弃。
    public var signatureCacheURL: URL {
        indexCacheURL.appendingPathExtension(UpdateSignature.documentExtension)
    }

    // MARK: - 索引

    public func loadIndex(transport: CatalogTransport = DefaultCatalogTransport()) -> CatalogIndexLoadResult {
        var warnings: [String] = []

        if let remoteURL = remoteIndexURL,
           let verified = verifiedRemoteIndex(remoteURL, transport: transport, into: &warnings) {
            writeCache(verified, transport: transport, into: &warnings)
            return CatalogIndexLoadResult(index: verified.index, origin: .remote, warnings: warnings)
        }

        if let index = verifiedCachedIndex(transport: transport, into: &warnings) {
            return CatalogIndexLoadResult(index: index, origin: .cachedRemote, warnings: warnings)
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
                if let data = tryResult({ try transport.fetch(fileURL) }, into: &warnings, label: "分类切片拉取失败"),
                   digestAccepted(data, for: entry, into: &warnings, label: "分类切片完整性校验失败"),
                   let catalog = tryDecodeSlice(data, matching: entry, into: &warnings, label: "分类切片解析失败") {
                    return CatalogSliceLoadResult(
                        catalog: catalog,
                        origin: .remote,
                        warnings: warnings,
                        cacheData: data
                    )
                }
            } else {
                // 索引里的文件名不合法（含路径分隔符 / scheme / 不是 .json）。
                // 这是远端数据，宁可不加载也不能照着它发请求。
                warnings.append("索引里的分类文件名不合法，拒绝请求：\(entry.file ?? "nil")")
            }
        }

        if let data = tryResult({ try transport.readFile(at: sliceCacheURL) }, into: &warnings, label: "分类切片副本读取失败"),
           digestAccepted(data, for: entry, into: &warnings, label: "分类切片副本完整性校验失败"),
           let catalog = tryDecodeSlice(data, matching: entry, into: &warnings, label: "分类切片副本解析失败") {
            return CatalogSliceLoadResult(catalog: catalog, origin: .cachedRemote, warnings: warnings)
        }

        return CatalogSliceLoadResult(catalog: nil, origin: nil, warnings: warnings)
    }

    /// 加载「全部」候选集。它使用同一份切片缓存，因此重启离线时缓存内容仍与当前筛选吻合。
    public func loadAll(
        _ entry: LivewallAllEntry,
        categoryIDs: Set<Int>,
        transport: CatalogTransport = DefaultCatalogTransport()
    ) -> CatalogSliceLoadResult {
        var warnings: [String] = []

        if let remoteURL = remoteIndexURL {
            if let fileURL = entry.resolvedFileURL(relativeTo: remoteURL),
               let data = tryResult({ try transport.fetch(fileURL) }, into: &warnings, label: "全部切片拉取失败"),
               digestAccepted(data, sha256: entry.sha256, into: &warnings, label: "全部切片完整性校验失败"),
               let catalog = tryDecodeAllSlice(
                   data, itemCount: entry.itemCount, categoryIDs: categoryIDs,
                   into: &warnings, label: "全部切片解析失败"
               )
            {
                return CatalogSliceLoadResult(
                    catalog: catalog, origin: .remote, warnings: warnings, cacheData: data)
            }
            if entry.resolvedFileURL(relativeTo: remoteURL) == nil {
                warnings.append("索引里的全部切片文件名不合法，拒绝请求：\(entry.file)")
            }
        }

        if let data = tryResult({ try transport.readFile(at: sliceCacheURL) }, into: &warnings, label: "全部切片副本读取失败"),
           digestAccepted(data, sha256: entry.sha256, into: &warnings, label: "全部切片副本完整性校验失败"),
           let catalog = tryDecodeAllSlice(
               data, itemCount: entry.itemCount, categoryIDs: categoryIDs,
               into: &warnings, label: "全部切片副本解析失败"
           )
        {
            return CatalogSliceLoadResult(catalog: catalog, origin: .cachedRemote, warnings: warnings)
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

    // MARK: - 索引验签

    /// 验签通过、且摘要已确认齐全的索引，连同它的**原始字节与签名**（一并写副本用）。
    private struct VerifiedIndex {
        let index: LivewallCatalogIndex
        let payload: Data
        let signature: Data
    }

    /// 拉远程索引与它的签名，**先验签、再解析**。
    ///
    /// 顺序是刻意的：验签之前绝不把字节交给解码器 —— 一旦解析过，后面的每一步
    /// （写副本、用生成的菜单、按索引里的文件名发切片请求）都会默认它可信。
    private func verifiedRemoteIndex(
        _ remoteURL: URL,
        transport: CatalogTransport,
        into warnings: inout [String]
    ) -> VerifiedIndex? {
        guard let signatureURL = CatalogSignature.documentURL(for: remoteURL) else {
            warnings.append("索引地址推不出签名文件地址，拒绝使用远程索引")
            return nil
        }

        // 两步分开写、**第一步失败就不发第二个请求**：同一个 `inout` 变量不能在一次表达式里
        // 传两遍，而且没必要为一份拿不到的索引再去请求它的签名。
        guard let payload = tryResult({ try transport.fetch(remoteURL) }, into: &warnings, label: "索引拉取失败")
        else { return nil }
        guard
            let document = tryResult(
                { try transport.fetch(signatureURL) },
                into: &warnings,
                label: "索引签名拉取失败（漏传 .sig？）"
            )
        else { return nil }

        return verifiedIndex(payload: payload, document: document, into: &warnings, label: "索引验签失败")
    }

    /// 验签 + 解析 + 摘要齐全性检查。任一步不过都返回 nil 并留下可区分的原因。
    private func verifiedIndex(
        payload: Data,
        document: Data,
        into warnings: inout [String],
        label: String
    ) -> VerifiedIndex? {
        if case .rejected(let reason) = CatalogSignature.verify(payload: payload, document: document) {
            warnings.append("\(label)：\(reason)")
            return nil
        }

        guard let index = tryDecodeIndex(payload, into: &warnings, label: "索引解析失败") else { return nil }

        if let problem = CatalogSignature.digestProblem(in: index) {
            // 验签通过、但内容不合约定：这是**生产侧**的 bug（摘要没写全），
            // 客户端不能靠「那就少校验一层」把它掩盖过去。
            warnings.append("索引不可用：\(problem)")
            return nil
        }

        return VerifiedIndex(index: index, payload: payload, signature: document)
    }

    /// 把索引与它的签名**一起**写入本地副本。
    ///
    /// 两份必须同时落到缓存里（见 `signatureCacheURL`）：只写索引不写签名，断网时
    /// 读回来的副本过不了验签，等于没有缓存。任一份写失败都只记 warning ——
    /// 本次已经用上了远程内容，缓存只是下次断网的兜底。
    private func writeCache(
        _ verified: VerifiedIndex,
        transport: CatalogTransport,
        into warnings: inout [String]
    ) {
        do {
            try transport.writeFile(verified.payload, to: indexCacheURL)
        } catch {
            warnings.append("索引已使用，但写入本地副本失败：\(error.localizedDescription)")
        }
        do {
            try transport.writeFile(verified.signature, to: signatureCacheURL)
        } catch {
            warnings.append("索引已使用，但写入签名副本失败（断网时没有可用的兜底）：\(error.localizedDescription)")
        }
    }

    /// 读本地副本，**同样验签**。
    ///
    /// 副本也验签，而不是「自己写的所以可信」：它是断网时唯一的来源，而且是一份躺在本机
    /// 磁盘上、生命周期跨进程的字节。验一遍的代价是本地一次 Ed25519（微秒级）。
    private func verifiedCachedIndex(
        transport: CatalogTransport,
        into warnings: inout [String]
    ) -> LivewallCatalogIndex? {
        guard
            let payload = tryResult(
                { try transport.readFile(at: indexCacheURL) },
                into: &warnings,
                label: "索引副本读取失败"
            )
        else { return nil }
        guard
            let document = tryResult(
                { try transport.readFile(at: signatureCacheURL) },
                into: &warnings,
                label: "索引签名副本读取失败"
            )
        else { return nil }

        return verifiedIndex(payload: payload, document: document, into: &warnings, label: "索引副本验签失败")?.index
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

    /// 切片的字节摘要是否与**已验签的索引**里记的那个一致。
    ///
    /// 不符就整条判不可用（而不是「先用着」）：切片的 `url` / `coverUrl` 直接决定
    /// 「播放什么视频」与「往系统墙纸上写哪张图」—— 一份来路不明的切片没有可用的部分。
    private func digestAccepted(
        _ data: Data,
        for entry: LivewallCategoryEntry,
        into warnings: inout [String],
        label: String
    ) -> Bool {
        guard let expected = entry.sha256 else {
            // 正常情况下到不了这里：`CatalogSignature.digestProblem` 已经把「有切片却没摘要」
            // 的索引整份拒掉了。这条守卫是给「绕过索引校验、自己构造 entry」的调用点兜底的。
            // **缺摘要不能当作通过** —— 那等于给攻击者留一条「把摘要字段删掉」的路。
            warnings.append("\(label)：索引里没有该分类切片的摘要，拒绝使用")
            return false
        }
        return digestAccepted(data, sha256: expected, into: &warnings, label: label)
    }

    private func digestAccepted(
        _ data: Data,
        sha256 expected: String,
        into warnings: inout [String],
        label: String
    ) -> Bool {
        guard ContentDigest.isValid(expected) else {
            warnings.append("\(label)：索引里的 sha256 格式无效，拒绝使用")
            return false
        }
        guard ContentDigest.matches(data, hex: expected) else {
            let actual = ContentDigest.sha256Hex(data)
            warnings.append(
                "\(label)：切片内容与索引里的摘要不符（索引记 \(expected.prefix(12))…，实际 \(actual.prefix(12))…）"
            )
            return false
        }
        return true
    }

    private func tryDecodeAllSlice(
        _ data: Data,
        itemCount: Int,
        categoryIDs: Set<Int>,
        into warnings: inout [String],
        label: String
    ) -> WallpaperCatalog? {
        do {
            let catalog = CatalogCoding.sanitize(try CatalogCoding.decode(data))
            guard catalog.items.count == itemCount, !catalog.items.isEmpty else {
                warnings.append("\(label)：条目数与索引不符（索引记 \(itemCount)，实际 \(catalog.items.count)）")
                return nil
            }
            guard Set(catalog.source.categoryIds) == categoryIDs else {
                warnings.append("\(label)：分类清单与已验签索引不符")
                return nil
            }
            let itemIDs = catalog.items.map(\.id)
            guard Set(itemIDs).count == itemIDs.count,
                  catalog.items.allSatisfy({ !$0.categoryIds.isEmpty && Set($0.categoryIds).isSubset(of: categoryIDs) })
            else {
                warnings.append("\(label)：条目分类无效或存在重复条目")
                return nil
            }
            return catalog
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
