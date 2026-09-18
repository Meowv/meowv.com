import Foundation
import LiveWallCore

func screenSourceStoreTests() {
    suite("ScreenSourceStore") {

        test("空表读不到任何东西") {
            let store = ScreenSourceStore.empty
            expectEqual(store.count, 0, "空表应没有记录")
            expectNil(store.itemID(for: 1), "空表不该读到条目")
        }

        test("按 displayID 存取") {
            var store = ScreenSourceStore()
            store.setItemID(42, for: 3)
            expectEqual(store.itemID(for: 3), 42, "应能按 displayID 读回条目 id")
            expectNil(store.itemID(for: 4), "没写过的屏不该凭空有值")
        }

        test("同一块屏重复写入是覆盖而不是追加") {
            var store = ScreenSourceStore()
            store.setItemID(1, for: 3)
            store.setItemID(2, for: 3)
            expectEqual(store.count, 1, "同一块屏只应有一条记录")
            expectEqual(store.itemID(for: 3), 2, "后写的应覆盖先写的")
        }

        test("清理：拔掉的屏会被剔除") {
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)
            store.setItemID(20, for: 2)
            store.setItemID(30, for: 3)
            let removed = store.prune(keeping: [1, 3])
            expectEqual(removed, 1, "应剔除 1 条")
            expectEqual(store.count, 2, "应剩 2 条")
            expectNil(store.itemID(for: 2), "被剔除的屏不该还在")
            expectEqual(store.itemID(for: 1), 10, "保留的屏不受影响")
        }

        test("清理：保留集合为空时全部剔除") {
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)
            store.setItemID(20, for: 2)
            let removed = store.prune(keeping: [])
            expectEqual(removed, 2, "应全部剔除")
            expectEqual(store.count, 0, "应清空")
        }

        test("上限：超出后条数被夹住") {
            var store = ScreenSourceStore()
            for index in 0..<(ScreenSourceStore.maxEntries + 5) {
                store.setItemID(index, for: UInt32(index))
            }
            expectEqual(store.count, ScreenSourceStore.maxEntries, "条数应被上限夹住")
        }

        test("上限：裁剪是确定的，重复裁剪结果稳定") {
            var store = ScreenSourceStore()
            for index in 0..<(ScreenSourceStore.maxEntries + 3) {
                store.setItemID(index, for: UInt32(index))
            }
            let after = store
            store.prune(keeping: Set((0..<(ScreenSourceStore.maxEntries + 3)).map { UInt32($0) }))
            expectEqual(store, after, "裁剪后再裁剪一遍不应发生变化")
        }

        test("Codable 往返") {
            var store = ScreenSourceStore()
            store.setItemID(7, for: 11)
            store.setItemID(8, for: 22)
            guard let data = try? JSONEncoder().encode(store) else {
                expect(false, "编码失败")
                return
            }
            guard let decoded = try? JSONDecoder().decode(ScreenSourceStore.self, from: data) else {
                expect(false, "解码失败")
                return
            }
            expectEqual(decoded, store, "往返后应一致")
            expectEqual(decoded.itemID(for: 22), 8, "往返后仍能按 displayID 读到")
        }

        test("键是 displayID 的字符串形式") {
            // JSON 的键只能是字符串，而这个结构要落进 config.json ——
            // 这条锁住「写出去的是字符串键」，避免哪天改成数字后老配置读不回来。
            var store = ScreenSourceStore()
            store.setItemID(5, for: 9)
            let data = (try? JSONEncoder().encode(store)) ?? Data()
            let text = String(data: data, encoding: .utf8) ?? ""
            expect(text.contains("\"9\""), "键应是字符串形式的 displayID")
        }
    }
}
