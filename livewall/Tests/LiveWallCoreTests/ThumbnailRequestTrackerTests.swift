import LiveWallCore

/// 缩略图请求调度：去重、并发上限、失败不重试。
///
/// 这组测试不需要网络 —— `ThumbnailRequestTracker` 是纯状态机，
/// 它只回答「给定一批 URL，现在该发哪几个」。真正的 `URLSession` 在 `ThumbnailLoader` 里。
func thumbnailRequestTrackerTests() {
    suite("缩略图请求追踪") {

        test("并发不超过上限") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            let started = tracker.submit((1...10).map { "https://cdn.test/\($0).jpg" })
            expectEqual(started.count, 4, "首次最多发 4 个")
            expectEqual(tracker.inFlightCount, 4, "在飞数应为 4")
            expectEqual(tracker.pendingCount, 6, "其余 6 个应排队")
        }

        test("一个结束就补一个，始终不超上限") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            _ = tracker.submit((1...10).map { "https://cdn.test/\($0).jpg" })
            let next = tracker.finish("https://cdn.test/1.jpg", succeeded: true)
            expectEqual(next.count, 1, "空出一个位应补发 1 个")
            expectEqual(tracker.inFlightCount, 4, "补发后仍在飞 4 个")
            expectEqual(tracker.pendingCount, 5, "排队数应减 1")
        }

        test("同一 URL 去重，只发一次") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            let started = tracker.submit(["https://cdn.test/a.jpg", "https://cdn.test/a.jpg"])
            expectEqual(started.count, 1, "同一 URL 只应发一次")
            // 再提交一次同一批（卡片复用时会重复提交），仍不应重发
            let again = tracker.submit(["https://cdn.test/a.jpg"])
            expectEqual(again.count, 0, "在飞的 URL 不应重发")
            expectEqual(tracker.pendingCount, 0, "也不应重复排队")
        }

        test("失败的 URL 不再自动重试") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            _ = tracker.submit(["https://cdn.test/bad.jpg"])
            _ = tracker.finish("https://cdn.test/bad.jpg", succeeded: false)
            expect(tracker.isFailed("https://cdn.test/bad.jpg"), "失败应被记住")

            let retry = tracker.submit(["https://cdn.test/bad.jpg", "https://cdn.test/good.jpg"])
            expectEqual(retry.count, 1, "只应发没失败过的那个")
            expectEqual(retry.first, "https://cdn.test/good.jpg", "发出的应是好地址")
        }

        test("resetFailures 之后失败项可以重发") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            _ = tracker.submit(["https://cdn.test/bad.jpg"])
            _ = tracker.finish("https://cdn.test/bad.jpg", succeeded: false)
            let restarted = tracker.resetFailures()
            expectEqual(restarted.count, 0, "失败表清空时队列里没有等待项，不发请求")
            expectEqual(tracker.failedCount, 0, "失败表应清空")

            let retry = tracker.submit(["https://cdn.test/bad.jpg"])
            expectEqual(retry.count, 1, "清空后应能重发")
        }

        test("cancelAll 放弃在飞与等待，但不记失败") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 2)
            _ = tracker.submit((1...5).map { "https://cdn.test/\($0).jpg" })
            tracker.cancelAll()
            expectEqual(tracker.inFlightCount, 0, "在飞应清空")
            expectEqual(tracker.pendingCount, 0, "等待队列应清空")
            expectEqual(tracker.failedCount, 0, "取消不等于失败")
            // 取消后同一批可以重新提交（重开窗口的场景）
            let restarted = tracker.submit((1...5).map { "https://cdn.test/\($0).jpg" })
            expectEqual(restarted.count, 2, "重新提交应重新按上限发出")
        }

        test("replacingPending 丢弃已滚出屏幕的等待项") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 2)
            _ = tracker.submit(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg", "https://cdn.test/3.jpg"])
            expectEqual(tracker.pendingCount, 1, "应有 1 个在排队")

            // 用户又滚了一段，可见项换了：旧的等待项已滚出屏幕，不该再占位置
            let started = tracker.submit(["https://cdn.test/9.jpg"], replacingPending: true)
            expectEqual(started.count, 0, "两个位都在飞，暂时发不出")
            expectEqual(tracker.pendingCount, 1, "等待项应是新的那个")
            expect(!tracker.isPending("https://cdn.test/3.jpg"), "旧的等待项应被丢弃")
            expect(tracker.isPending("https://cdn.test/9.jpg"), "新的等待项应在队列里")

            // 不丢弃时则保留排队
            var keep = ThumbnailRequestTracker(concurrencyLimit: 2)
            _ = keep.submit(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg", "https://cdn.test/3.jpg"])
            _ = keep.submit(["https://cdn.test/9.jpg"])
            expectEqual(keep.pendingCount, 2, "不丢弃时两个都在排队")
        }

        test("空 URL 被忽略") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 4)
            let started = tracker.submit(["", "https://cdn.test/a.jpg"])
            expectEqual(started.count, 1, "空串不应发出请求")
            expectEqual(started.first, "https://cdn.test/a.jpg", "应只发合法地址")
        }

        test("并发上限至少为 1") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 0)
            expectEqual(tracker.concurrencyLimit, 1, "0 应被夹到 1")
            let started = tracker.submit(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"])
            expectEqual(started.count, 1, "一次只发一个")
        }

        test("全部失败后不再重试，避免坏地址反复占位") {
            var tracker = ThumbnailRequestTracker(concurrencyLimit: 2)
            let urls = (1...4).map { "https://cdn.test/\($0).jpg" }
            var started = tracker.submit(urls)
            while !started.isEmpty {
                var next: [String] = []
                for url in started {
                    next += tracker.finish(url, succeeded: false)
                }
                started = next
            }
            expectEqual(tracker.failedCount, 4, "4 个都该被记为失败")
            expectEqual(tracker.inFlightCount, 0, "不应有请求挂在半路")
            expectEqual(tracker.submit(urls).count, 0, "再提交也不应重发")
        }
    }
}
