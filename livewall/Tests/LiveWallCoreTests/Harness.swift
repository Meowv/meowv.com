import Foundation

// MARK: - 「测试专用」的生产 API 清单
//
// 下面这些符号**只在测试里有调用点**（生产路径不读它们）。它们不是死代码，
// 但此前每一处都单独写着「别当死代码删掉」—— 那种逐点打补丁的保护，
// 下一轮死代码审计还得重新判一遍。集中登记在这里，扫描时整份跳过。
//
// | 符号 | 为什么留着 |
// | --- | --- |
// | `LevelPreset.LevelBand` | 拿本机真实的 `CGWindowLevelForKey` 校验「各预设确实落在有效区间内」这个前提 |
// | `CoverageGrid.coverage(of:by:)` | 精确覆盖率。删掉它，「左右各占 40% 的两个窗口覆盖率是 0.8 而不是 1.0」只能退化成布尔判定 |
// | `CoverageGrid.legacyBoundingBoxCovers` | 旧实现的等价物 —— 「为什么必须换掉 bbox 判定」的可执行证据 |
// | `MultiScreenPolicy.slotCount(screenCount:)` | 未加上限的理论槽位数，作为 `slotPlan(from:)` 的对照 |
// | `CandidatePool.blacklistResetCount` | 黑名单自动重置次数（生产只写不读），用于断言「全失效时确实重试了一轮」 |
// | `ThumbnailRequestTracker` 的查询属性（`inFlightCount` / `pendingCount` / `failedCount` / `isInFlight` / `isPending`） | 并发与去重状态机的可观测面 |
//
// ⚠️ `ThumbnailRequestTracker.resetFailures` **不在此列** —— 它已经接进了生产
// （`ThumbnailLoader.retryFailed()` ← 浏览窗口的「重试」按钮）。
//
// 新增同类符号时**加一行到这里**，不要再在符号旁边写第二遍说明。

/// 极简测试运行器。
///
/// 为什么不用 XCTest：本机只装了 Command Line Tools，没有 Xcode，
/// XCTest 与 Swift Testing 都不可用（`unable to resolve module dependency: 'XCTest'`）。
/// 这个运行器只依赖 Foundation，功能上够用；代价是没有 IDE 集成、没有测试筛选与并行。
///
/// `@unchecked Sendable` 是显式断言：测试**串行执行**（`main.swift` 里逐个调用），
/// 全部状态只被主线程读写。标它是为了让 `swift-tools-version` 升到 6.0 时
/// `static let shared` 不再被 Swift 6 语言模式报错。
///
/// 用法（写在 `main.swift` 里）：
/// ```swift
/// suite("CandidatePool") {
///     test("一轮内不重复") {
///         expectEqual(Set(picked).count, picked.count, "出现重复")
///     }
/// }
/// exit(TestRunner.shared.report())
/// ```
final class TestRunner: @unchecked Sendable {
    static let shared = TestRunner()

    private var suites: [String] = []
    private var currentSuite = ""
    private var currentTest = ""
    private var failureRecords: [String] = []
    private(set) var passedCount = 0
    private(set) var failedCount = 0
    private(set) var assertionCount = 0

    private init() {}

    func beginSuite(_ name: String) {
        suites.append(name)
        currentSuite = name
        currentTest = ""
        print("\n▸ \(name)")
    }

    func beginTest(_ name: String) {
        currentTest = name
    }

    func record(_ condition: Bool, _ label: String, file: StaticString, line: UInt) {
        assertionCount += 1
        if condition {
            passedCount += 1
            print("    ✓ \(label)")
        } else {
            failedCount += 1
            let location = "\(URL(fileURLWithPath: "\(file)").lastPathComponent):\(line)"
            let record = "[\(currentSuite) > \(currentTest)] \(label)  (\(location))"
            failureRecords.append(record)
            print("    ✗ \(label)  ← \(location)")
        }
    }

    func report() -> Int32 {
        print("\n" + String(repeating: "─", count: 60))
        print("断言 \(assertionCount) 项：通过 \(passedCount)，失败 \(failedCount)")
        if !failureRecords.isEmpty {
            print("\n失败明细：")
            for record in failureRecords { print("  ✗ \(record)") }
        }
        print(failedCount == 0 ? "结果：全部通过 ✅" : "结果：存在失败 ❌")
        print(String(repeating: "─", count: 60))
        return failedCount == 0 ? 0 : 1
    }
}

// MARK: - 顶层便捷函数

func suite(_ name: String, _ body: () -> Void) {
    TestRunner.shared.beginSuite(name)
    body()
}

func test(_ name: String, _ body: () -> Void) {
    TestRunner.shared.beginTest(name)
    body()
}

func expect(_ condition: Bool, _ label: String, file: StaticString = #file, line: UInt = #line) {
    TestRunner.shared.record(condition, label, file: file, line: line)
}

func expectEqual<T: Equatable>(_ actual: T, _ expected: T, _ label: String, file: StaticString = #file, line: UInt = #line) {
    if actual == expected {
        TestRunner.shared.record(true, label, file: file, line: line)
    } else {
        TestRunner.shared.record(false, "\(label) —— 期望 \(expected)，实际 \(actual)", file: file, line: line)
    }
}

func expectNil<T>(_ value: T?, _ label: String, file: StaticString = #file, line: UInt = #line) {
    expect(value == nil, label, file: file, line: line)
}

func expectNotNil<T>(_ value: T?, _ label: String, file: StaticString = #file, line: UInt = #line) {
    expect(value != nil, label, file: file, line: line)
}

func expectThrows(_ label: String, file: StaticString = #file, line: UInt = #line, _ body: () throws -> Void) {
    do {
        try body()
        TestRunner.shared.record(false, "\(label) —— 预期抛错但没有", file: file, line: line)
    } catch {
        TestRunner.shared.record(true, label, file: file, line: line)
    }
}
