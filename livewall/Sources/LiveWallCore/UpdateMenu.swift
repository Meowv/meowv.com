import Foundation

/// 「有新版本」那一段菜单的**内容**。与 `AboutMenu` 同一定位：只产出数据、不碰 `NSMenu`，
/// 这样文案与条目顺序能脱离 GUI 单测。
public enum UpdateMenu {

    /// 子菜单里可点的动作。**只有「下载」一项**，且没有「自动安装」—— 见 `installHint`。
    ///
    /// 曾经还有「稍后提醒」与「忽略此版本」，都拿掉了：
    ///  - 「稍后提醒」点了等于什么都没做，下次启动照样提示，纯噪音；
    ///  - 「忽略此版本」一旦点了就**没有恢复入口**（配置里躺着 `ignoredUpdateBuild`，
    ///    界面上再也点不回来），想更新只能手改配置 —— 死胡同比提示本身更烦人。
    /// 所以更新行要么下载、要么就一直挂着，直到用户装完新版。
    public enum Action: Equatable, Sendable {
        /// 下载 dmg 到下载目录并在 Finder 里选中。
        case updateNow
    }

    /// 主菜单那一行的标题。体积可选 —— 拿不到就不显示括号，不编一个数字。
    public static func rowTitle(version: String, sizeBytes: Int64?) -> String {
        guard let sizeBytes, sizeBytes > 0 else { return "有新版本 \(version)" }
        return "有新版本 \(version)（\(ProcessUsageText.bytes(UInt64(sizeBytes)))）"
    }

    /// 子菜单里**禁用**的信息行，自上而下。体积缺失时少一行，不是显示「未知」。
    public static func detailLines(feed: UpdateFeed) -> [String] {
        var lines = ["版本 \(feed.version)（build \(feed.build)）"]
        if let sizeBytes = feed.sizeBytes, sizeBytes > 0 {
            lines.append("大小 \(ProcessUsageText.bytes(UInt64(sizeBytes)))")
        }
        if let notes = truncatedNotes(feed.notes) {
            lines.append(notes)
        }
        return lines
    }

    public static func actionTitle(_ action: Action) -> String {
        switch action {
        case .updateNow: return "立即下载更新"
        }
    }

    /// 更新说明压成一行。菜单项放多行会被压成一团、还会把菜单拉得极宽，
    /// 所以只留摘要，完整说明留给下载页。
    ///
    /// 换行与续行空白先规整成单个空格 —— 服务端为了可读性多半写成多行。
    public static func truncatedNotes(_ notes: String, maxLength: Int = 40) -> String? {
        let flat = notes
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        guard !flat.isEmpty else { return nil }
        guard flat.count > maxLength else { return flat }
        return String(flat.prefix(maxLength)) + "…"
    }

    /// 手动点「检查更新」之后的回执。**只对手动检查显示** ——
    /// 点完菜单就收起了，结果要到下次展开才看得见，不给这一句等于「点了没反应」；
    /// 而启动 / 网络恢复时的自动检查没人在等结果，一律静默。
    ///
    /// - Parameter warnings: 失败原因（`.unusable` 时才有意义），取首条展示。
    /// - Returns: 文案 + 是否算异常（`true` 时状态区会加「⚠」前缀）。
    public static func feedback(
        _ decision: UpdateDecision,
        warnings: [String],
        currentVersion: String
    ) -> (text: String, isWarning: Bool) {
        switch decision {
        case .available(let feed):
            // 不说「见『检查更新』下方」—— 有新版本时那个入口是**隐藏**的。
            return ("发现新版本 \(feed.version)，见下方更新项", false)
        case .upToDate:
            return ("已是最新版本 \(currentVersion)", false)
        case .unusable:
            let reason = warnings.first ?? "远程版本信息不可用"
            return ("更新检查失败：\(reason)", true)
        }
    }

    /// 下载完成后的提示。**必须先退出再覆盖**：本 App 在退出时要把用户的原墙纸恢复回去，
    /// 直接覆盖一个正在运行的自己，那一步就丢了。
    ///
    /// 这也是整个功能**只下载、不安装**的原因 —— 自动替换自身需要另一条
    /// installer 进程与权限处理，代价远超「让用户拖一下」。
    public static let installHint = "已下载到下载目录。请先退出动态壁纸，再把 dmg 里的 App 拖到应用程序覆盖。"
}
