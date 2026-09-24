import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 菜单栏

    /// 菜单栏状态项图标。资源由 `build.sh` 拷进 `Contents/Resources/`。
    ///
    /// 用 `Bundle.main` 而不是 `NSImage(named:)`：本 App 的 .app 由脚本手工组装，
    /// 没有 asset catalog，资源只在 bundle 根下。
    static let playingIcon = menuBarIcon(named: "MenuBarIcon")
    static let pausedIcon = menuBarIcon(named: "MenuBarIconPaused")

    /// 显式把逻辑尺寸钉在 18pt，不依赖 PNG 里的 DPI 元数据 ——
    /// 这样即使只加载到 36px 的 @2x 位图，显示尺寸也不会翻倍，
    /// 而 Retina 屏仍能采样到全部像素。
    ///
    /// 彩色而非模板图：图形是四色风车，转成模板图会被压成单色剪影，颜色全部丢失 ——
    /// 而「带色彩」正是选它的理由。代价是不会随菜单栏明暗自动反色，所以播放 / 暂停
    /// 靠颜色区分而非透明度：菜单栏是叠在壁纸上的半透明层，低 alpha 实测几乎看不清。
    /// 暂停态因而另出一张同形状、统一中灰的图。
    static func menuBarIcon(named name: String) -> NSImage? {
        guard let image = Bundle.main.image(forResource: name) else { return nil }
        image.isTemplate = false
        image.size = NSSize(width: 18, height: 18)
        return image
    }

    func buildStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        // 常驻：既不允许被 ⌘ 拖走，也不因移除而终止进程。
        // 默认是 [.removalAllowed, .terminationOnRemoval]，两项都要去掉 ——
        // 留着 `.terminationOnRemoval` 的话，用户一拖走 App 就跟着退出，
        // 而拖走这个动作本身是很容易误触的。
        item.behavior = []
        statusItem = item
        refreshStatusItem()
    }

    func refreshStatusItem() {
        guard let item = statusItem else { return }

        if let icon = engine.isPlaying ? Self.playingIcon : Self.pausedIcon {
            item.button?.image = icon
            item.button?.title = ""
        } else {
            // 图标资源缺失时的兜底（例如不经 .app 直接跑 .build 里的可执行文件）
            item.button?.image = nil
            item.button?.title = engine.isPlaying ? "◉" : "◐"
        }

        // 菜单展开期间**不重建**：换掉 `item.menu` 会让菜单闪一下、并重置已展开的子菜单
        // 与高亮项。但这次刷新不能丢（状态是变了才来刷的），所以记一个待办，
        // 由 `menuDidClose` 在收起后补一次。
        //
        // 此前这条约束只在 `setUpdateState` 一处被遵守，其余二十来个调用点
        // （网络变化、状态翻转、每次成功加载）都在展开期无条件重建 —— 行为自相矛盾。
        guard !isMenuOpen else {
            isMenuRebuildPending = true
            return
        }
        item.menu = buildMenu()
    }

    func buildMenu() -> NSMenu {
        let menu = NSMenu()

        // ── 状态区 ───────────────────────────────────────────
        // 六段结构：状态 → 播放控制 → 设置 → 维护 → 关于 → 退出。
        // 菜单从光标位置向下展开，到达成本与行号正相关，所以高频动作贴顶、
        // 低频与破坏性操作置底；同一类别必须连续成块，否则会破坏位置记忆。
        let header = NSMenuItem(title: "动态壁纸", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let current = NSMenuItem(title: currentName, action: nil, keyEquivalent: "")
        current.isEnabled = false
        menu.addItem(current)

        // 进程自身占用。**仅 debug 构建**（与下面「打印窗口层级表」同一约定）——
        // 它是开发期的观测手段（「一个一直挂在后台的东西到底吃多少资源」），
        // release 下不显示，省掉一行菜单高度。
        // 内容只在菜单展开时刷新（见 `NSMenuDelegate` 扩展），所以这一行在菜单收起
        // 期间显示的是上一次的值；CPU 那行自带区间标注，不会被读成瞬时值。
        #if DEBUG
            menu.addItem(usageRow(id: Self.usageRowID, text: usageText))
        #endif

        // 暂停原因由 governor 的状态直接推导，不另存一份 —— 存一份就要在每个
        // 恢复路径上记得清掉，漏一处就会残留一句「已手动暂停」。
        if !governor.state.isPlaying {
            let paused = NSMenuItem(
                title: "已暂停：\(governor.state.reason?.label ?? "未知原因")",
                action: nil,
                keyEquivalent: ""
            )
            paused.isEnabled = false
            menu.addItem(paused)
        }

        if !network.isReachable {
            let networkInfo = NSMenuItem(title: "⚠ 网络不可达，保持当前画面", action: nil, keyEquivalent: "")
            networkInfo.isEnabled = false
            menu.addItem(networkInfo)
        }

        if let notice {
            // 进了这一次构建，用户下次展开就能看到它 —— 收起时才可以作废。
            noticeShown = true
            let noticeItem = NSMenuItem(title: notice.display, action: nil, keyEquivalent: "")
            noticeItem.isEnabled = false
            menu.addItem(noticeItem)
        }

        // 配置写失败单独占一行，**不受 `notice` 的生命周期影响** ——
        // 它由下一次成功的写入清掉（见 `persistenceFailure` 的说明）。
        // 放进 `notice` 会被随后的成功路径清成 nil，「设置没存上」就又一次没有痕迹。
        if let persistenceFailure {
            let saveFailure = NSMenuItem(
                title: "⚠ \(persistenceFailure)", action: nil, keyEquivalent: "")
            saveFailure.isEnabled = false
            menu.addItem(saveFailure)
        }

        // 热键冲突行只在真出问题时出现。三项热键的组合提示已经写在各自菜单项的
        // 标题里，再常驻一行纯属重复；而「被别的程序抢了」只有这里能发现。
        let hotKeyFailures = hotKeys.failures
        if !hotKeyFailures.isEmpty {
            let conflict = NSMenuItem(
                title: "⚠ 热键冲突：" + hotKeyFailures.map(\.definition.display).joined(separator: "、")
                    + "（组合被其它程序占用）",
                action: nil,
                keyEquivalent: ""
            )
            conflict.isEnabled = false
            menu.addItem(conflict)
        }

        menu.addItem(.separator())

        // ── 播放控制 ─────────────────────────────────────────
        // 标题里写组合提示，但**不要**设 `keyEquivalent` —— 菜单打开时全局热键与
        // 菜单项会各触发一次，切换类操作执行两遍等于互相抵消。
        let next = NSMenuItem(
            title: "下一张（\(HotKeyManager.Definition.nextItem.display)）",
            action: #selector(nextNow),
            keyEquivalent: ""
        )
        next.target = self
        menu.addItem(next)

        let toggle = NSMenuItem(
            title: (isUserPaused ? "继续播放" : "暂停播放")
                + "（\(HotKeyManager.Definition.togglePause.display)）",
            action: #selector(togglePause),
            keyEquivalent: ""
        )
        toggle.target = self
        menu.addItem(toggle)

        menu.addItem(buildOrderMenu())

        menu.addItem(.separator())

        // ── 设置 ────────────────────────────────────────────
        // 组内按「用户调整它的频率」降序：切换间隔与内容过滤是会用几次就调的，
        // 开机自启与壁纸显示位置装完基本不动。
        menu.addItem(buildIntervalMenu())
        menu.addItem(buildPowerMenu())
        // 锁屏预览紧跟省电设置：同属「画面行为」的开关，且都是开一次就不常动。
        let lockPreview = NSMenuItem(
            title: "锁屏预览（\(preferences.lockScreenPreview ? "开" : "关")）",
            action: #selector(toggleLockScreenPreview),
            keyEquivalent: ""
        )
        lockPreview.target = self
        lockPreview.state = preferences.lockScreenPreview ? .on : .off
        menu.addItem(lockPreview)
        menu.addItem(buildCategoryMenu())
        // 壁纸来源紧跟内容过滤：两者都是「播什么」的选择，且都是低频设置项。
        menu.addItem(buildSourceMenu())

        let policyMenu = NSMenu()
        // 顶部一行说明当前策略的代价（尤其流量），这是选择时唯一要权衡的东西
        let policyDetail = NSMenuItem(
            title: screenCoordinator.policy.detail, action: nil, keyEquivalent: "")
        policyDetail.isEnabled = false
        policyMenu.addItem(policyDetail)
        policyMenu.addItem(.separator())
        for policy in MultiScreenPolicy.allCases {
            let entry = NSMenuItem(
                title: policy.label,
                action: #selector(switchMultiScreenPolicy(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = policy.rawValue
            entry.state = policy == screenCoordinator.policy ? .on : .off
            policyMenu.addItem(entry)
        }
        let policyRoot = NSMenuItem(
            title: "多屏策略（\(screenCoordinator.policy.label)）",
            action: nil,
            keyEquivalent: ""
        )
        policyRoot.submenu = policyMenu
        menu.addItem(policyRoot)

        let levelMenu = NSMenu()
        let currentPlacement = LevelPreset.placement(for: screenCoordinator.level)
        for placement in WindowPlacement.allCases {
            let entry = NSMenuItem(
                title: placement.label,
                action: #selector(switchWindowPlacement(_:)),
                keyEquivalent: "")
            entry.target = self
            entry.representedObject = placement.rawValue
            entry.state = placement == currentPlacement ? .on : .off
            levelMenu.addItem(entry)

            let detail = NSMenuItem(title: placement.detail, action: nil, keyEquivalent: "")
            detail.isEnabled = false
            // 说明行缩进到对应选项下方，让用户先看到意图，再看到后果。
            detail.indentationLevel = 1
            levelMenu.addItem(detail)
        }
        levelMenu.addItem(.separator())
        let redetect = NSMenuItem(
            title: "重新检测显示位置",
            action: #selector(redetectWindowPlacement),
            keyEquivalent: "")
        redetect.target = self
        levelMenu.addItem(redetect)
        let diagnostics = NSMenuItem(
            title: "查看层级诊断…",
            action: #selector(showLevelDiagnostics),
            keyEquivalent: "")
        diagnostics.target = self
        levelMenu.addItem(diagnostics)

        let levelRoot = NSMenuItem(
            title: "壁纸位置（\(currentPlacement == .immersive ? "沉浸模式" : "标准桌面")）",
            action: nil,
            keyEquivalent: "")
        levelRoot.submenu = levelMenu
        menu.addItem(levelRoot)

        // 开机自启放设置组末尾：它属「系统集成」而不是「画面显示」，
        // 状态直接读系统（不是读我们自己的配置）—— 用户可能在
        // 「系统设置 → 通用 → 登录项」里关掉它，那时这里必须如实显示。
        let loginItem = NSMenuItem(
            title: "开机自启（\(LaunchAtLogin.statusLabel)）",
            action: #selector(toggleLaunchAtLogin),
            keyEquivalent: ""
        )
        loginItem.target = self
        loginItem.state = LaunchAtLogin.isEnabled ? .on : .off
        menu.addItem(loginItem)

        menu.addItem(.separator())

        // ── 维护 ────────────────────────────────────────────
        // 低频一次性动作。放在设置组之后：它们都不改变任何设置，混在配置项中间
        // 既打断位置记忆，也容易被误点。
        // 「打开动态壁纸」排在这一段最前：它是唯一一个「浏览 + 挑选」性质的入口，
        // 与后面两个「产出 / 恢复」动作不同类。
        let browser = NSMenuItem(
            title: "打开动态壁纸",
            action: #selector(openWallpaperBrowser),
            keyEquivalent: ""
        )
        browser.target = self
        // 本地来源下置灰：那个窗口列的是**线上分类的条目**，本地没有可浏览的目录。
        // 判据与「内容过滤」「下载当前壁纸」共用 `WallpaperSourceMenu.OnlineOnlyEntry`
        // 一处登记，实际生效在 `validateMenuItem(_:)` —— 带 action 的项写在这里的
        // `isEnabled` 会被 `NSMenu` 的自动校验覆盖（详见文件末尾的说明）。
        menu.addItem(browser)

        // 「下载当前壁纸」排在「重新加载」之前：前者是主动产出，后者是恢复动作。
        let downloadCurrent = NSMenuItem(
            title: downloader.isDownloading ? "下载中…" : "下载当前壁纸",
            action: #selector(downloadCurrentWallpaper),
            keyEquivalent: ""
        )
        downloadCurrent.target = self
        // 可用性（下载中 / 没有可下载条目 / 本地来源）一律在 `validateMenuItem(_:)` 里判 ——
        // 与「打开动态壁纸」同一个坑：这里写 `isEnabled` 会被自动校验覆盖。
        menu.addItem(downloadCurrent)

        // 标题必须与 `reloadCatalog` 的实际分支一致（都用**配置里有没有本地路径**判定，
        // 不是用生效态）：本地来源下这一项做的是「重扫文件夹」，其中也包括
        // 「盘拔了导致回退线上之后，再按一次重试那个文件夹」——菜单里写着「重新加载清单」
        // 却去扫本地目录，是排障时最费解的一种不一致。
        let reload = NSMenuItem(
            title: preferences.resolvedLocalFolderURL == nil
                ? "重新加载清单（\(HotKeyManager.Definition.reloadCatalog.display)）"
                : "重新扫描本地文件夹（\(HotKeyManager.Definition.reloadCatalog.display)）",
            action: #selector(reloadCatalog),
            keyEquivalent: ""
        )
        reload.target = self
        menu.addItem(reload)

        // 开发者工具：只在 debug 构建里存在。日常使用走 `./build.sh`（release），
        // 排障走 `./run.sh`（debug）。整块不参与 release 编译，二进制里也没有相关字符串。
        #if DEBUG
            menu.addItem(.separator())
            for (title, directory) in [
                ("打开日志目录", DebugDirectory.logs),
                ("打开下载壁纸目录", DebugDirectory.downloadedWallpapers),
                ("打开数据缓存目录", DebugDirectory.remoteDataCache),
                ("打开锁屏素材目录", DebugDirectory.aerialLockScreen),
            ] {
                let item = NSMenuItem(
                    title: title,
                    action: #selector(openDebugDirectory(_:)),
                    keyEquivalent: ""
                )
                item.target = self
                item.representedObject = directory.rawValue
                menu.addItem(item)
            }

            let dump = NSMenuItem(
                title: "打印窗口层级表", action: #selector(dumpWindows), keyEquivalent: "")
            dump.target = self
            menu.addItem(dump)
        #endif

        // 更新段**不在这里**：它属于「关于」子菜单，紧贴「当前版本」那一行
        // （位置由 `AboutMenu.entries` 里的 `.updateSection` 占位决定）。

        // ── 关于 ────────────────────────────────────────────
        // 最低频的内容放最末段。
        menu.addItem(.separator())
        menu.addItem(buildAboutMenu())

        // 退出放在最底部并单独分隔，避免误触；点击后走 `shutdown()`，
        // 与系统终止和 SIGTERM 共用同一条清理路径（含恢复用户原墙纸）。
        menu.addItem(.separator())
        let quit = NSMenuItem(
            title: "退出动态壁纸",
            action: #selector(quitApplication(_:)),
            keyEquivalent: "q"
        )
        quit.target = self
        menu.addItem(quit)
        //
        // 菜单的采样刷新靠 delegate：`NSMenu.delegate` 是 weak，而 `AppDelegate`
        // 由 `main.swift` 顶层的 `let` 持有到进程结束，所以这里可以直接用 self。
        menu.delegate = self
        return menu
    }

    /// 菜单退出。先主动执行清理，再交给 AppKit 结束进程；
    /// `applicationWillTerminate` 可能再次调用 `shutdown()`，由幂等保护挡住重复清理。
    @objc func quitApplication(_ sender: Any?) {
        log("菜单请求退出，开始退出清理")
        shutdown()
        NSApp.terminate(sender)
    }

    /// 「关于」子菜单：版本、**更新段**、作者、赞助入口。
    ///
    /// 内容（顺序、禁用行、链接）全在 `LiveWallCore/AboutMenu`，这里只负责把数据
    /// 翻译成 `NSMenuItem` —— 与 `buildCategoryMenu` 同一分工，那样才测得到。
    func buildAboutMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for entry in AboutMenu.entries(version: Self.appVersion) {
            switch entry {
            case .updateSection:
                // 入口与更新行**互斥**，由 `updateState` 一处决定。
                appendUpdateSection(to: submenu)
            case .info(let title):
                let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
                item.isEnabled = false
                submenu.addItem(item)
            case .link(let title, let action):
                let item = NSMenuItem(
                    title: title,
                    action: Self.selector(for: action),
                    keyEquivalent: ""
                )
                item.target = self
                submenu.addItem(item)
            case .separator:
                submenu.addItem(.separator())
            }
        }
        let root = NSMenuItem(title: "关于动态壁纸", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// `AboutMenu.Action` → `Selector` 的映射。
    ///
    /// 放在 App 这一侧而不是 `LiveWallCore`：纯逻辑层不该知道 `Selector` 这种 AppKit 概念。
    static func selector(for action: AboutMenu.Action) -> Selector {
        switch action {
        case .openBlog: return #selector(openAuthorBlog)
        case .showDonation: return #selector(openDonationPage)
        }
    }

    /// App 版本。从 bundle 读，不在代码里维护第二份。
    /// 不经 .app 直接跑 `.build/` 里的可执行文件时读不到，回退成「开发版」。
    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "开发版"
    }

    /// App 的 build 号（`CFBundleVersion`）—— **版本比对的权威值**，发版必须递增。
    ///
    /// 读不到（直接跑 `.build/` 里的可执行文件）或不是数字时返回 nil，
    /// `UpdateEvaluator` 会因此判为「不可用」，绝不会误提示。
    static var appBuild: Int? {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return raw.flatMap { Int($0) }
    }

}
