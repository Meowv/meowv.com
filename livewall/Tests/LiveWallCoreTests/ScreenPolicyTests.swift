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

        test("槽位分组：镜像与仅主屏都只有一组") {
            for policy in [MultiScreenPolicy.mirror, .mainScreenOnly] {
                let plan = policy.slotPlan(from: dual)
                expectEqual(plan.slotCount, 1, "\(policy.label) 应只有 1 个槽位")
            }
            let mirrored = MultiScreenPolicy.mirror.slotPlan(from: dual)
            expectEqual(mirrored.screenCount(inSlot: 0), 2, "镜像槽位应覆盖 2 块屏")
            expect(mirrored.hasSharedSlot, "镜像存在共用解码的槽位")
            let mainOnly = MultiScreenPolicy.mainScreenOnly.slotPlan(from: dual)
            expectEqual(mainOnly.screenCount(inSlot: 0), 1, "仅主屏只覆盖 1 块屏")
            expect(!mainOnly.hasSharedSlot, "仅主屏不存在共用槽位")
        }

        test("槽位分组：每屏独立一屏一组") {
            let plan = MultiScreenPolicy.perScreen.slotPlan(from: dual)
            expectEqual(plan.slotCount, 2, "双屏应 2 组")
            expect(!plan.hasSharedSlot, "未超上限时不应有共用槽位")
        }

        test("槽位分组：超过上限时超出的屏并进最后一组") {
            let many = (0..<5).map { ScreenIdentity(displayID: UInt32($0 + 1), index: $0) }
            let plan = MultiScreenPolicy.perScreen.slotPlan(from: many)
            let limit = MultiScreenPolicy.maxIndependentScreens
            expectEqual(plan.slotCount, limit, "槽位数应被上限夹住")
            expectEqual(
                plan.screenCount(inSlot: limit - 1),
                many.count - (limit - 1),
                "超出的屏应并进最后一组"
            )
            expect(plan.hasSharedSlot, "超出上限后应出现共用槽位")
            // 主屏必须独占一路：被并进共用组的话，「主屏」这个概念就没了
            expectEqual(plan.screenCount(inSlot: 0), 1, "主屏所在组应独占一路解码")
        }

        test("槽位分组：无屏幕时不分组") {
            for policy in MultiScreenPolicy.allCases {
                expectEqual(policy.slotPlan(from: []).slotCount, 0, "\(policy.label) 无屏时应为 0 组")
            }
        }

        test("槽位分组：单屏时任何策略都只有一组") {
            let single = [ScreenIdentity(displayID: 1, index: 0)]
            for policy in MultiScreenPolicy.allCases {
                expectEqual(policy.slotPlan(from: single).slotCount, 1, "\(policy.label) 单屏应 1 组")
            }
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
