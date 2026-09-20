import LiveWallCore

/// 「选片顺序」子菜单（随机 / 顺序 / 固定）。
///
/// 重点锁住「固定是派生显示」这条设计：固定态下随机与顺序两行**都不勾选**，
/// 勾选落在固定行上，父项标题变「固定」。如果哪天有人为了省事在
/// `Preferences` 里另存一个「当前选的是固定」的布尔量，这组断言会拦住。
func playbackOrderMenuTests() {
    suite("选片顺序菜单") {

        test("三行，顺序为 随机 → 顺序 → 固定") {
            let entries = PlaybackOrderMenu.entries(order: .shuffle, isPinned: false, canPinCurrent: true)
            expectEqual(entries.count, 3, "应为三行")
            expectEqual(entries[0].kind, .order(.shuffle), "第 1 行应是随机")
            expectEqual(entries[1].kind, .order(.sequential), "第 2 行应是顺序")
            expectEqual(entries[2].kind, .pin, "第 3 行应是固定")
        }

        test("两行顺序用 PlaybackOrder 自己的标题，不另写一份文案") {
            let entries = PlaybackOrderMenu.entries(order: .shuffle, isPinned: false, canPinCurrent: true)
            expectEqual(entries[0].title, PlaybackOrder.shuffle.menuTitle, "随机行标题应复用 menuTitle")
            expectEqual(entries[1].title, PlaybackOrder.sequential.menuTitle, "顺序行标题应复用 menuTitle")
            expectEqual(entries[2].title, PlaybackOrderMenu.pinTitle, "固定行标题应复用 pinTitle")
        }

        test("未固定 + 随机：勾随机，根标题（随机）") {
            let entries = PlaybackOrderMenu.entries(order: .shuffle, isPinned: false, canPinCurrent: true)
            expect(entries[0].isSelected, "随机行应勾选")
            expect(!entries[1].isSelected, "顺序行不应勾选")
            expect(!entries[2].isSelected, "固定行不应勾选")
            expectEqual(
                PlaybackOrderMenu.rootTitle(order: .shuffle, isPinned: false),
                "选片顺序（随机）",
                "根标题应显示随机"
            )
        }

        test("未固定 + 顺序：勾顺序，根标题（顺序）") {
            let entries = PlaybackOrderMenu.entries(order: .sequential, isPinned: false, canPinCurrent: true)
            expect(!entries[0].isSelected, "随机行不应勾选")
            expect(entries[1].isSelected, "顺序行应勾选")
            expect(!entries[2].isSelected, "固定行不应勾选")
            expectEqual(
                PlaybackOrderMenu.rootTitle(order: .sequential, isPinned: false),
                "选片顺序（顺序）",
                "根标题应显示顺序"
            )
        }

        test("已固定：只勾固定行，两个顺序行都不勾") {
            // 这是「固定是派生显示」的核心断言。固定态下画面与 order 无关，
            // 勾上任何一行都会让人以为「现在播的是这个顺序挑出来的」。
            for order in PlaybackOrder.allCases {
                let entries = PlaybackOrderMenu.entries(order: order, isPinned: true, canPinCurrent: true)
                expect(!entries[0].isSelected, "固定态下随机行不应勾选（order=\(order)）")
                expect(!entries[1].isSelected, "固定态下顺序行不应勾选（order=\(order)）")
                expect(entries[2].isSelected, "固定态下应勾选固定行")
                expectEqual(
                    PlaybackOrderMenu.rootTitle(order: order, isPinned: true),
                    "选片顺序（固定）",
                    "固定态根标题应是固定（order=\(order)）"
                )
            }
        }

        test("当前没有可播条目时固定行置灰，其它两行照常可点") {
            let entries = PlaybackOrderMenu.entries(order: .shuffle, isPinned: false, canPinCurrent: false)
            expect(entries[0].isEnabled, "随机行应可点")
            expect(entries[1].isEnabled, "顺序行应可点")
            expect(!entries[2].isEnabled, "没有当前条目时固定行应置灰")
        }

        test("已固定时固定行仍可点（幂等）") {
            let entries = PlaybackOrderMenu.entries(order: .shuffle, isPinned: true, canPinCurrent: true)
            expect(entries[2].isEnabled, "已固定时固定行仍应可点")
        }
    }
}
