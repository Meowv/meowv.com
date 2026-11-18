import Foundation
import LiveWallCore

/// 软件内「一键锁屏」的纯逻辑：解锁按键、壁纸模式配置与桌面播放暂停。
func inAppLockTests() {
    suite("InAppLockInputPolicy") {

        test("只有空格与 ⌘W 解锁，其余按键一律拦截") {
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 49, modifiers: []),
                .unlock,
                "空格解锁"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 13, modifiers: [.command]),
                .unlock,
                "⌘W 解锁"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 13, modifiers: []),
                .block,
                "W 单独按下不解锁"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 0, modifiers: []),
                .block,
                "普通字母拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 48, modifiers: []),
                .block,
                "Tab 拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 36, modifiers: []),
                .block,
                "回车拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 53, modifiers: []),
                .block,
                "Esc 拦截"
            )
        }

        test("⇧ 不影响解锁，⌘ / ⌃ / ⌥ 参与时拦截") {
            // ⇧ 被刻意忽略：误按 ⇧ 不该让人以为解锁失灵。
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 49, modifiers: [.shift]),
                .unlock,
                "⇧Space 仍解锁"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 13, modifiers: [.command, .shift]),
                .unlock,
                "⌘⇧W 仍解锁"
            )
            // 带 ⌘ / ⌃ / ⌥ 的空格是系统快捷键（Spotlight、输入法切换等），不能当成解锁。
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 49, modifiers: [.command]),
                .block,
                "⌘Space 拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 49, modifiers: [.control]),
                .block,
                "⌃Space 拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 49, modifiers: [.option]),
                .block,
                "⌥Space 拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 13, modifiers: [.command, .option]),
                .block,
                "⌘⌥W 拦截"
            )
            expectEqual(
                InAppLockInputPolicy.keyDecision(keyCode: 13, modifiers: [.command, .control]),
                .block,
                "⌘⌃W 拦截"
            )
        }

        test("解锁提示文案只有一份") {
            expectEqual(InAppLockInputPolicy.unlockHint, "空格或 ⌘W", "菜单与文档共用同一句")
        }
    }

    suite("InAppLockPreferences") {

        test("老配置缺字段默认沿用当前壁纸，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 900,
              "playbackOrder": "sequential",
              "lockScreenPreview": false
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8))
            else {
                expect(false, "老配置应当能解码")
                return
            }
            expect(decoded.inAppLockUsesCurrentWallpaper, "缺字段默认沿用当前壁纸")
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectEqual(decoded.playbackOrder, .sequential, "其它字段应保留")
            expectEqual(decoded.lockScreenPreview, false, "其它字段应保留")
        }

        test("纯黑屏选项能读回，写坏了回退默认") {
            let black = """
            { "intervalSeconds": 600, "inAppLockUsesCurrentWallpaper": false }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(black.utf8))
            else {
                expect(false, "应能解码")
                return
            }
            expect(!decoded.inAppLockUsesCurrentWallpaper, "纯黑屏状态应读回")
            expectEqual(decoded.intervalSeconds, 600, "其它字段应保留")

            // 手改成字符串：坏一个字段不能把整份配置打回默认
            let broken = """
            { "intervalSeconds": 1500, "inAppLockUsesCurrentWallpaper": "yes" }
            """
            guard let decodedBroken = try? JSONDecoder().decode(
                Preferences.self, from: Data(broken.utf8)
            ) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expect(decodedBroken.inAppLockUsesCurrentWallpaper, "损坏的字段应回退到默认（当前壁纸）")
            expectEqual(decodedBroken.intervalSeconds, 1500, "其它字段应保留")
        }

        test("纯黑屏选项往返编码不丢") {
            var preferences = Preferences()
            preferences.inAppLockUsesCurrentWallpaper = false
            preferences.intervalSeconds = 77
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expect(!decoded.inAppLockUsesCurrentWallpaper, "纯黑屏状态应保持")
            expectEqual(decoded.intervalSeconds, 77, "其它字段应保持")
        }
    }

    suite("InAppLockPlayback") {

        test("软件锁屏期间桌面播放暂停") {
            let resolver = PlaybackStateResolver()
            let state = resolver.resolve(PlaybackSignals(inAppLocked: true))
            expectEqual(state, .paused(.inAppLocked), "锁屏时暂停桌面解码")
            expectEqual(state.reason?.label, "软件锁屏中", "暂停原因文案")
        }

        test("用户手动暂停优先于软件锁屏") {
            let resolver = PlaybackStateResolver()
            expectEqual(
                resolver.resolve(PlaybackSignals(userPaused: true, inAppLocked: true)),
                .paused(.userRequested),
                "用户暂停不被其它信号改写"
            )
        }

        test("解锁后按其它信号恢复") {
            let resolver = PlaybackStateResolver()
            expectEqual(
                resolver.resolve(PlaybackSignals(inAppLocked: false)),
                .playing,
                "解锁后恢复播放"
            )
            // 系统锁屏仍优先于软件锁屏：两个原因同时存在时先报系统锁屏。
            expectEqual(
                resolver.resolve(PlaybackSignals(sessionLocked: true, inAppLocked: true)),
                .paused(.sessionLocked),
                "系统锁屏优先"
            )
        }
    }
}
