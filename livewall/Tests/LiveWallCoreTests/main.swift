import Foundation

// LiveWallCore 测试入口。
//
// 运行方式：`swift run LiveWallCoreTests`，或项目根目录的 `./test.sh`。
// 全部通过时退出码为 0，存在失败时为 1。
//
// 新增测试：在 Tests/LiveWallCoreTests/ 下建一个 `xxxTests()` 函数，
// 内部用 `suite { test { expect... } }` 组织，然后在下面调用它。

levelPresetTests()
textLayoutTests()
catalogTests()
categoryTests()
poolTests()
failurePolicyTests()
powerTests()
multiScreenPolicyTests()
logRotationTests()
screenSourceStoreTests()
preferencesCompatibilityTests()
lockScreenPreviewTests()
downloadNamingTests()
processUsageTests()
aboutMenuTests()

exit(TestRunner.shared.report())
