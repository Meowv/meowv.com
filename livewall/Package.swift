// swift-tools-version: 6.0
import PackageDescription

// 构建体系说明
//
// 为什么用 SwiftPM 而不是 `swiftc Sources/*.swift`：
//   1. 目录一多，glob 就不好使；
//   2. 纯逻辑需要能脱离 GUI/AVFoundation 单测 —— 早期曾因一个纯逻辑错误
//      （用 contains("wallpaper") 把第三方壁纸软件误判成系统壁纸）得出假阳性结论。
//
// 为什么测试用 executableTarget 而不是 testTarget：
//   本机只装了 Command Line Tools，**没有 Xcode**，因此 XCTest 与 Swift Testing
//   都不可用（`unable to resolve module dependency: 'XCTest'`）。
//   替代方案是自己写一个断言运行器，用 `swift run LiveWallCoreTests` 执行，
//   失败时以非零退出码结束。功能上够用，代价是没有 IDE 集成与测试筛选。
//
// 新增可执行产品时同步改 build.sh 的 --product 参数。

let package = Package(
    name: "LiveWall",
    platforms: [.macOS("26.0")],
    targets: [
        // 纯逻辑：不依赖 NSApplication，可单测
        .target(name: "LiveWallCore"),

        // 桌面层窗口与窗口层级探测：依赖 AppKit
        //
        // **为什么单独一个 target**（而不是并进 `LiveWall`）：它是「Core 可单测 /
        // Desktop 只碰 AppKit / App 只做编排」这条三层叙事里的一层，README 的目录结构与
        // `AGENTS.md` 都按它写。合并能少一个 target，但会让「哪些代码不该有 GUI 依赖」
        // 失去一个物理边界 —— 而那正是当初把 `CoverageGrid` 从 AppKit 里拆出来的理由。
        //
        // ⚠️ 它**不可单测**（测试 target 只依赖 `LiveWallCore`），所以需要断言的纯逻辑
        // 都已经搬回 Core。这里只留薄薄的 AppKit 包装。
        .target(name: "LiveWallDesktop", dependencies: ["LiveWallCore"]),

        // 正式 App
        .executableTarget(
            name: "LiveWall",
            dependencies: ["LiveWallCore", "LiveWallDesktop"]
        ),

        // 测试运行器（替代 XCTest）
        .executableTarget(
            name: "LiveWallCoreTests",
            dependencies: ["LiveWallCore"],
            path: "Tests/LiveWallCoreTests"
        ),
    ]
)
