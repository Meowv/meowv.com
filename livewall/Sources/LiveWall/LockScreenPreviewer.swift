import AppKit
import LiveWallCore

/// 锁屏预览：把当前壁纸的静态图同步成**系统墙纸**。
///
/// 为什么只能是静态的：锁屏界面由 `loginwindow` 在安全罩层级绘制，第三方窗口提不到它
/// 之上（能提上去就等于能伪造登录框）。所以锁屏能看到的只有**系统墙纸**本身。
/// 而本 App 的覆盖窗口在系统墙纸**之上**，桌面态下静态图被挡住、看不见 ——
/// 这既是它能工作的原因，也说明它不会干扰日常桌面观感。
///
/// 来源优先级：清单里的静态图（`coverUrl`）→ 抓当前播放帧 → 放弃（保留系统原墙纸）。
/// 并发约定与项目其它组件一致：**只在主线程使用**（AppDelegate 在主线程调用，
/// 内部异步路径也都在 `Task { @MainActor in }` 里 await）。刻意**不**标注 `@MainActor` ——
/// 标了会让 AppDelegate 里 `lazy var` 的属性初始化变成跨隔离调用，直接编译报错。
final class LockScreenPreviewer {

    /// 写入结果，供日志与调用方观察。
    enum Outcome: Equatable { case written, skipped, failed }

    /// 日志出口，由 AppDelegate 注入（这里不自己开文件）。
    var log: ((String) -> Void)?
    /// 需要提示用户时的出口：`(文本, 是否警告)`。
    var onNotice: ((String, Bool) -> Void)?

    private let cacheDirectory: URL
    private let policy: LockScreenPreviewPolicy

    private var lastSignature: PreviewSignature?
    private var lastApplied: URL?
    private var lastDisplayIDs: [UInt32] = []
    private var lastWriteAt: Date?
    private var generation = 0
    /// 每次调用 `update` 都递增。下载期间如果用户又换了片，旧操作只能丢弃结果。
    private var operationGeneration = 0
    /// 失败提示只报一次，避免每换一张片就刷一条警告。
    private var didReportFailure = false
    private var didRecordOriginals = false
    private var originalWallpapers: [UInt32: URL] = [:]

    init(cacheDirectory: URL, policy: LockScreenPreviewPolicy = LockScreenPreviewPolicy()) {
        self.cacheDirectory = cacheDirectory
        self.policy = policy
    }

    // MARK: - 对外接口

    /// 换片后调用。`frameProvider` 用于静态图缺失/下载失败时抓当前帧。
    ///
    /// 注意调用时机：**抓帧必须在播放中进行**。锁屏通知到达时 governor 已经把播放器
    /// 暂停了，那时 `hasNewPixelBuffer` 恒为 false，只能复用已缓存的图。
    @discardableResult
    func update(
        for item: WallpaperItem,
        multiScreenPolicy: MultiScreenPolicy,
        frameProvider: @escaping () -> CGImage?
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
        if outcome == .written {
            lastSignature = signature
            lastWriteAt = Date()
            didReportFailure = false
        }
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
                try NSWorkspace.shared.setDesktopImageURL(lastApplied, for: pair.screen, options: [:])
                applied += 1
            } catch {
                log?("锁屏预览：锁屏时重设屏 \(pair.identity.displayID) 失败：\(error.localizedDescription)")
            }
        }
        if applied > 0 {
            log?("锁屏预览：锁屏时重设 \(applied) 块屏")
        }
    }

    /// 退出时把系统墙纸恢复成用户原来的那张。
    ///
    /// 不做的话，App 退出后桌面会直接露出一张「最后播放过的静态图」，用户会以为
    /// 自己的壁纸被改坏了。**进程被强杀时恢复不了**（只能手动改回来），所以日志里
    /// 会把原图路径打出来。
    func restoreUserWallpaper() {
        operationGeneration += 1
        guard didRecordOriginals, !originalWallpapers.isEmpty else { return }
        var restored = 0
        for pair in Self.screenPairs() {
            guard let url = originalWallpapers[pair.identity.displayID] else { continue }
            do {
                try NSWorkspace.shared.setDesktopImageURL(url, for: pair.screen, options: [:])
                restored += 1
            } catch {
                log?("锁屏预览：恢复屏 \(pair.identity.displayID) 的原墙纸失败：\(error.localizedDescription)")
            }
        }
        log?("锁屏预览：已恢复原墙纸 \(restored) 块屏")
        lastApplied = nil
        lastSignature = nil
        lastDisplayIDs.removeAll()
        didRecordOriginals = false
        originalWallpapers.removeAll()
    }

    // MARK: - 实际写入

    private func apply(
        item: WallpaperItem,
        displayIDs: [UInt32],
        frameProvider: () -> CGImage?,
        operation: Int
    ) async -> Outcome {
        guard operation == operationGeneration else { return .skipped }

        // 从「全部屏幕」切到「仅主屏」等策略变化时，先把被移除的屏幕恢复成
        // 用户原来的墙纸；否则它会一直停留在上一张锁屏预览图。
        restoreRemovedDisplays(currentDisplayIDs: displayIDs)

        var coverFile: URL?
        if let coverURL = item.coverImageURL {
            do {
                coverFile = try await downloadCover(coverURL)
            } catch {
                log?("锁屏预览：静态图下载失败（\(item.id)：\(error.localizedDescription)），改用抓帧")
            }
        } else {
            log?("锁屏预览：清单里没有静态图地址（\(item.id)），改用抓帧")
        }
        guard operation == operationGeneration else { return .skipped }

        // 抓帧是兜底，不是主路径 —— 只有静态图不可用才去抓
        let frame = coverFile == nil ? frameProvider() : nil
        guard operation == operationGeneration else { return .skipped }
        let source = policy.decide(
            coverDownloadSucceeded: coverFile != nil,
            frameAvailable: frame != nil
        )

        let imageURL: URL
        switch source {
        case .remote:
            guard let coverFile else { return .failed }
            imageURL = coverFile
        case .frame:
            guard let frame, let written = writeFrame(frame) else {
                reportFailure("锁屏预览：静态图与抓帧都不可用，保留系统原墙纸")
                return .failed
            }
            imageURL = written
        case .none:
            reportFailure("锁屏预览：静态图与抓帧都不可用，保留系统原墙纸")
            return .failed
        }
        guard operation == operationGeneration else { return .skipped }

        recordOriginalsIfNeeded()

        let targets = Self.screenPairs().filter { displayIDs.contains($0.identity.displayID) }
        guard !targets.isEmpty else {
            log?("锁屏预览：目标屏为空，跳过 \(item.id)")
            return .skipped
        }

        var applied = 0
        for pair in targets {
            guard operation == operationGeneration else { return .skipped }
            do {
                try NSWorkspace.shared.setDesktopImageURL(imageURL, for: pair.screen, options: [:])
                applied += 1
            } catch {
                log?("锁屏预览：设置屏 \(pair.identity.displayID) 的墙纸失败：\(error.localizedDescription)")
            }
        }
        guard applied > 0 else {
            reportFailure("锁屏预览：系统拒绝了墙纸设置")
            return .failed
        }

        lastApplied = imageURL
        lastDisplayIDs = displayIDs
        let origin = source == .frame ? "抓帧" : "静态图"
        log?("锁屏预览已更新：\(imageURL.lastPathComponent)（\(origin)）→ \(applied) 块屏")
        return .written
    }

    private func restoreRemovedDisplays(currentDisplayIDs: [UInt32]) {
        let previous = Set(lastDisplayIDs)
        let current = Set(currentDisplayIDs)
        let removed = previous.subtracting(current)
        guard !removed.isEmpty else { return }
        for pair in Self.screenPairs() where removed.contains(pair.identity.displayID) {
            guard let url = originalWallpapers[pair.identity.displayID] else { continue }
            do {
                try NSWorkspace.shared.setDesktopImageURL(url, for: pair.screen, options: [:])
                log?("锁屏预览：策略切换，恢复移除的屏 \(pair.identity.displayID) 原墙纸")
            } catch {
                log?("锁屏预览：恢复移除的屏 \(pair.identity.displayID) 原墙纸失败：\(error.localizedDescription)")
            }
        }
    }

    private func downloadCover(_ url: URL) async throws -> URL {
        let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension.lowercased()
        let name = policy.cacheFileName(generation: generation, fileExtension: ext)
        generation += 1
        let destination = cacheDirectory.appendingPathComponent(name)
        let bytes = try await FileDownloader.download(
            url,
            to: destination,
            timeout: 15,
            expectedContentTypePrefix: "image/"
        )
        log?("锁屏预览：静态图已缓存 \(name)（\(bytes) 字节）")
        return destination
    }

    private func writeFrame(_ image: CGImage) -> URL? {
        let name = policy.cacheFileName(generation: generation, fileExtension: "jpg")
        generation += 1
        let destination = cacheDirectory.appendingPathComponent(name)
        let rep = NSBitmapImageRep(cgImage: image)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
            log?("锁屏预览：抓到的帧无法编码为 JPEG")
            return nil
        }
        do {
            try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
            try data.write(to: destination, options: .atomic)
            log?("锁屏预览：已抓当前帧 \(image.width)x\(image.height) → \(name)（\(data.count) 字节）")
            return destination
        } catch {
            log?("锁屏预览：帧写入失败：\(error.localizedDescription)")
            return nil
        }
    }

    private func reportFailure(_ message: String) {
        log?("⚠️ \(message)")
        guard !didReportFailure else { return }
        didReportFailure = true
        onNotice?(message, true)
    }

    // MARK: - 原墙纸记录与恢复

    private func recordOriginalsIfNeeded() {
        guard !didRecordOriginals else { return }
        didRecordOriginals = true
        for pair in Self.screenPairs() {
            if let url = NSWorkspace.shared.desktopImageURL(for: pair.screen) {
                originalWallpapers[pair.identity.displayID] = url
            }
        }
        if !originalWallpapers.isEmpty {
            let paths = originalWallpapers.values.map(\.path).joined(separator: "、")
            log?("锁屏预览：已记录原墙纸（\(paths)），退出时恢复")
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
