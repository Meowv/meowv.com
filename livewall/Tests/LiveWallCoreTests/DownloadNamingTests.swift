import Foundation
import LiveWallCore

/// 手动下载的文件名规则。
///
/// **从 `LockScreenPreviewTests.swift` 拆出来的**（2026-09-21 审查）：那个文件里同时装着
/// 两个毫不相关的 suite，而 `main.swift` 是**按函数名**手工登记的 —— 它对「函数在哪个
/// 文件」完全无感，所以这类名实不符不会报错、只会积累。
func downloadNamingTests() {
    suite("下载命名") {

        test("替换非法字符") {
            expectEqual(
                DownloadNaming.sanitize("a/b:c\\d*e?f\"g<h>i|j"),
                "a_b_c_d_e_f_g_h_i_j",
                "文件名非法字符应替换成下划线"
            )
        }

        test("换行与制表符也替换") {
            expectEqual(DownloadNaming.sanitize("第一行\n第二行\t结尾"), "第一行_第二行_结尾", "换行与制表符应替换")
        }

        test("压缩连续空白") {
            expectEqual(DownloadNaming.sanitize("a    b"), "a b", "连续空格压成一个")
        }

        test("去掉首尾空白与点") {
            expectEqual(DownloadNaming.sanitize("  ..标题..  "), "标题", "首尾的点与空白都要去掉")
        }

        test("截断到 60 字符") {
            let long = String(repeating: "字", count: 80)
            expectEqual(DownloadNaming.sanitize(long).count, 60, "超长标题应截断")
        }

        test("保留中文与空格") {
            expectEqual(DownloadNaming.sanitize("蒙眼天使 4K"), "蒙眼天使 4K", "中文与空格照常保留")
        }

        test("扩展名从 URL 取") {
            expectEqual(
                DownloadNaming.fileExtension(for: URL(string: "https://cdn.test/a.jpg"), fallback: "jpg"),
                "jpg",
                "jpg"
            )
            expectEqual(
                DownloadNaming.fileExtension(for: URL(string: "https://cdn.test/a.png"), fallback: "jpg"),
                "png",
                "静态图实测有 png，不能硬编码"
            )
            expectEqual(
                DownloadNaming.fileExtension(for: URL(string: "https://cdn.test/a_size_bit_pattern.mp4"), fallback: "mp4"),
                "mp4",
                "带下划线的文件名"
            )
        }

        test("扩展名取不到时用兜底") {
            expectEqual(
                DownloadNaming.fileExtension(for: URL(string: "https://cdn.test/noext"), fallback: "mp4"),
                "mp4",
                "没有扩展名时用兜底"
            )
            expectEqual(DownloadNaming.fileExtension(for: nil, fallback: "jpg"), "jpg", "URL 为 nil 时用兜底")
        }

        test("文件名带 id 前缀") {
            expectEqual(
                DownloadNaming.fileName(id: 162264, title: "蒙眼天使", fileExtension: "mp4"),
                "162264-蒙眼天使.mp4",
                "id 前缀保证不同条目不会互相覆盖"
            )
        }

        test("标题清洗后为空时只用 id") {
            expectEqual(
                DownloadNaming.fileName(id: 7, title: "///", fileExtension: "mp4"),
                "7-___.mp4",
                "全是非法字符时仍以 id 开头，且不为空"
            )
            expectEqual(
                DownloadNaming.fileName(id: 7, title: "   ", fileExtension: "mp4"),
                "7.mp4",
                "纯空白标题退化成只用 id"
            )
        }

        test("视频与静态图同基名成对") {
            let video = DownloadNaming.fileName(id: 1, title: "标题", fileExtension: "mp4")
            let cover = DownloadNaming.fileName(id: 1, title: "标题", fileExtension: "jpg")
            expectEqual(video, "1-标题.mp4", "视频名")
            expectEqual(cover, "1-标题.jpg", "静态图名")
        }
    }

    suite("更新包文件名（version 来自远端，必须清洗）") {

        test("正常版本号原样拼进去") {
            let feed = UpdateFeed(
                version: "0.2.0",
                build: 3,
                sha256: String(repeating: "a", count: 64),
                fileURL: URL(string: "https://cdn.test/LiveWall-0.2.0.dmg")!
            )
            expectEqual(feed.suggestedFileName, "LiveWall-0.2.0.dmg", "常规版本号")
        }

        test("版本号里带路径分隔符不会穿出下载目录") {
            // `appendingPathComponent` 不解析 `..`，所以不清洗的话
            // `"version": "../../../../tmp/x"` 会写到下载目录之外。
            // 签名保护的是来源、不保护字段语义，这条缝要自己堵。
            //
            // ⚠️ 断言的是**真实属性**（解析后仍在下载目录内），不是「字符串里没有 `..`」——
            // 后者过严：`sanitize` 把 `/` 换成 `_` 之后，`..` 已经不是路径分量了，
            // 它只是文件名里两个普通的点（实测 `"../../x"` → `".._.._x"`）。
            let feed = UpdateFeed(
                version: "../../../../tmp/evil",
                build: 3,
                sha256: String(repeating: "a", count: 64),
                fileURL: URL(string: "https://cdn.test/x.dmg")!
            )
            let name = feed.suggestedFileName
            let directory = URL(fileURLWithPath: "/Users/someone/Downloads", isDirectory: true)
            let resolved = directory.appendingPathComponent(name).standardizedFileURL

            expect(!name.contains("/"), "文件名里不能有路径分隔符，实际「\(name)」")
            expectEqual(
                resolved.deletingLastPathComponent().path,
                directory.standardizedFileURL.path,
                "解析后必须仍落在下载目录里，实际「\(resolved.path)」"
            )
            expect(name.hasPrefix("LiveWall-") && name.hasSuffix(".dmg"), "仍应是合法文件名，实际「\(name)」")
        }

        test("版本号清洗后为空时退回 build 号，而不是拼出怪名字") {
            let feed = UpdateFeed(
                version: "///",
                build: 42,
                sha256: String(repeating: "a", count: 64),
                fileURL: URL(string: "https://cdn.test/x.dmg")!
            )
            // `sanitize("///")` 得到 "___"（非法字符替换成下划线），不为空；
            // 纯空白才会被压成空串 —— 那一种要退回 build。
            let blank = UpdateFeed(
                version: "   ",
                build: 42,
                sha256: String(repeating: "a", count: 64),
                fileURL: URL(string: "https://cdn.test/x.dmg")!
            )
            expectEqual(feed.suggestedFileName, "LiveWall-___.dmg", "非法字符被替换，仍可用")
            expectEqual(blank.suggestedFileName, "LiveWall-42.dmg", "纯空白应退回 build 号")
        }
    }
}
