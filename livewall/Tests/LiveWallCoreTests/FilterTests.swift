import Foundation
import LiveWallCore

private func item(_ id: Int, author: String, tags: [String] = []) -> WallpaperItem {
    WallpaperItem(id: id, title: "t\(id)", author: author, url: "https://example.com/\(id).mp4", tags: tags)
}

func filterTests() {
    suite("CandidateFilter") {

        test("空过滤视为不限") {
            let filter = CandidateFilter()
            expect(!filter.isActive, "空过滤不应处于激活状态")
            expectEqual(filter.summary, "不限", "空过滤摘要应为不限")
            expect(filter.matches(item(1, author: "西瓜")), "空过滤应放行任何条目")
        }

        test("作者过滤：命中放行、未命中拦截") {
            let filter = CandidateFilter(authors: ["西瓜", "孤雁"])
            expect(filter.isActive, "选了作者应处于激活状态")
            expect(filter.matches(item(1, author: "西瓜")), "命中作者应放行")
            expect(filter.matches(item(2, author: "孤雁")), "第二个作者也应放行")
            expect(!filter.matches(item(3, author: "房东的猫")), "未命中作者应拦截")
        }

        test("作者过滤：空作者名不会被误放行") {
            let filter = CandidateFilter(authors: ["西瓜"])
            expect(!filter.matches(item(1, author: "")), "空作者名不应命中")
        }

        test("标签过滤：任选一个标签命中即放行") {
            let filter = CandidateFilter(tags: ["古风", "可爱"])
            expect(filter.matches(item(1, author: "a", tags: ["可爱"])), "命中第一个标签")
            expect(filter.matches(item(2, author: "a", tags: ["古风", "城市"])), "命中第二个标签")
            expect(!filter.matches(item(3, author: "a", tags: ["城市夜景"])), "都没命中应拦截")
            expect(!filter.matches(item(4, author: "a")), "无标签应拦截")
        }

        test("两个维度之间是与：作者与标签都要满足") {
            let filter = CandidateFilter(authors: ["西瓜"], tags: ["古风"])
            expect(filter.matches(item(1, author: "西瓜", tags: ["古风"])), "都满足应放行")
            expect(!filter.matches(item(2, author: "西瓜", tags: ["可爱"])), "标签不满足应拦截")
            expect(!filter.matches(item(3, author: "孤雁", tags: ["古风"])), "作者不满足应拦截")
        }

        test("apply 返回过滤后的条目") {
            let items = [
                item(1, author: "西瓜"),
                item(2, author: "孤雁"),
                item(3, author: "西瓜"),
            ]
            let filtered = CandidateFilter(authors: ["西瓜"]).apply(to: items)
            expectEqual(filtered.map(\.id), [1, 3], "应只剩西瓜的两条")
        }

        test("不限时 apply 原样返回且不复制内容") {
            let items = [item(1, author: "西瓜"), item(2, author: "孤雁")]
            let filtered = CandidateFilter().apply(to: items)
            expectEqual(filtered.count, 2, "不限时应全部保留")
        }

        test("摘要文案") {
            expectEqual(CandidateFilter(authors: ["a"]).summary, "1 位作者", "单个作者")
            expectEqual(CandidateFilter(authors: ["a", "b"]).summary, "2 位作者", "两个作者")
            expectEqual(CandidateFilter(tags: ["t"]).summary, "1 个标签", "单个标签")
            expectEqual(
                CandidateFilter(authors: ["a"], tags: ["t"]).summary,
                "1 位作者 + 1 个标签",
                "两个维度都有限制"
            )
        }
    }

    suite("FilterOptions") {

        test("作者按条目数降序，同数按 Unicode 码点升序") {
            let items = [
                item(1, author: "乙"),
                item(2, author: "甲"),
                item(3, author: "丙"),
                item(4, author: "丙"),
            ]
            let options = FilterOptions.authors(from: items)
            // 同数项按码点排：乙 U+4E59 < 甲 U+7532。
            // 刻意不用 localizedStandardCompare —— 那个结果随系统语言变化，
            // 会让「顺序稳定可复现」这条性质失效。
            expectEqual(options.map(\.value), ["丙", "乙", "甲"], "丙 2 条在前，其余同数按码点升序")
            expectEqual(options.map(\.count), [2, 1, 1], "计数应正确")
        }

        test("空作者名不进入选项") {
            let items = [item(1, author: ""), item(2, author: "西瓜")]
            let options = FilterOptions.authors(from: items)
            expectEqual(options.map(\.value), ["西瓜"], "空作者名应被排除")
        }

        test("标签统计：同一条目里的重复标签只算一次") {
            let items = [item(1, author: "a", tags: ["古风", "古风", "可爱"])]
            let options = FilterOptions.tags(from: items)
            expectEqual(options.map(\.value).sorted(), ["古风", "可爱"], "重复标签应去重")
            expectEqual(options.first(where: { $0.value == "古风" })?.count, 1, "古风应只计 1 次")
        }

        test("空清单返回空选项") {
            expect(FilterOptions.authors(from: []).isEmpty, "空清单没有作者选项")
            expect(FilterOptions.tags(from: []).isEmpty, "空清单没有标签选项")
        }
    }

    suite("CandidatePool 过滤") {

        let catalog = [
            item(1, author: "西瓜"),
            item(2, author: "孤雁"),
            item(3, author: "西瓜"),
            item(4, author: "房东的猫"),
        ]

        test("不设过滤时全部可用") {
            let pool = CandidatePool(items: catalog)
            expectEqual(pool.totalCount, 4, "全部 4 条")
            expectEqual(pool.catalogCount, 4, "清单总数 4")
            expectEqual(pool.filteredOutCount, 0, "没有排除任何条目")
            expect(!pool.filter.isActive, "默认过滤应为不限")
        }

        test("设置过滤后候选集收窄") {
            var pool = CandidatePool(items: catalog)
            pool.filter = CandidateFilter(authors: ["西瓜"])
            expectEqual(pool.totalCount, 2, "只剩西瓜的 2 条")
            expectEqual(pool.catalogCount, 4, "清单总数不变")
            expectEqual(pool.filteredOutCount, 2, "排除 2 条")
            expectEqual(pool.availableCount, 2, "可用数也应是 2")
        }

        test("过滤后 next 只返回符合条件的条目") {
            var pool = CandidatePool(items: catalog, filter: CandidateFilter(authors: ["西瓜"]))
            var generator = SeededGenerator(seed: 7)
            var seen: [Int] = []
            while let next = pool.next(using: &generator) {
                seen.append(next.id)
                if seen.count >= 10 { break }   // 防死循环：队列会重洗
            }
            expectEqual(Set(seen), [1, 3], "只应取到西瓜的两条，实际 \(seen)")
        }

        test("改过滤会清空待取队列") {
            var pool = CandidatePool(items: catalog)
            var generator = SeededGenerator(seed: 1)
            _ = pool.next(using: &generator)
            expect(pool.pendingCount > 0, "取过一次后队列里应还有剩余")

            pool.filter = CandidateFilter(authors: ["孤雁"])
            expectEqual(pool.pendingCount, 0, "改过滤后队列应被清空，等下一次 next 重新洗牌")
        }

        test("改过滤不清黑名单 —— 那是资源失效的记录，与用户选了什么无关") {
            var pool = CandidatePool(items: catalog)
            pool.blacklist(id: 2)
            expectEqual(pool.blacklistedCount, 1, "拉黑 1 条")

            pool.filter = CandidateFilter(authors: ["西瓜"])
            expectEqual(pool.blacklistedCount, 1, "改过滤不应清空黑名单")
        }

        test("过滤到空集时视为耗尽") {
            var pool = CandidatePool(items: catalog)
            pool.filter = CandidateFilter(authors: ["不存在的作者"])
            expectEqual(pool.totalCount, 0, "没有匹配条目")
            expect(pool.isExhausted, "空候选集应视为耗尽")
            var generator = SeededGenerator(seed: 3)
            expect(pool.next(using: &generator) == nil, "取不出任何条目")
        }

        test("清空过滤后恢复全部候选") {
            var pool = CandidatePool(items: catalog, filter: CandidateFilter(authors: ["西瓜"]))
            expectEqual(pool.totalCount, 2, "先收窄到 2 条")
            pool.filter = CandidateFilter()
            expectEqual(pool.totalCount, 4, "清空过滤应恢复 4 条")
            expectEqual(pool.filteredOutCount, 0, "不再排除任何条目")
        }

        test("authorOptions 在 setItems 时算好") {
            let pool = CandidatePool(items: catalog)
            expectEqual(pool.authorOptions.map(\.value), ["西瓜", "孤雁", "房东的猫"], "应按条目数降序")
            expectEqual(pool.authorOptions.first?.count, 2, "西瓜有 2 条")
        }

        test("作者选项取自全量而非过滤后的子集") {
            let pool = CandidatePool(items: catalog, filter: CandidateFilter(authors: ["西瓜"]))
            expectEqual(pool.authorOptions.count, 3, "选项应来自全量清单，否则过滤后无法再放宽")
        }

        test("构造时传入的过滤立即生效") {
            let pool = CandidatePool(items: catalog, filter: CandidateFilter(authors: ["房东的猫"]))
            expectEqual(pool.totalCount, 1, "构造时就应收窄")
            expectEqual(pool.filter.summary, "1 位作者", "过滤条件应保留")
        }
    }
}
