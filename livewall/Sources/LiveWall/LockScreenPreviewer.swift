import AppKit
import ImageIO
import LiveWallCore
import UniformTypeIdentifiers

/// 锁屏预览：把当前壁纸的静态图同步成**系统墙纸**。
///
/// 为什么只能是静态的：锁屏界面由 `loginwindow` 在安全罩层级绘制，第三方窗口提不到它
/// 之上（能提上去就等于能伪造登录框）。所以锁屏能看到的只有**系统墙纸**本身。
/// 而本 App 的覆盖窗口在系统墙纸**之上**，桌面态下静态图被挡住、看不见 ——
/// 这既是它能工作的原因，也说明它不会干扰日常桌面观感。
///
/// 来源优先级：清单里的静态图（`coverUrl`）→ 抓当前播放帧 → 放弃（保留系统原墙纸）。
///
/// 退出时走 `freezeCurrent`：同步地把**正在播的那条**的静态图留在系统墙纸上
/// （不是恢复用户原墙纸 —— 详见那里的说明）。
/// 并发约定：状态只在主 actor 读写；下载、取帧等待、JPEG 编码与文件写入都离开主 actor。
/// `@MainActor` 用来约束状态，不把重活锁在主线程。
///
/// 注：这里此前有一条「刻意不标 `@MainActor`，标了会让 AppDelegate 里 `lazy var`
/// 的属性初始化变成跨隔离调用」的说明。那个约束只在 `AppDelegate` **没有**隔离标注时
/// 成立；`AppDelegate` 本身标了 `@MainActor` 之后它就消失了。
///
/// 标了之后有一处**必须留意**：`update` 收到的 `frameProvider` 是 async 闭包。
/// 它要读的是主 actor 隔离的播放槽位，但真正的取帧由 `AVAssetImageGenerator`
/// 异步完成，等待期间不会占住主 actor。
///
/// 真正的重活在 `FileDownloader.download` 与非隔离的 JPEG 编码里，所以 `update` 仍是
/// 「进主线程登记状态、await 时离开主线程」，不会把下载或大图编码搬到主线程上跑。
@MainActor
final class LockScreenPreviewer {

    /// 写入结果，供日志与调用方观察。
    enum Outcome: Equatable { case written, skipped, failed }

    struct PreparedPreview {
        let itemID: Int
        let coverURL: String?
        let imageURL: URL
        let source: CoverSource
    }

    /// 日志出口，由 AppDelegate 注入（这里不自己开文件）。
    var log: ((String) -> Void)?
    /// 需要提示用户时的出口：`(文本, 是否警告)`。
    var onNotice: ((String, Bool) -> Void)?

    private let cacheDirectory: URL
    private let recordsDirectory: URL
    private let policy: LockScreenPreviewPolicy
    private let setDesktopImage: (URL, NSScreen) throws -> Void
    /// 用户原墙纸的持久化位置（`displayID → 路径`）。
    ///
    /// 为什么要落盘：退出时会把当前播放的静态图**留在**系统墙纸上（见 `freezeCurrent`），
    /// 下次启动再读「原墙纸」读到的就是本 App 自己留下的那张，之后关闭锁屏预览
    /// 开关会「恢复」到一张 App 的封面。真原墙纸只在第一次运行时才拿得到，必须存下来。
    private let recordsURL: URL

    private var lastSignature: PreviewSignature?
    private var lastApplied: URL?
    private var lastDisplayIDs: [UInt32] = []
    private var lastWriteAt: Date?
    private var preparedFiles: Set<URL> = []
    private var retainedFiles: [URL] = []
    /// 每次调用 `update` 都递增。下载期间如果用户又换了片，旧操作只能丢弃结果。
    private var operationGeneration = 0
    /// 失败提示只报一次，避免每换一张片就刷一条警告。
    private var didReportFailure = false
    /// 是否已经尝试过从磁盘读回上一轮记录（只读一次，之后不再碰文件）。
    private var didAttemptLoad = false
    private var originalWallpapers: [UInt32: URL] = [:]
    /// 「系统墙纸是自家缓存图」这条日志只打一次，否则每换一张片刷一条。
    private var didReportOwnCache = false

    init(
        cacheDirectory: URL,
        recordsDirectory: URL,
        policy: LockScreenPreviewPolicy = LockScreenPreviewPolicy(),
        setDesktopImage: @escaping (URL, NSScreen) throws -> Void = { url, screen in
            try NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: [:])
        }
    ) {
        self.cacheDirectory = cacheDirectory
        self.recordsDirectory = recordsDirectory
        self.policy = policy
        self.setDesktopImage = setDesktopImage
        self.recordsURL = recordsDirectory.appendingPathComponent("original-wallpapers.json")
    }

    // MARK: - 对外接口

    /// 播放前完成下载或异步取帧与编码，此时不更改系统墙纸。
    func prepare(
        for item: WallpaperItem,
        frameProvider: () async -> CGImage?
    ) async -> PreparedPreview? {
        var imageURL: URL?
        if let coverURL = item.coverImageURL {
            do { imageURL = try await downloadCover(coverURL) }
            catch { log?("锁屏预览：静态图下载失败（\(item.id)），改用抓帧") }
        }
        let coverSucceeded = imageURL != nil
        if imageURL == nil, !Task.isCancelled {
            if let frame = await frameProvider() { imageURL = await writeFrame(frame) }
        }
        guard let imageURL else { return nil }
        let source = policy.decide(coverDownloadSucceeded: coverSucceeded, frameAvailable: true)
        let result = PreparedPreview(itemID: item.id, coverURL: item.coverUrl, imageURL: imageURL, source: source)
        guard !Task.isCancelled else {
            discard(result)
            return nil
        }
        return result
    }

    /// 加载被取消、过期或预备图已提交后，释放预备文件的所有权。
    func discard(_ prepared: PreparedPreview?) {
        guard let prepared else { return }
        preparedFiles.remove(prepared.imageURL)
        guard !retainedFiles.contains(prepared.imageURL) else { return }
        Self.removeFiles([prepared.imageURL])
    }

    /// 与 engine.play 在同一轮主 actor 内提交，退出时不会仍指向上一张封面。
    @discardableResult
    func applyPrepared(_ prepared: PreparedPreview, for item: WallpaperItem,
                       multiScreenPolicy: MultiScreenPolicy) -> Outcome {
        guard prepared.itemID == item.id, prepared.coverURL == item.coverUrl else { return .skipped }
        operationGeneration += 1
        let displayIDs = policy.targetDisplayIDs(policy: multiScreenPolicy, screens: Self.screenPairs().map(\.identity))
        return applyPrepared(prepared, for: item, displayIDs: displayIDs)
    }

    private func applyPrepared(_ prepared: PreparedPreview, for item: WallpaperItem,
                               displayIDs: [UInt32]) -> Outcome {
        restoreRemovedDisplays(currentDisplayIDs: displayIDs)
        recordOriginalsIfNeeded()
        let targets = Self.screenPairs().filter { displayIDs.contains($0.identity.displayID) }
        guard !targets.isEmpty else { return .skipped }
        let applied = setWallpaper(prepared.imageURL, to: targets)
        guard applied > 0 else {
            reportFailure("锁屏预览：系统拒绝了墙纸设置")
            return .failed
        }
        lastApplied = prepared.imageURL
        lastDisplayIDs = displayIDs
        lastSignature = PreviewSignature(itemID: item.id, displayIDs: displayIDs, coverURL: item.coverUrl)
        lastWriteAt = Date()
        didReportFailure = false
        retainedFiles.append(prepared.imageURL)
        retainedFiles = Array(retainedFiles.suffix(2))
        pruneCaches()
        let origin = prepared.source == .frame ? "抓帧" : "静态图"
        log?("锁屏预览已更新：\(prepared.imageURL.lastPathComponent)（\(origin)）→ \(applied) 块屏")
        return .written
    }

    /// 换片后调用。`frameProvider` 用于静态图缺失/下载失败时抓当前帧。
    ///
    /// 用于策略变化与开关切换；正常换片走 prepare + applyPrepared，在播放前准备完图。
    @discardableResult
    func update(
        for item: WallpaperItem,
        multiScreenPolicy: MultiScreenPolicy,
        frameProvider: @escaping () async -> CGImage?
    ) async -> Outcome {
        let pairs = Self.screenPairs()
        let displayIDs = policy.targetDisplayIDs(policy: multiScreenPolicy, screens: pairs.map(\.identity))
        let signature = PreviewSignature(
            itemID: item.id,
            displayIDs: displayIDs,
            coverURL: item.coverUrl
        )
        operationGeneration += 1
        let operation = operationGeneration

        guard policy.shouldWrite(
            previous: lastSignature,
            next: signature,
            now: Date(),
            lastWriteAt: lastWriteAt
        ) else {
            return .skipped
        }

        let outcome = await apply(
            item: item,
            displayIDs: displayIDs,
            frameProvider: frameProvider,
            operation: operation
        )
        return outcome
    }

    /// 锁屏瞬间调用：把最近一次成功的图**再设一遍**，防止上一次写入没生效
    /// （`setDesktopImageURL` 生效有延迟）。刻意不现抓帧 —— 此时播放器已暂停。
    func reapplyCached() {
        guard let lastApplied, FileManager.default.fileExists(atPath: lastApplied.path) else { return }
        let targets = Self.screenPairs().filter { lastDisplayIDs.contains($0.identity.displayID) }
        guard !targets.isEmpty else { return }
        var applied = 0
        for pair in targets {
            do {
                try setDesktopImage(lastApplied, pair.screen)
                applied += 1
            } catch {
                log?("锁屏预览：锁屏时重设屏 \(pair.identity.displayID) 失败：\(error.localizedDescription)")
            }
        }
        if applied > 0 {
            log?("锁屏预览：锁屏时重设 \(applied) 块屏")
        }
    }

    /// 退出时把「当前正在播的那条」已经缓存好的静态图**固化**成系统墙纸。
    ///
    /// 与 `update` 的区别：**这里是同步的** —— 退出流程没有时间窗，不能 await 下载。
    /// 两条来源按优先级：
    /// 1. 当前张的静态图已经写过（`lastSignature.itemID == itemID`）→ 再设一遍，
    ///    顺带兜住 `setDesktopImageURL` 的生效延迟；
    /// 2. 都拿不到 → **保持现状不动**（通常是上一张），绝不把墙纸清空。
    ///
    /// 播放切换前已完成静态图准备；退出路径不再下载、抓帧或编码。
    ///
    /// 顺带作废所有在飞的 `update`：退出清理期间它们若抢先写完，会把固化结果顶掉。
    @discardableResult
    func freezeCurrent(
        itemID: Int,
        multiScreenPolicy: MultiScreenPolicy
    ) -> Outcome {
        operationGeneration += 1

        let pairs = Self.screenPairs()
        let displayIDs = policy.targetDisplayIDs(policy: multiScreenPolicy, screens: pairs.map(\.identity))
        let targets = pairs.filter { displayIDs.contains($0.identity.displayID) }
        guard !targets.isEmpty else {
            log?("退出固化：目标屏为空，跳过")
            return .skipped
        }

        // 1) 当前张已经写过 —— 绝大多数退出走这条，图与正在播的完全一致
        if let signature = lastSignature, signature.itemID == itemID,
           let cached = lastApplied, FileManager.default.fileExists(atPath: cached.path) {
            let applied = setWallpaper(cached, to: targets)
            log?("退出固化：复用已缓存的 \(cached.lastPathComponent) → \(applied) 块屏")
            return applied > 0 ? .written : .failed
        }

        log?("退出固化：当前张的静态图尚未写好，保留现有墙纸")
        return .skipped
    }

    /// 把系统墙纸恢复成用户原来的那张（**关闭锁屏预览开关**时调用）。
    ///
    /// 退出**不**走这里 —— 退出要的是把当前播放的静态图留在桌面上（见 `freezeCurrent`）。
    /// 关掉开关时必须恢复，否则「关掉」之后锁屏仍是最后一张静态图，用户会以为开关没生效。
    /// **进程被强杀时恢复不了**（只能手动改回来），所以日志里会把原图路径打出来。
    func restoreUserWallpaper() {
        operationGeneration += 1
        guard !originalWallpapers.isEmpty else { return }
        var restored = 0
        for pair in Self.screenPairs() {
            guard let url = originalWallpapers[pair.identity.displayID] else { continue }
            do {
                try setDesktopImage(url, pair.screen)
                restored += 1
            } catch {
                log?("锁屏预览：恢复屏 \(pair.identity.displayID) 的原墙纸失败：\(error.localizedDescription)")
            }
        }
        log?("锁屏预览：已恢复原墙纸 \(restored) 块屏")
        lastApplied = nil
        lastSignature = nil
        lastDisplayIDs.removeAll()
        // 原墙纸已经还回去了，下次开写前要从头记一遍（磁盘那份仍在，允许再读一次）。
        didAttemptLoad = false
        originalWallpapers.removeAll()
    }

    /// 导入关闭预览的设置时，尚未播放过任何内容，需先读取本机恢复记录。
    func restoreRecordedUserWallpaper() {
        if originalWallpapers.isEmpty, let saved = loadRecords() { originalWallpapers = saved }
        restoreUserWallpaper()
    }

    // MARK: - 实际写入

    private func apply(
        item: WallpaperItem,
        displayIDs: [UInt32],
        frameProvider: () async -> CGImage?,
        operation: Int
    ) async -> Outcome {
        guard operation == operationGeneration else { return .skipped }

        guard let prepared = await prepare(for: item, frameProvider: frameProvider) else {
            guard operation == operationGeneration, !Task.isCancelled else { return .skipped }
            reportFailure("锁屏预览：静态图与抓帧都不可用，保留现有墙纸")
            return .failed
        }
        defer { discard(prepared) }
        guard operation == operationGeneration, !Task.isCancelled else { return .skipped }
        return applyPrepared(prepared, for: item, displayIDs: displayIDs)
    }

    private func restoreRemovedDisplays(currentDisplayIDs: [UInt32]) {
        // 判定本身是纯函数（`LockScreenPreviewPolicy.removedDisplayIDs`），可单测。
        let removed = LockScreenPreviewPolicy.removedDisplayIDs(
            previous: lastDisplayIDs, current: currentDisplayIDs)
        guard !removed.isEmpty else { return }
        for pair in Self.screenPairs() where removed.contains(pair.identity.displayID) {
            guard let url = originalWallpapers[pair.identity.displayID] else { continue }
            do {
                try setDesktopImage(url, pair.screen)
                log?("锁屏预览：策略切换，恢复移除的屏 \(pair.identity.displayID) 原墙纸")
            } catch {
                log?("锁屏预览：恢复移除的屏 \(pair.identity.displayID) 原墙纸失败：\(error.localizedDescription)")
            }
        }
    }

    private func downloadCover(_ url: URL) async throws -> URL {
        let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension.lowercased()
        let name = policy.cacheFileName(identifier: UUID(), fileExtension: ext)
        let destination = cacheDirectory.appendingPathComponent(name)
        preparedFiles.insert(destination)
        var completed = false
        defer {
            if !completed {
                preparedFiles.remove(destination)
                Self.removeFiles([destination])
            }
        }
        try PrivateFileAccess.secureDirectory(at: cacheDirectory)
        let bytes = try await FileDownloader.download(
            url,
            to: destination,
            timeout: 15,
            expectedContentTypePrefix: "image/"
        )
        try PrivateFileAccess.secureFile(at: destination)
        completed = true
        log?("锁屏预览：静态图已缓存 \(name)（\(bytes) 字节）")
        return destination
    }

    /// 把一张图设到目标屏上，返回成功设置的屏数。
    private func setWallpaper(_ url: URL, to targets: [(screen: NSScreen, identity: ScreenIdentity)]) -> Int {
        var applied = 0
        for pair in targets {
            do {
                try setDesktopImage(url, pair.screen)
                applied += 1
            } catch {
                log?("锁屏预览：设置屏 \(pair.identity.displayID) 的墙纸失败：\(error.localizedDescription)")
            }
        }
        return applied
    }

    private func writeFrame(_ image: CGImage) async -> URL? {
        let name = policy.cacheFileName(identifier: UUID(), fileExtension: "jpg")
        let destination = cacheDirectory.appendingPathComponent(name)
        preparedFiles.insert(destination)
        var completed = false
        defer {
            if !completed {
                preparedFiles.remove(destination)
                Self.removeFiles([destination])
            }
        }
        guard let data = await Task.detached(priority: .utility, operation: {
            Self.encodeJPEG(image)
        }).value else {
            log?("锁屏预览：抓到的帧无法编码为 JPEG")
            return nil
        }
        let cacheDirectory = self.cacheDirectory
        do {
            try await Task.detached(priority: .utility) {
                try PrivateFileAccess.secureDirectory(at: cacheDirectory)
                try data.write(to: destination, options: .atomic)
                try PrivateFileAccess.secureFile(at: destination)
            }.value
            completed = true
            log?("锁屏预览：已抓当前帧 \(image.width)x\(image.height) → \(name)（\(data.count) 字节）")
            return destination
        } catch {
            log?("锁屏预览：帧写入失败：\(error.localizedDescription)")
            return nil
        }
    }

    private func pruneCaches() {
        let directory = cacheDirectory
        Task { @MainActor [weak self] in
            let files = await Task.detached(priority: .utility) {
                (try? FileManager.default.contentsOfDirectory(at: directory,
                    includingPropertiesForKeys: nil))?.filter {
                    $0.lastPathComponent.hasPrefix("cover-")
                        && ["jpg", "jpeg", "png", "heic"].contains($0.pathExtension.lowercased())
                } ?? []
            }.value
            guard let self else { return }
            // 枚举返回的 URL 与 appendingPathComponent 产生的 URL 可能有不同的 base URL。
            // 同一缓存目录按唯一文件名比较，避免 URL 表示差异误删当前图或在飞预备图。
            let keep = Set(preparedFiles.map(\.lastPathComponent))
                .union(retainedFiles.map(\.lastPathComponent))
            Self.removeFiles(files.filter { !keep.contains($0.lastPathComponent) })
        }
    }

    private static func removeFiles(_ files: [URL]) {
        Task.detached(priority: .utility) {
            for file in files { try? FileManager.default.removeItem(at: file) }
        }
    }

    /// ImageIO 可在后台线程直接编码 CGImage；不要改回 `NSBitmapImageRep` 后放
    /// `Task.detached` —— AppKit 位图对象并非为后台线程使用设计。
    nonisolated private static func encodeJPEG(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else {
            return nil
        }
        let properties = [
            kCGImageDestinationLossyCompressionQuality: 0.85
        ] as CFDictionary
        CGImageDestinationAddImage(destination, image, properties)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }

    private func reportFailure(_ message: String) {
        log?("⚠️ \(message)")
        guard !didReportFailure else { return }
        didReportFailure = true
        onNotice?(message, true)
    }

    // MARK: - 原墙纸记录与恢复

    private func recordOriginalsIfNeeded() {
        // 记到了就收工。**没记到要允许下次再试** —— 典型场景是启动时系统墙纸还是
        // 上一轮留下的自家缓存图（认不出来、只能跳过），而用户在本次会话里手动换了
        // 壁纸：那时再读一次就拿到了。只读一次磁盘，之后靠内存判断。
        guard originalWallpapers.isEmpty else { return }

        if !didAttemptLoad {
            didAttemptLoad = true
            if let saved = loadRecords(), !saved.isEmpty {
                originalWallpapers = saved
                log?("锁屏预览：沿用已记录的原墙纸 \(saved.count) 块屏")
                return
            }
        }

        var recorded: [UInt32: URL] = [:]
        var skippedOwn = 0
        for pair in Self.screenPairs() {
            guard let url = NSWorkspace.shared.desktopImageURL(for: pair.screen) else { continue }
            guard !LockScreenPreviewPolicy.isOwnCacheFile(
                url,
                cacheDirectories: [cacheDirectory, LiveWallPaths.applicationSupportDirectory]
            ) else {
                skippedOwn += 1
                continue
            }
            recorded[pair.identity.displayID] = url
        }
        originalWallpapers = recorded
        guard !recorded.isEmpty else {
            guard !didReportOwnCache else { return }
            didReportOwnCache = true
            log?("锁屏预览：当前系统墙纸是本 App 上次留下的缓存图（\(skippedOwn) 块屏），没有可记录的原墙纸；用户换壁纸后会自动补记")
            return
        }
        saveRecords(recorded)
        let paths = recorded.values.map(\.path).joined(separator: "、")
        log?("锁屏预览：已记录原墙纸（\(paths)），关闭锁屏预览时恢复")
    }

    private func loadRecords() -> [UInt32: URL]? {
        guard let data = try? Data(contentsOf: recordsURL),
              let raw = try? JSONDecoder().decode([String: String].self, from: data) else { return nil }
        var result: [UInt32: URL] = [:]
        for (key, path) in raw {
            guard let displayID = UInt32(key) else { continue }
            result[displayID] = URL(fileURLWithPath: path)
        }
        return result
    }

    private func saveRecords(_ records: [UInt32: URL]) {
        let raw = Dictionary(uniqueKeysWithValues: records.map { (String($0.key), $0.value.path) })
        guard let data = try? JSONEncoder().encode(raw) else { return }
        do {
            try PrivateFileAccess.secureDirectory(at: recordsDirectory)
            try data.write(to: recordsURL, options: .atomic)
            try PrivateFileAccess.secureFile(at: recordsURL)
        } catch {
            log?("锁屏预览：原墙纸记录写入失败：\(error.localizedDescription)")
        }
    }

    // MARK: - 屏幕配对

    /// 屏幕与显示 id 的配对。与 `ScreenCoordinator.createWindows` 用同一套映射，
    /// 不依赖 `NSScreen.main`（它是「当前键盘焦点所在的屏」，会随拖窗口漂移）。
    private static func screenPairs() -> [(screen: NSScreen, identity: ScreenIdentity)] {
        NSScreen.screens.enumerated().compactMap { index, screen in
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                return nil
            }
            return (screen, ScreenIdentity(displayID: number.uint32Value, index: index))
        }
    }
}
