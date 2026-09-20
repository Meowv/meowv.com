import Foundation
import LiveWallCore

/// 锁屏预览的纯逻辑：写入节流、缓存文件名槽位、目标屏、来源决策。
///
/// 这些判定决定了「什么时候写、写哪张、写到哪些屏」，全部可以脱离 GUI 验证 ——
/// 真正的系统调用（下载、抓帧、设墙纸）在 `LiveWall/LockScreenPreviewer.swift` 里。
func lockScreenPreviewTests() {
    suite("锁屏预览：写入节流") {

        test("首次写入总是执行") {
            let policy = LockScreenPreviewPolicy()
            let signature = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: "https://cdn.test/a.jpg")
            expect(
                policy.shouldWrite(previous: nil, next: signature, now: Date(), lastWriteAt: nil),
                "没有历史记录时应写入"
            )
        }

        test("换片立刻写，不受最小间隔限制") {
            let policy = LockScreenPreviewPolicy(minimumInterval: 3600)
            let previous = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: nil)
            let next = PreviewSignature(itemID: 2, displayIDs: [1], coverURL: nil)
            expect(
                policy.shouldWrite(previous: previous, next: next, now: Date(), lastWriteAt: Date()),
                "换了片就该立刻写，不该等最小间隔"
            )
        }

        test("目标屏变化也算变化") {
            let policy = LockScreenPreviewPolicy(minimumInterval: 3600)
            let previous = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: nil)
            let next = PreviewSignature(itemID: 1, displayIDs: [1, 2], coverURL: nil)
            expect(
                policy.shouldWrite(previous: previous, next: next, now: Date(), lastWriteAt: Date()),
                "多了一块屏就该重写（否则那块屏没有静态图）"
            )
        }

        test("静态图地址变化也算变化") {
            let policy = LockScreenPreviewPolicy(minimumInterval: 3600)
            let previous = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: "https://cdn.test/a.jpg")
            let next = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: "https://cdn.test/b.png")
            expect(
                policy.shouldWrite(previous: previous, next: next, now: Date(), lastWriteAt: Date()),
                "地址变了就该重写"
            )
        }

        test("签名完全相同且在最小间隔内 → 不写") {
            let policy = LockScreenPreviewPolicy(minimumInterval: 60)
            let signature = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: nil)
            let now = Date()
            expect(
                !policy.shouldWrite(previous: signature, next: signature, now: now, lastWriteAt: now.addingTimeInterval(-10)),
                "同一张图反复写纯属浪费"
            )
        }

        test("签名相同但超过最小间隔 → 允许重写") {
            let policy = LockScreenPreviewPolicy(minimumInterval: 60)
            let signature = PreviewSignature(itemID: 1, displayIDs: [1], coverURL: nil)
            let now = Date()
            expect(
                policy.shouldWrite(previous: signature, next: signature, now: now, lastWriteAt: now.addingTimeInterval(-61)),
                "超过间隔后允许重写（用于纠偏）"
            )
        }

        test("屏幕顺序不同不算变化") {
            let a = PreviewSignature(itemID: 1, displayIDs: [2, 1], coverURL: nil)
            let b = PreviewSignature(itemID: 1, displayIDs: [1, 2], coverURL: nil)
            expectEqual(a, b, "displayIDs 应排序后比较，否则顺序抖动会触发无意义的写入")
        }
    }

    suite("锁屏预览：缓存文件名槽位") {

        test("两个槽位交替") {
            let policy = LockScreenPreviewPolicy()
            let names = (0..<4).map { policy.cacheFileName(generation: $0, fileExtension: "jpg") }
            expectEqual(names, ["cover-0.jpg", "cover-1.jpg", "cover-0.jpg", "cover-1.jpg"], "应交替使用两个槽位")
        }

        test("扩展名跟随来源（静态图可能是 png）") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(policy.cacheFileName(generation: 0, fileExtension: "png"), "cover-0.png", "png 槽位 0")
            expectEqual(policy.cacheFileName(generation: 1, fileExtension: "jpg"), "cover-1.jpg", "jpg 槽位 1")
        }

        test("空扩展名回退到 jpg") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(policy.cacheFileName(generation: 0, fileExtension: ""), "cover-0.jpg", "空扩展名应回退")
        }
    }

    suite("锁屏预览：目标屏与来源决策") {

        let screens = [
            ScreenIdentity(displayID: 10, index: 0),
            ScreenIdentity(displayID: 20, index: 1),
        ]

        test("镜像覆盖全部屏") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.targetDisplayIDs(policy: .mirror, screens: screens),
                [10, 20],
                "镜像时每块屏都要有静态图"
            )
        }

        test("每屏独立同样覆盖全部屏") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.targetDisplayIDs(policy: .perScreen, screens: screens),
                [10, 20],
                "每屏独立时静态图仍是同一张，但每块屏都要写"
            )
        }

        test("仅主屏只写第一块屏") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.targetDisplayIDs(policy: .mainScreenOnly, screens: screens),
                [10],
                "副屏要保留系统墙纸"
            )
        }

        test("没有屏幕时目标为空") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(policy.targetDisplayIDs(policy: .mirror, screens: []), [], "无屏时应为空")
        }

        test("来源决策：静态图优先，抓帧兜底，都没有就放弃") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.decide(coverDownloadSucceeded: true, frameAvailable: true),
                .remote,
                "静态图成功时不该退到抓帧"
            )
            expectEqual(
                policy.decide(coverDownloadSucceeded: false, frameAvailable: true),
                .frame,
                "静态图失败时抓帧兜底"
            )
            expectEqual(
                policy.decide(coverDownloadSucceeded: false, frameAvailable: false),
                .none,
                "两者都不可用时不写（保持系统原墙纸）"
            )
        }
    }

    suite("锁屏预览：退出固化时的文件名避让") {

        test("与上次写入同名时顺延一个槽位") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.cacheFileName(generation: 0, fileExtension: "jpg", avoiding: "cover-0.jpg"),
                "cover-1.jpg",
                "同路径重复设置不一定触发刷新，必须换一个槽位"
            )
        }

        test("不同名时不变") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.cacheFileName(generation: 0, fileExtension: "jpg", avoiding: "cover-1.jpg"),
                "cover-0.jpg",
                "本来就不冲突就不该顺延"
            )
        }

        test("没有上次写入时按原规则") {
            let policy = LockScreenPreviewPolicy()
            expectEqual(
                policy.cacheFileName(generation: 1, fileExtension: "png", avoiding: nil),
                "cover-1.png",
                "首次写盘不受影响"
            )
        }
    }

    suite("锁屏预览：识别自家缓存图") {

        let cache = URL(fileURLWithPath: "/Users/me/Library/Application Support/com.meowv.livewall", isDirectory: true)

        test("缓存目录里的图算自家") {
            expect(
                LockScreenPreviewPolicy.isOwnCacheFile(
                    cache.appendingPathComponent("cover-0.jpg"),
                    cacheDirectory: cache
                ),
                "退出留下的封面必须认出来，否则会被当成用户原墙纸"
            )
        }

        test("系统默认墙纸不算") {
            let system = URL(fileURLWithPath: "/System/Library/CoreServices/DefaultDesktop.heic")
            expect(
                !LockScreenPreviewPolicy.isOwnCacheFile(system, cacheDirectory: cache),
                "不能把用户的原墙纸误判成自家缓存"
            )
        }

        test("同名前缀的兄弟目录不算") {
            let sibling = URL(fileURLWithPath: "/Users/me/Library/Application Support/com.meowv.livewall-2/cover-0.jpg")
            expect(
                !LockScreenPreviewPolicy.isOwnCacheFile(sibling, cacheDirectory: cache),
                "按路径分量比较，不能只比字符串前缀"
            )
        }
    }
}

/// 手动下载的文件名规则。
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
}
