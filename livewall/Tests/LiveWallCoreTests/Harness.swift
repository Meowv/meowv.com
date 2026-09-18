import Foundation

/// 极简测试运行器。
///
/// 为什么不用 XCTest：本机只装了 Command Line Tools，没有 Xcode，
/// XCTest 与 Swift Testing 都不可用（`unable to resolve module dependency: 'XCTest'`）。
/// 这个运行器只依赖 Foundation，功能上够用；代价是没有 IDE 集成、没有测试筛选与并行。
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
final class TestRunner {
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
