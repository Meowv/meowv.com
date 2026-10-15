import Foundation
import LiveWallCore

func favoritePlaybackTests() {
    suite("收藏内容过滤与轮换") {
        let first = WallpaperItem(id: 101, title: "收藏一", author: "", url: "https://example.com/101.mp4")
        let second = WallpaperItem(id: 202, title: "收藏二", author: "", url: "https://example.com/202.mp4")
        let third = WallpaperItem(id: 303, title: "收藏三", author: "", url: "https://example.com/303.mp4")
        let categories = [LivewallCategoryEntry(id: 10, name: "自然", file: "category.10.json", itemCount: 5)]

        test("仅有收藏时显示入口，索引不可用时也可选择") {
            let empty = CategoryMenu.entries(categories: categories, selectedID: 10)
            expectEqual(empty.map(\.title), ["全部", "自然"], "空收藏不增加菜单")
            let entries = CategoryMenu.entries(categories: [], selectedID: nil, allEnabled: false, favoriteCount: 2)
            expectEqual(entries.map(\.title), ["全部", "收藏"], "收藏紧跟全部")
            expectEqual(entries[0].isEnabled, false, "缺索引时全部不可用")
            expectEqual(entries[1].isEnabled, true, "收藏不依赖索引")
            expectEqual(entries[1].isFavorites, true, "收藏与全部有独立身份")
        }
        test("收藏过滤单选且保留普通分类记忆") {
            for selectedID: Int? in [nil, 10] {
                let entries = CategoryMenu.entries(
                    categories: categories, selectedID: selectedID,
                    favoriteCount: 2, favoritesSelected: true
                )
                expectEqual(entries.filter(\.isSelected).map(\.title), ["收藏"], "收藏与普通分类不同时勾选")
                expectEqual(CategoryMenu.rootTitle(categories: categories, selectedID: selectedID, favoritesSelected: true), "内容过滤（收藏）", "根项显示收藏")
            }
            let normal = CategoryMenu.entries(categories: categories, selectedID: 10, favoriteCount: 2)
            expectEqual(normal.filter(\.isSelected).map(\.title), ["自然"], "普通分类仍然单选")
        }
        test("旧配置、损坏字段与空收藏回退") {
            for json in ["{}", "{\"playFavorites\":\"yes\",\"intervalSeconds\":900}", "{\"playFavorites\":true,\"favoriteItems\":[]}"] {
                let preferences = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
                expectEqual(preferences?.playFavorites, false, "缺失、错误或空收藏均不用收藏过滤")
            }
            let empty = Preferences(selectedCategoryID: 10, playFavorites: true).sanitized()
            expectEqual(empty.playFavorites, false, "清洗空收藏过滤")
            expectEqual(empty.selectedCategoryID, 10, "保留回退分类")
        }
        test("重启恢复收藏过滤与原有播放配置") {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            do {
                let url = directory.appendingPathComponent("config.json")
                for order in PlaybackOrder.allCases {
                    for pinnedItem: WallpaperItem? in [nil, third] {
                        let preferences = Preferences(
                            intervalSeconds: 120, jitterRatio: 0, switchWhenFinished: true,
                            playbackOrder: order, multiScreenPolicy: .perScreen,
                            selectedCategoryID: 10, pinnedItem: pinnedItem,
                            favoriteItems: [second, first], playFavorites: true
                        )
                        try preferences.save(to: url)
                        let restored = Preferences.load(from: url)
                        expectEqual(restored, preferences, "收藏过滤恢复原播放配置，含不在收藏中的固定项")
                        let menu = PlaybackOrderMenu.entries(
                            order: restored.playbackOrder, isPinned: restored.pinnedItem != nil,
                            canPinCurrent: true
                        )
                        expectEqual(menu.map(\.kind), [.order(.shuffle), .order(.sequential), .pin], "收藏支持随机、顺序、固定三种模式")
                        expect(menu.allSatisfy(\.isEnabled), "收藏中的三种模式均可选")
                        let selected: PlaybackOrderMenu.Kind = pinnedItem == nil ? .order(order) : .pin
                        expectEqual(menu.filter(\.isSelected).map(\.kind), [selected], "原模式的菜单勾选保持不变")
                    }
                }
            } catch { expect(false, "收藏过滤存储失败：\(error)") }
        }
        test("收藏候选复用顺序与随机规则，增删后不残留旧队列") {
            let items = [third, second, first]
            var sequential = CandidatePool(items: items, order: .sequential)
            expectEqual((0..<3).compactMap { _ in sequential.next()?.id }, items.map(\.id), "顺序按收藏原序完整走一轮")
            sequential.setItems([third, second])
            expectEqual((0..<2).compactMap { _ in sequential.next()?.id }, [third.id, second.id], "取消收藏从下一轮候选移除")
            var shuffle = CandidatePool(items: items, order: .shuffle)
            expectEqual(Set((0..<3).compactMap { _ in shuffle.next()?.id }), Set(items.map(\.id)), "随机一轮不重复且只取收藏")
            var singleton = CandidatePool(items: [first], order: .shuffle)
            expectEqual(singleton.next(), first, "一个收藏可播放")
            expectEqual(singleton.next(), first, "一个收藏继续循环")
        }
        test("禁用在轮换、恢复与故障黑名单重置中始终排除") {
            var pool = CandidatePool(items: [first, second, third], order: .sequential)
            pool.excludedIDs = [second.id]
            expectEqual(pool.itemsSnapshot, [first, second, third], "浏览列表保留原始条目")
            expectEqual(pool.restore(id: second.id), nil, "每屏恢复不能取禁用项")
            expectEqual((0..<2).compactMap { _ in pool.next()?.id }, [first.id, third.id], "顺序轮换跳过禁用项")
            pool.blacklist(id: first.id)
            pool.blacklist(id: third.id)
            pool.refill()
            expectEqual(pool.next()?.id, first.id, "资源黑名单可重置")
            expectEqual(pool.next()?.id, third.id, "重置后仍跳过禁用项")
            pool.excludedIDs = [first.id, second.id, third.id]
            expect(pool.isExhausted, "全部禁用时无候选")
            let resetCount = pool.blacklistResetCount
            expectEqual(pool.next(), nil, "全部禁用不能自动重试")
            expectEqual(pool.blacklistResetCount, resetCount, "不因禁用触发黑名单重置")
        }
        test("收藏被禁用清空后恢复原分类记忆") {
            let restored = Preferences(
                selectedCategoryID: 10, favoriteItems: [first],
                disabledItems: [first], playFavorites: true
            ).sanitized()
            expectEqual(restored.favoriteItems, [], "冲突项从收藏移除")
            expectEqual(restored.playFavorites, false, "空收藏退出收藏过滤")
            expectEqual(restored.selectedCategoryID, 10, "原分类记忆保留")
        }
    }
}
