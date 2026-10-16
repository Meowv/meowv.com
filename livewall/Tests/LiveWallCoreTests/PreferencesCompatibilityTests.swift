import Foundation
import LiveWallCore

/// 配置加字段时的向后兼容。
///
/// 这组测试的存在意义：`Preferences` 的合成 `Codable` 在缺字段时会抛 `keyNotFound`
/// 而不是回退默认值，那样每加一个字段，用户已有的 config.json 就会整体解码失败、
/// 退回全默认 —— **静默丢掉所有设置**。所以新增字段必须在这里补一条。
func preferencesCompatibilityTests() {
    suite("Preferences 向后兼容") {

        test("开发者工具默认关闭，缺键或损坏不丢失其它设置") {
            expectEqual(Preferences.default.developerToolsEnabled, false, "默认不启用开发者工具")
            for value in ["", ",\"developerToolsEnabled\":null", ",\"developerToolsEnabled\":\"yes\""] {
                let data = Data("{\"intervalSeconds\":1200,\"playbackOrder\":\"sequential\"\(value)}".utf8)
                guard let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                    expect(false, "开发者开关损坏不能导致整份配置失效")
                    continue
                }
                expectEqual(decoded.developerToolsEnabled, false, "缺键或非法值回退关闭")
                expectEqual(decoded.intervalSeconds, 1200, "其它间隔保持")
                expectEqual(decoded.playbackOrder, .sequential, "其它顺序保持")
            }
        }

        test("开发者工具开关往返并落盘后保持选择") {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let file = directory.appendingPathComponent("config.json")
            defer { try? FileManager.default.removeItem(at: directory) }
            for enabled in [true, false] {
                let preferences = Preferences(intervalSeconds: 1200, developerToolsEnabled: enabled)
                do {
                    let encoded = try JSONEncoder().encode(preferences)
                    let decoded = try JSONDecoder().decode(Preferences.self, from: encoded)
                    expectEqual(decoded.developerToolsEnabled, enabled, "开关往返保持")
                    try preferences.save(to: file)
                    let loaded = Preferences.load(from: file)
                    expectEqual(loaded.developerToolsEnabled, enabled, "重启读回开关")
                    expectEqual(loaded.intervalSeconds, 1200, "其它设置保持")
                } catch {
                    expect(false, "配置往返或落盘失败：\(error)")
                }
            }
        }

        test("老配置（没有 perScreenSources）仍能解码，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 600,
              "jitterRatio": 0.25,
              "switchWhenFinished": true,
              "playbackOrder": "sequential",
              "gravity": "fit",
              "levelPreset": "desktopWindow",
              "multiScreenPolicy": "mirror"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectEqual(decoded.intervalSeconds, 600, "老配置里的间隔应保留")
            expectEqual(decoded.playbackOrder, .sequential, "老配置里的选片顺序应保留")
            expectEqual(decoded.gravity, "fit", "老配置里的缩放应保留")
            expectEqual(decoded.multiScreenPolicy, .mirror, "老配置里的多屏策略应保留")
            expectEqual(decoded.perScreenSources, ScreenSourceStore.empty, "缺字段应回退到空表")
            expectNil(decoded.selectedCategoryID, "缺字段表示默认全部分类")
        }

        test("带 authorFilter 的配置仍能解码，该字段被忽略") {
            // 作者过滤已换成分类过滤（`selectedCategoryID`）。用户升级前写下的
            // `authorFilter` 必须**不报错、不拖累其它字段**，只是不再生效。
            let legacy = """
            {
              "intervalSeconds": 900,
              "authorFilter": ["作者A", "作者B"]
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "含 authorFilter 的老配置应当能解码")
                return
            }
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectNil(decoded.selectedCategoryID, "缺字段表示默认全部分类")
        }

        test("selectedCategoryID 存在时按原样读回") {
            let json = """
            { "selectedCategoryID": 4001 }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "新配置应当能解码")
                return
            }
            expectEqual(decoded.selectedCategoryID, 4001, "分类 id 应读回")
        }

        test("selectedCategoryID 写坏了不影响其它字段") {
            // 手改配置把这一项写成字符串。逐字段容错的意义就是：
            // 坏一个字段不能把整份配置打回默认。
            let json = """
            {
              "intervalSeconds": 1200,
              "selectedCategoryID": "美女"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decoded.intervalSeconds, 1200, "其它字段应保留")
            expectNil(decoded.selectedCategoryID, "损坏的字段应回退到 nil")
        }

        test("非正数的分类 id 被 sanitize 清掉") {
            var preferences = Preferences()
            preferences.selectedCategoryID = -1
            expectNil(preferences.sanitized().selectedCategoryID, "负数应被清掉")

            preferences.selectedCategoryID = 0
            expectNil(preferences.sanitized().selectedCategoryID, "0 应被清掉")

            preferences.selectedCategoryID = 4001
            expectEqual(preferences.sanitized().selectedCategoryID, 4001, "合法 id 应保留")
        }

        test("清单地址原样读回，不被改写") {
            // `remoteCatalogURL` 是用户配置项：**改默认值只影响「配置里没这个键」的情况**，
            // 已经写在文件里的地址一律按原样用（包括清空 = 只用副本缓存）。
            var preferences = Preferences()
            preferences.remoteCatalogURL = "https://example.com/my/catalog.json"
            expectEqual(
                preferences.sanitized().remoteCatalogURL,
                "https://example.com/my/catalog.json",
                "自填地址不应被改写"
            )
            preferences.remoteCatalogURL = nil
            expectNil(preferences.sanitized().remoteCatalogURL, "nil 也不应被改写")
        }

        test("perScreenSources 存在时按原样读回") {
            let json = """
            {
              "multiScreenPolicy": "perScreen",
              "perScreenSources": {"sources": {"1": 42, "2": 43}}
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "新配置应当能解码")
                return
            }
            expectEqual(decoded.multiScreenPolicy, .perScreen, "策略应为每屏独立")
            expectEqual(decoded.perScreenSources.itemID(for: 1), 42, "第 1 块屏的源应读回")
            expectEqual(decoded.perScreenSources.itemID(for: 2), 43, "第 2 块屏的源应读回")
        }

        test("perScreenSources 写坏了不影响其它字段") {
            // 手改配置把这一项写成了别的类型。逐字段容错的意义就是：
            // 坏一个字段不能把整份配置打回默认。
            let json = """
            {
              "intervalSeconds": 900,
              "perScreenSources": "not an object"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectEqual(decoded.perScreenSources, ScreenSourceStore.empty, "损坏的字段应回退到空表")
        }

        test("老配置（没有 lockScreenPreview）默认开启，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 1500,
              "playbackOrder": "sequential"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectEqual(decoded.lockScreenPreview, true, "缺字段应回退到默认开启")
            expectEqual(decoded.intervalSeconds, 1500, "其它字段应保留")
            expectEqual(decoded.playbackOrder, .sequential, "其它字段应保留")
        }

        test("lockScreenPreview 关掉后能读回，写坏了也不影响其它字段") {
            let off = """
            { "intervalSeconds": 600, "lockScreenPreview": false }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(off.utf8)) else {
                expect(false, "应能解码")
                return
            }
            expectEqual(decoded.lockScreenPreview, false, "关闭状态应读回")
            expectEqual(decoded.intervalSeconds, 600, "其它字段应保留")

            // 手改成字符串：坏一个字段不能把整份配置打回默认
            let broken = """
            { "intervalSeconds": 900, "lockScreenPreview": "yes" }
            """
            guard let decodedBroken = try? JSONDecoder().decode(Preferences.self, from: Data(broken.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decodedBroken.lockScreenPreview, true, "损坏的字段应回退到默认值")
            expectEqual(decodedBroken.intervalSeconds, 900, "其它字段应保留")
        }

        test("lockScreenPreview 往返编码不丢") {
            var preferences = Preferences()
            preferences.lockScreenPreview = false
            preferences.intervalSeconds = 42
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expectEqual(decoded.lockScreenPreview, false, "关闭状态应保持")
            expectEqual(decoded.intervalSeconds, 42, "其它字段应保持")
        }

        test("老配置（没有 animateMenuBarIcon）默认关闭，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 1200,
              "lockScreenPreview": false
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectEqual(decoded.animateMenuBarIcon, false, "缺字段应回退到默认关闭")
            expectEqual(decoded.intervalSeconds, 1200, "其它字段应保留")
            expectEqual(decoded.lockScreenPreview, false, "其它字段应保留")
        }

        test("animateMenuBarIcon 打开后能读回，写坏了也不影响其它字段") {
            let on = """
            { "intervalSeconds": 300, "animateMenuBarIcon": true }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(on.utf8)) else {
                expect(false, "应能解码")
                return
            }
            expectEqual(decoded.animateMenuBarIcon, true, "开启状态应读回")
            expectEqual(decoded.intervalSeconds, 300, "其它字段应保留")

            // 手改成字符串：坏一个字段不能把整份配置打回默认
            let broken = """
            { "intervalSeconds": 900, "animateMenuBarIcon": "yes" }
            """
            guard let decodedBroken = try? JSONDecoder().decode(Preferences.self, from: Data(broken.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decodedBroken.animateMenuBarIcon, false, "损坏的字段应回退到默认值")
            expectEqual(decodedBroken.intervalSeconds, 900, "其它字段应保留")
        }

        test("animateMenuBarIcon 往返编码不丢") {
            var preferences = Preferences()
            preferences.animateMenuBarIcon = true
            preferences.intervalSeconds = 77
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expectEqual(decoded.animateMenuBarIcon, true, "开启状态应保持")
            expectEqual(decoded.intervalSeconds, 77, "其它字段应保持")
        }

        test("老配置（没有 remoteUpdateURL）仍能解码，且不丢设置") {
            let legacy = """
            {
              "intervalSeconds": 600,
              "gravity": "fit",
              "playbackOrder": "sequential"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectEqual(decoded.intervalSeconds, 600, "老配置里的间隔应保留")
            expectEqual(decoded.gravity, "fit", "老配置里的缩放应保留")
            expectEqual(decoded.playbackOrder, .sequential, "老配置里的选片顺序应保留")
            expectEqual(decoded.remoteUpdateURL, Preferences.defaultRemoteUpdateURL, "缺字段应回退到默认更新源")
        }

        test("配置里残留已删除的 ignoredUpdateBuild 不影响解码") {
            // 「忽略此版本」已删除，但老配置里可能还留着这个键 —— 未知键必须被跳过，
            // 而不是让整份配置解码失败。
            let legacy = """
            { "intervalSeconds": 900, "ignoredUpdateBuild": "2" }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "带废弃字段的配置整体解码仍应成功")
                return
            }
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
        }

        test("更新源地址：空串与非 http(s) 一律视为不检查") {
            var empty = Preferences()
            empty.remoteUpdateURL = ""
            expectNil(empty.resolvedUpdateURL, "空串 = 不检查")
            var bad = Preferences()
            bad.remoteUpdateURL = "ftp://example.com/version.json"
            expectNil(bad.resolvedUpdateURL, "非 http(s) 不能用")
            var local = Preferences()
            local.remoteUpdateURL = "http://127.0.0.1:8000/version.json"
            expectNotNil(local.resolvedUpdateURL, "http 留给本地调试用")
        }

        test("老配置（没有 pinnedItem）回退到未固定，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 600,
              "playbackOrder": "sequential",
              "selectedCategoryID": 4001,
              "lockScreenPreview": false
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectNil(decoded.pinnedItem, "缺字段应回退到未固定")
            expectEqual(decoded.intervalSeconds, 600, "间隔应保留")
            expectEqual(decoded.playbackOrder, .sequential, "选片顺序应保留")
            expectEqual(decoded.selectedCategoryID, 4001, "分类应保留")
            expectEqual(decoded.lockScreenPreview, false, "锁屏预览开关应保留")
        }

        test("pinnedItem 存在时按原样读回，且与 selectedCategoryID 共存") {
            // 这一条锁住「存整条而不是 id」的设计：固定项的所属分类可能已经
            // 与 `selectedCategoryID` 不同（用户固定后又换了分类浏览），
            // 两者必须都能独立读回，不能互相干扰。
            let json = """
            {
              "selectedCategoryID": 4005,
              "pinnedItem": {
                "id": 8899,
                "title": "雪山",
                "author": "某人",
                "url": "https://cdn.test/8899.mp4",
                "coverUrl": "https://cdn.test/8899.jpg",
                "tags": [],
                "categoryIds": [4001]
              }
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "含 pinnedItem 的配置应当能解码")
                return
            }
            expectEqual(decoded.selectedCategoryID, 4005, "分类应读回（与固定项所属分类不同）")
            expectEqual(decoded.pinnedItem?.id, 8899, "固定项 id 应读回")
            expectEqual(decoded.pinnedItem?.title, "雪山", "固定项标题应读回")
            expectEqual(decoded.pinnedItem?.url, "https://cdn.test/8899.mp4", "固定项地址应读回")
            expectEqual(decoded.pinnedItem?.categoryIds ?? [], [4001], "固定项分类应读回")
        }

        test("pinnedItem 写坏了不影响其它字段") {
            // 手改配置把整条写坏（漏 url、id 写成字符串）。逐字段容错的意义就是：
            // 坏一个字段不能把整份配置打回默认 —— 否则用户所有设置一起静默清零。
            let broken = """
            {
              "intervalSeconds": 1200,
              "selectedCategoryID": 4001,
              "pinnedItem": {"id": "不是数字", "title": "x"}
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(broken.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decoded.intervalSeconds, 1200, "其它字段应保留")
            expectEqual(decoded.selectedCategoryID, 4001, "其它字段应保留")
            expectNil(decoded.pinnedItem, "损坏的固定项应回退到未固定")
        }

        test("pinnedItem 地址非法时被 sanitize 清掉") {
            var preferences = Preferences()
            preferences.pinnedItem = WallpaperItem(
                id: 1, title: "T", author: "A",
                url: "https://cdn.test/1.mp4"
            )
            expectNotNil(preferences.sanitized().pinnedItem, "合法地址应保留")

            preferences.pinnedItem = WallpaperItem(id: 2, title: "T", author: "A", url: "")
            expectNil(preferences.sanitized().pinnedItem, "空串应被清掉")

            preferences.pinnedItem = WallpaperItem(id: 3, title: "T", author: "A", url: "ftp://cdn.test/3.mp4")
            expectNil(preferences.sanitized().pinnedItem, "非 http(s) 应被清掉")
        }

        test("普通配置编码不再保存固定快照") {
            var preferences = Preferences()
            preferences.pinnedItem = WallpaperItem(
                id: 42, title: "T", author: "A",
                url: "https://cdn.test/42.mp4",
                coverUrl: "https://cdn.test/42.jpg"
            )
            preferences.playbackOrder = .sequential
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expectNil(decoded.pinnedItem, "固定快照由加密库保存")
            expect(data.range(of: Data("https://cdn.test/42".utf8)) == nil, "编码不包含播放或静态图地址")
            expectEqual(decoded.playbackOrder, .sequential, "其它字段应保持")

            // 无论是否固定，普通设置编码都不输出条目。
            let empty = Preferences()
            guard let emptyData = try? JSONEncoder().encode(empty),
                  let emptyJSON = String(data: emptyData, encoding: .utf8) else {
                expect(false, "编码应成功")
                return
            }
            expect(!emptyJSON.contains("\"pinnedItem\""), "未固定时不应写出该键（与 selectedCategoryID 同口径）")
            expect(!emptyJSON.contains("\"selectedCategoryID\""), "对照组：nil 可选字段一律不写出")
            expect(emptyJSON.contains("\"playbackOrder\""), "非可选字段仍应写出")
        }

        test("老配置（没有 localFolderPath）回退线上，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 900,
              "playbackOrder": "sequential"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectNil(decoded.localFolderPath, "缺字段应回退到线上")
            expectNil(decoded.resolvedLocalFolderURL, "回退后没有可用的本地文件夹")
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectEqual(decoded.playbackOrder, .sequential, "其它字段应保留")
        }

        test("localFolderPath 存在时按原样读回，往返不丢") {
            var preferences = Preferences()
            preferences.localFolderPath = "/Users/someone/Movies/wallpapers"
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expectEqual(decoded.localFolderPath, "/Users/someone/Movies/wallpapers", "路径应原样读回")
            expectEqual(decoded.resolvedLocalFolderURL?.path, "/Users/someone/Movies/wallpapers", "应能解析成 URL")
            expectEqual(decoded.localFolderName, "wallpapers", "应能取出文件夹名给菜单用")
        }

        test("localFolderPath 写坏了不影响其它字段") {
            let broken = """
            { "localFolderPath": 123, "intervalSeconds": 1500 }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(broken.utf8)) else {
                expect(false, "类型不对也不该让整份配置解不出来")
                return
            }
            expectNil(decoded.localFolderPath, "解不出来就当没配置本地文件夹")
            expectEqual(decoded.intervalSeconds, 1500, "其它字段应保留")
        }

        test("localFolderPath 空串与纯空白被 sanitize 清掉") {
            var preferences = Preferences()
            preferences.localFolderPath = "   "
            expectNil(preferences.sanitized().localFolderPath, "纯空白应被清掉")

            // **不存在的路径刻意保留**：外接盘拔掉时应当保留配置并回退线上，
            // 插回来（或按 ⌥⌘R 重扫）即可继续用，而不是把用户的设置清掉。
            preferences.localFolderPath = "/Volumes/NotMounted/Movies"
            expectEqual(
                preferences.sanitized().localFolderPath,
                "/Volumes/NotMounted/Movies",
                "文件夹不存在不该被静态清洗掉"
            )
        }

        test("本地固定项（file:// 地址）不被 sanitize 清掉") {
            var preferences = Preferences()
            preferences.pinnedItem = WallpaperItem(
                id: 7, title: "本地片", author: "",
                url: "file:///Users/someone/Movies/a.mp4"
            )
            expectNotNil(preferences.sanitized().pinnedItem, "固定一条本地视频是合法用法")
        }
    }
}
