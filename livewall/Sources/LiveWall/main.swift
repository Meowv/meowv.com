import AppKit

// 动态壁纸 正式 App 入口。
//
// 菜单栏常驻、不占 Dock（Info.plist 里 LSUIElement=true）。
// 窗口层级的启动自检与降级在 AppDelegate 里做 —— 那是这套方案唯一的脆弱点。

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
