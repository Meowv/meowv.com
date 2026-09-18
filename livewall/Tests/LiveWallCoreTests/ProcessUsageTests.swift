import Foundation
import LiveWallCore

func processUsageTests() {
    suite("ProcessUsage") {
        test("CPU 占用率是两次采样的增量之比") {
            let base = ProcessUsageSample(cpuNanos: 0, wallNanos: 0, memoryBytes: 0)
            let latest = ProcessUsageSample(cpuNanos: 1_000_000_000, wallNanos: 10_000_000_000, memoryBytes: 0)
            expectEqual(ProcessUsage.cpuPercent(from: base, to: latest), 10.0, "1 秒 CPU / 10 秒墙钟 = 10%")
        }

        test("墙钟没走或回退时返回 nil，不能退化成 0%") {
            let base = ProcessUsageSample(cpuNanos: 100, wallNanos: 500, memoryBytes: 0)
            let same = ProcessUsageSample(cpuNanos: 900, wallNanos: 500, memoryBytes: 0)
            let backwards = ProcessUsageSample(cpuNanos: 900, wallNanos: 400, memoryBytes: 0)
            expectNil(ProcessUsage.cpuPercent(from: base, to: same), "同一时刻算两次，占比没有定义")
            expectNil(ProcessUsage.cpuPercent(from: base, to: backwards), "墙钟回退（休眠唤醒）同理")
        }

        test("CPU 时间回退时按 0 算，不是负数") {
            let base = ProcessUsageSample(cpuNanos: 900, wallNanos: 100, memoryBytes: 0)
            let latest = ProcessUsageSample(cpuNanos: 100, wallNanos: 1_100, memoryBytes: 0)
            expectEqual(ProcessUsage.cpuPercent(from: base, to: latest), 0.0, "负的占用率只会让人以为算错了")
        }

        test("多核占用可以超过 100%，不夹到 100") {
            let base = ProcessUsageSample(cpuNanos: 0, wallNanos: 0, memoryBytes: 0)
            let latest = ProcessUsageSample(cpuNanos: 20_000_000_000, wallNanos: 10_000_000_000, memoryBytes: 0)
            expectEqual(ProcessUsage.cpuPercent(from: base, to: latest), 200.0, "两个核跑满就是 200%")
        }

        test("峰值取较大值") {
            expectEqual(ProcessUsage.peakBytes(100, 200), 200, "后来更高")
            expectEqual(ProcessUsage.peakBytes(200, 100), 200, "后来更低时保留峰值")
        }

        test("区间太短时算出的占用率是噪音，必须判为不可用") {
            // 实测：0.0005 秒的区间算出 134%。分子分母都极小，比值全是噪音，
            // 而「134%」看起来像一个真读数 —— 宁可不给，也不要给噪音。
            expect(
                ProcessUsage.isWindowUsable(ProcessUsage.minimumWindowSeconds),
                "恰好等于阈值算可用"
            )
            expect(
                !ProcessUsage.isWindowUsable(ProcessUsage.minimumWindowSeconds - 0.001),
                "低于阈值一律不可用"
            )
            expect(!ProcessUsage.isWindowUsable(0), "零区间")
            expect(!ProcessUsage.isWindowUsable(0.0005), "本 bug 的实测值")
            expect(!ProcessUsage.isWindowUsable(-1), "负区间")
            expect(!ProcessUsage.isWindowUsable(.nan), "非数不能当成可用")
            expect(ProcessUsage.isWindowUsable(3), "正常查看间隔可用")
        }
    }

    suite("ProcessUsageText") {
        test("字节文案：1024 进制，小数值保留一位") {
            expectEqual(ProcessUsageText.bytes(0), "0 B", "零")
            expectEqual(ProcessUsageText.bytes(1023), "1023 B", "不到 1 KB 就用 B")
            expectEqual(ProcessUsageText.bytes(1024), "1.0 KB", "刚到 1 KB")
            expectEqual(ProcessUsageText.bytes(8 * 1024 * 1024), "8.0 MB", "小于 10 保留一位")
            expectEqual(ProcessUsageText.bytes(128 * 1024 * 1024), "128 MB", "大于等于 10 取整")
            expectEqual(ProcessUsageText.bytes(1_610_612_736), "1.50 GB", "GB 固定两位")
        }

        test("占用率文案：拿不到显示破折号而不是 0%") {
            expectEqual(ProcessUsageText.percent(nil), "—", "nil 不是 0")
            expectEqual(ProcessUsageText.percent(2.34), "2.3%", "小数")
            expectEqual(ProcessUsageText.percent(42.6), "43%", "大数取整")
        }

        test("CPU 行必须带区间，否则会被读成瞬时值") {
            expectEqual(
                ProcessUsageText.cpuRow(percent: 2.34, windowSeconds: 180),
                "CPU 2.3%（近 3 分钟）",
                "两次查看之间"
            )
            expectEqual(
                ProcessUsageText.cpuRow(percent: 2.34, windowSeconds: 180, sinceLaunch: true),
                "CPU 2.3%（自启动 3 分钟）",
                "基线来自启动时"
            )
            expectEqual(
                ProcessUsageText.cpuRow(percent: 2.34, windowSeconds: nil),
                "CPU 2.3%",
                "没有区间就不编一个"
            )
            expectEqual(
                ProcessUsageText.cpuRow(percent: nil, windowSeconds: 180),
                "CPU —（近 3 分钟）",
                "区间有、占用率没有"
            )
        }

        test("内存行只在峰值更高时才显示峰值") {
            let current = UInt64(128 * 1024 * 1024)
            expectEqual(
                ProcessUsageText.memoryRow(bytes: current, peakBytes: current),
                "内存 128 MB",
                "刚启动时两者相等，没有额外信息"
            )
            expectEqual(
                ProcessUsageText.memoryRow(bytes: current, peakBytes: 210 * 1024 * 1024),
                "内存 128 MB（峰值 210 MB）",
                "曾经更高过"
            )
        }

        test("合并成一行：先内存后 CPU，两者的附加信息都保留") {
            let current = UInt64(128 * 1024 * 1024)
            expectEqual(
                ProcessUsageText.combinedRow(
                    percent: 2.34,
                    windowSeconds: 180,
                    bytes: current,
                    peakBytes: 210 * 1024 * 1024
                ),
                "内存 128 MB（峰值 210 MB） · CPU 2.3%（近 3 分钟）",
                "内存打头；峰值与区间都不能省"
            )
            expectEqual(
                ProcessUsageText.combinedRow(
                    percent: nil,
                    windowSeconds: nil,
                    bytes: current,
                    peakBytes: current
                ),
                "内存 128 MB · CPU —",
                "拿不到占用率时显示 —（不是 0%），没有区间就不编一个"
            )
            expectEqual(
                ProcessUsageText.combinedRow(
                    percent: 2.34,
                    windowSeconds: 180,
                    sinceLaunch: true,
                    bytes: current,
                    peakBytes: current
                ),
                "内存 128 MB · CPU 2.3%（自启动 3 分钟）",
                "自启动基线走同一个前缀"
            )
        }
    }
}
