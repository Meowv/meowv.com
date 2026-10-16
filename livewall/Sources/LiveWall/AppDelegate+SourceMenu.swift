import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {


    /// 内容过滤子菜单：全部、收藏或一级分类单选。
    ///
    /// 分类行的内容由 `CategoryMenu` 算好；「全部」固定为第一行。这里只负责贴成 `NSMenu`。
    ///
    /// 本地来源下**整项置灰**：本地文件夹没有分类概念，点任何一行都没有可加载的东西。
    /// 置灰优于让用户点到必然无反应的动作（`AGENTS.md` 的既有取舍），根标题如实写出原因。
    func buildCategoryMenu() -> NSMenuItem {
        // 判据与另外两个线上专属入口共用一处登记（`WallpaperSourceMenu.OnlineOnlyEntry`）。
        guard WallpaperSourceMenu.isEnabled(.categoryFilter, isLocalSource: isLocalSource) else {
            let root = NSMenuItem(
                title: CategoryMenu.localSourceRootTitle, action: nil, keyEquivalent: "")
            root.isEnabled = false
            return root
        }

        let submenu = NSMenu()
        let entries = CategoryMenu.entries(
            categories: categories,
            selectedID: selectedCategoryID,
            allEnabled: (index?.allSlice?.itemCount ?? 0) > 0,
                favoriteCount: favoriteItemIDs.count,
            favoritesSelected: isFavoritesFilter
        )

        for entry in entries {
            let item = NSMenuItem(
                title: entry.title,
                action: entry.isFavorites ? #selector(selectFavorites) : #selector(selectCategory(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = entry.id
            item.state = entry.isSelected ? .on : .off
            // 条目数为 0 的分类要置灰、本地来源下整项不可用 —— 判据都在
            // `validateMenuItem(_:)` 里（构建时写 `isEnabled` 会被自动校验覆盖）。
            submenu.addItem(item)
        }
        if categories.isEmpty {
            let empty = NSMenuItem(title: "清单里没有分类信息", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            submenu.addItem(empty)
        }

        let root = NSMenuItem(
            title: CategoryMenu.rootTitle(
                categories: categories, selectedID: selectedCategoryID,
                favoritesSelected: isFavoritesFilter
            ),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 壁纸来源子菜单：**线上 / 本地**二选一。
    ///
    /// 行的内容由 `WallpaperSourceMenu` 算好（纯逻辑，可单测），这里只贴成 `NSMenu`。
    /// 两行都**永远可点**：本地行同时承担「改选文件夹」——已启用时再点一次就是换一个文件夹，
    /// 再单独放一行「改选文件夹…」纯属重复。
    func buildSourceMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for entry in WallpaperSourceMenu.entries(isLocal: isLocalSource) {
            let item = NSMenuItem(
                title: entry.title,
                action: #selector(selectSource(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = entry.kind.rawValue
            item.state = entry.isSelected ? .on : .off
            submenu.addItem(item)
        }

        let root = NSMenuItem(
            title: WallpaperSourceMenu.rootTitle(
                isLocal: isLocalSource,
                localFolderName: preferences.localFolderName
            ),
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    /// 切换壁纸来源。
    ///
    /// 选「本地」时先开面板选文件夹、**后台试扫一遍**，扫不出 mp4 就地提示并且
    /// **不写配置** —— 让用户选了「本地」却因为挑了个空文件夹而静默停在旧来源上，
    /// 是最难排查的一种表现（菜单勾选和实际来源对不上）。
    ///
    /// 选「线上」时**不清空候选池**再加载：与 `reloadCatalog` 同一条取舍 ——
    /// 拉取失败要保持当前画面继续播，而不是先黑一下。
    @objc func selectSource(_ sender: NSMenuItem) {
        guard libraryReady else { return }
        guard let raw = sender.representedObject as? String,
            let kind = WallpaperSourceMenu.Kind(rawValue: raw)
        else { return }

        switch kind {
        case .remote:
            // 判据是**配置**而不是生效态：本地扫描失败回退线上之后，菜单里勾的是线上，
            // 但配置里还留着路径 —— 这时点「线上」应该把那份路径清掉（用户明确不要它了），
            // 而不是因为「已经是线上」就静默吞掉这次点击。
            guard preferences.resolvedLocalFolderURL != nil else { return }
            // 用户明确切回线上：正在后台跑的本目录扫描结果必须作废。
            localScanGeneration += 1
            isLocalSource = false
            preferences.localFolderPath = nil
            persistPreferences("壁纸来源：线上清单")
            log("壁纸来源改为线上清单")
            notice = .info("壁纸来源：线上清单")
            refreshStatusItem()
            loadCatalogAndStart()

        case .local:
            guard let folder = chooseLocalFolder() else { return }
            log("正在扫描本地文件夹：\(folder.path)")
            scanLocalFolder(folder, isFirstLoad: false, persistFolderPath: true)
        }
    }

    /// 弹出文件夹选择面板。用户取消返回 nil。
    func chooseLocalFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        // 不允许选文件、也不允许在面板里新建目录：数据源是一个**已有内容的**文件夹，
        // 现建一个空目录只会立刻撞上「文件夹里没有 mp4」。
        panel.canCreateDirectories = false
        panel.prompt = "选用"
        panel.message = "选择一个存放 mp4 的文件夹（含子文件夹，其它格式会被忽略）"
        // 再次选择时从当前文件夹开始，不用一层层点回去。
        if let current = preferences.resolvedLocalFolderURL {
            panel.directoryURL = current
        }
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        return url
    }

    /// 切换「全部」或某个内容分类。
    ///
    /// 索引里没有条目，所以这一步是**真的去拉一个文件**（`category.<id>.json`，约 0.6 MB）——
    /// 换来的好处是启动时不必下全量。因为是异步的，要处理两件事：
    ///
    /// - **连点**：用递增的请求序号，回包时比对，过期结果丢弃（`loadSlice` 里做）；
    /// - **失败**：保持当前画面与当前勾选，不把候选池换空。
    ///
    /// 选中项**只在拉取成功后写回**配置，否则菜单的勾选会和池子里的内容打架。
    @objc func selectCategory(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? Int else {
            guard selectedCategoryID != nil || isFavoritesFilter else { return }
            guard let allSlice = index?.allSlice else {
                notice = .warning("当前清单不支持全部筛选，请先更新清单")
                refreshStatusItem()
                return
            }
            failuresBySlot.removeAll()
            notice = .info("正在加载全部内容…")
            refreshStatusItem()
            loadAllSlice(
                allSlice,
                service: makeCatalogService(),
                isFirstLoad: pool.totalCount == 0
            )
            return
        }
        guard id != selectedCategoryID || isFavoritesFilter else { return }
        guard let entry = categories.first(where: { $0.id == id }) else { return }
        guard entry.itemCount > 0 else {
            // 菜单里这种项本来就置灰了，走到这里说明是别的途径触发的
            notice = .warning("分类「\(entry.name)」没有可用内容")
            log("⚠️ 分类「\(entry.name)」条目数为 0，忽略本次切换")
            refreshStatusItem()
            return
        }

        failuresBySlot.removeAll()
        notice = .info("正在加载分类「\(entry.name)」…")
        refreshStatusItem()
        // 「首次加载」的判据与 `handleIndexResult` 保持一致：池子还空着才算。
        // 用户可能在启动那一下（首次切片还在路上）就点了分类，那次也算首次 ——
        // 写死 `false` 会让「启动后立刻点一下」丢掉每屏源的恢复。
        loadSlice(for: id, service: makeCatalogService(), isFirstLoad: pool.totalCount == 0)
    }

    @objc func switchMultiScreenPolicy(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let policy = MultiScreenPolicy(rawValue: raw)
        else { return }

        preferences.multiScreenPolicy = policy
        persistPreferences("多屏策略")

        let verdict = screenCoordinator.apply(policy: policy)
        lastLayerVerdict = verdict
        // 槽位集合随策略变化（镜像 1 个 / 每屏独立 N 个），必须重新对齐并绑定窗口。
        // 失败计数也要清：旧槽位的失败次数跟新槽位没有关系。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        syncPlaybackSlots()

        notice = .info("多屏策略：\(policy.label)（\(verdict.summary)）")
        log(
            "多屏策略切换为 \(policy.label)：窗口 \(screenCoordinator.windows.count) 个 / 屏幕 "
                + "\(screenCoordinator.screenCount) 块，槽位 \(engine.slotKeys().count) 个 | \(verdict.summary)"
        )
        if policy == .perScreen, screenCoordinator.slotPlan.hasSharedSlot {
            log(
                "屏幕数超过每屏独立上限 \(MultiScreenPolicy.maxIndependentScreens) 块，"
                    + "超出的屏幕共用最后一路解码")
        }
        refreshStatusItem()
        persistScreenSources()
    }

    /// 切换用户可理解的显示位置。具体 WindowServer 层级由这里统一映射与校准。
    @objc func switchWindowPlacement(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
            let placement = WindowPlacement(rawValue: raw)
        else { return }

        switch placement {
        case .standard:
            applyStandardWindowPlacement(noticeText: "已切换到标准桌面：壁纸位于桌面图标下方")
        case .immersive:
            let alert = NSAlert()
            alert.messageText = "启用沉浸模式？"
            alert.informativeText = "壁纸会覆盖桌面图标，适合纯展示场景。桌面图标仍在系统中，但暂时不会显示。"
            alert.addButton(withTitle: "启用沉浸模式")
            alert.addButton(withTitle: "取消")
            guard alert.runModal() == .alertFirstButtonReturn else { return }

            let preset = LevelPreset.iconAboveGap1
            let verdict = screenCoordinator.apply(level: preset.level)
            lastLayerVerdict = verdict
            preferences.levelPreset = preset
            persistPreferences("窗口层级")
            notice = verdict.isHealthy
                ? .info("已启用沉浸模式：桌面图标已被壁纸覆盖")
                : .warning("沉浸模式已启用，但层级检测发现异常：\(verdict.summary)")
            refreshStatusItem()
        }
    }

    /// 标准桌面模式始终从推荐候选开始，由运行时自动选择可用层级。
    func applyStandardWindowPlacement(noticeText: String) {
        let calibration = screenCoordinator.calibrate(startingFrom: .recommended)
        lastLayerVerdict = calibration.verdict
        preferences.levelPreset = calibration.preset
        persistPreferences("窗口层级")
        notice = calibration.verdict.isHealthy
            ? .info(noticeText)
            : .warning("标准桌面检测未完成：\(calibration.verdict.summary)")
        refreshStatusItem()
    }

    /// 重新检测当前显示位置：标准桌面重新校准，沉浸模式重新验证当前层级。
    @objc func redetectWindowPlacement() {
        if LevelPreset.placement(for: screenCoordinator.level) == .immersive {
            let verdict = screenCoordinator.apply(level: screenCoordinator.level)
            lastLayerVerdict = verdict
            notice = verdict.isHealthy
                ? .info("显示位置检测完成：沉浸模式正常")
                : .warning("显示位置检测发现异常：\(verdict.summary)")
            refreshStatusItem()
        } else {
            applyStandardWindowPlacement(noticeText: "显示位置检测完成：壁纸位于桌面图标下方")
        }
    }

    /// 将工程诊断保留在按需打开的详情里，不污染日常菜单文案。
    @objc func showLevelDiagnostics() {
        let alert = NSAlert()
        alert.messageText = "窗口层级诊断"

        guard let verdict = lastLayerVerdict else {
            alert.informativeText = "尚未完成显示位置检测。"
            alert.addButton(withTitle: "好")
            alert.runModal()
            return
        }

        let placement = LevelPreset.placement(for: screenCoordinator.level)
        let iconRelation: String
        switch verdict.isBelowIcons {
        case .some(true): iconRelation = "是"
        case .some(false): iconRelation = "否（已覆盖）"
        case .none: iconRelation = "未知"
        }
        let wallpaperRelation: String
        switch verdict.isAboveWallpaper {
        case .some(true): wallpaperRelation = "是"
        case .some(false): wallpaperRelation = "否"
        case .none: wallpaperRelation = "未知"
        }
        var lines = [
            "显示模式：\(placement == .immersive ? "沉浸模式" : "标准桌面")",
            "系统墙纸之上：\(wallpaperRelation)",
            "桌面图标之下：\(iconRelation)",
            "覆盖整屏：\(verdict.coversScreen ? "是" : "否")",
            "同层竞争：\(verdict.competingWindows.isEmpty ? "无" : verdict.competingWindows.map(\.ownerName).joined(separator: "、"))",
            "实际层级：\(verdict.ourLevel)",
        ]
        if !verdict.notes.isEmpty {
            lines.append("")
            lines.append(contentsOf: verdict.notes)
        }
        alert.informativeText = lines.joined(separator: "\n")
        alert.addButton(withTitle: "好")
        alert.runModal()
    }

    /// 保留旧入口供已有调用方与旧配置兼容；普通菜单不再暴露技术层级。
    @objc func switchLevel(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let preset = LevelPreset(rawValue: raw)
        else { return }
        let verdict = screenCoordinator.apply(level: preset.level)
        lastLayerVerdict = verdict
        preferences.levelPreset = preset
        persistPreferences("窗口层级")
        notice = .info("窗口层级：\(verdict.summary)")
        log("切换到层级 \(preset.shortLabel)（\(preset.level)）：\(verdict.summary)")
        refreshStatusItem()
    }

    /// 打开动态壁纸浏览窗口（维护段）。
    ///
    /// **单窗口复用**：已有 controller 就只前置，不重复开 —— 否则点两次会有两个窗口，
    /// 而它们各自持有一个预览播放器，同一个视频会被下两遍。
    ///
    /// 打开窗口**不暂停桌面播放**（决策 12）：浏览窗口是「挑一张」的工具，
    /// 不该把正在看的壁纸弄停。
    @objc func openWallpaperBrowser() {
        recordRestReminderActivity()
        // 本地来源下这一项在菜单里已经置灰（`OnlineOnlyEntry.wallpaperBrowser`）。
        // 这里的守卫是给「别的途径触发」兜底 —— 窗口列的是线上分类的条目，
        // 本地来源下打开它只会显示一个与当前画面无关的目录。
        guard WallpaperSourceMenu.isEnabled(.wallpaperBrowser, isLocalSource: isLocalSource) else {
            notice = .warning("本地文件夹来源下不浏览线上内容")
            log("本地来源下忽略「打开动态壁纸」")
            refreshStatusItem()
            return
        }
        if let existing = browserWindowController {
            existing.present()
            return
        }
        let controller = WallpaperBrowserWindowController(dataSource: self)
        controller.log = { [weak self] message in self?.log(message) }
        controller.onClose = { [weak self] in
            self?.browserWindowController = nil
            self?.log("浏览窗口已关闭（桌面播放不受影响）")
        }
        browserWindowController = controller
        log("打开动态壁纸浏览窗口")
        controller.present()
    }

    @objc func reloadCatalog() {
        // 刻意**不清空候选池**：重载失败时保持现有内容继续播，
        // 而不是把池子清空、让下一次切换撞上「候选池已耗尽」。
        // 重载成功时 `handleCatalogResult` 会自己把候选集换成当前分类的那一片。
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        // 本地来源下「重新加载清单」= **重扫文件夹**（⌥⌘R 与菜单项共用这一条路径）。
        // 往文件夹里加/删 mp4 之后，就是靠它生效的 —— 定时切换刻意不重扫。
        if let folder = preferences.resolvedLocalFolderURL {
            log("重新扫描本地文件夹")
            startLocalSource(folder, isFirstLoad: false)
            return
        }
        loadCatalogAndStart()
    }

    @objc func dumpWindows() {
        guard preferences.developerToolsEnabled else { return }
        WindowInspector.printTable(highlightPIDs: [
            Int(ProcessInfo.processInfo.processIdentifier)
        ])
    }

}
