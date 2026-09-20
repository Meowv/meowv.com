import LiveWallCore

private func pinnedItem(id: Int = 1, url: String = "https://cdn.test/1.mp4") -> WallpaperItem {
    WallpaperItem(id: id, title: "W\(id)", author: "A", url: url)
}

/// 「固定为桌面壁纸」的驱动事件裁决。
///
/// 这组测试的意义在于把**输入空间穷举**掉：`PinDriveEvent.allCases` 有 8 项，
/// 乘上「固定 / 未固定」两种状态共 16 组，全部断言。
/// 这样以后往 `PinDriveEvent` 里加 case 时，如果忘了在判定表里给它一个裁决，
/// 这里的穷举会立刻失败 —— 而不是等用户在真机上发现画面被悄悄换走。
func pinnedPlaybackTests() {
    suite("固定状态机：驱动事件裁决") {

        test("未固定时，任何事件都按原逻辑取片") {
            for event in PinDriveEvent.allCases {
                expectEqual(
                    PinnedPlayback.resolve(pinnedItem: nil, event: event),
                    .unpinAndAdvance,
                    "未固定 + \(event) 应正常取片"
                )
            }
        }

        test("固定态下：定时器与恢复类事件一律不动画面") {
            let item = pinnedItem()
            let holdEvents: [PinDriveEvent] = [
                .scheduledAdvance,
                .networkRestored,
                .slotRecovery,
                .playbackFailureRecovery,
            ]
            for event in holdEvents {
                expectEqual(
                    PinnedPlayback.resolve(pinnedItem: item, event: event),
                    .hold,
                    "固定 + \(event) 应保持画面"
                )
            }
        }

        test("固定态下：引擎空了 / 新增槽位 / 切片应用都要重新铺满") {
            let item = pinnedItem()
            let reapplyEvents: [PinDriveEvent] = [
                .newSlotAdded,
                .resumeWithEmptyEngine,
                .sliceApplied,
            ]
            for event in reapplyEvents {
                expectEqual(
                    PinnedPlayback.resolve(pinnedItem: item, event: event),
                    .reapplyPin,
                    "固定 + \(event) 应重新铺满"
                )
            }
        }

        test("固定态下只有用户主动请求才解钉") {
            expectEqual(
                PinnedPlayback.resolve(pinnedItem: pinnedItem(), event: .userRequestedUnpin),
                .unpinAndAdvance,
                "用户点「下一张」/ 选「随机」「顺序」应解钉"
            )
        }

        test("每个事件都有明确裁决，没有漏判") {
            let item = pinnedItem()
            for event in PinDriveEvent.allCases {
                let resolution = PinnedPlayback.resolve(pinnedItem: item, event: event)
                // 「定时器到点」必须 hold（固定就是不再轮换），
                // 「引擎空了」必须 reapplyPin（否则固定态遇到空引擎会一直黑着）。
                // 这两条是判定表里最容易写反的一对。
                if event == .scheduledAdvance {
                    expectEqual(resolution, .hold, "定时器到点不能换片")
                }
                if event == .resumeWithEmptyEngine {
                    expectEqual(resolution, .reapplyPin, "空引擎必须补固定项，不能黑屏")
                }
            }
        }
    }

    suite("固定项可用性") {

        test("http(s) 地址可用") {
            expect(PinnedPlayback.isPlayable(pinnedItem(url: "https://cdn.test/1.mp4")), "https 应可用")
            expect(PinnedPlayback.isPlayable(pinnedItem(url: "http://cdn.test/1.mp4")), "http 应可用")
        }

        test("空串 / 非 http(s) / 相对路径都不可用") {
            expect(!PinnedPlayback.isPlayable(pinnedItem(url: "")), "空串应不可用")
            expect(!PinnedPlayback.isPlayable(pinnedItem(url: "ftp://cdn.test/1.mp4")), "ftp 应不可用")
            expect(!PinnedPlayback.isPlayable(pinnedItem(url: "/relative/1.mp4")), "无 scheme 应不可用")
        }

        test("静态图缺失不影响「可播」判定") {
            // 固定只看播放地址。静态图是 UI 的事（网格缩略图由 `ThumbnailURL` 决定
            // 能不能显示），不该让「没有封面图」变成「不能固定」。
            let withoutCover = WallpaperItem(
                id: 1, title: "W1", author: "A",
                url: "https://cdn.test/1.mp4"
            )
            expect(PinnedPlayback.isPlayable(withoutCover), "没有静态图也应可播")
        }
    }
}
