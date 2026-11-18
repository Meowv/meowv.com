import Foundation
import LiveWallCore

/// 软件内「一键锁屏」的纯逻辑：解锁按键、独立壁纸配置与桌面播放暂停。
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

        test("老配置缺字段回退纯黑，且其它设置不丢") {
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
            expectNil(decoded.inAppLockVideoPath, "缺字段表示纯黑屏")
            expectNil(decoded.resolvedInAppLockVideoURL, "纯黑屏没有可播放地址")
            expectNil(decoded.inAppLockVideoName, "纯黑屏没有显示名")
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectEqual(decoded.playbackOrder, .sequential, "其它字段应保留")
            expectEqual(decoded.lockScreenPreview, false, "其它字段应保留")
        }

        test("锁屏壁纸路径写坏了不影响其它字段") {
            // 手改配置把这一项写成数字：坏一个字段不能把整份配置打回默认。
            let broken = """
            { "intervalSeconds": 1500, "inAppLockVideoPath": 123 }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(broken.utf8))
            else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectNil(decoded.inAppLockVideoPath, "损坏的路径应回退到纯黑屏")
            expectEqual(decoded.intervalSeconds, 1500, "其它字段应保留")
        }

        test("锁屏壁纸路径往返并解析成 URL") {
            var preferences = Preferences()
            preferences.inAppLockVideoPath = "/Users/someone/Movies/lock.mp4"
            guard let data = try? JSONEncoder().encode(preferences),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返应能成功")
                return
            }
            expectEqual(
                decoded.inAppLockVideoPath,
                "/Users/someone/Movies/lock.mp4",
                "路径应原样读回"
            )
            expectEqual(
                decoded.resolvedInAppLockVideoURL?.path,
                "/Users/someone/Movies/lock.mp4",
                "应能解析成 URL"
            )
            expectEqual(decoded.inAppLockVideoName, "lock.mp4", "应能取出文件名给菜单用")
        }

        test("波浪号路径按用户主目录展开") {
            var preferences = Preferences()
            preferences.inAppLockVideoPath = "~/Movies/lock.mp4"
            expectEqual(
                preferences.resolvedInAppLockVideoURL?.path,
                NSHomeDirectory() + "/Movies/lock.mp4",
                "~ 应展开成主目录"
            )
        }

        test("空串与纯空白被清掉，不存在的路径保留") {
            var blank = Preferences()
            blank.inAppLockVideoPath = "   "
            expectNil(blank.sanitized().inAppLockVideoPath, "纯空白应被清掉")

            // **不存在的路径刻意保留**：外接盘拔掉时应当保留配置，插回来即可继续用；
            // 锁屏时加载失败会停在纯黑屏，不会回退当前桌面壁纸。
            var missing = Preferences()
            missing.inAppLockVideoPath = "/Volumes/NotMounted/lock.mp4"
            expectEqual(
                missing.sanitized().inAppLockVideoPath,
                "/Volumes/NotMounted/lock.mp4",
                "文件不存在不该被静态清洗掉"
            )
        }

        test("未配置时不写出该键") {
            let preferences = Preferences()
            guard let data = try? JSONEncoder().encode(preferences),
                  let json = String(data: data, encoding: .utf8) else {
                expect(false, "编码应成功")
                return
            }
            expect(!json.contains("\"inAppLockVideoPath\""), "nil 可选字段一律不写出")
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
