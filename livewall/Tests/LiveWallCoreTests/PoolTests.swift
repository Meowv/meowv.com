import Foundation
import LiveWallCore

private func makeItems(_ count: Int) -> [WallpaperItem] {
    (1...count).map { index in
        WallpaperItem(
            id: index,
            title: "W\(index)",
            author: "",
            url: "https://cdn.test/\(index).mp4"
        )
    }
}

func poolTests() {
    suite("CandidatePool") {

        test("一轮之内不重复") {
            let pool = CandidatePool(items: makeItems(10))
            var generator = SeededGenerator(seed: 42)
            var mutable = pool
            var picked: [Int] = []
            for _ in 0..<10 {
                guard let item = mutable.next(using: &generator) else { break }
                picked.append(item.id)
            }
            expectEqual(picked.count, 10, "应取出 10 条")
            expectEqual(Set(picked).count, 10, "一轮内不应重复")
        }

        test("取空后自动重排，且新一轮不以上一条开头") {
            var pool = CandidatePool(items: makeItems(5))
            var generator = SeededGenerator(seed: 7)
            var picked: [Int] = []
            for _ in 0..<11 {
                guard let item = pool.next(using: &generator) else { break }
                picked.append(item.id)
            }
            expectEqual(picked.count, 11, "应取出 11 条")
            // 第 6 条（新一轮第一条）不应等于第 5 条
            expect(picked[5] != picked[4], "重排后不应紧接着重复上一条（\(picked[4]) → \(picked[5])）")
            // 前 5 条自身不重复
            expectEqual(Set(picked.prefix(5)).count, 5, "第一轮内不重复")
        }

        test("不同种子产生不同顺序") {
            var a = CandidatePool(items: makeItems(20))
            var b = CandidatePool(items: makeItems(20))
            var genA = SeededGenerator(seed: 1)
            var genB = SeededGenerator(seed: 2)
            let seqA = (0..<20).map { _ in a.next(using: &genA)?.id ?? -1 }
            let seqB = (0..<20).map { _ in b.next(using: &genB)?.id ?? -1 }
            expect(seqA != seqB, "不同种子应给出不同顺序")
            expectEqual(Set(seqA), Set(seqB), "但集合应相同")
        }

        test("黑名单条目不会被取出") {
            var pool = CandidatePool(items: makeItems(3))
            pool.blacklist(id: 2)
            var generator = SeededGenerator(seed: 3)
            var picked: [Int] = []
            for _ in 0..<2 {
                guard let item = pool.next(using: &generator) else { break }
                picked.append(item.id)
            }
            expectEqual(picked.count, 2, "只剩 2 条可用")
            expect(!picked.contains(2), "被拉黑的 id 不应出现")
            expectEqual(pool.blacklistedCount, 1, "黑名单计数")
            expectEqual(pool.availableCount, 2, "可用计数")
        }

        test("拉黑待取队列里的条目会立即移除") {
            var pool = CandidatePool(items: makeItems(3))
            var generator = SeededGenerator(seed: 5)
            _ = pool.next(using: &generator)
            expectEqual(pool.pendingCount, 2, "队列剩 2 条")
            // 把队列里剩下的两条全部拉黑
            pool.blacklist(id: 1)
            pool.blacklist(id: 2)
            pool.blacklist(id: 3)
            expectEqual(pool.pendingCount, 0, "队列应被清空")
        }

        test("黑名单覆盖全部候选时自动重置并重试一轮") {
            var pool = CandidatePool(items: makeItems(3))
            for id in 1...3 { pool.blacklist(id: id) }
            expect(pool.isExhausted, "应判定为耗尽")
            expectEqual(pool.availableCount, 0, "可用数为 0")

            var generator = SeededGenerator(seed: 11)
            let item = pool.next(using: &generator)

            expectNotNil(item, "重置后应仍能取到条目")
            expectEqual(pool.blacklistResetCount, 1, "应记录一次重置")
            expectEqual(pool.blacklistedCount, 0, "黑名单应被清空")
        }

        test("只有一条候选时不排除自己") {
            var pool = CandidatePool(items: makeItems(1))
            var generator = SeededGenerator(seed: 13)
            let first = pool.next(using: &generator)
            let second = pool.next(using: &generator)
            expectEqual(first?.id, 1, "第一条")
            expectEqual(second?.id, 1, "唯一候选应能被反复取到")
        }

        test("空候选集返回 nil") {
            var pool = CandidatePool(items: [])
            var generator = SeededGenerator(seed: 17)
            expectNil(pool.next(using: &generator), "空集应返回 nil")
            expect(pool.isExhausted, "应判定为耗尽")
            expectEqual(pool.blacklistResetCount, 0, "空集不应触发黑名单重置")
        }

        test("setItems 清空待取队列但保留黑名单") {
            var pool = CandidatePool(items: makeItems(5))
            var generator = SeededGenerator(seed: 19)
            _ = pool.next(using: &generator)
            pool.blacklist(id: 3)
            expect(pool.pendingCount > 0, "替换前队列非空")

            pool.setItems(makeItems(8))

            expectEqual(pool.pendingCount, 0, "队列应被清空")
            expectEqual(pool.blacklistedCount, 1, "黑名单应保留")
            expectEqual(pool.totalCount, 8, "候选集应被替换")
        }

        test("取出的条目会更新 currentID") {
            var pool = CandidatePool(items: makeItems(3))
            var generator = SeededGenerator(seed: 23)
            let item = pool.next(using: &generator)
            expectEqual(pool.currentID, item?.id, "currentID 应跟随取出项")
        }
    }

    suite("SchedulePolicy") {

        test("默认间隔为 300 秒") {
            let policy = SchedulePolicy()
            expectEqual(policy.intervalSeconds, 300, "默认间隔")
            expectEqual(policy.switchWhenFinished, false, "默认不播完即切")
        }

        test("无抖动时返回精确的固定间隔") {
            let policy = SchedulePolicy(intervalSeconds: 120, jitterRatio: 0)
            var generator = SeededGenerator(seed: 1)
            let values = (0..<5).map { _ in policy.nextDelaySeconds(using: &generator) }
            expectEqual(Set(values), [120], "无抖动应为定值 120，实际 \(values)")
        }

        test("抖动落在 ±20% 区间内") {
            let policy = SchedulePolicy(intervalSeconds: 100, jitterRatio: 0.2)
            var generator = SeededGenerator(seed: 29)
            var values: [Double] = []
            for _ in 0..<200 {
                values.append(policy.nextDelaySeconds(using: &generator))
            }
            expectEqual(values.count, 200, "采样数")
            expect(values.allSatisfy { $0 >= 80 && $0 <= 120 }, "全部应落在 80–120 秒")
            expect(values.min()! < 95, "应出现明显低于基准的值，实际 \(values.min()!)")
            expect(values.max()! > 105, "应出现明显高于基准的值，实际 \(values.max()!)")
        }

        test("抖动比例被限制在 0…1") {
            let policy = SchedulePolicy(intervalSeconds: 100, jitterRatio: 5)
            var generator = SeededGenerator(seed: 31)
            var values: [Double] = []
            for _ in 0..<50 {
                values.append(policy.nextDelaySeconds(using: &generator))
            }
            // ratio 被夹到 1 后，倍数落在 0…2，即 0…200 秒
            expect(values.allSatisfy { $0 >= 0 && $0 <= 200 },
                   "超范围抖动应被夹紧，实际范围 \(values.min()!)–\(values.max()!)")
            expect(values.min()! < 50, "应出现接近 0 的值")
            expect(values.max()! > 150, "应出现接近 200 的值")
        }

        test("播完即切时返回视频时长") {
            let policy = SchedulePolicy(intervalSeconds: 300, switchWhenFinished: true)
            var generator = SeededGenerator(seed: 37)
            expectEqual(policy.nextDelaySeconds(videoDuration: 10.033, using: &generator), 10.033, "应返回视频时长")
        }

        test("播完即切但时长不可用时退回固定间隔") {
            let policy = SchedulePolicy(intervalSeconds: 300, jitterRatio: 0, switchWhenFinished: true)
            var generator = SeededGenerator(seed: 41)
            expectEqual(policy.nextDelaySeconds(videoDuration: nil, using: &generator), 300, "nil 时长应退回间隔")
            expectEqual(policy.nextDelaySeconds(videoDuration: 0, using: &generator), 300, "0 时长应退回间隔")
            expectEqual(policy.nextDelaySeconds(videoDuration: -1, using: &generator), 300, "负时长应退回间隔")
            expectEqual(policy.nextDelaySeconds(videoDuration: .infinity, using: &generator), 300, "无穷大应退回间隔")
        }

        test("间隔设为非正数时退回默认值，避免退化成 0 秒死循环") {
            let policy = SchedulePolicy(intervalSeconds: 0, jitterRatio: 0)
            var generator = SeededGenerator(seed: 43)
            expectEqual(policy.nextDelaySeconds(using: &generator), 300, "0 间隔应退回默认")
            let negative = SchedulePolicy(intervalSeconds: -10, jitterRatio: 0)
            expectEqual(negative.nextDelaySeconds(using: &generator), 300, "负间隔应退回默认")
        }
    }
}
