import Foundation
import LiveWallCore

/// 配置加字段时的向后兼容。
///
/// 这组测试的存在意义：`Preferences` 的合成 `Codable` 在缺字段时会抛 `keyNotFound`
/// 而不是回退默认值，那样每加一个字段，用户已有的 config.json 就会整体解码失败、
/// 退回全默认 —— **静默丢掉所有设置**。所以新增字段必须在这里补一条。
func preferencesCompatibilityTests() {
    suite("Preferences 向后兼容") {

        test("老配置（没有 perScreenSources）仍能解码，且其它设置不丢") {
            let legacy = """
            {
              "intervalSeconds": 600,
              "jitterRatio": 0.25,
              "switchWhenFinished": true,
              "playbackOrder": "sequential",
              "gravity": "fit",
              "levelPreset": "desktopWindow",
              "multiScreenPolicy": "mirror",
              "authorFilter": ["作者A"]
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(legacy.utf8)) else {
                expect(false, "老配置应当能解码")
                return
            }
            expectEqual(decoded.intervalSeconds, 600, "老配置里的间隔应保留")
            expectEqual(decoded.playbackOrder, .sequential, "老配置里的选片顺序应保留")
            expectEqual(decoded.gravity, "fit", "老配置里的缩放应保留")
            expectEqual(decoded.multiScreenPolicy, .mirror, "老配置里的多屏策略应保留")
            expectEqual(decoded.authorFilter, ["作者A"], "老配置里的作者过滤应保留")
            expectEqual(decoded.perScreenSources, ScreenSourceStore.empty, "缺字段应回退到空表")
        }

        test("perScreenSources 存在时按原样读回") {
            let json = """
            {
              "multiScreenPolicy": "perScreen",
              "perScreenSources": {"sources": {"1": 42, "2": 43}}
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "新配置应当能解码")
                return
            }
            expectEqual(decoded.multiScreenPolicy, .perScreen, "策略应为每屏独立")
            expectEqual(decoded.perScreenSources.itemID(for: 1), 42, "第 1 块屏的源应读回")
            expectEqual(decoded.perScreenSources.itemID(for: 2), 43, "第 2 块屏的源应读回")
        }

        test("perScreenSources 写坏了不影响其它字段") {
            // 手改配置把这一项写成了别的类型。逐字段容错的意义就是：
            // 坏一个字段不能把整份配置打回默认。
            let json = """
            {
              "intervalSeconds": 900,
              "perScreenSources": "not an object"
            }
            """
            guard let decoded = try? JSONDecoder().decode(Preferences.self, from: Data(json.utf8)) else {
                expect(false, "字段损坏时整体解码仍应成功")
                return
            }
            expectEqual(decoded.intervalSeconds, 900, "其它字段应保留")
            expectEqual(decoded.perScreenSources, ScreenSourceStore.empty, "损坏的字段应回退到空表")
        }
    }
}
