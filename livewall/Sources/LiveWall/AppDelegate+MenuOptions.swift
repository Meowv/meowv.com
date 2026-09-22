import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 菜单展开期的惰性采样（仅 debug 构建）

    #if DEBUG
        /// 发起一次采样。**每次展开只调一次**（由 `sampledThisOpen` 保证）——
        /// 同一次展开采两次会把基线推到「刚刚那一刻」，第二次的区间≈0，算出纯噪音。
        func requestUsageSample() {
            processMonitor.sample { [weak self] report in
                guard let self else { return }
                // `nil` = 采样失败（mach 调用没拿到数据）。失败也要让用户看见 ——
                // 不处理的话状态区会一直停在「测量中…」，看起来像卡住了。
                if let report {
                    self.applyUsageReport(report)
                } else {
                    self.applyUsageFailure()
                }
            }
        }

        /// 采样失败：只改文案，不重建菜单（同 `updateUsageRows` 的理由）。
        func applyUsageFailure() {
            usageFailed = true
            guard isMenuOpen, let menu = statusItem?.menu else { return }
            updateUsageRows(in: menu)
        }

        /// 采样回到主线程。菜单已经收起就直接丢弃 —— 那时行已经不在屏幕上，
        /// 而 `statusItem.menu` 可能已经被 `refreshStatusItem` 换掉了。
        func applyUsageReport(_ report: ProcessMonitor.Report) {
            usageReport = report
            usageFailed = false
            guard isMenuOpen, let menu = statusItem?.menu else { return }
            updateUsageRows(in: menu)
        }

        /// 只改这一行的 title，**不重建菜单** —— 重建会让正在展开的菜单闪一下、
        /// 并把已经展开的子菜单与高亮项重置掉。
        func updateUsageRows(in menu: NSMenu) {
            for item in menu.items where (item.representedObject as? String) == Self.usageRowID {
                item.title = usageText
            }
        }
    #endif

    /// 全局热键触发。按 id 分派 —— 走的是和菜单完全相同的入口，不另开一条路径。
    func handleHotKey(_ id: UInt32) {
        switch id {
        case HotKeyManager.Definition.togglePause.id:
            togglePause()
        case HotKeyManager.Definition.nextItem.id:
            nextNow()
        case HotKeyManager.Definition.reloadCatalog.id:
            reloadCatalog()
        default:
            log("未知热键 id \(id)")
        }
    }

    /// 选片顺序子菜单：**随机 / 顺序 / 固定**三行。
    ///
    /// 两种顺序都会走完一整轮才重排、一轮内不重复，所以这里选的不是「有没有随机」，
    /// 而是「这一轮的排列怎么来」。改成子菜单而不是勾选项：勾选项的「未勾」状态
    /// 分不清是「顺序」还是「没设置」。
    ///
    /// 行的内容（标题、顺序、置灰、勾选）由 `PlaybackOrderMenu` 算好 —— 那是纯逻辑，
    /// 可以单测；这里只负责把它贴成 `NSMenu`。
    ///
    /// **「固定」是派生显示**：`pinnedItem != nil` 时勾选它，随机/顺序两行都不勾。
    /// `playbackOrder` 本身仍是两值之一，天然提供「解钉后恢复哪个顺序」。
    func buildOrderMenu() -> NSMenuItem {
        let submenu = NSMenu()
        // 当前没有正在播的条目时「固定」行置灰 —— 置灰优于点了之后收到一句失败提示。
        // 实际生效的判据在 `validateMenuItem(_:)`（见文件末尾的说明），这里传进去的
        // `canPinCurrent` 与它同源（都读 `self.canPinCurrent`），不会打架。
        let canPinCurrent = self.canPinCurrent

        for entry in PlaybackOrderMenu.entries(
            order: preferences.playbackOrder,
            isPinned: isPinned,
            canPinCurrent: canPinCurrent
        ) {
            let item: NSMenuItem
            switch entry.kind {
            case .order(let order):
                item = NSMenuItem(
                    title: entry.title,
                    action: #selector(switchPlaybackOrder(_:)),
                    keyEquivalent: ""
                )
                item.representedObject = order.rawValue
            case .pin:
                // 已固定时仍可点（幂等）：再点一次正是用户确认
                // 「现在固定的到底是哪条」的自然动作。
                item = NSMenuItem(
                    title: entry.title,
                    action: #selector(pinCurrentItem),
                    keyEquivalent: ""
                )
            }
            item.target = self
            // 不在这里写 `isEnabled`：带 action 的项由 `validateMenuItem(_:)` 决定可用性
            // （`NSMenu.autoenablesItems` 默认开启，写了也会被覆盖 —— 见文件末尾的说明）。
            item.state = entry.isSelected ? .on : .off
            submenu.addItem(item)
        }

        let root = NSMenuItem(
            title: PlaybackOrderMenu.rootTitle(
                order: preferences.playbackOrder, isPinned: isPinned),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 菜单「固定」行：把**当前正在播的那条**固定为桌面壁纸（决策 6）。
    @objc func pinCurrentItem() {
        guard let primary = engine.primaryKey, let item = engine.item(on: primary) else {
            // 菜单里这一行本来就置灰了，走到这里说明是别的途径触发的
            notice = .warning("当前没有正在播放的壁纸", oneShot: true)
            refreshStatusItem()
            return
        }
        // 分类传当前值：这条本来就在播，说明当前分类就是对的，没有要切的东西。
        // 本地来源下传 nil —— 本地条目没有分类，传 `selectedCategoryID`（线上残留值）
        // 会让 `setPinned` 去拉一个跟画面毫无关系的线上切片。
        setPinned(item, categoryID: isLocalSource ? nil : selectedCategoryID)
    }

    /// 切换间隔子菜单。改的是 `intervalSeconds`（单位秒），预设覆盖 30 秒 – 1 小时；
    /// 想填别的值就手改 `config.json`，范围外的会被 `SwitchInterval.clamp` 夹紧。
    func buildIntervalMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for seconds in SwitchInterval.presets {
            let entry = NSMenuItem(
                title: SwitchInterval.label(seconds),
                action: #selector(setSwitchInterval(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = seconds
            entry.state = abs(preferences.intervalSeconds - seconds) < 0.5 ? .on : .off
            submenu.addItem(entry)
        }

        let root = NSMenuItem(
            title: "切换间隔（\(SwitchInterval.label(preferences.intervalSeconds))）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 省电开关的菜单标识。用 `representedObject` 传递，省掉五个几乎相同的 @objc 方法。
    enum PowerOption: String {
        case covered
        case idle
        case lowPowerMode
        case battery
        case thermalPressure

        var label: String {
            switch self {
            case .covered: return "画面被遮挡时"
            case .idle: return "无操作时"
            case .lowPowerMode: return "低电量模式时"
            case .battery: return "电池供电时"
            case .thermalPressure: return "温度过高时"
            }
        }

        /// 菜单展示顺序 = 判定优先级顺序，两者不能各排各的。
        static let all: [PowerOption] = [
            .covered, .idle, .lowPowerMode, .battery, .thermalPressure,
        ]
    }

    /// 省电设置子菜单。改动直接写回 config.json 并立即重算，不需要重启。
    func buildPowerMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for option in PowerOption.all {
            let entry = NSMenuItem(
                title: option.label,
                action: #selector(togglePowerOption(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = option.rawValue
            entry.state = isOptionEnabled(option) ? .on : .off
            submenu.addItem(entry)

            // 空闲阈值作为「无操作时」的子项，缩进挂在它下面
            if option == .idle {
                let thresholds = NSMenu()
                for seconds in IdleThreshold.presets {
                    let item = NSMenuItem(
                        title: IdleThreshold.label(seconds),
                        action: #selector(setIdleThreshold(_:)),
                        keyEquivalent: ""
                    )
                    item.target = self
                    item.representedObject = seconds
                    item.state = abs(preferences.idleThresholdSeconds - seconds) < 0.5 ? .on : .off
                    // 总开关关着时子项没有意义，置灰而不是隐藏（保留可发现性）。
                    // 置灰判据在 `validateMenuItem(_:)`（构建时写 `isEnabled` 会被自动校验覆盖）。
                    thresholds.addItem(item)
                }
                let root = NSMenuItem(
                    title: "空闲阈值：\(IdleThreshold.label(preferences.idleThresholdSeconds))",
                    action: nil,
                    keyEquivalent: ""
                )
                root.submenu = thresholds
                submenu.addItem(root)
            }
        }
        let root = NSMenuItem(title: "省电设置", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    func isOptionEnabled(_ option: PowerOption) -> Bool {
        switch option {
        case .covered: return preferences.pauseWhenCovered
        case .idle: return preferences.pauseWhenIdle
        case .lowPowerMode: return preferences.pauseOnLowPowerMode
        case .battery: return preferences.pauseOnBattery
        case .thermalPressure: return preferences.pauseOnThermalPressure
        }
    }

    func setOption(_ option: PowerOption, enabled: Bool) {
        switch option {
        case .covered: preferences.pauseWhenCovered = enabled
        case .idle: preferences.pauseWhenIdle = enabled
        case .lowPowerMode: preferences.pauseOnLowPowerMode = enabled
        case .battery: preferences.pauseOnBattery = enabled
        case .thermalPressure: preferences.pauseOnThermalPressure = enabled
        }
    }
}
