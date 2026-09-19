import Foundation
import LiveWallCore

/// 「关于」子菜单的内容。
///
/// 这组断言的价值在于：菜单结构改动（加一行、调顺序、换链接）会被立刻发现 ——
/// 菜单是用户唯一能看到作者与赞助入口的地方，改坏了没有别的报错途径。
func aboutMenuTests() {
    suite("关于菜单") {

        test("条目顺序：版本 → 作者 → 分隔线 → 赞助") {
            let entries = AboutMenu.entries(version: "1.2.3")
            expectEqual(entries.count, 4, "条目数")
            expectEqual(entries[0], AboutMenu.Entry.info("当前版本 1.2.3"), "首行是版本（禁用行）")
            expectEqual(
                entries[1],
                AboutMenu.Entry.link(title: AboutMenu.authorName, action: .openBlog),
                "第二行是作者，点击打开博客"
            )
            expectEqual(entries[2], AboutMenu.Entry.separator, "作者与赞助之间要有分隔线，避免误点")
            expectEqual(
                entries[3],
                AboutMenu.Entry.link(title: "赞助支持", action: .showDonation),
                "末行是赞助入口"
            )
        }

        test("版本号由调用方传入，不在菜单层硬编码") {
            let entries = AboutMenu.entries(version: "0.0.0-dev")
            expectEqual(entries[0], AboutMenu.Entry.info("当前版本 0.0.0-dev"), "版本应原样拼进标题")
        }

        test("作者名与博客地址") {
            expectEqual(AboutMenu.authorName, "阿星𝑷𝒍𝒖𝒔", "作者名")
            let url = URL(string: AboutMenu.blogURLString)
            expectNotNil(url, "博客地址应是合法 URL")
            expectEqual(url?.scheme, "https", "博客地址必须走 https")
        }

        test("赞助入口指向 studio 首页，且是合法 https") {
            let url = URL(string: AboutMenu.donationURLString)
            expectNotNil(url, "赞助地址应是合法 URL")
            expectEqual(url?.scheme, "https", "赞助地址必须走 https")
            expectEqual(url?.host, "studio.meowv.com", "赞助入口指向 studio 首页（页脚有赞助弹窗）")
        }
    }
}
