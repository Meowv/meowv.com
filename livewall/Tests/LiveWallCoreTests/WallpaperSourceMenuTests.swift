import LiveWallCore

/// 「壁纸来源」子菜单（线上 / 本地）。
///
/// 这组断言守的是**单选语义**：两行必须互斥勾选，且默认落在线上 ——
/// 用户没配过本地文件夹时，菜单里唯一能看出「不选也照样能播」的线索就是这一行。
func wallpaperSourceMenuTests() {
    suite("壁纸来源菜单") {

        test("两行，顺序为 线上 → 本地") {
            let entries = WallpaperSourceMenu.entries(isLocal: false)
            expectEqual(entries.count, 2, "应为两行")
            expectEqual(entries[0].kind, .remote, "第 1 行应是线上")
            expectEqual(entries[1].kind, .local, "第 2 行应是本地")
        }

        test("默认（线上）：勾线上行，根标题（线上）") {
            let entries = WallpaperSourceMenu.entries(isLocal: false)
            expect(entries[0].isSelected, "线上行应勾选")
            expect(!entries[1].isSelected, "本地行不应勾选")
            expectEqual(
                WallpaperSourceMenu.rootTitle(isLocal: false, localFolderName: nil),
                "壁纸来源（线上）",
                "根标题应显示线上"
            )
        }

        test("本地态：勾本地行，根标题带文件夹名") {
            let entries = WallpaperSourceMenu.entries(isLocal: true)
            expect(!entries[0].isSelected, "线上行不应勾选")
            expect(entries[1].isSelected, "本地行应勾选")
            expectEqual(
                WallpaperSourceMenu.rootTitle(isLocal: true, localFolderName: "Videos"),
                "壁纸来源（本地：Videos）",
                "根标题应带上文件夹名"
            )
        }

        test("本地态但取不到文件夹名时退回通用文案") {
            for name in [nil, ""] {
                expectEqual(
                    WallpaperSourceMenu.rootTitle(isLocal: true, localFolderName: name),
                    "壁纸来源（本地文件夹）",
                    "没有名字时不该出现空括号（name=\(name ?? "nil")）"
                )
            }
        }

        test("只服务线上内容的三个入口，在本地来源下一律置灰") {
            for entry in WallpaperSourceMenu.OnlineOnlyEntry.allCases {
                expect(
                    WallpaperSourceMenu.isEnabled(entry, isLocalSource: false),
                    "线上来源下「\(entry.label)」应当可点"
                )
                expect(
                    !WallpaperSourceMenu.isEnabled(entry, isLocalSource: true),
                    "本地来源下「\(entry.label)」应当置灰"
                )
            }
        }

        test("线上专属入口的登记表没漏项") {
            // 断言的是「这几个入口都在册」，不是数量本身：以后新增一个只服务线上内容的
            // 入口时，这条会提醒把它登记进来 —— 漏登记的后果是它一直可点，
            // 而本地来源下点它必然无反应（没有编译错误会提示这件事）。
            expectEqual(
                Set(WallpaperSourceMenu.OnlineOnlyEntry.allCases.map(\.label)),
                ["内容过滤", "下载当前壁纸", "打开动态壁纸"],
                "在册的线上专属入口"
            )
        }

        test("超长文件夹名被截断，父项标题不被撑宽") {
            let long = String(repeating: "长", count: 60)
            let title = WallpaperSourceMenu.rootTitle(isLocal: true, localFolderName: long)
            expect(title.count < long.count, "长名应被截断")
            expect(title.hasSuffix("）"), "截断后仍应是完整的一对括号")
        }
    }
}
