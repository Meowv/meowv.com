import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

extension AppDelegate {

    // MARK: - 本地文件夹数据源

    /// 扫描本地文件夹并切换过去。失败时**保留配置里的路径**并回退线上清单。
    ///
    /// 目录遍历放到后台；主 actor 只接收结果。外接盘、网络卷或大目录下，
    /// 同步扫描会直接卡住菜单与启动路径。
    ///
    /// - Parameter isFirstLoad: 是否算「本次启动的第一次加载」。只有它为真时才恢复
    ///   每屏源记忆（与线上路径同一条规则：手动重载时各屏已经记着当前条目，
    ///   再恢复一次等于把同一段视频重新拉一遍）。
    func startLocalSource(_ folder: URL, isFirstLoad: Bool) {
        scanLocalFolder(folder, isFirstLoad: isFirstLoad, persistFolderPath: false)
    }

    /// 后台扫描一个本地文件夹，成功后回到主 actor 应用。
    ///
    /// - Parameter persistFolderPath: 用户刚选中的文件夹为 true，只有扫描成功才写入配置；
    ///   启动时从配置恢复的扫描为 false，失败后保留原路径并回退线上。
    func scanLocalFolder(_ folder: URL, isFirstLoad: Bool, persistFolderPath: Bool) {
        localScanGeneration += 1
        let generation = localScanGeneration
        notice = .info("正在扫描本地文件夹…")
        refreshStatusItem()

        Task { @MainActor [weak self] in
            let result: Result<[WallpaperItem], LocalVideoSource.SourceError> = await Task.detached(
                priority: .userInitiated
            ) {
                do {
                    return .success(try LocalVideoSource.items(in: folder))
                } catch let error as LocalVideoSource.SourceError {
                    return .failure(error)
                } catch {
                    return .failure(.unreadable(error.localizedDescription))
                }
            }.value

            guard let self, generation == self.localScanGeneration else {
                self?.log("丢弃过期的本地文件夹扫描结果：\(folder.path)")
                return
            }

            switch result {
            case .success(let items):
                if persistFolderPath {
                    self.preferences.localFolderPath = folder.path
                    self.persistPreferences("壁纸来源：本地文件夹")
                    self.pendingRestore.removeAll()
                }
                self.applyLocalItems(items, folder: folder, isFirstLoad: isFirstLoad)

            case .failure(let error):
                let reason = error.errorDescription ?? error.localizedDescription
                self.log("⚠️ 本地文件夹不可用：\(reason)")
                if persistFolderPath {
                    self.notice = .warning("这个文件夹不能用（\(reason)），仍用当前来源")
                    self.refreshStatusItem()
                    return
                }
                // 配置里的路径**保留**（外接盘插回来、或 ⌥⌘R 重扫即可恢复），
                // 但生效来源翻回线上 —— 菜单必须如实显示。
                self.isLocalSource = false
                let message = "本地文件夹不可用（\(reason)），已回到线上清单"
                self.pendingSourceNotice = message
                self.notice = .warning(message)
                self.refreshStatusItem()
                self.loadCatalogAndStart()
            }
        }
    }

    /// 把已经扫到的本地条目灌进候选池并开播。
    ///
    /// 单独抽出来是为了让「用户刚选完文件夹」那条路径**只扫一次**：
    /// 先试扫校验、成功再进来，而不是校验一遍、启用时再扫一遍。
    func applyLocalItems(_ items: [WallpaperItem], folder: URL, isFirstLoad: Bool) {
        isLocalSource = true
        failuresBySlot.removeAll()
        retriesBySlot.removeAll()
        // 换来源等于换了一整片候选集，上一次的异常提示（分类加载失败等）不再成立。
        notice = nil

        pool.order = preferences.playbackOrder
        pool.setItems(items)
        log("壁纸来源：本地文件夹 \(folder.path)，\(items.count) 个 mp4")

        if isFirstLoad && !isPinned {
            // 本地条目的 id 是路径哈希，跨重启稳定，所以每屏源记忆在本地模式下同样有效。
            // 从线上切过来时记忆里的 id 一条都匹配不上（plan 会算成空），各屏正常取片。
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: Set(items.map(\.id))
            )
            if !pendingRestore.isEmpty {
                let detail = pendingRestore.map { "屏\($0.key)→\($0.value)" }.sorted().joined(
                    separator: "、")
                log("待恢复的每屏源 \(pendingRestore.count) 条：\(detail)")
            }
        }

        refreshStatusItem()

        // 固定态：不轮换，核一遍固定项即可（与线上路径同一处置）。
        guard !isPinned else {
            applyPinToMissingSlots()
            return
        }
        advance()
    }

    /// 把「来源切换」留下的说明重新挂回状态区。
    ///
    /// 线上加载成功会把 `notice` 清成 nil（那是「清掉上一次的异常」的正常行为），
    /// 而「本地文件夹不可用，已回到线上清单」正是**在它之前**写下的、用户必须看到的一句。
    func consumePendingSourceNotice() {
        guard let message = pendingSourceNotice else { return }
        pendingSourceNotice = nil
        notice = .warning(message)
    }

    // MARK: - 清单

    /// 清单由两个文件组成，启动时按顺序拉：
    /// 1. **索引** `livewall/catalog.json`（几百字节）—— 拿到分类清单，菜单就能建了；
    /// 2. **当前分类的切片** `livewall/category.<id>.json`（约 0.6 MB）—— 拿到条目。
    ///
    /// 切分类是「再拉一个切片」，不是「在本地全量里筛」：索引里**没有条目**，
    /// 那是它保持几百字节的前提。
    func loadCatalogAndStart() {
        let service = makeCatalogService()
        log("加载清单索引：远程=\(service.remoteIndexURL?.absoluteString ?? "未配置")")
        let requested = preferences.selectedCategoryID

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = service.loadIndex()
            DispatchQueue.main.async {
                guard let self else { return }
                self.handleIndexResult(result, service: service, requested: requested)
            }
        }
    }

    func makeCatalogService() -> CatalogService {
        CatalogService(
            remoteIndexURL: preferences.resolvedRemoteURL,
            indexCacheURL: indexCacheURL,
            sliceCacheURL: sliceCacheURL
        )
    }

    func handleIndexResult(
        _ result: CatalogIndexLoadResult,
        service: CatalogService,
        requested: Int?
    ) {
        // 与 `applySliceResult` 同一条理由：本地来源生效期间，线上回包（含失败回包）
        // 一律丢弃 —— 否则会把「没有可用的清单」这类提示写到正在播本地视频的状态区上，
        // 也会让索引与生效来源对不上。切回线上时会重新加载一次。
        guard !isLocalSource else {
            log("本地来源已生效，丢弃线上索引结果")
            return
        }

        guard let loaded = result.index, let origin = result.origin else {
            // 失败原因必须打出来：DNS / TLS / 超时 / 解析 各对应完全不同的处理
            for warning in result.warnings { log("  ⚠︎ \(warning)") }
            notice = .warning("没有可用的清单")
            log("清单索引加载失败：远程与本地副本都不可用")
            refreshStatusItem()
            return
        }
        index = loaded
        for warning in result.warnings { log("  ⚠︎ \(warning)") }
        log("索引来源：\(origin.label)，\(categories.count) 个分类")

        guard let target = resolveCategoryID(requested: requested) else {
            notice = .warning("没有可用的内容")
            log("索引里没有任何有内容的分类（都是 0 条）")
            refreshStatusItem()
            return
        }

        // 判定要在 `setItems` **之前**做 —— 灌进去之后池子就非空了。
        loadSlice(for: target, service: service, isFirstLoad: pool.totalCount == 0)
    }

    /// 拉取并应用某个分类的切片。
    ///
    /// 带请求序号：用户可能连点两次分类，回包时比对序号，过期结果直接丢弃 ——
    /// 否则会出现「点了 B，画面却停在 A」。
    func loadSlice(for categoryID: Int, service: CatalogService, isFirstLoad: Bool) {
        guard let entry = categories.first(where: { $0.id == categoryID }) else { return }
        sliceRequestGeneration += 1
        let generation = sliceRequestGeneration
        log("加载分类切片「\(entry.name)」（id \(entry.id)）…")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = service.loadSlice(entry)
            DispatchQueue.main.async {
                guard let self else { return }
                guard generation == self.sliceRequestGeneration else {
                    self.log("丢弃过期的分类切片结果（\(entry.name)，id \(entry.id)）")
                    return
                }
                self.applySliceResult(
                    result, entry: entry, service: service, isFirstLoad: isFirstLoad)
            }
        }
    }

    func applySliceResult(
        _ result: CatalogSliceLoadResult,
        entry: LivewallCategoryEntry,
        service: CatalogService,
        isFirstLoad: Bool
    ) {
        // 本地来源生效期间**丢弃线上结果**：用户可能在启动那一下（索引 / 切片还在路上）
        // 就切到了本地文件夹，回包若照常灌进候选池，就会出现「来源显示本地、池子里却是
        // 线上条目」——菜单、置灰、固定时的分类同步全都按「本地」判定，前后自相矛盾。
        // 请求序号挡不住这种情况：它不是「过期请求」，而是一次**来源已变**的有效回包。
        guard !isLocalSource else {
            log("本地来源已生效，丢弃线上切片结果（\(entry.name)）")
            return
        }

        guard let slice = result.catalog, let origin = result.origin else {
            // 刻意不动播放器：保持当前画面比黑屏好。
            // 首次加载时池子是空的，没有「当前画面」可保持，文案要说实话。
            for warning in result.warnings { log("  ⚠︎ \(warning)") }
            if pool.totalCount == 0 {
                notice = .warning("没有可用的内容")
                log("⚠️ 分类「\(entry.name)」切片加载失败，且当前没有在播的内容")
            } else {
                notice = .warning("分类「\(entry.name)」加载失败，保持当前画面")
                log("⚠️ 分类「\(entry.name)」（id \(entry.id)）切片加载失败，保持当前画面")
            }
            refreshStatusItem()
            return
        }

        for warning in result.warnings { log("  ⚠︎ \(warning)") }

        // 只有通过请求代次校验的结果才能成为离线副本。否则先请求 A、再请求 B，
        // B 可能先完成而 A 后完成，下一次离线启动就会读到过期分类。
        if origin == .remote, let data = result.cacheData {
            do {
                try service.cacheSlice(data)
            } catch {
                log("  ⚠︎ 分类切片已使用，但写入本地副本失败：\(error.localizedDescription)")
            }
        }

        // 切分类时 `selectCategory` 会写一句「正在加载分类「X」…」。那是**进度提示**，
        // 内容到手就该消失 —— 不能指望 `loadAndPlay` 成功时去清它：
        // 暂停（或候选池耗尽）时 `advance()` 会提前返回，那句提示就永远挂在状态区了。
        //
        // 顺带清掉更早的警告也是对的：这次操作成功了，池子已经换成新分类，
        // 「候选池已耗尽」不再成立；「已暂停调度」同样不会残留成假信息 ——
        // 成功取到内容后 `loadAndPlay` 会重排定时器，恢复播放时
        // `applyPlaybackState(.playing)` 也会重排。
        notice = nil
        // 但「本地文件夹失效、已回到线上清单」那句必须留住 —— 它正是在这次加载之前
        // 写下的，`advance()` 若因暂停/耗尽提前返回，光靠 `loadAndPlay` 兜不住。
        consumePendingSourceNotice()

        // 只有真的拿到内容才更新选中项：拉取失败时保持旧值，
        // 菜单的勾选与池子里的内容才不会打架。
        selectedCategoryID = entry.id
        if preferences.selectedCategoryID != entry.id {
            // 首次启动，或记忆值已经不在索引里（分类被删/改名）：立刻写回，
            // 否则每次启动都要重复回退一次，菜单里的勾选也不稳定。
            preferences.selectedCategoryID = entry.id
            persistPreferences("分类记忆")
        }

        pool.order = preferences.playbackOrder
        pool.setItems(slice.items)

        // 每屏独立模式下，各屏上次播的是哪一条记在 `perScreenSources` 里，这里恢复它。
        //
        // **只在本次启动第一次成功加载清单时做**：手动重载清单（⌥⌘R）时各屏已经记着
        // 当前条目，再恢复一次等于把同一段视频重新下一遍。
        // 计划里只保留**当前分类里确实存在**的条目，其余直接丢弃（见 `ScreenSourceRestore`）。
        // **固定态不填**：`advance()` 会被固定分支拦截，`pendingRestore` 不会被消费，
        // 会滞留成一份过期计划，等用户解钉后被突然消费掉 —— 表现成「解钉后莫名
        // 跳回上次开机时播的那条」。
        if isFirstLoad && !isPinned {
            pendingRestore = ScreenSourceRestore.plan(
                store: preferences.perScreenSources,
                candidateIDs: Set(slice.items.map(\.id))
            )
            if !pendingRestore.isEmpty {
                let detail = pendingRestore.map { "屏\($0.key)→\($0.value)" }.sorted().joined(
                    separator: "、")
                log("待恢复的每屏源 \(pendingRestore.count) 条：\(detail)")
            } else if preferences.multiScreenPolicy == .perScreen,
                preferences.perScreenSources.count > 0
            {
                log("每屏源记忆里的条目都不在当前分类，本轮各屏重新取片")
            }
        }

        log("内容：\(entry.name)（id \(entry.id)）\(pool.totalCount) 条，来源 \(origin.label)")
        if isFirstLoad {
            log("选片顺序：\(preferences.playbackOrder.label)（\(preferences.playbackOrder.detail)）")
        }

        refreshStatusItem()

        // 固定态：不轮换，也不因为换了分类而解钉（决策 10 —— 桌面继续播固定项，
        // 菜单「内容过滤」照实显示新分类）。
        //
        // 固定项**自包含**（`pinnedItem` 存的是整条，不是 id），所以不依赖本切片定位，
        // 这里只做一次「核一遍」：启动时各槽位还是空的，会在这里被铺满。
        // 铺满是幂等的 —— 已经铺满时就是 no-op，不会因为换个分类重下一遍视频。
        guard !isPinned else {
            applyPinToMissingSlots()
            return
        }
        advance()
    }

    // MARK: - 内容分类

    /// 解析要生效的分类：**记忆值优先**（必须仍在索引里**且有内容**），
    /// 否则用索引里的默认分类（同样要求有内容），再否则取第一个有内容的分类。
    ///
    /// 规则本身在 `LivewallIndex.playableCategoryID` 里（纯函数，可单测）；
    /// 这里只负责把「为什么换了」记进日志。
    func resolveCategoryID(requested: Int?) -> Int? {
        let resolved = index?.playableCategoryID(remembered: requested) ?? nil
        guard let requested, resolved != requested else { return resolved }

        // 走到这里说明记忆值没能直接用上，两种情况的原因完全不同，日志要分开说
        if let entry = categories.first(where: { $0.id == requested }) {
            log("记忆的分类「\(entry.name)」条目数为 0（还没抓或已被清空），改选有内容的分类")
        } else {
            log("记忆的分类 id \(requested) 已不在索引里，回退到默认分类")
        }
        return resolved
    }

    func categoryName(for id: Int?) -> String {
        CategoryMenu.selectedName(categories: categories, selectedID: id)
    }

}
