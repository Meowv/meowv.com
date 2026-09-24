import Foundation
import LiveWallCore

func restReminderTests() {
    suite("RestReminderPolicy") {

        test("间隔与时长预设按约定排列") {
            expectEqual(
                RestReminderInterval.presets,
                [1_800, 3_600, 7_200, 14_400],
                "间隔预设"
            )
            expectEqual(
                RestReminderDuration.presets,
                [60, 120, 180, 300, 600],
                "时长预设"
            )
            expectEqual(RestReminderInterval.label(3_600), "1 小时", "1 小时文案")
            expectEqual(RestReminderDuration.label(180), "3 分钟", "3 分钟文案")
            expectEqual(RestReminderClock.inactivityTimeoutSeconds, 300, "连续无输入 5 分钟后暂停累计")
        }

        test("非法和越界值被夹到合法范围") {
            expectEqual(RestReminderInterval.clamp(10), 1_800, "间隔下限")
            expectEqual(RestReminderInterval.clamp(100_000), 86_400, "间隔上限")
            expectEqual(RestReminderInterval.clamp(.infinity), 3_600, "非法间隔回默认")
            expectEqual(RestReminderDuration.clamp(0), 60, "时长下限")
            expectEqual(RestReminderDuration.clamp(9_999), 3_600, "时长上限")
            expectEqual(RestReminderDuration.clamp(.nan), 60, "非法时长回默认")
        }
    }

    suite("RestReminderClock") {

        test("只累计允许的活跃时间") {
            var clock = RestReminderClock()
            expect(
                !clock.advance(
                    by: 900,
                    intervalSeconds: 1_800,
                    enabled: true,
                    canAccumulate: true
                ),
                "未到间隔时不触发"
            )
            expectEqual(clock.accumulatedSeconds, 900, "累计活跃时间")
            expect(
                !clock.advance(
                    by: 100,
                    intervalSeconds: 1_800,
                    enabled: true,
                    canAccumulate: false
                ),
                "暂停条件下不累计"
            )
            expectEqual(clock.accumulatedSeconds, 900, "暂停后累计值不变")
        }

        test("到期只产生一次待触发状态") {
            var clock = RestReminderClock()
            expect(
                clock.advance(
                    by: 1_800,
                    intervalSeconds: 1_800,
                    enabled: true,
                    canAccumulate: true
                ),
                "达到间隔应触发"
            )
            expect(clock.isDue, "应保留待触发状态")
            expect(
                !clock.advance(
                    by: 100,
                    intervalSeconds: 1_800,
                    enabled: true,
                    canAccumulate: true
                ),
                "待处理期间不重复触发"
            )
            expectEqual(clock.accumulatedSeconds, 1_800, "到期后累计值封顶")
        }

        test("开始休息和关闭提醒都会重置") {
            var clock = RestReminderClock(accumulatedSeconds: 1_000, isDue: true)
            clock.markRestStarted()
            expectEqual(clock.accumulatedSeconds, 0, "开始休息后清零")
            expect(!clock.isDue, "开始休息后清除待触发")
            _ = clock.advance(
                by: 10,
                intervalSeconds: 1_800,
                enabled: true,
                canAccumulate: true
            )
            clock.reset()
            expectEqual(clock.accumulatedSeconds, 0, "关闭提醒后清零")
            expect(!clock.isDue, "关闭提醒后不再待触发")
        }
    }

    suite("RestReminderPreferences") {

        test("老配置缺少新字段时保持默认且提醒关闭") {
            let legacy = """
            {
              "intervalSeconds": 900,
              "playbackOrder": "sequential"
            }
            """
            guard let preferences = try? JSONDecoder().decode(
                Preferences.self,
                from: Data(legacy.utf8)
            ) else {
                expect(false, "老配置应能解码")
                return
            }
            expect(!preferences.restReminderEnabled, "老配置不应自动开启提醒")
            expectEqual(
                preferences.restIntervalSeconds,
                RestReminderInterval.defaultSeconds,
                "缺少间隔时使用默认值"
            )
            expectEqual(
                preferences.restDurationSeconds,
                RestReminderDuration.defaultSeconds,
                "缺少时长时使用默认值"
            )
            expectEqual(preferences.intervalSeconds, 900, "旧字段不丢失")
        }

        test("新字段往返编码并清洗越界值") {
            var preferences = Preferences()
            preferences.restReminderEnabled = true
            preferences.restIntervalSeconds = 100
            preferences.restDurationSeconds = 10_000
            let sanitized = preferences.sanitized()
            expect(sanitized.restReminderEnabled, "开关应保留")
            expectEqual(sanitized.restIntervalSeconds, 1_800, "间隔应清洗")
            expectEqual(sanitized.restDurationSeconds, 3_600, "时长应清洗")

            guard let data = try? JSONEncoder().encode(sanitized),
                  let decoded = try? JSONDecoder().decode(Preferences.self, from: data)
            else {
                expect(false, "新字段应能往返")
                return
            }
            expect(decoded.restReminderEnabled, "开关往返")
            expectEqual(decoded.restIntervalSeconds, 1_800, "间隔往返")
            expectEqual(decoded.restDurationSeconds, 3_600, "时长往返")
        }
    }
}
