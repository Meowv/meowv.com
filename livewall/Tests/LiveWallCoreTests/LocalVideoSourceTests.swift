import Foundation
import LiveWallCore

/// 本地文件夹数据源（`LocalVideoSource`）。
///
/// 锁住三条最容易悄悄坏掉的规则：
/// 1. **递归**收集、只收 `.mp4`（大小写不敏感），其它扩展名忽略；
/// 2. id 由**路径**派生且稳定 —— 失效黑名单与每屏源记忆都按 id 记，
///    拿下标当 id 的话，往文件夹里加一个文件就会让后面全部错位，
///    表现成「上次那块屏播的片子变成了另一条」；
/// 3. 目录不存在 / 一个 mp4 都没有时必须抛错 —— 启用本地来源前要能判出来，
///    否则用户会得到一个「启用了但什么都不播」的来源。
func localVideoSourceTests() {
    suite("本地视频源") {

        test("递归收集 mp4、只认 mp4、按路径升序") {
            withTempFolder { root in
                makeFile(root.appendingPathComponent("b.mp4"))
                makeFile(root.appendingPathComponent("a.mp4"))
                makeFile(root.appendingPathComponent("note.txt"))
                makeFile(root.appendingPathComponent("movie.mov"))
                let sub = root.appendingPathComponent("子目录", isDirectory: true)
                try? FileManager.default.createDirectory(at: sub, withIntermediateDirectories: true)
                makeFile(sub.appendingPathComponent("c.MP4"))

                guard let items = try? LocalVideoSource.items(in: root) else {
                    expect(false, "应当扫描成功")
                    return
                }
                // 升序按**完整路径**比：`a.mp4` < `b.mp4` < `子目录/c.MP4`（ASCII 小于汉字）。
                // 顺序模式直接照候选集次序播，所以这个次序必须可预期。
                expectEqual(items.map(\.title), ["a", "b", "c"], "应递归收到 3 个 mp4 且按路径升序")
                expectEqual(items.first?.url.hasPrefix("file://"), true, "地址应是 file:// 形式")
                expectEqual(items.first?.author, "", "本地条目没有作者")
                expectNil(items.first?.coverUrl, "本地条目没有静态图地址（走抓帧兜底）")
            }
        }

        test("名为 xxx.mp4 的目录不算文件") {
            withTempFolder { root in
                let fake = root.appendingPathComponent("假视频.mp4", isDirectory: true)
                try? FileManager.default.createDirectory(at: fake, withIntermediateDirectories: true)
                makeFile(root.appendingPathComponent("real.mp4"))

                let items = (try? LocalVideoSource.items(in: root)) ?? []
                expectEqual(items.count, 1, "只应收到真实文件")
                expectEqual(items.first?.title, "real", "目录本身不该成为条目")
            }
        }

        test("id 由路径派生：同一路径两次扫描完全相同") {
            withTempFolder { root in
                makeFile(root.appendingPathComponent("a.mp4"))
                let first = (try? LocalVideoSource.items(in: root)) ?? []
                let second = (try? LocalVideoSource.items(in: root)) ?? []
                expectEqual(first.map(\.id), second.map(\.id), "同一文件夹两次扫描的 id 必须一致")
                expect(first.allSatisfy { $0.id > 0 }, "id 必须是正数")
            }
        }

        test("不同文件夹里的同名文件 id 不同") {
            withTempFolder { root in
                let left = root.appendingPathComponent("左", isDirectory: true)
                let right = root.appendingPathComponent("右", isDirectory: true)
                for folder in [left, right] {
                    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    makeFile(folder.appendingPathComponent("same.mp4"))
                }
                let leftID = (try? LocalVideoSource.items(in: left))?.first?.id
                let rightID = (try? LocalVideoSource.items(in: right))?.first?.id
                expectNotNil(leftID, "左侧应有条目")
                expect(leftID != rightID, "同名不同路径必须是两个 id（否则黑名单会串味）")
            }
        }

        test("哈希冲突时线性探测，不出现重复 id") {
            let url = URL(fileURLWithPath: "/tmp/livewall-probe.mp4")
            let base = LocalVideoSource.stableID(for: url)
            let probed = LocalVideoSource.stableID(for: url, excluding: [base])
            expect(base != probed, "已被占用的 id 应让位")
            expect(probed > 0, "让位后的 id 仍为正数")
        }

        test("没有 mp4 时抛错") {
            withTempFolder { root in
                makeFile(root.appendingPathComponent("readme.md"))
                expectThrows("空文件夹应当抛错") {
                    _ = try LocalVideoSource.items(in: root)
                }
            }
        }

        test("路径不是文件夹时抛错") {
            withTempFolder { root in
                let file = root.appendingPathComponent("a.mp4")
                makeFile(file)
                expectThrows("指向文件的路径应当抛错") {
                    _ = try LocalVideoSource.items(in: file)
                }
                expectThrows("不存在的路径应当抛错") {
                    _ = try LocalVideoSource.items(in: root.appendingPathComponent("不存在"))
                }
            }
        }
    }
}

/// 建一个临时目录，跑完删掉。扫描要真读盘，不能用假路径。
private func withTempFolder(_ body: (URL) throws -> Void) {
    let root = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("livewall-local-source-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    do {
        try body(root)
    } catch {
        expect(false, "临时目录用例抛出意外错误：\(error)")
    }
}

private func makeFile(_ url: URL) {
    try? Data("x".utf8).write(to: url)
}
