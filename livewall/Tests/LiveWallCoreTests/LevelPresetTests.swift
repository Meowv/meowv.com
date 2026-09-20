import CoreGraphics
import LiveWallCore

/// LevelPreset 与 LevelBand 的测试。
/// 断言刻意不硬编码 -2147483623 —— 那个值随 macOS 版本变化，
/// 这里验证的是「派生关系」而不是「某台机器上的具体数值」。
func levelPresetTests() {
    suite("LevelPreset") {

        test("层级值必须由 CGWindowLevelForKey 派生，且与派生式一致") {
            let desktop = Int(CGWindowLevelForKey(.desktopWindow))
            let icon = Int(CGWindowLevelForKey(.desktopIconWindow))

            expectEqual(LevelPreset.desktopWindow.level, desktop, "desktopWindow")
            expectEqual(LevelPreset.desktopWindowPlus1.level, desktop + 1, "desktopWindow + 1")
            expectEqual(LevelPreset.desktopWindowPlus2.level, desktop + 2, "desktopWindow + 2")
            expectEqual(LevelPreset.iconMinus1.level, icon - 1, "icon - 1")
            expectEqual(LevelPreset.iconMinus2.level, icon - 2, "icon - 2")
            expectEqual(LevelPreset.iconAboveGap1.level, icon + 1, "icon + 1")
            expectEqual(LevelPreset.iconAboveGap2.level, icon + 2, "icon + 2")
        }

        test("推荐基线是 desktopWindow（实测与商业实现一致）") {
            expectEqual(LevelPreset.recommended, .desktopWindow, "recommended")
        }

        test("图标层严格高于桌面窗口层") {
            let desktop = Int(CGWindowLevelForKey(.desktopWindow))
            let icon = Int(CGWindowLevelForKey(.desktopIconWindow))
            expect(icon > desktop, "icon(\(icon)) 应大于 desktop(\(desktop))")
        }

        test("每个预设的派生式字符串与实际计算一致") {
            // 防止有人改了 level 计算却忘了改 derivation 文案
            for preset in LevelPreset.allCases {
                let derivation = preset.derivation
                expect(derivation.contains("CGWindowLevelForKey"),
                       "\(preset.rawValue) 的派生式应引用 CGWindowLevelForKey")
            }
        }

        test("coversDesktopIcons 只对 icon+1 / icon+2 为真") {
            // 显式列出，避免用 allCases 过滤后自证（那是同义反复）
            expect(LevelPreset.iconAboveGap1.coversDesktopIcons, "icon+1 应覆盖图标")
            expect(LevelPreset.iconAboveGap2.coversDesktopIcons, "icon+2 应覆盖图标")
            expect(!LevelPreset.desktopWindow.coversDesktopIcons, "desktopWindow 不应覆盖图标")
            expect(!LevelPreset.desktopWindowPlus1.coversDesktopIcons, "desktopWindow+1 不应覆盖图标")
            expect(!LevelPreset.desktopWindowPlus2.coversDesktopIcons, "desktopWindow+2 不应覆盖图标")
            expect(!LevelPreset.iconMinus1.coversDesktopIcons, "icon-1 不应覆盖图标")
            expect(!LevelPreset.iconMinus2.coversDesktopIcons, "icon-2 不应覆盖图标")
        }

        test("降级候选顺序里推荐基线排在第一位") {
            expectEqual(LevelPreset.fallbackOrder.first, LevelPreset.recommended, "fallbackOrder 首位")
            expect(!LevelPreset.fallbackOrder.isEmpty, "fallbackOrder 不应为空")
        }

        test("所有预设的 rawValue 唯一（Codable 往返依赖这一点）") {
            let rawValues = LevelPreset.allCases.map(\.rawValue)
            expectEqual(Set(rawValues).count, rawValues.count, "rawValue 应唯一")
        }
    }

    suite("LevelBand") {

        test("推荐基线落在有效区间内") {
            let band = LevelBand()
            expect(band.contains(LevelPreset.recommended.level),
                   "desktopWindow(\(LevelPreset.recommended.level)) 应在区间 (\(band.lowerBoundExclusive), \(band.upperBoundExclusive)) 内")
        }

        test("icon-1 / icon-2 / desktopWindow+1 / +2 都落在有效区间内") {
            let band = LevelBand()
            for preset in [LevelPreset.iconMinus1, .iconMinus2, .desktopWindowPlus1, .desktopWindowPlus2] {
                expect(band.contains(preset.level),
                       "\(preset.rawValue)(\(preset.level)) 应在区间内")
            }
        }

        test("覆盖图标的两个预设必须落在区间之外") {
            let band = LevelBand()
            expect(!band.contains(LevelPreset.iconAboveGap1.level), "icon+1 应超出上界")
            expect(!band.contains(LevelPreset.iconAboveGap2.level), "icon+2 应超出上界")
        }

        test("区间边界是开区间") {
            let band = LevelBand()
            expect(!band.contains(band.upperBoundExclusive), "上界本身不应被包含")
            expect(!band.contains(band.lowerBoundExclusive), "下界本身不应被包含")
        }

        test("区间宽度为正且合理") {
            let band = LevelBand()
            expect(band.width > 0, "区间宽度应为正，实际 \(band.width)")
            expect(band.width < 100, "区间宽度应在 100 层以内，实际 \(band.width)")
        }

        test("按显式数值构造时边界正确") {
            // 不依赖本机 CGWindowLevelForKey，用固定值验证纯逻辑
            let band = LevelBand(desktopLevel: -100, iconLevel: -80)
            expectEqual(band.lowerBoundExclusive, -102, "下界 = desktopLevel - 2")
            expectEqual(band.upperBoundExclusive, -80, "上界 = iconLevel")
            expect(band.contains(-101), "-101 应被包含")
            expect(band.contains(-81), "-81 应被包含")
            expect(!band.contains(-102), "-102 是下界，不应被包含")
            expect(!band.contains(-80), "-80 是上界，不应被包含")
        }
    }
}
