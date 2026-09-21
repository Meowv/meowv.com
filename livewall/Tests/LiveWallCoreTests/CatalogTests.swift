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

func makeService(remote: URL? = URL(string: testIndexURL)) -> CatalogService {
    CatalogService(
        remoteIndexURL: remote,
        indexCacheURL: URL(fileURLWithPath: testIndexCachePath),
        sliceCacheURL: URL(fileURLWithPath: testSliceCachePath)
    )
}

func entry(_ id: Int = 4001, name: String = "美女", file: String? = "category.4001.json", itemCount: Int = 2)
    -> LivewallCategoryEntry
{
    LivewallCategoryEntry(id: id, name: name, file: file, itemCount: itemCount)
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
            transport.remote[testIndexURL] = indexJSON(categories: [(7, "远程", "c.json", 1)])
            transport.files[testIndexCachePath] = indexJSON(categories: [(8, "本地", "l.json", 1)])

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .remote, "来源")
            expectEqual(result.index?.categories.first?.id, 7, "应使用远程内容")
        }

        test("远程成功后写入本地副本") {
            let transport = FakeTransport()
            transport.remote[testIndexURL] = indexJSON()

            _ = makeService().loadIndex(transport: transport)

            expectNotNil(transport.written[testIndexCachePath], "应写入副本")
        }

        test("写入副本失败不影响本次使用，只记 warning") {
            let transport = FakeTransport()
            transport.remote[testIndexURL] = indexJSON()
            transport.writeError = StubError(message: "磁盘只读")

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .remote, "仍应使用远程内容")
            expectEqual(result.warnings.count, 1, "应有一条 warning")
            expect((result.warnings.first ?? "").contains("写入本地副本失败"), "warning 内容")
        }

        test("远程失败时回退本地副本") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testIndexCachePath] = indexJSON(categories: [(9, "副本", "c.json", 1)])

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(result.index?.categories.first?.id, 9, "应使用副本内容")
            expectEqual(result.warnings.count, 1, "记录一条远程失败")
        }

        test("未配置远程地址时不发起请求，直接用副本") {
            let transport = FakeTransport()
            transport.files[testIndexCachePath] = indexJSON()

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

        test("远程返回空分类时继续降级，不当作成功") {
            let transport = FakeTransport()
            transport.remote[testIndexURL] = indexJSON(categories: [])
            transport.files[testIndexCachePath] = indexJSON()

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "空索引不算成功，应继续降级")
        }

        test("远程返回坏 JSON 时继续降级") {
            let transport = FakeTransport()
            transport.remote[testIndexURL] = Data("not json at all".utf8)
            transport.files[testIndexCachePath] = indexJSON()

            let result = makeService().loadIndex(transport: transport)

            expectEqual(result.origin, .cachedRemote, "坏 JSON 不算成功，应继续降级")
            expectEqual(result.warnings.count, 1, "记一条解析失败")
        }
    }

    suite("CatalogService 切片降级链") {

        let sliceURL = "https://cdn.test/livewall/category.4001.json"

        test("按索引里的相对名拼出远程地址并优先拉远程") {
            let transport = FakeTransport()
            transport.remote[sliceURL] = sliceJSON(items: [(7, "https://cdn.test/r.mp4", "远程")])

            let result = makeService().loadSlice(entry(), transport: transport)

            expectEqual(result.origin, .remote, "来源")
            expectEqual(result.catalog?.items.first?.id, 7, "应使用远程内容")
            expectEqual(transport.fetchedURLs, [sliceURL], "请求的地址应由索引地址拼出")
        }

        test("远程成功返回可延迟写入的副本数据") {
            let transport = FakeTransport()
            transport.remote[sliceURL] = sliceJSON()

            let result = makeService().loadSlice(entry(), transport: transport)

            expectNotNil(result.cacheData, "应返回副本数据，调用方确认请求仍有效后再写入")
        }

        test("远程失败时回退副本") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testSliceCachePath] = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().loadSlice(entry(), transport: transport)

            expectEqual(result.origin, .cachedRemote, "来源")
            expectEqual(result.catalog?.items.first?.id, 9, "应使用副本内容")
        }

        test("副本的分类归属不符时拒绝 —— 换过分类后离线启动就是这种情况") {
            // 缓存只有一份（「最后一份成功的切片」）。不校验归属的话，
            // 换了分类再离线启动，会把上一个分类的内容当成目标分类。
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files[testSliceCachePath] = sliceJSON(
                categoryName: "风景",
                categoryIds: [6000],
                items: [(9, "https://cdn.test/c.mp4", "别的分类")]
            )

            let result = makeService().loadSlice(entry(4001, name: "美女"), transport: transport)

            expectNil(result.catalog, "归属不符应拒绝")
            expect(
                result.warnings.contains { $0.contains("分类归属与请求不符") },
                "应说明是归属不符，而不是含糊的解析失败"
            )
        }

        test("副本归属相符时可用（含子树 id）") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            // 一级分类的 categoryIds 是整棵子树，含自身
            transport.files[testSliceCachePath] = sliceJSON(categoryIds: [4001, 64578])

            let result = makeService().loadSlice(entry(4001), transport: transport)

            expectEqual(result.origin, .cachedRemote, "子树包含自身，应可用")
        }

        test("索引里的文件名不合法时拒绝发请求，只记 warning") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/livewall/catalog.json"] = indexJSON()

            let result = makeService().loadSlice(entry(file: "../../etc/passwd.json"), transport: transport)

            expectNil(result.catalog, "非法文件名应拒绝")
            expectEqual(transport.fetchedURLs.count, 0, "不应发出任何请求")
        }

        test("未配置远程地址时不发请求，直接用副本") {
            let transport = FakeTransport()
            transport.files[testSliceCachePath] = sliceJSON()

            let result = makeService(remote: nil).loadSlice(entry(), transport: transport)

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

        test("远程返回空切片时继续降级") {
            let transport = FakeTransport()
            transport.remote[sliceURL] = sliceJSON(items: [])
            transport.files[testSliceCachePath] = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().loadSlice(entry(), transport: transport)

            expectEqual(result.origin, .cachedRemote, "空切片不算成功，应继续降级")
        }

        test("远程返回的条目全是非法 URL 时继续降级") {
            let transport = FakeTransport()
            transport.remote[sliceURL] = sliceJSON(items: [(1, "bad-url", "坏")])
            transport.files[testSliceCachePath] = sliceJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().loadSlice(entry(), transport: transport)

            expectEqual(result.origin, .cachedRemote, "清洗后为空应继续降级")
        }
    }
}
