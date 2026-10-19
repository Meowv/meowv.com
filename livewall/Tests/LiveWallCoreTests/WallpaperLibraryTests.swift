import Foundation
import LiveWallCore
import SQLite3

// 主测试线程等待信号量期间不访问 box；detached 避免继承入口的主 actor。
private final class LibraryWaitBox: @unchecked Sendable { var error: String? }
func runLibraryTest(_ body: @escaping @Sendable () async throws -> Void) {
    let box = LibraryWaitBox()
    let semaphore = DispatchSemaphore(value: 0)
    Task.detached {
        do { try await body() } catch { box.error = String(describing: error) }
        semaphore.signal()
    }
    semaphore.wait()
    if let error = box.error { expect(false, "条目库操作失败：\(error)") }
}

/// 显式构造旧版数据，不给生产编码器增加输出明文条目的开关。
func legacyConfigData(_ preferences: Preferences) throws -> Data {
    var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences)) as! [String: Any]
    object.removeValue(forKey: "userLibraryVersion")
    object["favoriteItems"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences.favoriteItems))
    object["disabledItems"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences.disabledItems))
    if let item = preferences.pinnedItem {
        object["pinnedItem"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(item))
    }
    return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
}

struct LibraryFixture: Sendable {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("livewall-library-test-" + UUID().uuidString)
    var database: URL { directory.appendingPathComponent("user-library.sqlite3") }
    var key: URL { directory.appendingPathComponent(".user-library-key") }
    var config: URL { directory.appendingPathComponent("config.json") }
    func store() throws -> WallpaperLibraryStore { try WallpaperLibraryStore(databaseURL: database, keyURL: key) }
    func writeLegacy(_ preferences: Preferences) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try legacyConfigData(preferences).write(to: config)
    }
    func sql(_ sql: String) throws {
        var db: OpaquePointer?
        guard sqlite3_open(database.path, &db) == SQLITE_OK, let db else { throw CocoaError(.fileWriteUnknown) }
        defer { sqlite3_close(db) }
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw CocoaError(.fileWriteUnknown) }
    }
    func clean() { try? FileManager.default.removeItem(at: directory) }
}

private func storedItem(_ id: Int) -> WallpaperItem {
    WallpaperItem(id: id, title: "雪山 \(id)", author: "Alice", url: "https://cdn.test/\(id).mp4",
                  coverUrl: "https://cdn.test/\(id).jpg", durationSeconds: 12, tags: ["自然", "4K"], categoryIds: [4001, 4002])
}

private func rejects(_ body: () async throws -> Void) async -> Bool {
    do { try await body(); return false } catch { return true }
}

func wallpaperLibraryTests() {
    suite("加密壁纸条目库") {
        test("迁移保留完整条目和顺序；配置、数据库与 WAL 不含地址") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let first = storedItem(1), second = storedItem(2), third = storedItem(3)
                try f.writeLegacy(Preferences(intervalSeconds: 900, selectedCategoryID: 4001, pinnedItem: second,
                                              favoriteItems: [second, first], disabledItems: [third], playFavorites: true))
                let store = try f.store(); try await store.load()
                let index = try await store.prepare(configURL: f.config)
                expectEqual(index.favoriteIDs, [1, 2], "迁移收藏 ID")
                expectEqual(index.disabledIDs, [3], "迁移禁用 ID")
                expectEqual(index.pinned, second, "独立恢复固定快照")
                let page = try await store.page(kind: .favorites)
                expectEqual(page.items, [second, first], "全部字段及最近在前的顺序保留")
                let settings = Preferences.loadSettings(from: f.config)
                expectEqual(settings.intervalSeconds, 900, "原设置保留")
                expect(settings.playFavorites, "新版配置重启保留收藏过滤")
                expectEqual(settings.userLibraryVersion, 1, "配置记录用户库版本")
                let config = try JSONSerialization.jsonObject(with: Data(contentsOf: f.config)) as! [String: Any]
                expect(config["favoriteItems"] == nil, "新版配置不含收藏条目")
                for url in try FileManager.default.contentsOfDirectory(at: f.directory, includingPropertiesForKeys: nil) {
                    let bytes = try Data(contentsOf: url)
                    expect(bytes.range(of: Data("https://cdn.test".utf8)) == nil, "私有文件 \(url.lastPathComponent) 不含明文地址")
                    let permissions = try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber
                    expectEqual(permissions?.intValue, 0o600, "私有文件权限为 0600")
                }
                let reopened = try f.store(); try await reopened.load()
                let restored = try await reopened.page(kind: .favorites)
                expectEqual(restored.items, [second, first], "重新打开数据库恢复条目")
                expectEqual(await reopened.decryptedCacheCount, 2, "启动只按需解密页面")
                // 旧客户端重新写入配置也不得覆盖已完成迁移的库。
                try f.writeLegacy(Preferences(favoriteItems: [third]))
                let authoritative = try await reopened.prepareMigration(configURL: f.config)
                expectEqual(authoritative.favoriteIDs, [1, 2], "新库权威，拒绝旧配置覆盖")
            }
        }
        test("增量互斥、最近顺序、禁用原子解除固定、本地固定独立保存") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let store = try f.store(); try await store.load()
                _ = try await store.prepareMigration(configURL: f.config)
                let a = storedItem(1), b = storedItem(2)
                _ = try await store.setFavorite(a, enabled: true)
                _ = try await store.setFavorite(b, enabled: true)
                _ = try await store.setPinned(a)
                let change = try await store.setDisabled(a, enabled: true)
                expect(!change.isFavorite && change.isDisabled && change.pinned == nil, "禁用同时移除收藏与固定")
                _ = try await store.setFavorite(a, enabled: true)
                let page = try await store.page(kind: .favorites)
                expectEqual(page.items, [a, b], "重新收藏排到最前并恢复禁用")
                let local = WallpaperItem(id: a.id, title: "本地", author: "", url: "file:///tmp/local.mp4")
                _ = try await store.setPinned(local)
                _ = try await store.setFavorite(a, enabled: false)
                expectEqual(await store.index().pinned, local, "本地固定快照与线上同 ID 独立")
                _ = try await store.setPinned(nil)
                expectNil(await store.index().pinned, "解除固定提交并持久化")
            }
        }
        test("SQL 绑定保留 64 位 ID、文本内容与分页边界") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let store = try f.store(); try await store.load()
                let large = WallpaperItem(id: Int.max, title: "雪山 O'Brien ? 中文", author: "Alice",
                                          url: "https://cdn.test/large.mp4", tags: ["自然"])
                let other = storedItem(1)
                _ = try await store.setFavorite(large, enabled: true)
                _ = try await store.setFavorite(other, enabled: true)
                _ = try await store.setPinned(large)
                let reopened = try f.store(); try await reopened.load()
                expectEqual(await reopened.index().pinned, large, "固定项的 64 位 ID 与密文完整恢复")
                expectEqual(try await reopened.item(id: Int.max), large, "按 64 位 ID 读取完整内容")
                let page = try await reopened.page(kind: .favorites, offset: 1, limit: 1)
                expectEqual(page.items, [large], "LIMIT 与 OFFSET 绑定后保留顺序")
                expectEqual(page.total, 2, "计数查询绑定正确")
                let searched = try await reopened.page(kind: .favorites, query: "O'Brien ? 中文")
                expectEqual(searched.items, [large], "特殊字符作为文本搜索")
                let injection = try await reopened.page(kind: .favorites, query: "' OR 1=1 --")
                expectEqual(injection.total, 0, "SQL 片段不会扩大搜索结果")
                _ = try await reopened.setFavorite(large, enabled: false)
                expectNil(try await reopened.item(id: Int.max), "删除绑定不会截断 64 位 ID")
                expectEqual(try await reopened.orderedIDs(kind: .favorites), [other.id], "删除不影响其它记录")
                _ = try await reopened.setFavorite(large, enabled: true)
                let updated = try await reopened.page(kind: .favorites, query: "O'Brien")
                expectEqual(updated.items, [large], "索引建好后增删条目仍可搜索")
                let local = WallpaperItem(id: Int.min, title: "本地", author: "", url: "file:///tmp/local.mp4")
                _ = try await reopened.setPinned(local)
                let restored = try f.store(); try await restored.load()
                expectEqual(await restored.index().pinned, local, "本地固定项保留负的 64 位 ID")
            }
        }
        test("SQL 失败回滚，缓存与磁盘均保留旧状态") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let store = try f.store(); try await store.load()
                let a = storedItem(1)
                _ = try await store.setFavorite(a, enabled: true)
                _ = try await store.setPinned(a)
                try f.sql("CREATE TRIGGER reject_record BEFORE INSERT ON library_records BEGIN SELECT RAISE(ABORT,'test'); END")
                expect(await rejects { _ = try await store.setDisabled(a, enabled: true) }, "写入失败抛错")
                let index = await store.index()
                expectEqual(index.favoriteIDs, [1], "失败保留内存收藏索引")
                expectEqual(index.disabledIDs, [], "失败不加入禁用索引")
                expectEqual(index.pinned, a, "失败不改变固定项")
                let page = try await store.page(kind: .favorites)
                expectEqual(page.items, [a], "数据库事务保持原内容")
                try f.sql("CREATE TRIGGER reject_pin BEFORE DELETE ON library_pin BEGIN SELECT RAISE(ABORT,'test'); END")
                expect(await rejects { _ = try await store.setPinned(nil) }, "解除固定写入失败抛错")
                expectEqual(await store.index().pinned, a, "解除固定失败不改变内存状态")
            }
        }
        test("缺失、错误密钥与篡改拒绝；未来版本不降级") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let store = try f.store(); try await store.load()
                _ = try await store.setFavorite(storedItem(1), enabled: true)
                let key = try Data(contentsOf: f.key)
                try FileManager.default.removeItem(at: f.key)
                expect(await rejects { try await f.store().load() }, "已有数据库缺少密钥时拒绝打开")
                expect(!FileManager.default.fileExists(atPath: f.key.path), "不生成替代密钥")
                try Data(repeating: 0, count: 32).write(to: f.key)
                expect(await rejects { try await f.store().load() }, "错误密钥拒绝")
                try key.write(to: f.key)
                try f.sql("UPDATE library_records SET kind=2 WHERE id=1")
                let tampered = try f.store(); try await tampered.load()
                expect(await rejects { _ = try await tampered.page(kind: .disabled) }, "修改列表类型也无法通过 AAD 认证")
                try f.sql("UPDATE library_metadata SET value=X'32' WHERE key='format'")
                expect(await rejects { try await f.store().load() }, "未来库版本拒绝打开")
            }
        }
        test("已有库缺少认证信息或数据表时不静默重建空表") {
            for sql in ["DELETE FROM library_metadata WHERE key='key_check'", "DROP TABLE library_records", "DROP TABLE library_pin"] {
                runLibraryTest {
                    let f = LibraryFixture(); defer { f.clean() }
                    let store = try f.store(); try await store.load()
                    _ = try await store.setFavorite(storedItem(1), enabled: true)
                    try f.sql(sql)
                    expect(await rejects { try await f.store().load() }, "损坏的库结构拒绝打开")
                }
            }
        }
        test("迁移中断后重试；损坏配置与丢失数据库不清空") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                try f.writeLegacy(Preferences(favoriteItems: [storedItem(1)]))
                let store = try f.store(); try await store.load()
                // 导入提交后、配置清理后的最后一步失败，等价于在两次提交之间退出。
                try f.sql("CREATE TRIGGER interrupt_migration BEFORE INSERT ON library_metadata WHEN NEW.key='migration_phase' AND hex(NEW.value)='636F6D706C657465' BEGIN SELECT RAISE(ABORT,'test'); END")
                let failed = await rejects { _ = try await store.prepareMigration(configURL: f.config) }
                expect(failed, "最后迁移状态提交失败可见")
                let pending = await store.index()
                expectEqual(pending.favoriteIDs, [1], "已提交的导入保持完整")
                let cleanConfig = try Data(contentsOf: f.config)
                var edited = try JSONSerialization.jsonObject(with: cleanConfig) as! [String: Any]
                edited["intervalSeconds"] = 1800
                let conflict = try JSONSerialization.data(withJSONObject: edited)
                try conflict.write(to: f.config)
                expect(await rejects { _ = try await store.prepareMigration(configURL: f.config) }, "未完成迁移期间的配置冲突拒绝覆盖")
                expectEqual(try Data(contentsOf: f.config), conflict, "冲突保留现场")
                try cleanConfig.write(to: f.config)
                try f.sql("DROP TRIGGER interrupt_migration")
                let recovered = try f.store(); try await recovered.load()
                let index = try await recovered.prepareMigration(configURL: f.config)
                expectEqual(index.favoriteIDs, [1], "重启核对备份后继续已提交的导入")
                try f.sql("UPDATE library_metadata SET value=X'756E6B6E6F776E' WHERE key='migration_phase'")
                expect(await rejects { _ = try await recovered.prepareMigration(configURL: f.config) }, "未知迁移状态拒绝继续")
                let changed = LibraryFixture(); defer { changed.clean() }
                try FileManager.default.createDirectory(at: changed.directory, withIntermediateDirectories: true)
                let broken = Data("{broken".utf8)
                try broken.write(to: changed.config)
                let newStore = try changed.store(); try await newStore.load()
                expect(await rejects { _ = try await newStore.prepareMigration(configURL: changed.config) }, "损坏 JSON 拒绝迁移")
                expectEqual(try Data(contentsOf: changed.config), broken, "不覆盖损坏源文件")
                try Data("{\"userLibraryVersion\":1}".utf8).write(to: changed.config)
                expect(await rejects { _ = try await newStore.prepareMigration(configURL: changed.config) }, "已迁移配置缺少原数据库时不创建空库")
            }
        }
        test("启动预检拒绝丢失的库，且不创建替代数据库或密钥") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                try FileManager.default.createDirectory(at: f.directory, withIntermediateDirectories: true)
                try Data("{\"userLibraryVersion\":1}".utf8).write(to: f.config)
                let store = try f.store()
                expect(await rejects { _ = try await store.prepare(configURL: f.config) }, "丢失的已迁移库拒绝启动")
                expect(!FileManager.default.fileExists(atPath: f.database.path), "不创建替代空库")
                expect(!FileManager.default.fileExists(atPath: f.key.path), "不创建替代密钥")
            }
        }
        test("分页、搜索跨字段、取消与修改后过期页拒绝") {
            runLibraryTest {
                let f = LibraryFixture(); defer { f.clean() }
                let items = (1...601).reversed().map(storedItem)
                try f.writeLegacy(Preferences(favoriteItems: items))
                let store = try f.store(); try await store.load()
                _ = try await store.prepareMigration(configURL: f.config)
                let first = try await store.page(kind: .favorites)
                expectEqual(first.items.count, 200, "第一页 200 条")
                let located = try await store.page(kind: .favorites, locateID: 1)
                expectEqual(located.offset, 600, "当前条目可定位到所在页")
                expectEqual(located.items.map(\.id), [1], "定位页内容")
                let searched = try await store.page(kind: .favorites, query: "雪山 aLiCe 4k")
                expectEqual(searched.total, 601, "搜索跨标题作者标签且不区分大小写")
                expect(await store.decryptedCacheCount <= 512, "解密缓存最多 512 条")
                _ = try await store.setDisabled(storedItem(601), enabled: true)
                expect(await rejects { _ = try await store.page(kind: .favorites, offset: 200, expectedRevision: first.revision) }, "过期分页拒绝混合两个版本")
                let task = Task { try await store.page(kind: .favorites, query: "Alice") }
                task.cancel()
                expect(await rejects { _ = try await task.value }, "取消搜索不返回结果")
            }
        }
        test("普通编码器也不暴露收藏、禁用及固定的明文") {
            do {
                let bytes = try JSONEncoder().encode(Preferences(pinnedItem: storedItem(1), favoriteItems: [storedItem(2)], disabledItems: [storedItem(3)]))
                expect(bytes.range(of: Data("cdn.test".utf8)) == nil, "默认编码不包含条目地址")
                let object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
                expect(object["pinnedItem"] == nil && object["favoriteItems"] == nil && object["disabledItems"] == nil, "三类快照字段均不写入")
            } catch { expect(false, "普通设置编码失败") }
        }
        test("日志 Unicode、JSON 转义、历史文件与轮转共同脱敏") {
            let original = "🎬 e\u{301} https://cdn.test/901.mp4?token=secret 和 https:\\/\\/cdn.test\\/901.jpg"
            let sanitized = AppLog.sanitize(original)
            expect(!sanitized.contains("cdn.test"), "移除完整地址与查询参数")
            expectEqual(AppLog.sanitize(sanitized), sanitized, "重复脱敏结果相同")
            let f = LibraryFixture(); defer { f.clean() }
            do {
                try FileManager.default.createDirectory(at: f.directory, withIntermediateDirectories: true)
                let log = f.directory.appendingPathComponent("livewall.log")
                try Data(original.utf8).write(to: log)
                AppLog.append("更新 https://cdn.test/new.mp4", to: log)
                let text = try String(contentsOf: log, encoding: .utf8)
                expect(!text.contains("cdn.test"), "历史与追加日志均脱敏")
                AppLog.append("https://cdn.test/rotated.mp4", to: log, rotationLimit: 1)
                let rotated = try String(contentsOf: log, encoding: .utf8)
                expect(!rotated.contains("cdn.test"), "轮转后仍脱敏")
            } catch { expect(false, "日志检查失败：\(error)") }
        }
    }
    if ProcessInfo.processInfo.environment["LIVEWALL_LIBRARY_BENCHMARK"] == "1" {
        wallpaperLibraryBenchmark()
    }
}

private func wallpaperLibraryBenchmark() {
    suite("条目库规模基准（合成数据）") {
        for count in [1_000, 10_000, 100_000] {
            test("\(count) 条收藏和禁用") {
                runLibraryTest {
                    let f = LibraryFixture(); defer { f.clean() }
                    let items = (1...count).map(storedItem)
                    try f.writeLegacy(Preferences(favoriteItems: Array(items.prefix(count / 2)), disabledItems: Array(items.suffix(count / 2))))
                    let store = try f.store(); try await store.load()
                    let start = Date()
                    _ = try await store.prepareMigration(configURL: f.config)
                    let importSeconds = Date().timeIntervalSince(start)
                    let reopened = try f.store()
                    let loadStart = Date(); try await reopened.load()
                    let loadSeconds = Date().timeIntervalSince(loadStart)
                    expectEqual(await reopened.decryptedCacheCount, 0, "启动不解密全部条目")
                    let pageStart = Date(); _ = try await reopened.page(kind: .disabled)
                    let pageSeconds = Date().timeIntervalSince(pageStart)
                    let writeStart = Date(); _ = try await reopened.setFavorite(storedItem(count), enabled: true)
                    let writeSeconds = Date().timeIntervalSince(writeStart)
                    expect(await reopened.decryptedCacheCount <= 512, "规模增长不扩大完整条目缓存")
                    let searching = try f.store(); try await searching.load()
                    let pendingSearch = Task { try await searching.page(kind: .disabled, query: "Alice") }
                    let deadline = Date().addingTimeInterval(10)
                    while await searching.decryptedCacheCount < 200, Date() < deadline { await Task.yield() }
                    pendingSearch.cancel()
                    // 千条可能已经完成；规模基准的取消检查以万条以上在途检索为准。
                    let cancelled = await rejects { _ = try await pendingSearch.value }
                    if count >= 10_000 { expect(cancelled, "可取消进行中的大列表检索") }
                    let searchStart = Date()
                    let results = try await searching.page(kind: .disabled, query: "Alice 自然")
                    let searchSeconds = Date().timeIntervalSince(searchStart)
                    let warmStart = Date()
                    _ = try await searching.page(kind: .disabled, query: "自然 4k")
                    let warmSeconds = Date().timeIntervalSince(warmStart)
                    expectEqual(results.total, count / 2 - 1, "全库检索结果完整")
                    expect(await searching.decryptedCacheCount <= 512, "全库检索后完整条目缓存仍有界")
                    print(String(format: "BENCH count=%d import=%.3fs open=%.2fms page=%.2fms write=%.2fms search=%.3fs warmSearch=%.2fms", count, importSeconds, loadSeconds * 1000, pageSeconds * 1000, writeSeconds * 1000, searchSeconds, warmSeconds * 1000))
                }
            }
        }
    }
}
