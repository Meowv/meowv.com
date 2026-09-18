import Foundation
import LiveWallCore

func multiScreenPolicyTests() {
    suite("MultiScreenPolicy") {

        let dual = [
            ScreenIdentity(displayID: 1, index: 0),
            ScreenIdentity(displayID: 3, index: 1),
        ]

        test("槽位数：镜像与仅主屏都只要一个") {
            for policy in [MultiScreenPolicy.mirror, .mainScreenOnly] {
                expectEqual(policy.slotCount(screenCount: 1), 1, "\(policy.label) 单屏应 1 个槽位")
                expectEqual(policy.slotCount(screenCount: 2), 1, "\(policy.label) 双屏仍应 1 个槽位")
                expectEqual(policy.slotCount(screenCount: 5), 1, "\(policy.label) 多屏仍应 1 个槽位")
            }
        }

        test("槽位数：每屏独立等于屏幕数") {
            expectEqual(MultiScreenPolicy.perScreen.slotCount(screenCount: 0), 0, "无屏时 0 个")
            expectEqual(MultiScreenPolicy.perScreen.slotCount(screenCount: 1), 1, "单屏 1 个")
            expectEqual(MultiScreenPolicy.perScreen.slotCount(screenCount: 2), 2, "双屏 2 个")
            expectEqual(MultiScreenPolicy.perScreen.slotCount(screenCount: 5), 5, "五屏 5 个")
        }

        test("无屏幕时任何策略都不建槽位") {
            for policy in MultiScreenPolicy.allCases {
                expectEqual(policy.slotCount(screenCount: 0), 0, "\(policy.label) 无屏时应为 0")
                expect(policy.targetScreens(from: []).isEmpty, "\(policy.label) 无屏时不应有目标屏")
            }
        }

        test("目标屏：镜像与每屏独立覆盖全部屏幕") {
            for policy in [MultiScreenPolicy.mirror, .perScreen] {
                let targets = policy.targetScreens(from: dual)
                expectEqual(targets.count, 2, "\(policy.label) 应覆盖 2 块屏")
                expectEqual(targets, dual, "\(policy.label) 应保持原顺序")
            }
        }

        test("目标屏：仅主屏只取列表第一项，而不是 NSScreen.main") {
            // NSScreen.main 是「键盘焦点所在屏」，会随用户拖窗口漂移；
            // 主屏应当是 screens[0]（含菜单栏的那块）。这条测试锁住这个选择。
            let targets = MultiScreenPolicy.mainScreenOnly.targetScreens(from: dual)
            expectEqual(targets.count, 1, "仅主屏应只选 1 块")
            expectEqual(targets.first?.index, 0, "应选 index 0（主屏），而不是别的屏")
            expectEqual(targets.first?.displayID, 1, "应选主屏的 displayID")
        }

        test("目标屏：顺序变化时仍取第一项") {
            let reversed = [
                ScreenIdentity(displayID: 3, index: 0),
                ScreenIdentity(displayID: 1, index: 1),
            ]
            let targets = MultiScreenPolicy.mainScreenOnly.targetScreens(from: reversed)
            expectEqual(targets.first?.displayID, 3, "应跟随列表顺序取第一项")
        }

        test("实现状态：每屏独立尚未落地") {
            expect(!MultiScreenPolicy.perScreen.isImplemented, "perScreen 尚未实现，菜单不应列出")
            expect(MultiScreenPolicy.mirror.isImplemented, "镜像已实现")
            expect(MultiScreenPolicy.mainScreenOnly.isImplemented, "仅主屏已实现")
        }

        test("文案齐全：每种策略都有标签与代价说明") {
            for policy in MultiScreenPolicy.allCases {
                expect(!policy.label.isEmpty, "\(policy.rawValue) 缺少 label")
                expect(!policy.detail.isEmpty, "\(policy.rawValue) 缺少 detail")
                expect(policy.detail != policy.label, "\(policy.rawValue) 的 detail 应补充信息而非重复 label")
            }
        }

        test("Codable 往返") {
            let encoder = JSONEncoder()
            let decoder = JSONDecoder()
            for policy in MultiScreenPolicy.allCases {
                guard let data = try? encoder.encode(policy) else {
                    expect(false, "\(policy.rawValue) 编码失败")
                    continue
                }
                let decoded = try? decoder.decode(MultiScreenPolicy.self, from: data)
                expectEqual(decoded, policy, "\(policy.rawValue) 往返后应一致")
            }
        }

        test("未知字符串解码失败而不是静默取默认值") {
            // 由 Preferences 的容错解码负责回退；这里确认枚举本身不吞掉非法值
            let json = Data(#""notAPolicy""#.utf8)
            let decoded = try? JSONDecoder().decode(MultiScreenPolicy.self, from: json)
            expect(decoded == nil, "非法字符串不应解码成功")
        }
    }
}
