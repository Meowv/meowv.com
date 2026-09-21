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

    suite("锁屏预览：策略变化后该恢复哪些屏") {

        test("全部屏幕收窄到仅主屏 → 被移除的屏要恢复原墙纸") {
            // 场景：用户把多屏策略从「全部同片」切到「仅主屏」。副屏上还顶着上一张
            // 锁屏预览图，必须恢复成用户原墙纸，否则它会一直留着。
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [10, 20], current: [10]),
                [20],
                "副屏应被判定为「被移除」"
            )
        }

        test("目标屏没变 → 一个都不用恢复") {
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [10, 20], current: [10, 20]),
                [],
                "没变化就不该动任何屏"
            )
        }

        test("新增屏幕不算被移除") {
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [10], current: [10, 20]),
                [],
                "新插的屏上没有「我们的静态图」要撤，动它等于误改用户墙纸"
            )
        }

        test("第一次写入就失败（lastDisplayIDs 为空）→ 不恢复任何屏") {
            // 既有行为：`lastDisplayIDs` 只在**写入成功后**更新，所以「从没成功写过」时
            // 不存在「我们改过那块屏」这个前提。写下来是为了让它成为**有意为之**，
            // 而不是某天被当成漏判给「修」掉。
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [], current: [10]),
                [],
                "没有成功写入的历史就不该恢复"
            )
        }

        test("全部屏都被移除") {
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [10, 20], current: []),
                [10, 20],
                "切到无目标屏时两块屏都该恢复"
            )
        }

        test("顺序不同不影响判定（比较的是集合）") {
            expectEqual(
                LockScreenPreviewPolicy.removedDisplayIDs(previous: [20, 10], current: [10]),
                [20],
                "顺序抖动不该改变结论"
            )
        }
    }
}
// 手动下载的文件名规则已迁到 `DownloadNamingTests.swift`（2026-09-21 审查：
// 本文件此前同时装着两个无关 suite，而 `main.swift` 按函数名登记、对此无感）。
