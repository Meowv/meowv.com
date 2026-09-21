import Foundation
import LiveWallCore

// MARK: - 测试替身

/// 可注入的传输层：文件与远程内容都用内存字典模拟，可单独注入错误。
final class FakeTransport: CatalogTransport {
    var files: [String: Data] = [:]
    var remote: [String: Data] = [:]
    var remoteError: Error?
    var readError: Error?
    var writeError: Error?
    private(set) var written: [String: Data] = [:]
    private(set) var fetchedURLs: [String] = []

    func readFile(at url: URL) throws -> Data {
        if let readError { throw readError }
        guard let data = files[url.path] else {
            throw CatalogError.fileNotFound(url.path)
        }
        return data
    }

    func writeFile(_ data: Data, to url: URL) throws {
        if let writeError { throw writeError }
        written[url.path] = data
        files[url.path] = data
    }

    func fetch(_ url: URL) throws -> Data {
        fetchedURLs.append(url.absoluteString)
        if let remoteError { throw remoteError }
        guard let data = remote[url.absoluteString] else {
            throw CatalogError.fileNotFound(url.absoluteString)
        }
        return data
    }
}

struct StubError: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - 构造器

/// 索引（`livewall/catalog.json`）的形状。**刻意不含 items**。
func indexJSON(
    categories: [(id: Int, name: String, file: String?, itemCount: Int)] = [
        (4001, "美女", "category.4001.json", 2),
        (6000, "风景", "category.6000.json", 1),
    ],
    defaultCategoryId: Int? = 4001,
    schemaVersion: Int = 1
) -> Data {
    let list = categories.map { entry in
        let file = entry.file.map { "\"\($0)\"" } ?? "null"
        return """
        {"id":\(entry.id),"name":"\(entry.name)","file":\(file),"itemCount":\(entry.itemCount)}
        """
    }.joined(separator: ",")
    let defaultField = defaultCategoryId.map { "\"defaultCategoryId\":\($0)," } ?? ""
    return Data("""
    {"schemaVersion":\(schemaVersion),"generatedAt":"2026-09-18T00:00:00Z",
     "source":{"deviceType":"desktop","contentType":"dynamic"},
     \(defaultField)"categories":[\(list)]}
    """.utf8)
}

/// 分类切片（`livewall/category.<id>.json`）的形状。
func sliceJSON(
    categoryName: String = "美女",
    categoryIds: [Int] = [4001],
    items: [(id: Int, url: String, title: String)] = [(1, "https://cdn.test/a.mp4", "A")],
    schemaVersion: Int = 1
) -> Data {
    let list = items.map { item in
        """
        {"id":\(item.id),"title":"\(item.title)","author":"作者","url":"\(item.url)","durationSeconds":null,"tags":["t1"],"categoryIds":\(categoryIds)}
        """
    }.joined(separator: ",")
    return Data("""
    {"schemaVersion":\(schemaVersion),"generatedAt":"2026-09-18T00:00:00Z",
     "source":{"deviceType":"desktop","contentType":"dynamic","categoryName":"\(categoryName)","categoryIds":\(categoryIds)},
     "items":[\(list)]}
    """.utf8)
}

let testIndexURL = "https://cdn.test/livewall/catalog.json"
let testIndexCachePath = "/tmp/livewall-test/cache/index.json"
let testSliceCachePath = "/tmp/livewall-test/cache/slice.json"

/// 签名文件的地址/路径。由被签文件的地址**加 `.sig`** 推导（`CatalogSignature.documentURL`）。
let testIndexSignatureURL = testIndexURL + ".sig"
let testIndexSignatureCachePath = testIndexCachePath + ".sig"

func makeService(remote: URL? = URL(string: testIndexURL)) -> CatalogService {
    CatalogService(
        remoteIndexURL: remote,
        indexCacheURL: URL(fileURLWithPath: testIndexCachePath),
        sliceCacheURL: URL(fileURLWithPath: testSliceCachePath)
    )
}

func entry(
    _ id: Int = 4001,
    name: String = "美女",
    file: String? = "category.4001.json",
    itemCount: Int = 2,
    sha256: String? = nil
) -> LivewallCategoryEntry {
    LivewallCategoryEntry(id: id, name: name, file: file, itemCount: itemCount, sha256: sha256)
}

/// 某个分类条目的「摘要取自这些字节」版本。
///
/// 切片不单独签名，只靠**索引里记的摘要**保证完整性 —— 所以凡是期望切片被接受的用例，
/// 都必须把「真实内容的摘要」放进 entry，否则连不上（这本身就是设计的一部分：
/// 没有摘要的切片一律拒绝）。
func entry(_ id: Int = 4001, name: String = "美女", digestOf data: Data, itemCount: Int = 2)
    -> LivewallCategoryEntry
{
    LivewallCategoryEntry(
        id: id,
        name: name,
        file: "category.\(id).json",
        itemCount: itemCount,
        sha256: ContentDigest.sha256Hex(data)
    )
}

// MARK: - 内容清单签名的固定向量

/// 已由**真实发布私钥**签名的内容索引（`tools/sign-version.swift sign`），
/// 与更新链共用同一把密钥与同一个信任锚。
///
/// ## 为什么必须是真签名，不能在测试里临时生成一对密钥
///
/// `CatalogSignature.verify` 刻意**只认内嵌公钥**，没有「传入公钥」这个参数 ——
/// 那是整套机制的锚，留一个「换个公钥就能验过」的口子等于把锚拔掉。
/// 于是正例只能靠真签名，代价就是这组向量。
///
/// 附带效果是它们同时成了**绊线**：谁动了 `UpdateSignature.publicKeyBase64`
/// （换密钥、改坏、被截断），下面所有正例会一起红 —— 而那时第一嫌疑是公钥，
/// 不是密码学出了问题。
///
/// ⚠️ 改动这些 JSON 的**任何一个字节**（哪怕只挪一个缩进）都必须重新签：
///    签的是原始字节。重新生成的命令见 `livewall/README.md`「内容清单签名」。
enum SignedIndex {

    /// 正常：一个分类，条目摘要合法（`a1a1…`）。
    static let remotePayload = #"{"schemaVersion":1,"generatedAt":"2026-09-18T00:00:00Z","source":{"deviceType":"desktop","contentType":"dynamic"},"defaultCategoryId":7,"categories":[{"id":7,"name":"远程","file":"c.json","itemCount":1,"sha256":"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"}]}"#
    static let remoteSignature = "bW2ycbZCuo0VvOEHwq26nmLotN7+jpg8ll1W/X6C9VJSmTPLdCVF3F8BcD4itRwZEe76l+SRer9g0THYIcFvDg=="

    /// 正常：另一个分类（用来区分「用的是哪一份」）。
    static let cachePayload = #"{"schemaVersion":1,"generatedAt":"2026-09-18T00:00:00Z","source":{"deviceType":"desktop","contentType":"dynamic"},"defaultCategoryId":8,"categories":[{"id":8,"name":"本地","file":"l.json","itemCount":1,"sha256":"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"}]}"#
    static let cacheSignature = "rxdHjNw0HIvwQjUePbHr8SjrX5572BjlBzPgV7yqtB0oNbdElborxQasGFVNZsEbKMTgVEe1fI+aD9sG5lq1Bg=="

    /// 正常：第三个分类（副本专用）。
    static let cacheAltPayload = #"{"schemaVersion":1,"generatedAt":"2026-09-18T00:00:00Z","source":{"deviceType":"desktop","contentType":"dynamic"},"defaultCategoryId":9,"categories":[{"id":9,"name":"副本","file":"c.json","itemCount":1,"sha256":"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"}]}"#
    static let cacheAltSignature = "/smGKtmoBM6MPRl45jLHS2PXW6g9iMeKhivranemYAPhg7ZULRfXY4d/mA8vq0UbOdSxYvDFlc/DohVwhZPUCA=="

    /// 负例：**签名有效**、但分类为空 —— 失败必须发生在「解析」那一步。
    static let emptyCategoriesPayload = #"{"schemaVersion":1,"generatedAt":"2026-09-18T00:00:00Z","source":{"deviceType":"desktop","contentType":"dynamic"},"defaultCategoryId":4001,"categories":[]}"#
    static let emptyCategoriesSignature = "Ni/Bv0JM4WXDn6YzW2nhbKjuU3mgx6HETkb9u5M9zhZIo4qsvKtaYws+8RcDdIcxdYgXeheKNBE55a9RmQMTBQ=="

    /// 负例：**签名有效**、但某个有切片的分类没有摘要。
    static let missingDigestPayload = #"{"schemaVersion":1,"generatedAt":"2026-09-18T00:00:00Z","source":{"deviceType":"desktop","contentType":"dynamic"},"defaultCategoryId":4001,"categories":[{"id":4001,"name":"美女","file":"category.4001.json","itemCount":2}]}"#
    static let missingDigestSignature = "ux8iFWL6QkB1/XG4wlFbSl8a6TBriFAlk3/rNOZ1LBdQLH40/3Wxomtz4XbLzZgMTEfv3BdgHO/ftjqXeUKuBQ=="

    /// 负例：**签名有效**、但根本不是 JSON。
    static let badJSONPayload = "not json at all"
    static let badJSONSignature = "R5dbt1Rnyutf8nGez2roOpjpMQK9a6eBNgZ2U7tQSOeCYNpnQ0K19oO7KZ9LsukhJ0D3MLuJ/bvs9QZe1dbgDg=="
}

/// 拼一份**签名文件**的内容（形状与 `tools/sign-version.swift` 写出的一致）。
///
/// 传给 `serve` / `cache` 的是签名本身（base64 串），由这里负责包成文件内容。
/// 直接把裸 base64 写进 `.sig` 是这条链上最容易犯的一次错（本次实现时就犯过一次），
/// 而客户端会报「签名文件不是 JSON（是不是没上传 .sig 文件？）」——
/// 看起来像「文件没传」，排障方向直接偏掉。
private func signatureFile(_ signature: String) -> Data {
    Data(#"{"alg":"ed25519","signature":"\#(signature)"}"#.utf8)
}

/// 在 `url` 上提供「清单 + 它的签名」这一对。
private func serve(
    _ transport: FakeTransport,
    payload: String,
    signature: String,
    at url: String = testIndexURL
) {
    transport.remote[url] = Data(payload.utf8)
    transport.remote[url + ".sig"] = signatureFile(signature)
}

/// 在本地副本路径上放「清单 + 它的签名」这一对。
private func cache(_ transport: FakeTransport, payload: String, signature: String) {
    transport.files[testIndexCachePath] = Data(payload.utf8)
    transport.files[testIndexSignatureCachePath] = signatureFile(signature)
}

// MARK: - 测试

func catalogTests() {
    suite("CatalogCoding 索引") {

        test("解析索引") {
            let index = try? CatalogCoding.decodeIndex(indexJSON())
            expectNotNil(index, "索引应能解析")
            expectEqual(index?.categories.count, 2, "分类数")
            expectEqual(index?.categories.first?.name, "美女", "首个分类名")
            expectEqual(index?.defaultCategoryId, 4001, "默认分类")
            expectEqual(index?.source.deviceType, "desktop", "设备类型")
            // 索引里的 source 没有 categoryName / categoryIds，必须容错
            expectEqual(index?.source.categoryIds, [], "索引 source 的 categoryIds 应回退空数组")
            expectNil(index?.source.categoryName, "索引 source 没有分类名")
        }

        test("索引不含 items 也能解析 —— 它本来就不该有") {
            let index = try? CatalogCoding.decodeIndex(indexJSON())
            expectNotNil(index, "索引不该因为缺 items 而失败")
        }

        test("拒绝没有分类的索引") {
            expectThrows("空 categories 应被拒绝") {
                _ = try CatalogCoding.decodeIndex(indexJSON(categories: []))
            }
        }

        test("拒绝高于支持版本的索引") {
            expectThrows("schemaVersion=99 应被拒绝") {
                _ = try CatalogCoding.decodeIndex(indexJSON(schemaVersion: 99))
            }
        }

        test("拒绝结构不符的 JSON") {
            expectThrows("非索引 JSON 应被拒绝") {
                _ = try CatalogCoding.decodeIndex(Data("{\"foo\":1}".utf8))
            }
        }

        test("默认分类：优先 defaultCategoryId") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(defaultCategoryId: 6000))
            expectEqual(index.resolvedDefaultCategoryID, 6000, "应取声明的默认分类")
        }

        test("默认分类：不在清单里时退回首项") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(defaultCategoryId: 9999))
            expectEqual(index.resolvedDefaultCategoryID, 4001, "应退回首项")
        }

        test("默认分类：没有 defaultCategoryId 时退回首项") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(defaultCategoryId: nil))
            expectEqual(index.resolvedDefaultCategoryID, 4001, "应退回首项")
        }

        test("按 id 取分类条目") {
            let index = try! CatalogCoding.decodeIndex(indexJSON())
            expectEqual(index.entry(for: 6000)?.name, "风景", "应能取到分类")
            expectNil(index.entry(for: 9999), "不存在的 id 返回 nil")
        }
    }

    suite("CatalogCoding 分类切片") {

        test("解析切片") {
            let catalog = try? CatalogCoding.decode(sliceJSON())
            expectNotNil(catalog, "切片应能解析")
            expectEqual(catalog?.items.count, 1, "条目数")
            expectEqual(catalog?.source.categoryName, "美女", "分类名")
            expectEqual(catalog?.items.first?.tags, ["t1"], "标签")
            expectNil(catalog?.items.first?.durationSeconds, "durationSeconds 应为 nil")
        }

        test("拒绝空条目切片") {
            expectThrows("空 items 应被拒绝") {
                _ = try CatalogCoding.decode(sliceJSON(items: []))
            }
        }

        test("条目缺 categoryIds 不会让整份切片解不出来") {
            // 内置兜底条目与手写清单都没有这个字段。
            let json = """
            {"schemaVersion":1,"generatedAt":"","source":{"deviceType":"desktop","contentType":"dynamic","categoryName":null,"categoryIds":[]},
             "items":[{"id":1,"title":"T","author":"","url":"https://cdn.test/a.mp4","durationSeconds":null,"tags":[]}]}
            """
            let catalog = try? CatalogCoding.decode(Data(json.utf8))
            expectNotNil(catalog, "缺字段应能解码")
            expectEqual(catalog?.items.first?.categoryIds, [], "应回退空数组")
        }

        test("条目缺 coverUrl 不会让整份切片解不出来") {
            // 加 coverUrl 之前的清单（老缓存副本）与内置兜底条目都没有这个字段。
            let json = """
            {"schemaVersion":1,"generatedAt":"","source":{"deviceType":"desktop","contentType":"dynamic","categoryName":null,"categoryIds":[]},
             "items":[{"id":1,"title":"T","author":"","url":"https://cdn.test/a.mp4","durationSeconds":null,"tags":[]}]}
            """
            let catalog = try? CatalogCoding.decode(Data(json.utf8))
            expectNotNil(catalog, "缺字段应能解码")
            expectNil(catalog?.items.first?.coverUrl, "应回退 nil")
            expectNil(catalog?.items.first?.coverImageURL, "没有静态图地址")
        }

        test("解析 coverUrl 并校验 scheme") {
            let json = """
            {"schemaVersion":1,"generatedAt":"","source":{"deviceType":"desktop","contentType":"dynamic","categoryName":null,"categoryIds":[]},
             "items":[
               {"id":1,"title":"T","author":"","url":"https://cdn.test/a.mp4","coverUrl":"https://cdn.test/a.jpg","durationSeconds":null,"tags":[]},
               {"id":2,"title":"T","author":"","url":"https://cdn.test/b.mp4","coverUrl":"not-a-url","durationSeconds":null,"tags":[]},
               {"id":3,"title":"T","author":"","url":"https://cdn.test/c.mp4","coverUrl":"   ","durationSeconds":null,"tags":[]}
             ]}
            """
            let catalog = try? CatalogCoding.decode(Data(json.utf8))
            expectNotNil(catalog, "应能解码")
            let items = catalog?.items ?? []
            expectEqual(items.first?.coverUrl, "https://cdn.test/a.jpg", "字段值原样保留")
            expectEqual(items.first?.coverImageURL?.absoluteString, "https://cdn.test/a.jpg", "合法地址可解析")
            expectNil(items.dropFirst().first?.coverImageURL, "非 URL 应返回 nil")
            expectNil(items.dropFirst(2).first?.coverImageURL, "空白串应返回 nil")
            // 静态图地址非法不该让条目消失：它不影响播放，客户端会退回抓帧
            expectEqual(CatalogCoding.sanitize(catalog!).items.count, 3, "coverUrl 非法不影响条目保留")
        }

        test("sanitize 剔除非法 URL 与重复") {
            let catalog = try! CatalogCoding.decode(sliceJSON(items: [
                (1, "https://cdn.test/a.mp4", "A"),
                (2, "not-a-url", "B"),
                (3, "https://cdn.test/a.mp4", "A 重复"),
            ]))
            let clean = CatalogCoding.sanitize(catalog)
            expectEqual(clean.items.count, 1, "只保留第一条合法且不重复的")
            expectEqual(clean.items.first?.id, 1, "保留的 id")
        }

        test("playableURL 接受 http(s) 与 file://，其余一律不可播") {
            // 本地文件夹数据源（`LocalVideoSource`）生成的条目地址是 `file://`。
            // 播放侧若仍用 `remoteURL` 判定，这些条目会被一律判成非法 ——
            // 候选池里灌进去了却播不了，本地固定项还会被 `Preferences.sanitized()` 清掉。
            let remote = WallpaperItem(id: 1, title: "T", author: "", url: "https://cdn.test/a.mp4")
            expectNotNil(remote.playableURL, "http(s) 可播")
            let local = WallpaperItem(id: 2, title: "T", author: "", url: "file:///Users/x/Movies/a.mp4")
            expectEqual(local.playableURL?.path, "/Users/x/Movies/a.mp4", "本地文件可播")
            expectNil(local.remoteURL, "remoteURL 仍只认 http(s)（远端清洗与下载用它）")
            expectNil(WallpaperItem(id: 3, title: "T", author: "", url: "").playableURL, "空串不可播")
            expectNil(WallpaperItem(id: 4, title: "T", author: "", url: "ftp://x/a.mp4").playableURL, "其它 scheme 不可播")
        }

        test("remoteURL 与 displayName") {
            let item = WallpaperItem(id: 1, title: "标题", author: "作者", url: "https://cdn.test/a.mp4")
            expectNotNil(item.remoteURL, "remoteURL")
            expectEqual(item.displayName, "标题 — 作者", "displayName")
            let noAuthor = WallpaperItem(id: 2, title: "标题", author: "", url: "https://cdn.test/b.mp4")
            expectEqual(noAuthor.displayName, "标题", "无作者时不加破折号")
        }
    }

    suite("分类切片地址解析") {

        let indexURL = URL(string: "https://cdn.test/livewall/catalog.json")!

        test("正常相对文件名解析到同目录") {
            let url = entry(file: "category.4001.json").resolvedFileURL(relativeTo: indexURL)
            expectEqual(url?.absoluteString, "https://cdn.test/livewall/category.4001.json", "应拼到索引同目录")
        }

        test("条目数为 0 的分类没有文件名") {
            expectNil(entry(file: nil).resolvedFileURL(relativeTo: indexURL), "file 为 nil 应返回 nil")
        }

        test("拒绝带路径分隔符的名字") {
            // 索引是远端数据，不能让它把请求指到别的路径去
            for name in ["../secret.json", "sub/category.json", "/etc/passwd.json", "a\\b.json"] {
                expectNil(
                    entry(file: name).resolvedFileURL(relativeTo: indexURL),
                    "应拒绝 \(name)"
                )
            }
        }

        test("拒绝带 scheme 的名字") {
            for name in ["https://evil.test/x.json", "file:///etc/x.json"] {
                expectNil(entry(file: name).resolvedFileURL(relativeTo: indexURL), "应拒绝 \(name)")
            }
        }

        test("拒绝点目录与非 json") {
            expectNil(entry(file: ".").resolvedFileURL(relativeTo: indexURL), "应拒绝 .")
            expectNil(entry(file: "..").resolvedFileURL(relativeTo: indexURL), "应拒绝 ..")
            expectNil(entry(file: "category.4001").resolvedFileURL(relativeTo: indexURL), "应拒绝非 .json")
            expectNil(entry(file: "").resolvedFileURL(relativeTo: indexURL), "应拒绝空名")
        }
    }

    suite("CatalogService 索引降级链") {

        test("配置了远程地址时优先拉远程") {
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.remotePayload, signature: SignedIndex.remoteSignature)
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .remote, "来源")
            expectEqual(result.index?.categories.first?.id, 7, "应使用远程内容")
            expectEqual(
                transport.fetchedURLs,
                [testIndexURL, testIndexSignatureURL],
                "应当**同时**拉索引与它的签名"
            )
        }

        test("远程成功后把索引与签名**一起**写入本地副本") {
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.remotePayload, signature: SignedIndex.remoteSignature)

            _ = makeService().loadIndex(transport: transport)

            expectEqual(transport.written[testIndexCachePath], Data(SignedIndex.remotePayload.utf8), "索引副本")
            // 只写索引不写签名，断网时读回来的副本过不了验签 —— 等于没有缓存。
            expectEqual(
                transport.written[testIndexSignatureCachePath],
                signatureFile(SignedIndex.remoteSignature),
                "签名副本"
            )
        }

        test("签名副本路径由索引副本路径推导，不是调用点单独配的") {
            // 这条挡的是「调用点忘了配签名路径」这类配置漏配：路径是从索引派生的，
            // 测试常量与产品推导必须一致，否则上面那条断言等于在测另一个位置。
            expectEqual(makeService().signatureCacheURL.path, testIndexSignatureCachePath, "推导出的签名副本路径")
        }

        test("写入副本失败不影响本次使用，只记 warning") {
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.remotePayload, signature: SignedIndex.remoteSignature)
            transport.writeError = StubError(message: "磁盘只读")

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .remote, "仍应使用远程内容")
            expectEqual(result.warnings.count, 2, "索引副本与签名副本各一条")
            expect(
                result.warnings.contains { $0.contains("写入本地副本失败") },
                "应说明索引副本写入失败，实际：\(result.warnings)"
            )
            expect(
                result.warnings.contains { $0.contains("写入签名副本失败") },
                "应说明签名副本写入失败，实际：\(result.warnings)"
            )
        }

        test("远程失败时回退本地副本") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            cache(transport, payload: SignedIndex.cacheAltPayload, signature: SignedIndex.cacheAltSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(result.index?.categories.first?.id, 9, "应使用副本内容")
            expectEqual(result.warnings.count, 1, "记录一条远程失败")
        }

        test("未配置远程地址时不发起请求，直接用副本") {
            let transport = FakeTransport()
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService(remote: nil).loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(transport.fetchedURLs.count, 0, "不应发起远程请求")
        }

        test("远程与副本都失败时返回 nil") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")

            let result = makeService().loadIndex(transport: transport)

            expectNil(result.index, "应返回 nil")
            expectNil(result.origin, "失败时来源也应为 nil")
            expect(!result.warnings.isEmpty, "失败必须留下原因，否则排障时只剩一句「都不可用」")
        }

        test("远程索引被改一个字节 → 判不可用，降级到副本") {
            // 这是整套签名机制存在的理由：能改 catalog.json 的人（静态站被入侵、
            // 发布脚本被改、CDN 被投毒）改不动签名。**没有「验不过就退回不校验」这条路。**
            let tampered = SignedIndex.remotePayload.replacingOccurrences(of: "\"id\":7", with: "\"id\":8")
            expect(tampered != SignedIndex.remotePayload, "前提：替换确实改了内容")
            let transport = FakeTransport()
            serve(transport, payload: tampered, signature: SignedIndex.remoteSignature)
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "被改过的远程索引不能用，应降级")
            expect(
                result.warnings.contains { $0.contains("索引验签失败") && $0.contains("不符") },
                "原因要指明签名不符，实际：\(result.warnings)"
            )
        }

        test("远程少了 .sig 文件 → 判不可用，降级到副本") {
            // 「把签名文件删掉即可绕过」是这类机制最容易漏的洞，必须堵死。
            let transport = FakeTransport()
            transport.remote[testIndexURL] = Data(SignedIndex.remotePayload.utf8)
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "缺签名不能用")
            expect(
                result.warnings.contains { $0.contains("索引签名拉取失败") },
                "原因要指向签名文件缺失，而不是含糊的「都不可用」：\(result.warnings)"
            )
        }

        test("远程返回空分类时继续降级，不当作成功") {
            // 载荷本身**签名有效** —— 失败必须发生在「解析」那一步，
            // 而不是被验签顺带挡掉（那样这条用例就测不到解析路径了）。
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.emptyCategoriesPayload, signature: SignedIndex.emptyCategoriesSignature)
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "空索引不算成功，应继续降级")
            expect(
                result.warnings.contains { $0.contains("索引解析失败") },
                "应记为解析失败，实际：\(result.warnings)"
            )
        }

        test("远程返回坏 JSON 时继续降级") {
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.badJSONPayload, signature: SignedIndex.badJSONSignature)
            cache(transport, payload: SignedIndex.cachePayload, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "坏 JSON 不算成功，应继续降级")
            expect(
                result.warnings.contains { $0.contains("索引解析失败") },
                "应记为解析失败，实际：\(result.warnings)"
            )
        }

        test("索引里缺切片摘要 → 整份判不可用（不能降级成「不校验」）") {
            // 验签通过、内容却不合约定：这是生产侧的 bug。客户端若「那就少校验一层」，
            // 签名机制就只剩一半 —— 攻击者只要让某个分类不带摘要即可让它的切片免检。
            let transport = FakeTransport()
            serve(transport, payload: SignedIndex.missingDigestPayload, signature: SignedIndex.missingDigestSignature)

            let result = makeService().loadIndex(transport: transport)

            expectNil(result.index, "缺摘要的索引必须判不可用")
            expect(
                result.warnings.contains { $0.contains("缺少合法的切片摘要") && $0.contains("美女") },
                "原因要指名是哪个分类缺摘要，实际：\(result.warnings)"
            )
        }

        test("副本缺签名文件 → 判不可用（副本也要验签）") {
            // 副本是断网时唯一的来源，而且是一份躺在本机磁盘上、跨进程存活的字节。
            // 「自己写的所以可信」是一条要一直维护的假设，验一遍的成本是本地一次 Ed25519。
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testIndexCachePath] = Data(SignedIndex.cachePayload.utf8)

            let result = makeService().loadIndex(transport: transport)

            expectNil(result.index, "没有签名副本就不能用")
            expect(
                result.warnings.contains { $0.contains("索引签名副本读取失败") },
                "原因要指向签名副本缺失，实际：\(result.warnings)"
            )
        }

        test("副本被改过 → 判不可用") {
            let tampered = SignedIndex.cachePayload.replacingOccurrences(of: "\"id\":8", with: "\"id\":9")
            expect(tampered != SignedIndex.cachePayload, "前提：替换确实改了内容")
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            cache(transport, payload: tampered, signature: SignedIndex.cacheSignature)

            let result = makeService().loadIndex(transport: transport)

            expectNil(result.index, "被改过的副本不能用")
            expect(
                result.warnings.contains { $0.contains("索引副本验签失败") },
                "原因要指明是副本验签失败，实际：\(result.warnings)"
            )
        }
    }

    suite("CatalogService 切片降级链") {

        let sliceURL = "https://cdn.test/livewall/category.4001.json"

        test("按索引里的相对名拼出远程地址并优先拉远程") {
            let remoteSlice = sliceJSON(items: [(7, "https://cdn.test/r.mp4", "远程")])
            let transport = FakeTransport()
            transport.remote[sliceURL] = remoteSlice

            let result = makeService().loadSlice(entry(digestOf: remoteSlice), transport: transport)

            expectEqual(result.origin, .remote, "来源")
            expectEqual(result.catalog?.items.first?.id, 7, "应使用远程内容")
            expectEqual(transport.fetchedURLs, [sliceURL], "请求的地址应由索引地址拼出")
        }

        test("远程成功返回可延迟写入的副本数据") {
            let remoteSlice = sliceJSON()
            let transport = FakeTransport()
            transport.remote[sliceURL] = remoteSlice

            let result = makeService().loadSlice(entry(digestOf: remoteSlice), transport: transport)

            expectNotNil(result.cacheData, "应返回副本数据，调用方确认请求仍有效后再写入")
        }

        test("远程切片的摘要与索引不符 → 拒绝，降级到副本") {
            // 索引已经验过签，所以索引里的摘要是可信的；切片对不上就说明**内容被换过**
            // （或者生产侧有 bug）。切片的 url / coverUrl 直接决定「播什么视频」与
            // 「往系统墙纸上写哪张图」，没有可以「先用着」的部分。
            let tampered = sliceJSON(items: [(7, "https://evil.test/x.mp4", "被换过")])
            let good = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])
            let transport = FakeTransport()
            transport.remote[sliceURL] = tampered
            transport.files[testSliceCachePath] = good

            let result = makeService().loadSlice(entry(digestOf: good), transport: transport)

            expectEqual(result.origin, .cachedRemote, "摘要不符的远程切片不能用")
            expect(
                result.warnings.contains { $0.contains("分类切片完整性校验失败") && $0.contains("摘要不符") },
                "原因要指出摘要不符，而不是含糊的解析失败：\(result.warnings)"
            )
        }

        test("副本的摘要与索引不符 → 拒绝") {
            let expected = sliceJSON()
            let stale = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "旧副本")])
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testSliceCachePath] = stale

            let result = makeService().loadSlice(entry(digestOf: expected), transport: transport)

            expectNil(result.catalog, "摘要不符的副本不能用")
            expect(
                result.warnings.contains { $0.contains("副本完整性校验失败") },
                "原因要指明是副本的完整性校验，实际：\(result.warnings)"
            )
        }

        test("远程失败时回退副本（副本必须与索引里的摘要一致）") {
            let cached = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testSliceCachePath] = cached

            let result = makeService().loadSlice(entry(digestOf: cached), transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(result.catalog?.items.first?.id, 9, "应使用副本内容")
        }

        test("副本的分类归属不符时拒绝 —— 换过分类后离线启动就是这种情况") {
            // 缓存只有一份（「最后一份成功的切片」）。不校验归属的话，
            // 换了分类再离线启动，会把上一个分类的内容当成目标分类。
            let cached = sliceJSON(
                categoryName: "风景",
                categoryIds: [6000],
                items: [(9, "https://cdn.test/c.mp4", "别的分类")]
            )
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testSliceCachePath] = cached

            let result = makeService().loadSlice(entry(4001, name: "美女", digestOf: cached), transport: transport)

            expectNil(result.catalog, "归属不符应拒绝")
            expect(
                result.warnings.contains { $0.contains("分类归属与请求不符") },
                "应说明是归属不符，而不是含糊的解析失败"
            )
        }

        test("副本归属相符时可用（含子树 id）") {
            let cached = sliceJSON(categoryIds: [4001, 64578])
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            // 一级分类的 categoryIds 是整棵子树，含自身
            transport.files[testSliceCachePath] = cached

            let result = makeService().loadSlice(entry(digestOf: cached), transport: transport)

            expectEqual(result.origin, .cachedRemote, "子树包含自身，应可用")
        }

        test("索引里的文件名不合法时拒绝发请求，只记 warning") {
            let transport = FakeTransport()

            let result = makeService().loadSlice(entry(file: "../../etc/passwd.json"), transport: transport)

            expectNil(result.catalog, "非法文件名应拒绝")
            expectEqual(transport.fetchedURLs.count, 0, "不应发出任何请求")
        }

        test("索引里没有该切片的摘要 → 拒绝使用（不能降级成「不校验」）") {
            // 正常路径上到不了这里（缺摘要的索引在 loadIndex 就被整份拒了），
            // 这条守的是「绕过索引校验、自己构造 entry」的调用点。
            let data = sliceJSON()
            let transport = FakeTransport()
            transport.remote[sliceURL] = data

            let result = makeService().loadSlice(entry(), transport: transport)

            expectNil(result.catalog, "没有摘要就不能用")
            expect(
                result.warnings.contains { $0.contains("没有该分类切片的摘要") },
                "原因要指明缺摘要，实际：\(result.warnings)"
            )
        }

        test("摘要相符但切片为空 → 仍然判失败，且不会拿一份摘要对不上的副本兜底") {
            // 生成侧不会产出空切片，所以这条是「万一」。注意降级语义与没有摘要机制时**不同**：
            // 副本必须与索引里的摘要逐字节一致才可能被接受，对不上就不该拿来兜底 ——
            // 那等于用一份来路不明的数据掩盖一次真实故障。
            let empty = sliceJSON(items: [])
            let cached = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])
            let transport = FakeTransport()
            transport.remote[sliceURL] = empty
            transport.files[testSliceCachePath] = cached

            let result = makeService().loadSlice(entry(digestOf: empty), transport: transport)

            expectNil(result.catalog, "没有可用内容")
            expect(
                result.warnings.contains { $0.contains("分类切片解析失败") },
                "空切片应记解析失败，实际：\(result.warnings)"
            )
            expect(
                result.warnings.contains { $0.contains("副本完整性校验失败") },
                "副本应因摘要不符被拒，实际：\(result.warnings)"
            )
        }

        test("未配置远程地址时不发请求，直接用副本") {
            let cached = sliceJSON()
            let transport = FakeTransport()
            transport.files[testSliceCachePath] = cached

            let result = makeService(remote: nil).loadSlice(entry(digestOf: cached), transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(transport.fetchedURLs.count, 0, "不应发起远程请求")
        }

        test("远程与副本都不可用时返回 nil") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")

            let result = makeService().loadSlice(entry(), transport: transport)

            expectNil(result.catalog, "应返回 nil")
            expectNil(result.origin, "失败时来源也应为 nil")
            expect(!result.warnings.isEmpty, "失败必须留下原因")
        }

        test("远程返回的条目全是非法 URL 时判失败") {
            let bad = sliceJSON(items: [(1, "bad-url", "坏")])
            let transport = FakeTransport()
            transport.remote[sliceURL] = bad

            let result = makeService().loadSlice(entry(digestOf: bad), transport: transport)

            expectNil(result.catalog, "清洗后没有可用条目")
            expect(
                result.warnings.contains { $0.contains("清洗后没有可用条目") },
                "原因应指明清洗结果为空，实际：\(result.warnings)"
            )
        }
    }
}
