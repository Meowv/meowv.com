import Foundation
import LiveWallCore

/// 版本检查的纯逻辑：解析、判定、菜单文案。
///
/// 这三块正好是「改坏了最容易被误判成线上没更新」的地方 ——
/// 更新提示不出现是**静默失败**，没有任何别的症状，所以必须穷举。
func updateTests() {

    // MARK: - 解析

    suite("版本信息解析") {

        test("完整字段能解出来") {
            let data = Data(#"{"version":"0.2.0","build":2,"notes":"修了锁屏预览","sizeBytes":3107840,"sha256":"ABC123","fileURL":"https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg"}"#.utf8)
            var warnings: [String] = []
            let feed = UpdateFeedCoding.decode(data, into: &warnings)
            expectNotNil(feed, "完整字段应当解析成功")
            expectEqual(feed?.version, "0.2.0", "版本号")
            expectEqual(feed?.build, 2, "build")
            expectEqual(feed?.sizeBytes, 3107840, "体积")
            expectEqual(feed?.notes, "修了锁屏预览", "更新说明")
            expect(warnings.isEmpty, "正常数据不该产生 warning")
        }

        test("build 写成字符串数字也接受") {
            // 服务端是脚本生成的 JSON，写手常把 build 写成 "2"。
            // 这不是数据错误，不该因此让用户看不到更新。
            let data = Data(#"{"version":"0.2.0","build":"2","fileURL":"https://a.b/c.dmg"}"#.utf8)
            var warnings: [String] = []
            expectEqual(UpdateFeedCoding.decode(data, into: &warnings)?.build, 2, "字符串数字应转成 Int")
        }

        test("必填字段缺失一律判不可用，不留半截数据") {
            let cases: [(String, String)] = [
                (#"{"build":2,"fileURL":"https://a.b/c.dmg"}"#, "缺 version"),
                (#"{"version":"0.2.0","fileURL":"https://a.b/c.dmg"}"#, "缺 build"),
                (#"{"version":"0.2.0","build":2}"#, "缺 fileURL"),
            ]
            for (json, label) in cases {
                var warnings: [String] = []
                expectNil(UpdateFeedCoding.decode(Data(json.utf8), into: &warnings), label)
                expect(!warnings.isEmpty, "\(label)：必须有 warning 说明原因")
            }
        }

        test("fileURL 不是 https 就拒绝") {
            let data = Data(#"{"version":"0.2.0","build":2,"fileURL":"http://a.b/c.dmg"}"#.utf8)
            var warnings: [String] = []
            expectNil(UpdateFeedCoding.decode(data, into: &warnings), "http 地址不能作为更新源")
        }

        test("build 非法值一律拒绝：0、负数、小数、乱字符串") {
            for raw in ["0", "-1", "2.5", "\"abc\"", "null"] {
                let data = Data(#"{"version":"0.2.0","build":\#(raw),"fileURL":"https://a.b/c.dmg"}"#.utf8)
                var warnings: [String] = []
                expectNil(UpdateFeedCoding.decode(data, into: &warnings), "build=\(raw) 应判不可用")
            }
        }

        test("根节点不是 JSON 对象 / 不是 JSON，都只是失败而不是崩溃") {
            for raw in ["[]", "\"hello\"", "not json at all", ""] {
                var warnings: [String] = []
                expectNil(UpdateFeedCoding.decode(Data(raw.utf8), into: &warnings), "输入 \(raw) 应解析失败")
            }
        }

        test("可选字段缺失不影响主流程") {
            let data = Data(#"{"version":"0.2.0","build":2,"fileURL":"https://a.b/c.dmg"}"#.utf8)
            var warnings: [String] = []
            let feed = UpdateFeedCoding.decode(data, into: &warnings)
            expectNotNil(feed, "只有必填字段也该解析成功")
            expectNil(feed?.sizeBytes, "体积缺失就是 nil，不补 0")
            expectNil(feed?.sha256, "校验值缺失就是 nil")
            expectEqual(feed?.notes, "", "更新说明缺失是空串")
            expect(feed?.sha256Matches("anything") ?? false, "没给校验值时不校验，一律视为通过")
        }

        test("SHA-256 比对忽略大小写与首尾空白") {
            var feed = UpdateFeed(version: "0.2.0", build: 2, sha256: " ABC123 ", fileURL: URL(string: "https://a.b/c.dmg")!)
            expect(feed.sha256Matches("abc123"), "大小写与空格都不该影响比对")
            feed.sha256 = "ABC123"
            expect(!feed.sha256Matches("deadbeef"), "不同的摘要必须判为不符")
        }

        test("落盘文件名带版本号，多次更新不会互相覆盖") {
            let feed = UpdateFeed(version: "0.2.0", build: 2, fileURL: URL(string: "https://a.b/c.dmg")!)
            expectEqual(feed.suggestedFileName, "LiveWall-0.2.0.dmg", "文件名")
        }
    }

    // MARK: - 判定

    suite("更新判定") {

        let os = OperatingSystemVersion(majorVersion: 27, minorVersion: 0, patchVersion: 0)

        func feed(build: Int, minOS: String? = nil) -> UpdateFeed {
            UpdateFeed(
                version: "0.2.\(build)",
                build: build,
                fileURL: URL(string: "https://a.b/c.dmg")!,
                minOSVersion: minOS
            )
        }

        test("远程 build 更高 → 提示") {
            let result = UpdateEvaluator.evaluate(localBuild: 1, feed: feed(build: 2), currentOS: os)
            expectEqual(result, .available(feed(build: 2)), "有新版本")
            expect(result.showsUpdateRow, "要显示更新入口")
        }

        test("远程 build 相等或更低 → 不提示") {
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 2, feed: feed(build: 2), currentOS: os),
                .upToDate,
                "相等算最新"
            )
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 3, feed: feed(build: 2), currentOS: os),
                .upToDate,
                "远程更低也算最新"
            )
        }

        test("本地 build 读不到 → 绝不提示（开发版直跑的情形）") {
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: nil, feed: feed(build: 9), currentOS: os),
                .unusable,
                "不知道自己是哪一版就别谈更新"
            )
        }

        test("远程信息不可用 → 不提示") {
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 1, feed: nil, currentOS: os),
                .unusable,
                "feed 为 nil"
            )
        }

        test("系统低于最低要求 → 不提示；满足或没要求 → 正常提示") {
            let old = OperatingSystemVersion(majorVersion: 13, minorVersion: 0, patchVersion: 0)
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 1, feed: feed(build: 2, minOS: "26.0"), currentOS: old),
                .unusable,
                "装了也跑不起来，不提示"
            )
            let same = feed(build: 2, minOS: "13.0")
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 1, feed: same, currentOS: old),
                .available(same),
                "正好等于最低版本算满足"
            )
            expectEqual(
                UpdateEvaluator.evaluate(localBuild: 1, feed: feed(build: 2), currentOS: old),
                .available(feed(build: 2)),
                "没写最低要求就不拦"
            )
        }

        test("看不懂的最低版本字符串当作满足，不拦更新") {
            let old = OperatingSystemVersion(majorVersion: 13, minorVersion: 0, patchVersion: 0)
            expect(
                UpdateEvaluator.isOSAtLeast("不是版本号", current: old),
                "服务端填错不该让用户看不到更新"
            )
            expect(UpdateEvaluator.isOSAtLeast(nil, current: old), "没要求一律满足")
        }
    }

    // MARK: - 菜单文案

    suite("更新菜单文案") {

        test("主行带版本号与体积；体积缺失就不编一个") {
            expectEqual(UpdateMenu.rowTitle(version: "0.2.0", sizeBytes: 3107840), "有新版本 0.2.0（3.0 MB）", "有体积")
            expectEqual(UpdateMenu.rowTitle(version: "0.2.0", sizeBytes: nil), "有新版本 0.2.0", "没体积")
            expectEqual(UpdateMenu.rowTitle(version: "0.2.0", sizeBytes: 0), "有新版本 0.2.0", "体积为 0 视同没有")
        }

        test("详情行：体积缺失少一行，说明缺失整行不出现") {
            let full = UpdateFeed(
                version: "0.2.0", build: 2, notes: "修了锁屏预览", sizeBytes: 3107840,
                fileURL: URL(string: "https://a.b/c.dmg")!
            )
            expectEqual(
                UpdateMenu.detailLines(feed: full),
                ["版本 0.2.0（build 2）", "大小 3.0 MB", "修了锁屏预览"],
                "三行齐全"
            )
            let bare = UpdateFeed(version: "0.2.0", build: 2, fileURL: URL(string: "https://a.b/c.dmg")!)
            expectEqual(UpdateMenu.detailLines(feed: bare), ["版本 0.2.0（build 2）"], "只剩版本行")
        }

        test("多行说明压成一行并截断") {
            expectEqual(
                UpdateMenu.truncatedNotes("第一行\n第二行"),
                "第一行 第二行",
                "换行规整成空格"
            )
            let long = String(repeating: "很长的说明", count: 10)
            let result = UpdateMenu.truncatedNotes(long, maxLength: 10)
            expectEqual(result?.count, 11, "截断到 10 个字加一个省略号")
            expect(result?.hasSuffix("…") ?? false, "截断要有省略号")
            expectNil(UpdateMenu.truncatedNotes("   \n  "), "全是空白视为没有说明")
        }

        test("只有一个可点动作：下载；没有「自动安装」这类措辞") {
            expectEqual(UpdateMenu.actionTitle(.updateNow), "立即下载更新", "只下载、不安装")
        }

        test("下载完成提示必须写「先退出再覆盖」") {
            expect(
                UpdateMenu.installHint.contains("先退出"),
                "覆盖运行中的自己会丢掉恢复原墙纸那一步，提示里必须点明"
            )
        }

        test("有新版本的回执不能指向「检查更新」—— 那个入口此时是隐藏的") {
            let feed = UpdateFeed(
                version: "0.2.0", build: 2, notes: "", sizeBytes: nil, sha256: nil,
                fileURL: URL(string: "https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg")!,
                minOSVersion: nil
            )
            let found = UpdateMenu.feedback(.available(feed), warnings: [], currentVersion: "0.1.0")
            expect(!found.text.contains("检查更新"), "入口已隐藏，文案再指向它就自相矛盾")
        }

        test("手动检查的三态都有回执 —— 不给就等于「点了没反应」") {
            let feed = UpdateFeed(
                version: "0.2.0", build: 2, notes: "", sizeBytes: nil, sha256: nil,
                fileURL: URL(string: "https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg")!,
                minOSVersion: nil
            )

            let latest = UpdateMenu.feedback(.upToDate, warnings: [], currentVersion: "0.1.0")
            expectEqual(latest.text, "已是最新版本 0.1.0", "已是最新要说清楚，否则用户以为没查")
            expect(!latest.isWarning, "已是最新不是异常")

            let found = UpdateMenu.feedback(.available(feed), warnings: [], currentVersion: "0.1.0")
            expect(found.text.contains("0.2.0"), "回执里要有新版本号")
            expect(!found.isWarning, "有新版本不是异常")

            let failed = UpdateMenu.feedback(.unusable, warnings: ["HTTP 500"], currentVersion: "0.1.0")
            expect(failed.text.contains("HTTP 500"), "失败原因要透出来，不然排障只能翻日志")
            expect(failed.isWarning, "检查失败算异常")

            let unknown = UpdateMenu.feedback(.unusable, warnings: [], currentVersion: "0.1.0")
            expect(!unknown.text.isEmpty, "连原因都没有时也要给一句兜底，不能空着")
            expect(unknown.isWarning, "同样是失败")
        }
    }

    // MARK: - 菜单状态

    suite("更新菜单状态") {

        let feed = UpdateFeed(
            version: "0.2.0", build: 2, notes: "", sizeBytes: nil, sha256: nil,
            fileURL: URL(string: "https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg")!,
            minOSVersion: nil
        )

        test("显隐由状态一处决定：有新版本时隐藏「检查更新」入口") {
            expect(UpdateState.idle.showsCheckItem, "无更新 → 入口可见，供手动触发")
            expect(!UpdateState.idle.showsUpdateRow, "无更新 → 没有更新行")
            expect(!UpdateState.available(feed).showsCheckItem, "有新版本 → 入口隐藏")
            expect(UpdateState.available(feed).showsUpdateRow, "有新版本 → 显示更新行")
            // 两者互斥：任何状态下都不该同时出现
            for state in [UpdateState.idle, .checking, .available(feed)] {
                expect(
                    state.showsCheckItem != state.showsUpdateRow,
                    "\(state.label)：入口与更新行必须互斥"
                )
            }
        }

        test("检查中：入口保留但禁用，标题带省略号") {
            expect(UpdateState.checking.showsCheckItem, "入口还在，用户看得到在跑")
            expect(!UpdateState.checking.checkItemEnabled, "禁用挡住重复请求")
            expectEqual(UpdateState.checking.checkItemTitle, "检查更新…", "")
            expectEqual(UpdateState.idle.checkItemTitle, "检查更新", "")
        }

        test("迁移：只有有新版本才离开入口态，失败按无更新处理") {
            expectEqual(UpdateState.idle.afterCheckStarted, .checking, "开始检查")
            expectEqual(UpdateState.checking.afterCheckFinished(.upToDate), .idle, "已是最新 → 入口不动")
            expectEqual(UpdateState.checking.afterCheckFinished(.unusable), .idle, "失败 → 按无更新处理")
            expectEqual(
                UpdateState.checking.afterCheckFinished(.available(feed)), .available(feed),
                "有新版本 → 切到更新行"
            )
            // 已经显示更新行时再查一次却没有了（线上撤下 / 用户已装新版），入口要还回来
            expectEqual(UpdateState.available(feed).afterCheckFinished(.upToDate), .idle, "")
        }

        test("幂等：同一个事件重复到达，状态不变") {
            expectEqual(UpdateState.checking.afterCheckStarted, .checking, "并发点击不该回到 idle")
            let once = UpdateState.idle.afterCheckFinished(.available(feed))
            expectEqual(once.afterCheckFinished(.available(feed)), once, "同一结果再来一次，值不变")
            expectEqual(UpdateState.idle.afterCheckFinished(.upToDate), .idle, "")
            expectEqual(UpdateState.idle.afterCheckStarted.afterCheckStarted, .checking, "")
        }
    }
}
