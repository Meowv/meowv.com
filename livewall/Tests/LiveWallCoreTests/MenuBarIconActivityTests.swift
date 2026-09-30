import LiveWallCore

/// 菜单栏图标旋转的判定表。
///
/// 这张表是**唯一**的判定来源（生产调用点在 `AppDelegate.shouldRotateMenuBarIcon`），
/// 所以要把两道闸门与四个动作信号逐条钉住 —— 它绿了，生产跑的就是这一份逻辑。
func menuBarIconActivityTests() {
    suite("MenuBarIconActivity") {

        test("开关关闭时永不旋转，即便所有信号都为真") {
            let signals = MenuBarIconSignals(
                isEnabled: false,
                isMenuOpen: false,
                isPlaying: true,
                isDownloading: true,
                isCheckingUpdate: true,
                hasPendingLoads: true,
                isPinApplying: true
            )
            expectEqual(MenuBarIconActivity.shouldRotate(signals), false, "总闸门关闭应静止")
        }

        test("菜单展开时不动画，即便正在播放") {
            let signals = MenuBarIconSignals(isEnabled: true, isMenuOpen: true, isPlaying: true)
            expectEqual(MenuBarIconActivity.shouldRotate(signals), false, "展开菜单应不动画")
        }

        test("正在播放时旋转") {
            let signals = MenuBarIconSignals(isEnabled: true, isPlaying: true)
            expectEqual(MenuBarIconActivity.shouldRotate(signals), true, "播放即转")
        }

        test("暂停且没有进行中的动作时静止") {
            let signals = MenuBarIconSignals(isEnabled: true)
            expectEqual(MenuBarIconActivity.shouldRotate(signals), false, "暂停且无动作应静止")
        }

        test("四个动作信号各自单独为真都能触发旋转") {
            let cases: [(String, MenuBarIconSignals)] = [
                ("下载当前壁纸", MenuBarIconSignals(isEnabled: true, isDownloading: true)),
                ("检查更新", MenuBarIconSignals(isEnabled: true, isCheckingUpdate: true)),
                ("切换壁纸加载", MenuBarIconSignals(isEnabled: true, hasPendingLoads: true)),
                ("铺满固定项", MenuBarIconSignals(isEnabled: true, isPinApplying: true)),
            ]
            for (label, signals) in cases {
                expectEqual(MenuBarIconActivity.shouldRotate(signals), true, "\(label)进行中应旋转")
            }
        }

        test("全假时静止") {
            expectEqual(MenuBarIconActivity.shouldRotate(MenuBarIconSignals()), false, "全假应静止")
        }
    }
}
