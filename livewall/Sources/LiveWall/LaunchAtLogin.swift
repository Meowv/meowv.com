import ServiceManagement

/// 开机自启。
///
/// 用 macOS 13+ 的 `SMAppService.mainApp`，它会注册到「系统设置 → 通用 → 登录项」，
/// 用户看得见也管得着。
///
/// 刻意不用另外两条路：
///  - `LSSharedFileList`（`SMLoginItemSetEnabled` 那一代）在 macOS 13 起已废弃；
///  - 往 `~/Library/LaunchAgents` 写 plist 会绕过登录项的用户可见性 ——
///    用户无法在系统设置里关掉它，卸载后还可能残留。
///
/// **实测（2026-09-18）**：App 放在 `~/Coding/.../build/LiveWall.app`（**不在
/// `/Applications` 下**）也能注册成功，注册后状态变 `enabled`，注销后回到 `notFound`。
///
/// 注意 `notFound` 这个名字有误导性：**未注册时返回的就是它**，而不是 `notRegistered`。
/// 曾据此在菜单里显示「不可用（需在 .app 内运行）」，而功能其实完全可用 ——
/// 一个会让用户放弃使用的假故障。两个「没开启」的状态统一映射为「未开启」。
enum LaunchAtLogin {

    /// 状态的人读描述。
    static var statusLabel: String {
        switch SMAppService.mainApp.status {
        case .enabled: return "已开启"
        case .requiresApproval: return "等待批准"
        case .notRegistered, .notFound: return "未开启"
        @unknown default: return "未知状态"
        }
    }

    /// 是否已开启（`requiresApproval` 不算开启 —— 用户还没批准，重启不会自启）。
    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    /// 已注册但需要用户去「系统设置 → 通用 → 登录项」手动批准。
    static var requiresApproval: Bool {
        SMAppService.mainApp.status == .requiresApproval
    }

    /// 开启或关闭。返回错误描述，`nil` 表示成功。
    static func setEnabled(_ enabled: Bool) -> String? {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}
