import AppKit

/// 浏览窗口。存在的唯一理由是**接住 ⌘W 这类带 Command 的快捷键**。
///
/// ## 为什么必须在窗口这一层接
///
/// 本 App 是 `LSUIElement`（菜单栏常驻、不占 Dock），**没有 main menu** ——
/// `NSApp.mainMenu` 是 nil，所以 ⌘W 没有菜单项去消费它。而带 Command 的按键事件走的是
/// **快捷键通道**：`NSApplication` → `NSWindow.performKeyEquivalent(with:)`；
/// 没人处理时事件被直接丢弃（还会响一声），**不会**再作为 `keyDown` 往下传。
/// 因此视图 / 控制器里的 `keyDown`、`cancelOperation` 永远收不到 ⌘W ——
/// 这正是「Esc 能用、⌘W 不能用」的原因：Esc 不带 Command，走的是 `cancelOperation`。
///
/// 「先收浮层、再关窗口」的规则只该有一份，所以这里不实现规则，只把事件转给内容视图
/// （`WallpaperBrowserViewController.handleWindowKeyEquivalent(_:)`）。
final class BrowserWindow: NSWindow {

    /// 快捷键处理器：返回 true 表示已消费，不再往下传（`super` 会继续找别的处理器）。
    var handleKeyEquivalent: ((NSEvent) -> Bool)?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if handleKeyEquivalent?(event) == true { return true }
        return super.performKeyEquivalent(with: event)
    }
}

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

        let window = BrowserWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1060, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "动态壁纸"
        window.contentViewController = browserViewController
        // ⌘W 等带 Command 的快捷键只有窗口这一层收得到（App 没有 main menu，见 `BrowserWindow`），
        // 接上内容视图里那套「先收浮层、再关窗口」的规则。弱引用避免窗口 → 闭包 → 控制器成环。
        let viewController = browserViewController
        window.handleKeyEquivalent = { [weak viewController] event in
            viewController?.handleWindowKeyEquivalent(event) ?? false
        }
        window.minSize = NSSize(width: 880, height: 560)
        window.isReleasedWhenClosed = false
        // 刻意用**默认 level**：它远高于桌面覆盖窗口那一层，不会跟壁纸抢层级；
        // 也刻意不切 `.regular` 激活策略 —— 那会闪出一个 Dock 图标，
        // 而窗口里只有列表与按钮、没有文本输入，`.accessory` + `NSApp.activate` 够用。
        window.center()

        super.init(window: window)
        window.delegate = self
    }

    /// ⚠️ 显式传 `file: ""` / `line: 0`：`fatalError` 的 `file:` 默认值是 `#file`，
    /// 会把**源文件名作为字符串常量**嵌进二进制（`strip` 管不到字符串字面量，
    /// 实测 release 二进制里因此残留 3 个源文件名）。这条路径永不执行，
    /// 丢掉崩溃定位信息零代价。
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载", file: "", line: 0) }

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
