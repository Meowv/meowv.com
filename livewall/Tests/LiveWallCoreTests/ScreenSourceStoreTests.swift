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

        test("entries 能一次读出整张表") {
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)
            store.setItemID(20, for: 3)
            expectEqual(store.entries, [1: 10, 3: 20], "应按 displayID 读出全部记录")
        }

        test("entries 跳过键解析不出 displayID 的记录") {
            // 配置被手改过时可能出现这种键。跳过它，别让整张表读不出来。
            let store = ScreenSourceStore(sources: ["1": 10, "not-a-number": 20, "": 30])
            expectEqual(store.entries, [1: 10], "坏键应被跳过")
            expectEqual(store.count, 3, "底层记录数不变（清理交给 prune）")
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

    suite("ScreenSourceRestore") {

        test("条目都在候选集里时全部可恢复") {
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)
            store.setItemID(20, for: 3)
            let plan = ScreenSourceRestore.plan(store: store, candidateIDs: [10, 20, 30])
            expectEqual(plan, [1: 10, 3: 20], "两块屏都该进计划")
        }

        test("条目已不在候选集里时被丢弃 —— 换了分类就是这种情况") {
            // 候选集是**当前分类**的切片。用户换过分类之后，旧条目多半已经不在了；
            // 拿着它去取片只会让那块屏空着，所以必须丢弃、退回正常取片。
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)      // 还在
            store.setItemID(999, for: 3)     // 不在当前分类
            let plan = ScreenSourceRestore.plan(store: store, candidateIDs: [10, 20])
            expectEqual(plan, [1: 10], "查不到的记录不该进计划")
        }

        test("全部查不到时计划为空") {
            var store = ScreenSourceStore()
            store.setItemID(999, for: 1)
            let plan = ScreenSourceRestore.plan(store: store, candidateIDs: [1, 2, 3])
            expect(plan.isEmpty, "一个都不命中就什么都不恢复")
        }

        test("空记忆或空候选集都得到空计划") {
            expect(
                ScreenSourceRestore.plan(store: .empty, candidateIDs: [1, 2]).isEmpty,
                "没有记忆时无可恢复"
            )
            var store = ScreenSourceStore()
            store.setItemID(1, for: 1)
            expect(
                ScreenSourceRestore.plan(store: store, candidateIDs: []).isEmpty,
                "候选集为空时无可恢复"
            )
        }

        test("拔掉的屏仍会被算进计划（由调用方按实际槽位取用）") {
            // 表里可能留着已经拔掉的屏。计划本身不做屏幕过滤 ——
            // 调用方只对**实际存在的槽位**取用，多余的项自然用不上。
            var store = ScreenSourceStore()
            store.setItemID(10, for: 1)
            store.setItemID(20, for: 99)
            let plan = ScreenSourceRestore.plan(store: store, candidateIDs: [10, 20])
            expectEqual(plan.count, 2, "计划不负责剔除拔掉的屏")
        }
    }
}
