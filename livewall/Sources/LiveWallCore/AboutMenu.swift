import Foundation

/// 「关于」子菜单的内容。
///
/// 与 `CategoryMenu` 同一定位：只产出**数据**，不碰 `NSMenu` —— 这样条目顺序、
/// 禁用行、链接合法性都能脱离 GUI 单测。作者名与赞助渠道**只在这里维护一份**，
/// 改文案只动这个文件。
public enum AboutMenu {

    /// 作者名。点击打开 `blogURLString`。
    public static let authorName = "阿星𝑷𝒍𝒖𝒔"

    /// 作者博客（也是本项目的说明入口）。
    public static let blogURLString = "https://meowv.com"

    /// 赞助入口指向的页面。
    ///
    /// 打开的是 **studio 首页**，不是二维码图片：studio 页脚本身就有「赞助支持」入口
    /// （点开是支付宝 / 微信二维码弹窗），把用户送到那里就够了 —— 客户端不必自己存二维码，
    /// 也不必为它写一个弹窗窗口；二维码换位置或换渠道都不用改客户端。
    public static let donationURLString = "https://studio.meowv.com#donate"

    /// 子菜单里一行的行为。刻意不在这里出现 `Selector` —— 纯逻辑层不该知道 AppKit。
    public enum Action: Equatable, Sendable {
        /// 打开作者博客（点作者名）。
        case openBlog
        /// 打开赞助支持页（点「赞助支持」）。
        case showDonation
    }

    /// 子菜单里的一行。
    public enum Entry: Equatable, Sendable {
        /// 只显示信息，不可点（例如版本号）。
        case info(String)
        /// 可点，触发一个行为。
        case link(title: String, action: Action)
        case separator
    }

    /// 子菜单内容，自上而下。
    ///
    /// 顺序理由：版本是「我是谁」的补充信息，放最上面；作者与赞助是两个动作，
    /// 用分隔线隔开，避免误点。
    public static func entries(version: String) -> [Entry] {
        [
            .info("当前版本 \(version)"),
            .link(title: authorName, action: .openBlog),
            .separator,
            .link(title: "赞助支持", action: .showDonation),
        ]
    }
}
