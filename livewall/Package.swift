// swift-tools-version: 5.9
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
    platforms: [.macOS(.v13)],
    targets: [
        // 纯逻辑：不依赖 NSApplication，可单测
        .target(name: "LiveWallCore"),

        // 桌面层窗口与窗口层级探测：依赖 AppKit
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
