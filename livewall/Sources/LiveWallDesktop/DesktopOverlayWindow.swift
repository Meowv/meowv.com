import AppKit
import AVFoundation

/// 桌面层覆盖窗口 —— 整个方案的承重结构。
///
/// 关键属性说明（每一条都对应一个验收点）：
///  - `level`：必须落在「系统壁纸之上、桌面图标之下」的区间，否则要么看不见要么挡住图标。
///  - `collectionBehavior`：`.canJoinAllSpaces` 让窗口跟随所有 Space；`.stationary` 让它在
///    Mission Control / Exposé 中不参与移动；`.ignoresCycle` 让它不出现在 Cmd+` 循环里。
///  - `ignoresMouseEvents = true`：必须为真，否则桌面右键、框选、拖文件全部失效。
///  - `isOpaque = true`：不透明窗口合成更快；壁纸不需要透明。
public final class DesktopOverlayWindow: NSWindow {

    public private(set) var playerLayer: AVPlayerLayer?
    public let hostView: NSView

    public init(screen: NSScreen, level: Int) {
        hostView = NSView(frame: CGRect(origin: .zero, size: screen.frame.size))
        // 必须用指定初始化器；带 screen: 的那个是便利初始化器，子类不能直接调。
        // 指定初始化器的 contentRect 使用全局屏幕坐标，所以直接传 screen.frame 即可落到目标屏。
        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        self.level = NSWindow.Level(rawValue: level)
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        ignoresMouseEvents = true
        hasShadow = false
        isOpaque = true
        backgroundColor = .black
        isMovable = false
        isReleasedWhenClosed = false
        // 不让窗口出现在系统窗口菜单 / Cmd+Tab 里
        isExcludedFromWindowsMenu = true

        hostView.wantsLayer = true
        hostView.layer?.backgroundColor = NSColor.black.cgColor
        contentView = hostView

        // 窗口创建后立刻上屏，且不激活本 App
        orderFrontRegardless()
    }

    /// 把播放器挂到窗口上。重复调用会替换旧图层 —— 屏幕热插拔重建窗口后可以复用同一个 player。
    ///
    /// 多个窗口可以挂**同一个** player（镜像模式），此时只解一份；每屏独立模式下则各挂各的。
    public func attach(player: AVPlayer, gravity: AVLayerVideoGravity) {
        playerLayer?.removeFromSuperlayer()
        let layer = AVPlayerLayer(player: player)
        layer.videoGravity = gravity
        layer.frame = hostView.bounds
        layer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        hostView.layer?.addSublayer(layer)
        playerLayer = layer
    }

    /// 运行时改层级。改完必须重新 orderFrontRegardless，
    /// 否则窗口在 WindowServer 里的排序不会立即刷新。
    public func apply(level newLevel: Int) {
        level = NSWindow.Level(rawValue: newLevel)
        orderFrontRegardless()
    }
}
