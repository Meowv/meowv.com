import Foundation
import LiveWallCore

func logRotationTests() {
    suite("LogRotation") {

        test("默认值") {
            let config = LogRotationConfig()
            expectEqual(config.maxFileSizeBytes, 2 * 1024 * 1024, "默认上限 2 MB（字节）")
            expectEqual(config.checkIntervalWrites, 64, "默认次数间隔 64 条")
            expectEqual(config.checkIntervalSeconds, 300, "默认时间间隔 300 秒")
        }

        test("检查间隔：次数与时间满足其一即检查") {
            let config = LogRotationConfig(checkIntervalWrites: 10, checkIntervalSeconds: 60)
            expect(config.shouldCheck(writesSinceCheck: 10, elapsedSeconds: 0), "次数达标应检查")
            expect(config.shouldCheck(writesSinceCheck: 0, elapsedSeconds: 60), "时间达标应检查")
            expect(!config.shouldCheck(writesSinceCheck: 9, elapsedSeconds: 59), "都没达标不应检查")
        }

        test("检查间隔：置 0 表示停用该条件") {
            let writesOnly = LogRotationConfig(checkIntervalWrites: 5, checkIntervalSeconds: 0)
            expect(!writesOnly.shouldCheck(writesSinceCheck: 4, elapsedSeconds: 9999), "时间条件停用后不应因时间触发")
            expect(writesOnly.shouldCheck(writesSinceCheck: 5, elapsedSeconds: 0), "次数条件仍有效")

            let timeOnly = LogRotationConfig(checkIntervalWrites: 0, checkIntervalSeconds: 60)
            expect(!timeOnly.shouldCheck(writesSinceCheck: 9999, elapsedSeconds: 59), "次数条件停用后不应因次数触发")
            expect(timeOnly.shouldCheck(writesSinceCheck: 0, elapsedSeconds: 60), "时间条件仍有效")
        }

        test("检查间隔：两个条件都为 0 时永不检查") {
            let config = LogRotationConfig(checkIntervalWrites: 0, checkIntervalSeconds: 0)
            expect(!config.shouldCheck(writesSinceCheck: 9999, elapsedSeconds: 9999), "两个条件都停用应永不检查")
        }

        test("轮转阈值：达到上限即轮转，边界含等号") {
            let config = LogRotationConfig(maxFileSizeBytes: 1000)
            expect(config.shouldRotate(fileSizeBytes: 1000), "正好等于上限应轮转")
            expect(config.shouldRotate(fileSizeBytes: 1001), "超过上限应轮转")
            expect(!config.shouldRotate(fileSizeBytes: 999), "差 1 字节不应轮转")
        }

        test("轮转阈值：上限为 0 表示不限制体积") {
            let config = LogRotationConfig(maxFileSizeBytes: 0)
            expect(!config.shouldRotate(fileSizeBytes: UInt64.max), "上限 0 时永不因体积轮转")
        }

        test("轮转说明写清了清理量与上限") {
            let text = LogRotationConfig.rotationNoticeText(
                clearedBytes: 2 * 1024 * 1024,
                limitBytes: 2 * 1024 * 1024
            )
            expect(text.contains("日志轮转"), "应标明这是轮转")
            expect(text.contains("2.0 MB"), "应带上可读的体积")
            expect(text.contains("不再保留"), "应说明旧内容不保留")
        }

        test("体积文本：按量级切换单位") {
            expectEqual(LogRotationConfig.byteCountText(0), "0 B", "零字节")
            expectEqual(LogRotationConfig.byteCountText(512), "512 B", "不足 1 KB 用字节")
            expectEqual(LogRotationConfig.byteCountText(2048), "2.0 KB", "KB 量级")
            expectEqual(LogRotationConfig.byteCountText(1536), "1.5 KB", "保留一位小数")
            expectEqual(LogRotationConfig.byteCountText(2 * 1024 * 1024), "2.0 MB", "MB 量级")
            // 差 1 字节到 MB 时仍按 KB 显示，且十分位走截断而非四舍五入
            expectEqual(LogRotationConfig.byteCountText(1024 * 1024 - 1), "1023.9 KB", "差 1 字节到 MB 仍按 KB 显示")
        }
    }
}
