import LiveWallCore

/// 内容分类：索引里的分类清单、默认分类解析、菜单行的内容。
///
/// 这组测试的存在意义：分类是**客户端唯一的内容筛选维度**，而索引里的两个字段
/// （`categories` 里的 `file` 与 `itemCount`）各自承担一条容易写错的规则 ——
/// `file` 决定去哪拉内容（且必须防住远端数据把请求指到别处），
/// `itemCount` 只用于把空分类置灰（不在菜单里显示）。
func categoryTests() {
    suite("分类索引解码") {

        test("索引能读出分类清单与默认分类") {
            let index = try? CatalogCoding.decodeIndex(indexJSON())
            expectNotNil(index, "索引应能解码")
            expectEqual(index?.categories.count, 2, "分类数")
            expectEqual(index?.categories.first?.id, 4001, "首个分类 id")
            expectEqual(index?.categories.first?.name, "美女", "首个分类名")
            expectEqual(index?.categories.first?.file, "category.4001.bin", "切片文件名")
            expectEqual(index?.defaultCategoryId, 4001, "默认分类 id")
        }

        test("条目数为 0 的分类照样进索引，且 file 为 null") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(categories: [
                (4001, "美女", "category.4001.json", 2614),
                (6000, "风景", nil, 0),
            ]))
            let empty = index.categories.first { $0.id == 6000 }
            expectNotNil(empty, "空分类应保留在索引里 —— 菜单要显示它并置灰")
            expectEqual(empty?.itemCount, 0, "条目数")
            expectNil(empty?.file, "空分类没有可拉取的切片")
        }

        test("索引里没有 items 字段（它就是靠这个保持几百字节）") {
            let index = try! CatalogCoding.decodeIndex(indexJSON())
            expectEqual(index.categories.count, 2, "只带分类清单")
        }
    }

    suite("默认分类解析") {

        test("优先取 defaultCategoryId") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: [(4001, "美女", "a.json", 5), (6000, "风景", "b.json", 3)],
                defaultCategoryId: 6000
            ))
            expectEqual(index.resolvedDefaultCategoryID, 6000, "应取索引声明的默认分类")
        }

        test("defaultCategoryId 不在分类清单里时退回首项") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: [(4001, "美女", "a.json", 5)],
                defaultCategoryId: 9999
            ))
            expectEqual(index.resolvedDefaultCategoryID, 4001, "应退回首项")
        }

        test("没有 defaultCategoryId 时退回首项") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(defaultCategoryId: nil))
            expectEqual(index.resolvedDefaultCategoryID, 4001, "应退回首项")
        }
    }

    suite("可播放分类解析") {

        /// 0 条的分类在菜单里本来就置灰不可点，所以它不该成为「选中项」。
        let withEmpty = [
            (4001, "空分类", nil, 0),
            (6000, "风景", "category.6000.json", 3384),
            (8000, "萌宠", "category.8000.json", 2587),
        ]

        test("记忆值有内容时直接用") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: withEmpty, defaultCategoryId: 6000
            ))
            expectEqual(index.playableCategoryID(remembered: 8000), 8000, "应尊重记忆值")
        }

        test("记忆值是空分类时改选有内容的 —— 不能让「没有可用的内容」成为结局") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: withEmpty, defaultCategoryId: 6000
            ))
            expectEqual(index.playableCategoryID(remembered: 4001), 6000, "应改选默认分类")
        }

        test("记忆值已不在索引里时用默认分类") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: withEmpty, defaultCategoryId: 6000
            ))
            expectEqual(index.playableCategoryID(remembered: 9999), 6000, "应回退默认分类")
        }

        test("默认分类本身是空分类时继续往下找") {
            // 生成侧 `--default-category` 指到一个还没抓过的分类就是这种情况
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: withEmpty, defaultCategoryId: 4001
            ))
            expectEqual(index.playableCategoryID(remembered: nil), 6000, "应取第一个有内容的")
        }

        test("默认分类不在索引里时取第一个有内容的") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(
                categories: withEmpty, defaultCategoryId: 7777
            ))
            expectEqual(index.playableCategoryID(remembered: nil), 6000, "应取第一个有内容的")
        }

        test("全部为空时返回 nil") {
            let index = try! CatalogCoding.decodeIndex(indexJSON(categories: [
                (4001, "空一", nil, 0),
                (6000, "空二", nil, 0),
            ]))
            expectNil(index.playableCategoryID(remembered: nil), "没有可播放的分类")
            expectNil(index.playableCategoryID(remembered: 4001), "记忆值也是空的")
        }

        test("第一个分类有内容时优先它（导出侧已把默认排首位）") {
            let index = try! CatalogCoding.decodeIndex(indexJSON())
            expectEqual(index.playableCategoryID(remembered: nil), 4001, "取首项")
            expectEqual(index.playableCategoryID(remembered: 6000), 6000, "记忆值优先于首项")
        }
    }

    suite("分类菜单") {

        let categories = [
            LivewallCategoryEntry(id: 4001, name: "美女", file: "category.4001.json", itemCount: 2614),
            LivewallCategoryEntry(id: 6000, name: "风景", file: "category.6000.json", itemCount: 3384),
            LivewallCategoryEntry(id: 9000, name: "空分类", file: nil, itemCount: 0),
        ]

        test("标题只有分类名，不带条目数") {
            let entries = CategoryMenu.entries(categories: categories, selectedID: 4001)
            expectEqual(entries.map(\.title), ["全部", "美女", "风景", "空分类"], "标题与顺序")
        }

        test("单选：只有当前分类被勾上") {
            let entries = CategoryMenu.entries(categories: categories, selectedID: 6000)
            expectEqual(entries.filter(\.isSelected).compactMap(\.id), [6000], "应只勾一个分类")
            expectEqual(entries.count, 4, "全部项与分类行都应显示")
        }

        test("条目数为 0 的分类置灰，但仍出现在菜单里") {
            let entries = CategoryMenu.entries(categories: categories, selectedID: 4001)
            let empty = entries.first { $0.id == 9000 }
            expectNotNil(empty, "空分类必须保留在菜单里 —— 置灰能一眼看出数据没抓全")
            expectEqual(empty?.isEnabled, false, "空分类应置灰不可点")
            expect(entries.first { $0.id == nil }?.isEnabled == true, "全部项可点")
            expect(entries.first { $0.id == 4001 }?.isEnabled == true, "有内容的分类可点")
        }

        test("条目数不显示，但确实参与置灰判定") {
            // 两条规则来自同一个字段，容易只做一条：显示出来（用户不要）或忘了置灰（点不动）。
            let entries = CategoryMenu.entries(categories: categories, selectedID: nil)
            expect(!entries.contains { $0.title.contains("2614") }, "标题里不该出现条目数")
            expectEqual(entries.first { $0.id == 9000 }?.isEnabled, false, "0 条仍要置灰")
            expectEqual(entries.first { $0.id == nil }?.isSelected, true, "nil 应选中全部")
        }

        test("全部项置灰时仍保留在列表首位") {
            let entries = CategoryMenu.entries(categories: [], selectedID: nil, allEnabled: false)
            expectEqual(entries.map(\.title), ["全部"], "全部项仍应存在")
            expectEqual(entries.first?.isEnabled, false, "清单未提供全部切片时应置灰")
        }

        test("根项标题显示当前分类") {
            expectEqual(
                CategoryMenu.rootTitle(categories: categories, selectedID: 4001),
                "内容过滤（美女）",
                "正常情况"
            )
            expectEqual(
                CategoryMenu.rootTitle(categories: [], selectedID: nil),
                "内容过滤（全部）",
                "nil 表示全部筛选"
            )
        }

        test("本地来源下的根项标题写明原因") {
            // 本地文件夹没有分类概念，菜单里这一项整项置灰。灰着一行什么都不写，
            // 用户只会以为功能坏了 —— 所以标题必须说明「为什么不可点」。
            expectEqual(
                CategoryMenu.localSourceRootTitle,
                "内容过滤（本地文件夹）",
                "本地来源下的标题"
            )
        }

        test("选中的分类已不在清单里时显示 id，不显示空白") {
            expectEqual(
                CategoryMenu.rootTitle(categories: categories, selectedID: 7777),
                "内容过滤（id 7777）",
                "应让人看出选的是一个已不存在的东西"
            )
        }
    }
}
