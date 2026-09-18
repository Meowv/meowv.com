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

func catalogJSON(items: [(id: Int, url: String, title: String)] = [(1, "https://cdn.test/a.mp4", "A")],
                 schemaVersion: Int = 1) -> Data {
    let list = items.map { item in
        """
        {"id":\(item.id),"title":"\(item.title)","author":"作者","url":"\(item.url)","durationSeconds":null,"tags":["t1"]}
        """
    }.joined(separator: ",")
    return Data("""
    {"schemaVersion":\(schemaVersion),"generatedAt":"2026-09-18T00:00:00Z",
     "source":{"deviceType":"desktop","contentType":"dynamic","categoryName":"美女","categoryIds":[4001]},
     "items":[\(list)]}
    """.utf8)
}

func makeService(remote: URL? = URL(string: "https://cdn.test/catalog.json"),
                 builtin: [WallpaperItem] = []) -> CatalogService {
    CatalogService(
        remoteCatalogURL: remote,
        remoteCacheURL: URL(fileURLWithPath: "/tmp/livewall-test/remote-cache.json"),
        builtinItems: builtin
    )
}

// MARK: - 测试

func catalogTests() {
    suite("CatalogCoding") {

        test("解析合法清单") {
            let catalog = try? CatalogCoding.decode(catalogJSON())
            expectNotNil(catalog, "应能解析")
            expectEqual(catalog?.items.count, 1, "条目数")
            expectEqual(catalog?.source.categoryName, "美女", "分类名")
            expectEqual(catalog?.items.first?.tags, ["t1"], "标签")
            expectNil(catalog?.items.first?.durationSeconds, "durationSeconds 应为 nil")
        }

        test("拒绝高于支持版本的清单") {
            expectThrows("schemaVersion=99 应被拒绝") {
                _ = try CatalogCoding.decode(catalogJSON(schemaVersion: 99))
            }
        }

        test("拒绝空条目清单") {
            let empty = Data("""
            {"schemaVersion":1,"generatedAt":"","source":{"deviceType":"desktop","contentType":"dynamic","categoryName":null,"categoryIds":[]},"items":[]}
            """.utf8)
            expectThrows("空 items 应被拒绝") { _ = try CatalogCoding.decode(empty) }
        }

        test("拒绝结构不符的 JSON") {
            expectThrows("非清单 JSON 应被拒绝") {
                _ = try CatalogCoding.decode(Data("{\"foo\":1}".utf8))
            }
        }

        test("sanitize 剔除非法 URL") {
            let catalog = try! CatalogCoding.decode(catalogJSON(items: [
                (1, "https://cdn.test/a.mp4", "A"),
                (2, "not-a-url", "B"),
                (3, "ftp://cdn.test/c.mp4", "C"),
            ]))
            let clean = CatalogCoding.sanitize(catalog)
            expectEqual(clean.items.count, 1, "只保留 https 条目")
            expectEqual(clean.items.first?.id, 1, "保留的 id")
        }

        test("sanitize 按 URL 去重") {
            let catalog = try! CatalogCoding.decode(catalogJSON(items: [
                (1, "https://cdn.test/a.mp4", "A"),
                (2, "https://cdn.test/a.mp4", "A 重复"),
            ]))
            let clean = CatalogCoding.sanitize(catalog)
            expectEqual(clean.items.count, 1, "同 URL 只保留一条")
            expectEqual(clean.items.first?.id, 1, "保留先出现的")
        }

        test("remoteURL 与 displayName") {
            let item = WallpaperItem(id: 1, title: "标题", author: "作者", url: "https://cdn.test/a.mp4")
            expectNotNil(item.remoteURL, "remoteURL")
            expectEqual(item.displayName, "标题 — 作者", "displayName")
            let noAuthor = WallpaperItem(id: 2, title: "标题", author: "", url: "https://cdn.test/b.mp4")
            expectEqual(noAuthor.displayName, "标题", "无作者时不加破折号")
        }
    }

    suite("CatalogService 降级链") {

        test("配置了远程地址时优先拉远程") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/catalog.json"] = catalogJSON(items: [(7, "https://cdn.test/r.mp4", "远程")])
            transport.files["/tmp/livewall-test/local.json"] = catalogJSON(items: [(8, "https://cdn.test/l.mp4", "本地")])

            let result = makeService().load(transport: transport)

            expectEqual(result?.origin, .remote, "来源")
            expectEqual(result?.catalog.items.first?.id, 7, "应使用远程内容")
        }

        test("远程成功后写入本地副本") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/catalog.json"] = catalogJSON()

            _ = makeService().load(transport: transport)

            expectNotNil(transport.written["/tmp/livewall-test/remote-cache.json"], "应写入副本")
        }

        test("写入副本失败不影响本次使用，只记 warning") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/catalog.json"] = catalogJSON()
            transport.writeError = StubError(message: "磁盘只读")

            let result = makeService().load(transport: transport)

            expectEqual(result?.origin, .remote, "仍应使用远程内容")
            expectEqual(result?.warnings.count, 1, "应有一条 warning")
            expect((result?.warnings.first ?? "").contains("写入本地副本失败"), "warning 内容")
        }

        test("远程失败时回退远程副本") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.files["/tmp/livewall-test/remote-cache.json"] = catalogJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().load(transport: transport)

            expectEqual(result?.origin, .cachedRemote, "来源")
            expectEqual(result?.catalog.items.first?.id, 9, "应使用副本内容")
            expectEqual(result?.warnings.count, 1, "记录一条远程失败")
        }

        test("未配置远程地址时不发起请求，直接用副本") {
            let transport = FakeTransport()
            transport.files["/tmp/livewall-test/remote-cache.json"] = catalogJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService(remote: nil).load(transport: transport)

            expectEqual(result?.origin, .cachedRemote, "来源")
            expectEqual(transport.fetchedURLs.count, 0, "不应发起远程请求")
        }

        test("远程与副本都失败时回退内置条目") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            let builtin = [WallpaperItem(id: 99, title: "兜底", author: "", url: "https://cdn.test/f.mp4")]

            let result = makeService(builtin: builtin).load(transport: transport)

            expectEqual(result?.origin, .builtin, "来源")
            expectEqual(result?.catalog.items.first?.id, 99, "应使用内置条目")
        }

        test("全部失败且无内置条目时返回 nil") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")

            let result = makeService().load(transport: transport)

            expectNil(result, "应返回 nil")
        }

        test("远程返回空条目时继续降级，不当作成功") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/catalog.json"] = Data("""
            {"schemaVersion":1,"generatedAt":"","source":{"deviceType":"desktop","contentType":"dynamic","categoryName":null,"categoryIds":[]},"items":[]}
            """.utf8)
            transport.files["/tmp/livewall-test/remote-cache.json"] = catalogJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().load(transport: transport)

            expectEqual(result?.origin, .cachedRemote, "空清单不算成功，应继续降级")
        }

        test("远程返回的全是非法 URL 时继续降级") {
            let transport = FakeTransport()
            transport.remote["https://cdn.test/catalog.json"] = catalogJSON(items: [(1, "bad-url", "坏")])
            transport.files["/tmp/livewall-test/remote-cache.json"] = catalogJSON(items: [(9, "https://cdn.test/c.mp4", "副本")])

            let result = makeService().load(transport: transport)

            expectEqual(result?.origin, .cachedRemote, "清洗后为空应继续降级")
        }

        test("warning 按发生顺序累积") {
            let transport = FakeTransport()
            transport.remoteError = StubError(message: "断网")
            transport.readError = StubError(message: "权限不足")

            let result = makeService(builtin: [WallpaperItem(id: 1, title: "T", author: "", url: "https://c.test/a.mp4")])
                .load(transport: transport)

            expectEqual(result?.warnings.count, 2, "远程 + 副本共两条")
            expect((result?.warnings.first ?? "").contains("远程清单拉取失败"), "第一条是远程")
            expect((result?.warnings.last ?? "").contains("远程清单副本读取失败"), "最后一条是副本")
        }
    }
}
