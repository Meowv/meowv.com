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

/// 交替作者，用于验证「先过滤出结果集，再在其中按顺序播」。
private func makeAuthoredItems(_ count: Int) -> [WallpaperItem] {
    (1...count).map { index in
        WallpaperItem(
            id: index,
            title: "W\(index)",
            author: index.isMultiple(of: 2) ? "B" : "A",
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

    suite("CandidatePool 顺序模式") {

        test("按清单原序播放，一轮走满全部条目") {
            var pool = CandidatePool(items: makeItems(5), order: .sequential)
            var generator = SeededGenerator(seed: 101)
            let picked = (0..<5).map { _ in pool.next(using: &generator)?.id ?? -1 }
            expectEqual(picked, [1, 2, 3, 4, 5], "应严格按清单顺序")
        }

        test("一轮结束后从清单开头继续，轮边界不紧挨着重复") {
            var pool = CandidatePool(items: makeItems(4), order: .sequential)
            var generator = SeededGenerator(seed: 103)
            let picked = (0..<8).map { _ in pool.next(using: &generator)?.id ?? -1 }
            // 这里刻意不用「排除当前项」的做法：那样每轮会短一条，实际序列会变成
            // 1,2,3,4 → 1,2,3 → 1,2 —— 看起来像漏播而且越跑越短。
            expectEqual(picked, [1, 2, 3, 4, 1, 2, 3, 4], "两轮都应是完整的清单原序")
            expect(picked[4] != picked[3], "轮边界不应紧接着重复上一条")
        }

        test("不受随机源影响：不同种子给出同样的顺序") {
            var a = CandidatePool(items: makeItems(6), order: .sequential)
            var b = CandidatePool(items: makeItems(6), order: .sequential)
            var genA = SeededGenerator(seed: 1)
            var genB = SeededGenerator(seed: 2)
            let seqA = (0..<6).map { _ in a.next(using: &genA)?.id ?? -1 }
            let seqB = (0..<6).map { _ in b.next(using: &genB)?.id ?? -1 }
            expectEqual(seqA, seqB, "顺序模式必须是确定性的")
        }

        test("新一轮第一条恰是当前项时向后让一位") {
            var pool = CandidatePool(items: makeItems(4), order: .sequential)
            var generator = SeededGenerator(seed: 107)
            expectEqual(pool.next(using: &generator)?.id, 1, "第一条")

            // 模拟「改了过滤条件 / 顺序 / 清单」后重建队列：队列清空、当前项保留
            pool.setItems(makeItems(4))
            expectEqual(pool.currentID, 1, "setItems 应保留当前项")
            expectEqual(pool.next(using: &generator)?.id, 2, "不应立刻重播正在播的那一条")
            // 让位是「把队首挪到队尾」，不是「删掉队首」—— 一轮的长度不能变，
            // 所以 1 必须出现在本轮末尾而不是消失。
            let rest = (0..<3).map { _ in pool.next(using: &generator)?.id ?? -1 }
            expectEqual(rest, [3, 4, 1], "让位不应丢条目，1 应排到本轮末尾")
        }

        test("只剩一条时反复取到同一条") {
            var pool = CandidatePool(items: makeItems(1), order: .sequential)
            var generator = SeededGenerator(seed: 109)
            expectEqual(pool.next(using: &generator)?.id, 1, "第一条")
            expectEqual(pool.next(using: &generator)?.id, 1, "唯一候选应能被反复取到")
        }

        test("跳过黑名单条目，不改变其余顺序") {
            var pool = CandidatePool(items: makeItems(5), order: .sequential)
            pool.blacklist(id: 3)
            var generator = SeededGenerator(seed: 113)
            let picked = (0..<4).map { _ in pool.next(using: &generator)?.id ?? -1 }
            expectEqual(picked, [1, 2, 4, 5], "应跳过 3，其余保持原序")
        }

        test("切换顺序会清空待取队列并重新开始一轮") {
            var pool = CandidatePool(items: makeItems(5), order: .sequential)
            var generator = SeededGenerator(seed: 127)
            _ = pool.next(using: &generator)
            _ = pool.next(using: &generator)
            expectEqual(pool.pendingCount, 3, "队列剩 3 条")

            pool.order = .shuffle

            expectEqual(pool.pendingCount, 0, "换顺序应清空队列")
            expectEqual(pool.totalCount, 5, "候选集不变")
        }

        test("重复设置同一顺序不会清空队列") {
            var pool = CandidatePool(items: makeItems(5), order: .sequential)
            var generator = SeededGenerator(seed: 131)
            _ = pool.next(using: &generator)
            let before = pool.pendingCount

            pool.order = .sequential

            expectEqual(pool.pendingCount, before, "值没变就不该重建 —— 否则一次误点会重置整轮")
        }

        test("过滤后从新结果集的第一条开始，且跳过的都是被过滤掉的") {
            var pool = CandidatePool(items: makeAuthoredItems(6), order: .sequential)
            pool.filter = CandidateFilter(authors: ["B"])
            var generator = SeededGenerator(seed: 137)
            let picked = (0..<3).map { _ in pool.next(using: &generator)?.id ?? -1 }
            expectEqual(picked, [2, 4, 6], "应只在 B 的结果集里按原序播放")
            expectEqual(pool.totalCount, 3, "结果集规模")
            expectEqual(pool.filteredOutCount, 3, "被过滤掉的条数")
        }

        test("空结果集返回 nil，不崩也不死循环") {
            var pool = CandidatePool(items: makeAuthoredItems(4), order: .sequential)
            pool.filter = CandidateFilter(authors: ["不存在的作者"])
            var generator = SeededGenerator(seed: 139)
            expectNil(pool.next(using: &generator), "空结果集应返回 nil")
            expect(pool.isExhausted, "应判定为耗尽")
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
            // 注意这不是「播完即切」—— 那个要显式开 switchWhenFinished。
            // 正常路径上 `Preferences.sanitized()` 会先把值夹进 SwitchInterval 的区间，
            // 这里是直接构造 SchedulePolicy 时的兜底。
            let policy = SchedulePolicy(intervalSeconds: 0, jitterRatio: 0)
            var generator = SeededGenerator(seed: 43)
            expectEqual(policy.nextDelaySeconds(using: &generator), 300, "0 间隔应退回默认")
            let negative = SchedulePolicy(intervalSeconds: -10, jitterRatio: 0)
            expectEqual(negative.nextDelaySeconds(using: &generator), 300, "负间隔应退回默认")
        }
    }

    suite("SwitchInterval") {

        test("预设严格升序且都落在合法区间内") {
            expectEqual(SwitchInterval.presets, [30, 60, 120, 300, 600, 1800, 3600], "预设")
            expect(
                zip(SwitchInterval.presets, SwitchInterval.presets.dropFirst()).allSatisfy { $0 < $1 },
                "预设必须严格升序 —— 菜单顺序直接取自它"
            )
            expect(
                SwitchInterval.presets.allSatisfy {
                    $0 >= SwitchInterval.minSeconds && $0 <= SwitchInterval.maxSeconds
                },
                "预设必须落在合法区间内"
            )
        }

        test("默认间隔必须是预设之一，否则菜单里没有任何一项被勾选") {
            expect(
                SwitchInterval.presets.contains(SchedulePolicy.defaultIntervalSeconds),
                "默认值 \(SchedulePolicy.defaultIntervalSeconds) 不在预设里"
            )
        }

        test("区间内的值原样保留") {
            for seconds in SwitchInterval.presets {
                expectEqual(SwitchInterval.clamp(seconds), seconds, "\(seconds) 不该被改动")
            }
        }

        test("区间外的值夹到最近的边界") {
            expectEqual(SwitchInterval.clamp(5), SwitchInterval.minSeconds, "低于下限夹到下限")
            expectEqual(SwitchInterval.clamp(0), SwitchInterval.minSeconds, "0 夹到下限")
            expectEqual(SwitchInterval.clamp(-5), SwitchInterval.minSeconds, "负数夹到下限")
            expectEqual(SwitchInterval.clamp(999_999), SwitchInterval.maxSeconds, "超上限夹到上限")
        }

        test("非有限值夹不了，退回默认间隔") {
            expectEqual(SwitchInterval.clamp(.nan), SchedulePolicy.defaultIntervalSeconds, "NaN")
            expectEqual(SwitchInterval.clamp(.infinity), SchedulePolicy.defaultIntervalSeconds, "+∞")
            expectEqual(SwitchInterval.clamp(-.infinity), SchedulePolicy.defaultIntervalSeconds, "-∞")
        }

        test("文案与空闲阈值共用一套规则") {
            expectEqual(SwitchInterval.label(30), "30 秒", "30 秒")
            expectEqual(SwitchInterval.label(300), "5 分钟", "5 分钟")
            expectEqual(SwitchInterval.label(3600), "1 小时", "1 小时")
            expectEqual(SwitchInterval.label(1), "10 秒", "低于下限先夹紧再出文案")
            expectEqual(SwitchInterval.label(.nan), "5 分钟", "非法值退回默认后再出文案")
        }
    }

    suite("DurationText") {

        test("非法输入返回 nil，由调用方决定兜底文案") {
            expectNil(DurationText.concise(0), "0")
            expectNil(DurationText.concise(-5), "负数")
            expectNil(DurationText.concise(.nan), "NaN")
            expectNil(DurationText.concise(.infinity), "无穷大")
        }

        test("带兜底的版本返回兜底文案") {
            expectEqual(DurationText.concise(0, fallback: "关闭"), "关闭", "兜底文案")
            expectEqual(DurationText.concise(300, fallback: "关闭"), "5 分钟", "合法值不该用兜底")
        }

        test("分钟与小时在整除时省略小数、不整除时保留一位") {
            expectEqual(DurationText.concise(90) ?? "-", "1.5 分钟", "90 秒")
            expectEqual(DurationText.concise(5400) ?? "-", "1.5 小时", "5400 秒")
            expectEqual(DurationText.concise(150) ?? "-", "2.5 分钟", "150 秒")
        }

        test("秒级四舍五入，59.6 秒进位成 60 秒而不是 59.6 秒") {
            expectEqual(DurationText.concise(59.6) ?? "-", "60 秒", "四舍五入")
            expectEqual(DurationText.concise(1) ?? "-", "1 秒", "整数秒")
        }
    }
}
