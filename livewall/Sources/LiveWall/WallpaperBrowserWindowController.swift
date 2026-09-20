import AppKit

/// 动态壁纸浏览窗口的持有者。
///
/// 这是本项目**第一个普通 UI 窗口** —— 此前刻意不做 App 内窗口（见 `AGENTS.md`）。
/// 三条约定：
///
/// 1. **单窗口复用**：`AppDelegate` 只持有一个 controller，已存在就 `present()` 前置，
///    不重复开；
/// 2. **`.accessory` 下激活**：先 `makeKeyAndOrderFront` 再 `NSApp.activate`，
///    顺序反了窗口会开在别的 App 后面（`.accessory` 进程默认不抢前台）；
/// 3. **关窗不退出**：`isReleasedWhenClosed = false`（controller 持有窗口，
///    否则关闭后再 `showWindow` 会崩），关闭时停预览播放器、取消在飞缩略图请求，
///    但**不调 `NSApp.terminate`** —— 菜单栏图标才是这个 App 的主体。
final class WallpaperBrowserWindowController: NSWindowController {

    /// 窗口关闭时回调，让 `AppDelegate` 把引用置空（下次打开重新建）。
    var onClose: (() -> Void)?

    /// 日志出口。转给内容视图 —— 缩略图与预览的排障信息与 App 其余部分
    /// 共用同一个日志文件，出问题时只看一处。
    var log: ((String) -> Void)? {
        didSet { browserViewController.log = log }
    }

    private let browserViewController: WallpaperBrowserViewController

    init(dataSource: WallpaperBrowserDataSource) {
        browserViewController = WallpaperBrowserViewController(dataSource: dataSource)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1060, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "动态壁纸"
        window.contentViewController = browserViewController
        window.minSize = NSSize(width: 880, height: 560)
        window.isReleasedWhenClosed = false
        // 刻意用**默认 level**：它远高于桌面覆盖窗口那一层，不会跟壁纸抢层级；
        // 也刻意不切 `.regular` 激活策略 —— 那会闪出一个 Dock 图标，
        // 而窗口里只有列表与按钮、没有文本输入，`.accessory` + `NSApp.activate` 够用。
        window.center()

        super.init(window: window)
        window.delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载") }

    /// 把窗口带到前台。
    func present() {
        guard let window else { return }
        // **先上屏、再请求激活**：`.accessory` 进程的窗口默认开在别的 App 后面，
        // 反过来的话激活请求会作用在一个还没上屏的窗口上。
        window.makeKeyAndOrderFront(nil)
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    /// 固定项变了（菜单里固定 / 解钉）。转给内容视图刷新徽标与按钮。
    func refreshPinState() {
        browserViewController.refreshPinState()
    }
}

extension WallpaperBrowserWindowController: NSWindowDelegate {

    func windowWillClose(_ notification: Notification) {
        // 释放预览播放器与在飞的缩略图请求。桌面播放**不动**（决策 12）。
        browserViewController.teardown()
        onClose?()
    }
}
