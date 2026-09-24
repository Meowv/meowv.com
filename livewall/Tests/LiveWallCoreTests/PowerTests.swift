import Foundation
import LiveWallCore

private let screen = CGRect(x: 0, y: 0, width: 1512, height: 982)

func powerTests() {
    suite("PlaybackStateResolver") {

        let resolver = PlaybackStateResolver()

        test("无任何信号时播放") {
            expectEqual(resolver.resolve(PlaybackSignals()), .playing, "空闲状态应播放")
        }

        test("用户手动暂停最优先，且不被其他信号撤销") {
            let everything = PlaybackSignals(
                userPaused: true,
                displaySleeping: true,
                sessionLocked: true,
                screenFullyCovered: true,
                thermalPressure: .critical,
                idleSeconds: 9999,
                lowPowerMode: true,
                onBattery: true
            )
            expectEqual(resolver.resolve(everything), .paused(.userRequested), "全部信号同时命中时仍是用户暂停")
        }

        test("锁屏优先于息屏与遮挡") {
            let signals = PlaybackSignals(displaySleeping: true, sessionLocked: true, screenFullyCovered: true)
            expectEqual(resolver.resolve(signals), .paused(.sessionLocked), "锁屏优先")
        }

        test("息屏优先于遮挡") {
            let signals = PlaybackSignals(displaySleeping: true, screenFullyCovered: true)
            expectEqual(resolver.resolve(signals), .paused(.displaySleeping), "息屏优先")
        }

        test("遮挡优先于热压力与空闲") {
            let signals = PlaybackSignals(screenFullyCovered: true, thermalPressure: .serious, idleSeconds: 9999)
            expectEqual(resolver.resolve(signals), .paused(.screenCovered), "遮挡优先")
        }

        test("热压力优先于空闲与低电量") {
            let signals = PlaybackSignals(thermalPressure: .critical, idleSeconds: 9999, lowPowerMode: true, onBattery: true)
            expectEqual(resolver.resolve(signals), .paused(.thermalPressure), "热压力优先")
        }

        test("空闲优先于低电量与电池") {
            let signals = PlaybackSignals(idleSeconds: 9999, lowPowerMode: true, onBattery: true)
            expectEqual(resolver.resolve(signals), .paused(.idle), "空闲优先")
        }

        test("低电量模式优先于电池供电") {
            let signals = PlaybackSignals(lowPowerMode: true, onBattery: true)
            expectEqual(resolver.resolve(signals), .paused(.lowPowerMode), "低电量模式优先")
        }

        test("热压力只有 serious / critical 才触发") {
            expectEqual(resolver.resolve(PlaybackSignals(thermalPressure: .nominal)), .playing, "nominal")
            expectEqual(resolver.resolve(PlaybackSignals(thermalPressure: .fair)), .playing, "fair 属正常波动")
            expectEqual(resolver.resolve(PlaybackSignals(thermalPressure: .serious)), .paused(.thermalPressure), "serious")
            expectEqual(resolver.resolve(PlaybackSignals(thermalPressure: .critical)), .paused(.thermalPressure), "critical")
        }

        test("空闲阈值边界") {
            let r = PlaybackStateResolver(idleThresholdSeconds: 90)
            expectEqual(r.resolve(PlaybackSignals(idleSeconds: 89.9)), .playing, "略低于阈值应继续播")
            expectEqual(r.resolve(PlaybackSignals(idleSeconds: 90)), .paused(.idle), "恰好等于阈值应暂停")
            expectEqual(r.resolve(PlaybackSignals(idleSeconds: 90.1)), .paused(.idle), "超过阈值应暂停")
        }

        test("休息期间只忽略空闲暂停，仍遵循其它省电信号") {
            let signals = PlaybackSignals(idleSeconds: 9999, resting: true)
            expectEqual(resolver.resolve(signals), .playing, "休息期间不因无操作暂停")
            expectEqual(
                resolver.resolve(PlaybackSignals(screenFullyCovered: true, idleSeconds: 9999, resting: true)),
                .paused(.screenCovered),
                "休息期间遮挡规则仍生效"
            )
            expectEqual(
                resolver.resolve(PlaybackSignals(userPaused: true, idleSeconds: 9999, resting: true)),
                .paused(.userRequested),
                "休息期间手动暂停仍生效"
            )
            expectEqual(
                resolver.resolve(PlaybackSignals(sessionLocked: true, idleSeconds: 9999, resting: true)),
                .paused(.sessionLocked),
                "休息期间锁屏规则仍生效"
            )
        }

        test("空闲阈值非正数时视为关闭检测") {
            // 防御配置写错：阈值为 0 不该让程序一启动就暂停
            let r = PlaybackStateResolver(pauseWhenIdle: true, idleThresholdSeconds: 0)
            expectEqual(r.resolve(PlaybackSignals(idleSeconds: 99999)), .playing, "阈值 0 应关闭检测")
            let negative = PlaybackStateResolver(pauseWhenIdle: true, idleThresholdSeconds: -5)
            expectEqual(negative.resolve(PlaybackSignals(idleSeconds: 99999)), .playing, "负阈值应关闭检测")
        }

        test("各开关关闭后对应信号不再触发暂停") {
            let off = PlaybackStateResolver(
                pauseWhenCovered: false,
                pauseWhenIdle: false,
                idleThresholdSeconds: 90,
                pauseOnLowPowerMode: false,
                pauseOnBattery: false,
                pauseOnThermalPressure: false
            )
            let signals = PlaybackSignals(
                screenFullyCovered: true,
                thermalPressure: .critical,
                idleSeconds: 9999,
                lowPowerMode: true,
                onBattery: true
            )
            expectEqual(off.resolve(signals), .playing, "全部关掉后应继续播放")
        }

        test("开关关闭不影响更高优先级的信号") {
            let noCovered = PlaybackStateResolver(pauseWhenCovered: false)
            expectEqual(
                noCovered.resolve(PlaybackSignals(displaySleeping: true, screenFullyCovered: true)),
                .paused(.displaySleeping),
                "关掉遮挡检测，息屏仍应暂停"
            )
            expectEqual(
                noCovered.resolve(PlaybackSignals(screenFullyCovered: true)),
                .playing,
                "关掉遮挡检测后单独遮挡不暂停"
            )
        }

        test("电池供电默认不暂停") {
            // 插拔电源就暂停会让画面频繁抖动，默认关闭
            expectEqual(PlaybackStateResolver().pauseOnBattery, false, "默认值")
            expectEqual(resolver.resolve(PlaybackSignals(onBattery: true)), .playing, "默认电池供电继续播")
            let onBatteryPauses = PlaybackStateResolver(pauseOnBattery: true)
            expectEqual(onBatteryPauses.resolve(PlaybackSignals(onBattery: true)), .paused(.onBattery), "开启后暂停")
        }

        test("穷举：返回的原因必须是命中信号里优先级最高的") {
            // 优先级顺序，从高到低
            let order: [PlaybackPauseReason] = [
                .userRequested, .sessionLocked, .displaySleeping,
                .screenCovered, .thermalPressure, .idle, .lowPowerMode, .onBattery,
            ]
            var seen = Set<PlaybackPauseReason>()
            for mask in 0..<(1 << 7) {
                let signals = PlaybackSignals(
                    userPaused: mask & 1 != 0,
                    displaySleeping: mask & 2 != 0,
                    sessionLocked: mask & 4 != 0,
                    screenFullyCovered: mask & 8 != 0,
                    thermalPressure: mask & 16 != 0 ? .critical : .nominal,
                    idleSeconds: mask & 32 != 0 ? 9999 : 0,
                    lowPowerMode: mask & 64 != 0,
                    onBattery: true
                )
                let expected = order.first { reason in
                    switch reason {
                    case .userRequested: return signals.userPaused
                    case .sessionLocked: return signals.sessionLocked
                    case .displaySleeping: return signals.displaySleeping
                    case .screenCovered: return signals.screenFullyCovered
                    case .thermalPressure: return signals.thermalPressure.isConstrained
                    case .idle: return signals.idleSeconds >= 90
                    case .lowPowerMode: return signals.lowPowerMode
                    case .onBattery: return false
                    }
                }
                let actual = resolver.resolve(signals).reason
                expectEqual(actual, expected, "mask=\(mask) 的原因应为 \(expected?.rawValue ?? "playing")")
                if let actual { seen.insert(actual) }
            }
            expect(seen.count >= 6, "穷举应覆盖到多数原因，实际命中 \(seen.count) 种")
        }

        test("由配置派生时开关与阈值一致") {
            var preferences = Preferences.default
            preferences.pauseWhenCovered = false
            preferences.idleThresholdSeconds = 120
            preferences.pauseOnBattery = true
            let derived = PlaybackStateResolver(preferences: preferences)
            expectEqual(derived.pauseWhenCovered, false, "遮挡开关")
            expectEqual(derived.idleThresholdSeconds, 120, "空闲阈值")
            expectEqual(derived.pauseOnBattery, true, "电池开关")
        }
    }

    suite("CoverageGrid") {

        test("单个全屏窗口算完全覆盖") {
            let full = CGRect(x: 0, y: 0, width: 1512, height: 982)
            expect(CoverageGrid.isFullyCovered(screen, by: [full]), "全屏窗口应判定为盖满")
            expectEqual(CoverageGrid.coverage(of: screen, by: [full]), 1.0, "覆盖率应为 1")
        }

        test("没有窗口时不算覆盖") {
            expect(!CoverageGrid.isFullyCovered(screen, by: []), "空列表不应判定为盖满")
            expectEqual(CoverageGrid.coverage(of: screen, by: []), 0, "覆盖率为 0")
        }

        test("两个各占 40% 的并排窗口不算盖满 —— 这正是旧实现的 bug") {
            // 旧实现把交集 union 后比较 bounding box 面积，两个窗口的 bbox 合起来就是整屏，
            // 于是明明看得见壁纸却被判定成「完全遮挡」而暂停。
            let left = CGRect(x: 0, y: 0, width: 600, height: 982)
            let right = CGRect(x: 912, y: 0, width: 600, height: 982)
            let rects = [left, right]

            expect(CoverageGrid.legacyBoundingBoxCovers(screen, by: rects),
                   "旧实现应（错误地）判定为盖满 —— 这条断言是换掉它的理由")
            expect(!CoverageGrid.isFullyCovered(screen, by: rects), "新实现应判定为未盖满")

            let ratio = CoverageGrid.coverage(of: screen, by: rects)
            // 精确值：1200 / 1512
            expect(abs(ratio - 0.79365) < 0.0005, "覆盖率应为精确的 1200/1512，实际 \(ratio)")
        }

        test("两个紧邻的半屏窗口确实盖满") {
            let left = CGRect(x: 0, y: 0, width: 756, height: 982)
            let right = CGRect(x: 756, y: 0, width: 756, height: 982)
            expect(CoverageGrid.isFullyCovered(screen, by: [left, right]), "左右各半且相邻应算盖满")
            expect(CoverageGrid.legacyBoundingBoxCovers(screen, by: [left, right]), "旧实现也应为真")
            expectEqual(CoverageGrid.coverage(of: screen, by: [left, right]), 1.0, "覆盖率应为 1")
        }

        test("三块拼满屏幕") {
            let rects = [
                CGRect(x: 0, y: 0, width: 504, height: 982),
                CGRect(x: 504, y: 0, width: 504, height: 982),
                CGRect(x: 1008, y: 0, width: 504, height: 982),
            ]
            expect(CoverageGrid.isFullyCovered(screen, by: rects), "三块拼满应算盖满")
        }

        test("20px 窄缝必须被检出 —— 网格采样会漏掉它") {
            // 这是换掉网格采样的直接原因：缝隙比一个网格（63px）还窄，
            // 没有任何采样点落进去，于是被报告成「覆盖 100%」。
            let rects = [
                CGRect(x: 0, y: 0, width: 746, height: 982),
                CGRect(x: 766, y: 0, width: 746, height: 982),
            ]
            expect(!CoverageGrid.isFullyCovered(screen, by: rects), "20px 缝隙不应算盖满")
            let ratio = CoverageGrid.coverage(of: screen, by: rects)
            // 精确值：(1512 - 20) / 1512
            expect(abs(ratio - 0.98677) < 0.0005, "覆盖率应为精确的 1492/1512，实际 \(ratio)")
        }

        test("1px 缝隙也能被检出") {
            let rects = [
                CGRect(x: 0, y: 0, width: 755, height: 982),
                CGRect(x: 756, y: 0, width: 756, height: 982),
            ]
            // 1px 缝隙 = 0.066% 未覆盖，在 0.5% 容错之内，所以仍算盖满
            expect(CoverageGrid.isFullyCovered(screen, by: rects), "1px 缝隙在容错范围内")
            // 但换成严格阈值就该被拒
            expect(!CoverageGrid.isFullyCovered(screen, by: rects, threshold: 0.9999), "严格阈值下 1px 缝隙应被拒")
        }

        test("超出屏幕范围的窗口按交集计算") {
            let oversized = CGRect(x: -500, y: -500, width: 3000, height: 3000)
            expect(CoverageGrid.isFullyCovered(screen, by: [oversized]), "远大于屏幕的窗口应算盖满")
            expectEqual(CoverageGrid.coverage(of: screen, by: [oversized]), 1.0, "覆盖率应为 1")
        }

        test("完全不重叠的窗口覆盖率是 0") {
            let elsewhere = CGRect(x: 5000, y: 5000, width: 100, height: 100)
            expectEqual(CoverageGrid.coverage(of: screen, by: [elsewhere]), 0, "屏幕外窗口覆盖率为 0")
            expect(!CoverageGrid.isFullyCovered(screen, by: [elsewhere]), "屏幕外窗口不算盖满")
        }

        test("零尺寸与非法输入不崩溃") {
            expect(!CoverageGrid.isFullyCovered(.zero, by: [CGRect(x: 0, y: 0, width: 10, height: 10)]), "零尺寸屏幕")
            expect(!CoverageGrid.isFullyCovered(.zero, by: []), "零尺寸屏幕且无窗口")
            let degenerate = CGRect(x: 0, y: 0, width: 0, height: 100)
            expectEqual(CoverageGrid.coverage(of: degenerate, by: []), 0, "零宽矩形")
            expectEqual(CoverageGrid.coverage(of: screen, by: [.zero]), 0, "零尺寸窗口")
        }

        test("阈值可调：降低阈值可让部分覆盖也算通过") {
            let rects = [
                CGRect(x: 0, y: 0, width: 600, height: 982),
                CGRect(x: 912, y: 0, width: 600, height: 982),
            ]
            expect(!CoverageGrid.isFullyCovered(screen, by: rects, threshold: 0.995), "0.995 阈值下不通过")
            expect(CoverageGrid.isFullyCovered(screen, by: rects, threshold: 0.75), "0.75 阈值下通过")
            expect(CoverageGrid.isFullyCovered(screen, by: rects, threshold: 0), "阈值 0 恒通过")
        }

        test("覆盖率随窗口增多单调不减") {
            let one = [CGRect(x: 0, y: 0, width: 400, height: 982)]
            let two = one + [CGRect(x: 400, y: 0, width: 400, height: 982)]
            let three = two + [CGRect(x: 800, y: 0, width: 400, height: 982)]
            let a = CoverageGrid.coverage(of: screen, by: one)
            let b = CoverageGrid.coverage(of: screen, by: two)
            let c = CoverageGrid.coverage(of: screen, by: three)
            expect(a <= b, "1 块 \(a) 应不大于 2 块 \(b)")
            expect(b <= c, "2 块 \(b) 应不大于 3 块 \(c)")
            expect(c < 1, "3 块 400px 仍未盖满 1512px")
        }

        test("重叠窗口不会重复计入面积") {
            // 两块完全重合的窗口覆盖率仍是 1，不会算成 2
            let a = CGRect(x: 0, y: 0, width: 1000, height: 982)
            let b = CGRect(x: 0, y: 0, width: 1000, height: 982)
            let ratio = CoverageGrid.coverage(of: screen, by: [a, b])
            expect(abs(ratio - 1000.0 / 1512.0) < 0.0005, "重叠不应重复计数，实际 \(ratio)")
        }

        test("半屏窗口的覆盖率恰好是 0.5") {
            let half = CGRect(x: 0, y: 0, width: 756, height: 982)
            expectEqual(CoverageGrid.coverage(of: screen, by: [half]), 0.5, "精确值应为 0.5")
        }

        test("只有横向部分覆盖时按面积算") {
            // 覆盖上半屏
            let top = CGRect(x: 0, y: 0, width: 1512, height: 491)
            let ratio = CoverageGrid.coverage(of: screen, by: [top])
            expect(abs(ratio - 0.5) < 0.001, "上半屏应约 0.5，实际 \(ratio)")
            expect(!CoverageGrid.isFullyCovered(screen, by: [top]), "只盖一半不算盖满")
        }
    }

    suite("Preferences 容错解码") {

        test("旧配置缺少新字段时用默认值补齐，不整体失败") {
            // 回归保护：Swift 合成的 Codable 缺字段会抛 keyNotFound，
            // 那样每加一个字段，用户已有的 config.json 就会被静默重置成默认值。
            let old = Data(#"{"gravity":"fit","intervalSeconds":60}"#.utf8)
            let decoded = try? JSONDecoder().decode(Preferences.self, from: old)

            expectNotNil(decoded, "缺字段不应导致解码失败")
            guard let decoded else { return }
            expectEqual(decoded.gravity, "fit", "已有字段应保留")
            expectEqual(decoded.intervalSeconds, 60, "已有字段应保留")
            expectEqual(decoded.pauseWhenCovered, Preferences.default.pauseWhenCovered, "缺失的省电字段用默认值")
            expectEqual(decoded.pauseOnBattery, false, "pauseOnBattery 默认 false")
            expectEqual(decoded.idleThresholdSeconds, 300, "空闲阈值默认 300（5 分钟）")
        }

        test("旧配置里已废弃的 catalogPath 被忽略，不影响解码") {
            // 本地清单已被移除，但用户手上的 config.json 可能还带着这个键。
            // JSONDecoder 会忽略未知键，绝不能因此整体解码失败。
            let old = Data(#"{"catalogPath":"~/Library/Application Support/com.meowv.livewall/catalog.json","intervalSeconds":60}"#.utf8)
            let decoded = try? JSONDecoder().decode(Preferences.self, from: old)

            expectNotNil(decoded, "未知键不应导致解码失败")
            expectEqual(decoded?.intervalSeconds, 60, "其它字段仍应保留")
        }

        test("默认清单地址指向线上索引 catalog.json") {
            // 数据源唯一来源就是线上这份 JSON。指向**索引**：它带分类清单与每个分类的
            // 切片文件名（`category.<id>.json`），条目按分类单独拉。
            expectEqual(
                Preferences.default.remoteCatalogURL,
                "https://studio.meowv.com/data/livewall/catalog.json",
                "默认远程地址"
            )
            expectEqual(
                Preferences.default.resolvedRemoteURL?.absoluteString,
                "https://studio.meowv.com/data/livewall/catalog.json",
                "默认地址应能解析成 URL"
            )
        }

        test("空对象解码为全默认") {
            let decoded = try? JSONDecoder().decode(Preferences.self, from: Data("{}".utf8))
            expectNotNil(decoded, "空对象应能解码")
            expectEqual(decoded?.intervalSeconds, Preferences.default.intervalSeconds, "空对象应得到默认间隔")
            expectEqual(decoded?.pauseWhenIdle, Preferences.default.pauseWhenIdle, "空对象应得到默认省电开关")
        }

        test("缺失的 playbackOrder 用默认值补齐") {
            let old = Data(#"{"intervalSeconds":60}"#.utf8)
            let decoded = try? JSONDecoder().decode(Preferences.self, from: old)
            expectEqual(decoded?.playbackOrder, .shuffle, "缺字段应退回随机")
            expectEqual(decoded?.playbackOrder, Preferences.default.playbackOrder, "与默认值一致")
        }

        test("枚举字段的值非法时退回默认，而不是让整份配置解码失败") {
            // 回归保护：`decodeIfPresent` 遇到「键在、值不是合法枚举成员」会抛
            // dataCorrupted。不包一层 try? 的话，手改配置写错一个词就会让
            // 整份 config.json 退回全默认 —— 用户所有设置静默清零。
            let broken = Data(#"""
            {
              "levelPreset": "desktopWindow2",
              "multiScreenPolicy": "mirrorX",
              "playbackOrder": "random",
              "intervalSeconds": 60,
              "pauseWhenCovered": false
            }
            """#.utf8)
            let decoded = try? JSONDecoder().decode(Preferences.self, from: broken)

            expectNotNil(decoded, "值非法不应导致解码失败")
            guard let decoded else { return }
            expectEqual(decoded.playbackOrder, Preferences.default.playbackOrder, "playbackOrder 退回默认")
            expectEqual(decoded.levelPreset, Preferences.default.levelPreset, "levelPreset 退回默认")
            expectEqual(decoded.multiScreenPolicy, Preferences.default.multiScreenPolicy, "multiScreenPolicy 退回默认")
            expectEqual(decoded.intervalSeconds, 60, "合法字段应保留")
            expectEqual(decoded.pauseWhenCovered, false, "合法字段应保留")
        }

        test("往返编解码保持字段一致") {
            var original = Preferences.default
            original.intervalSeconds = 123
            original.pauseWhenCovered = false
            original.pauseOnBattery = true
            original.idleThresholdSeconds = 45
            original.levelPreset = .iconMinus1
            original.playbackOrder = .sequential

            guard let data = try? JSONEncoder().encode(original),
                  let restored = try? JSONDecoder().decode(Preferences.self, from: data) else {
                expect(false, "往返编解码失败")
                return
            }
            expectEqual(restored, original, "往返后应完全一致")
            expectEqual(restored.playbackOrder, .sequential, "选片顺序应往返保留")
        }

        test("sanitized 修正非法值") {
            var broken = Preferences.default
            broken.intervalSeconds = -5
            broken.jitterRatio = 9
            broken.gravity = "weird"

            let fixed = broken.sanitized()

            expectEqual(fixed.intervalSeconds, SwitchInterval.minSeconds, "负间隔应夹到下限")
            expectEqual(fixed.jitterRatio, 1, "抖动应夹紧到 1")
            expectEqual(fixed.gravity, "fill", "非法 gravity 应回退 fill")
        }

        test("sanitized 把间隔夹进合法区间，而不是重置成默认") {
            // 手改配置的人多半只是「填得太短/太长」，夹到最近的合法值更接近本意。
            var tooShort = Preferences.default
            tooShort.intervalSeconds = 1
            expectEqual(tooShort.sanitized().intervalSeconds, SwitchInterval.minSeconds, "过短夹到下限")

            var tooLong = Preferences.default
            tooLong.intervalSeconds = 10_000_000
            expectEqual(tooLong.sanitized().intervalSeconds, SwitchInterval.maxSeconds, "过长夹到上限")

            var notANumber = Preferences.default
            notANumber.intervalSeconds = .nan
            expectEqual(
                notANumber.sanitized().intervalSeconds,
                SchedulePolicy.defaultIntervalSeconds,
                "非有限值夹不了，退回默认"
            )

            // 合法值一律原样保留 —— 预设之外的合法值（手填的）不能被抹掉
            var custom = Preferences.default
            custom.intervalSeconds = 45
            expectEqual(custom.sanitized().intervalSeconds, 45, "合法的手填值应保留")
        }

        test("间隔经过 sanitized 后一定落在区间内，且派生的策略不再走兜底分支") {
            for raw in [-100, 0, 5, 30, 300, 86_400, 999_999] as [Double] {
                var broken = Preferences.default
                broken.intervalSeconds = raw
                let fixed = broken.sanitized()
                let clamped = SwitchInterval.clamp(raw)
                expectEqual(fixed.intervalSeconds, clamped, "\(raw) 的夹紧结果")
                expect(
                    fixed.intervalSeconds >= SwitchInterval.minSeconds
                        && fixed.intervalSeconds <= SwitchInterval.maxSeconds,
                    "\(raw) → \(fixed.intervalSeconds) 应落在区间内"
                )
            }
        }

        test("由配置派生的省电策略与字段一致") {
            var preferences = Preferences.default
            preferences.pauseWhenCovered = false
            preferences.pauseWhenIdle = false
            preferences.idleThresholdSeconds = 200
            preferences.pauseOnBattery = true
            preferences.pauseOnThermalPressure = false

            let resolver = preferences.playbackStateResolver

            expectEqual(resolver.pauseWhenCovered, false, "遮挡开关")
            expectEqual(resolver.pauseWhenIdle, false, "空闲开关")
            expectEqual(resolver.idleThresholdSeconds, 200, "空闲阈值")
            expectEqual(resolver.pauseOnBattery, true, "电池开关")
            expectEqual(resolver.pauseOnThermalPressure, false, "热压力开关")
        }
    }

    suite("IdleThreshold") {

        test("预设升序且都是正数") {
            expectEqual(IdleThreshold.presets, [60, 300, 600, 1800], "预设应为 1/5/10/30 分钟")
            expect(IdleThreshold.presets.allSatisfy { $0 > 0 }, "预设必须为正")
            expect(
                zip(IdleThreshold.presets, IdleThreshold.presets.dropFirst()).allSatisfy { $0 < $1 },
                "预设必须严格升序 —— 菜单顺序直接取自它"
            )
        }

        test("默认空闲阈值必须是预设之一，否则菜单里没有任何一项被勾选") {
            expect(
                IdleThreshold.presets.contains(Preferences.default.idleThresholdSeconds),
                "默认值 \(Preferences.default.idleThresholdSeconds) 不在预设里"
            )
        }

        test("秒级文案") {
            expectEqual(IdleThreshold.label(1), "1 秒", "1 秒")
            expectEqual(IdleThreshold.label(45), "45 秒", "45 秒")
            expectEqual(IdleThreshold.label(59.6), "60 秒", "四舍五入后进位到 60 秒")
        }

        test("分钟级文案在整除时省略小数") {
            expectEqual(IdleThreshold.label(60), "1 分钟", "正好 1 分钟不带小数")
            expectEqual(IdleThreshold.label(300), "5 分钟", "正好 5 分钟不带小数")
            expectEqual(IdleThreshold.label(600), "10 分钟", "正好 10 分钟不带小数")
            expectEqual(IdleThreshold.label(1800), "30 分钟", "正好 30 分钟不带小数")
        }

        test("分钟级文案在不整除时保留一位小数") {
            expectEqual(IdleThreshold.label(90), "1.5 分钟", "90 秒应写成 1.5 分钟")
            expectEqual(IdleThreshold.label(150), "2.5 分钟", "150 秒应写成 2.5 分钟")
        }

        test("小时级文案") {
            expectEqual(IdleThreshold.label(3600), "1 小时", "1 小时")
            expectEqual(IdleThreshold.label(7200), "2 小时", "2 小时")
            expectEqual(IdleThreshold.label(5400), "1.5 小时", "1.5 小时")
        }

        test("非法输入显示为关闭而不是崩溃或 NaN") {
            expectEqual(IdleThreshold.label(0), "关闭", "0 表示关闭")
            expectEqual(IdleThreshold.label(-5), "关闭", "负数表示关闭")
            expectEqual(IdleThreshold.label(.infinity), "关闭", "无穷视为关闭")
            expectEqual(IdleThreshold.label(.nan), "关闭", "NaN 视为关闭")
        }

        test("文案不含小数点后的零（用户唯一能看到的解释）") {
            for seconds in IdleThreshold.presets {
                let text = IdleThreshold.label(seconds)
                expect(!text.contains(".0 "), "\(seconds) →「\(text)」不该出现 .0")
                expect(!text.contains("nan") && !text.contains("inf"), "\(seconds) →「\(text)」不该出现 nan/inf")
            }
        }
    }
}
