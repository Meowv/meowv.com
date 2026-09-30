import Foundation
import LiveWallCore

private func libraryItem(_ id: Int, title: String = "海边 Sunset", author: String = "Alice", tags: [String] = ["自然", "4K"]) -> WallpaperItem {
    WallpaperItem(
        id: id, title: title, author: author, url: "https://example.com/\(id).mp4",
        coverUrl: "https://example.com/\(id).jpg", durationSeconds: 12,
        tags: tags, categoryIds: [10, 20]
    )
}

func wallpaperSearchTests() {
    suite("浏览列表搜索") {
        let first = libraryItem(1)
        let second = libraryItem(2, title: "森林", author: "Bob", tags: ["自然"])
        let third = libraryItem(3, title: "城市 Sunset", author: "Alice", tags: ["夜景"])
        let items = [first, second, third]
        test("空关键词保留完整列表和顺序") {
            expectEqual(WallpaperSearch.filter(items, query: ""), items, "空字符串保留列表")
            expectEqual(WallpaperSearch.filter(items, query: " \n\t　"), items, "各类空白保留列表")
        }
        test("标题作者标签与大小写") {
            expectEqual(WallpaperSearch.filter(items, query: " 海边 "), [first], "标题命中且忽略首尾空白")
            expectEqual(WallpaperSearch.filter(items, query: "aLiCe"), [first, third], "作者不区分大小写并保序")
            expectEqual(WallpaperSearch.filter(items, query: "自然"), [first, second], "标签命中")
            expectEqual(WallpaperSearch.filter(items, query: "4k"), [first], "标签不区分大小写")
        }
        test("多个关键词须全部命中，可跨字段") {
            expectEqual(WallpaperSearch.filter(items, query: "sunset\tALICE\n自然"), [first], "三个字段分别命中")
            expectEqual(WallpaperSearch.filter(items, query: "森林 Alice"), [], "不合并不同条目的命中")
            expectEqual(WallpaperSearch.filter(items, query: "不存在"), [], "没有匹配结果")
        }
    }
}

func favoriteCollectionTests() {
    suite("收藏集合与配置兼容") {
        let first = libraryItem(1)
        let second = libraryItem(2)
        test("最近收藏在前，取消后再次添加排到最前") {
            let added = FavoriteCollection.toggling(second, in: [first])
            expectEqual(added, [second, first], "新收藏插入头部")
            expectEqual(FavoriteCollection.toggling(first, in: added), [second], "按 ID 取消收藏")
            expectEqual(FavoriteCollection.toggling(first, in: [second]), [first, second], "再次添加排最前")
            expectEqual(FavoriteCollection.toggling(libraryItem(1, title: "改名"), in: [first]), [], "标题变化不改变收藏身份")
        }
        test("去重与非法地址清洗") {
            let local = WallpaperItem(id: 3, title: "本地", author: "", url: "file:///tmp/video.mp4")
            let invalid = WallpaperItem(id: 4, title: "坏地址", author: "", url: "ftp://example.com/a.mp4")
            expectEqual(FavoriteCollection.sanitized([second, first, second, local, invalid]), [second, first], "去重保序且只收线上条目")
            expectEqual(FavoriteCollection.toggling(local, in: [first]), [first], "本地视频不加入收藏")
            var preferences = Preferences(favoriteItems: [second, first, second, invalid])
            preferences.pinnedItem = first
            expectEqual(preferences.sanitized().favoriteItems, [second, first], "配置清洗收藏")
            expectEqual(preferences.sanitized().pinnedItem, first, "收藏清洗不改变固定项")
        }
        test("旧配置和错误类型不影响其它设置") {
            for json in ["{\"intervalSeconds\":900}", "{\"intervalSeconds\":900,\"favoriteItems\":42}", "{\"intervalSeconds\":900,\"favoriteItems\":null}"] {
                let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
                expectEqual(decoded?.intervalSeconds, 900, "原有间隔保留")
                expectEqual(decoded?.favoriteItems, [], "收藏缺失或错误时为空")
            }
        }
        test("单个条目损坏仍保留其它收藏") {
            do {
                let valid = try JSONEncoder().encode(first)
                guard let object = String(data: valid, encoding: .utf8) else {
                    expect(false, "测试 JSON 应可解码")
                    return
                }
                let json = "{\"intervalSeconds\":600,\"favoriteItems\":[null,\(object),42,{\"id\":2},\(object)]}"
                let decoded = try JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
                expectEqual(decoded.intervalSeconds, 600, "坏条目不重置旧设置")
                expectEqual(decoded.favoriteItems, [first], "坏条目跳过且重复 ID 去重")
            } catch { expect(false, "配置解码失败：\(error)") }
        }
        test("完整条目落盘与重启恢复，收藏取消不改变播放设置") {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            do {
                var preferences = Preferences(selectedCategoryID: 10, pinnedItem: first, favoriteItems: [second, first])
                let url = directory.appendingPathComponent("config.json")
                try preferences.save(to: url)
                expectEqual(Preferences.load(from: url), preferences, "所有条目字段及顺序恢复")
                preferences.favoriteItems = FavoriteCollection.toggling(first, in: preferences.favoriteItems)
                try preferences.save(to: url)
                let restored = Preferences.load(from: url)
                expectEqual(restored.favoriteItems, [second], "取消收藏落盘恢复")
                expectEqual(restored.pinnedItem, first, "取消收藏仍保留固定项")
                expectEqual(restored.selectedCategoryID, 10, "取消收藏不改变播放分类")
            } catch { expect(false, "收藏保存失败：\(error)") }
        }
    }
}
