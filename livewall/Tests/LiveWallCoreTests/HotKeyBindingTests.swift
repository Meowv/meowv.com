import Foundation
import LiveWallCore

func hotKeyBindingTests() {
    suite("快捷键配置") {
        let original = HotKeyBinding(
            key: "P", modifiers: HotKeyBinding.command | HotKeyBinding.option
        )
        test("字母数字与修饰键展示") {
            expect(original.isValid, "默认组合合法")
            expectEqual(original.display, "⌥⌘P", "展示默认顺序")
            let custom = HotKeyBinding(
                key: "7",
                modifiers: HotKeyBinding.control | HotKeyBinding.shift | HotKeyBinding.command
            )
            expect(custom.isValid, "允许数字和多个修饰键")
            expectEqual(custom.display, "⌃⇧⌘7", "展示录入组合")
        }
        test("两键组合可注册并持久化") {
            let command = HotKeyBinding(key: "P", modifiers: HotKeyBinding.command)
            let control = HotKeyBinding(key: "7", modifiers: HotKeyBinding.control)
            expect(command.isValid, "⌘ 加字母合法")
            expect(control.isValid, "⌃ 加数字合法")
            expectEqual(command.display, "⌘P", "菜单展示两键组合")
            expectEqual(control.display, "⌃7", "菜单展示数字组合")
            let preferences = Preferences(hotKeyOverrides: ["togglePause": command, "nextItem": control])
            let data = try? JSONEncoder().encode(preferences)
            let decoded = data.flatMap { try? JSONDecoder().decode(Preferences.self, from: $0) }
            expectEqual(decoded?.hotKeyOverrides, preferences.hotKeyOverrides, "两键组合往返保存")
        }
        test("非法按键和弱修饰组合不能注册") {
            for binding in [
                HotKeyBinding(key: "p", modifiers: 3),
                HotKeyBinding(key: "F1", modifiers: 3),
                HotKeyBinding(key: "P", modifiers: 0),
                HotKeyBinding(key: "P", modifiers: HotKeyBinding.shift),
                HotKeyBinding(key: "P", modifiers: HotKeyBinding.option),
                HotKeyBinding(key: "P", modifiers: HotKeyBinding.option | HotKeyBinding.shift),
                HotKeyBinding(key: "P", modifiers: 255),
            ] {
                expect(!binding.isValid, "拒绝无效组合 \(binding.key) \(binding.modifiers)")
            }
        }
        test("旧配置及单项损坏均保留其它设置") {
            let legacy = try? JSONDecoder().decode(
                Preferences.self, from: Data("{\"intervalSeconds\":900}".utf8)
            )
            expectEqual(legacy?.hotKeyOverrides, [:], "旧配置按默认组合")
            let json = """
            {
              "intervalSeconds": 900,
              "hotKeyOverrides": {
                "togglePause": {"key":"P","modifiers":3},
                "nextItem": {"key":9,"modifiers":3},
                "reloadCatalog": {"key":"r","modifiers":3}
              }
            }
            """
            let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
            expectEqual(decoded?.intervalSeconds, 900, "损坏的快捷键不丢其它设置")
            expectEqual(decoded?.hotKeyOverrides, ["togglePause": original], "只保留合法条目")
        }
        test("覆盖配置编码往返和清洗") {
            let preferences = Preferences(
                hotKeyOverrides: ["togglePause": original]
            )
            let data = try? JSONEncoder().encode(preferences)
            let decoded = data.flatMap { try? JSONDecoder().decode(Preferences.self, from: $0) }
            expectEqual(decoded?.hotKeyOverrides, preferences.hotKeyOverrides, "自定义组合可恢复")

            let invalid = Preferences(hotKeyOverrides: [
                "togglePause": HotKeyBinding(key: "?", modifiers: 3)
            ])
            expectEqual(invalid.sanitized().hotKeyOverrides, [:], "手工写坏的组合被清洗")
        }
    }
}
