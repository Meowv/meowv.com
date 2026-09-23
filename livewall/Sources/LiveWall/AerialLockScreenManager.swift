import AppKit
import CryptoKit
import Foundation
import LiveWallCore

/// 把当前视频安装到 Aerial 槽位，并配置为系统 linked 动态墙纸。
/// 这是用户级的非公开系统集成；Apple 原视频与原 Index.plist 都会备份。
@MainActor
final class AerialLockScreenManager {

    enum UpdateOutcome {
        case applied
        case failed
        case superseded
    }

    enum ManagerError: LocalizedError {
        case unsupportedSystem
        case noDownloadedAerial
        case malformedManifest
        case missingManifestAsset(String)
        case missingIndex
        case invalidIndex
        case missingBackup
        case temporalMetadataMissing

        var errorDescription: String? {
            switch self {
            case .unsupportedSystem: return "动态锁屏当前只适配 macOS 27"
            case .noDownloadedAerial: return "请先在系统设置中下载一张 Apple Aerial 动态墙纸"
            case .malformedManifest: return "无法读取系统 Aerial 清单"
            case .missingManifestAsset(let id): return "Aerial 槽位 \(id) 不在系统清单中"
            case .missingIndex: return "找不到 macOS 墙纸选择记录"
            case .invalidIndex: return "无法读取 macOS 墙纸选择记录"
            case .missingBackup: return "Apple Aerial 原视频备份不存在，已停止恢复操作"
            case .temporalMetadataMissing: return "编码结果缺少 macOS 27 锁屏需要的 HEVC temporal 元数据"
            }
        }
    }

    private struct State: Codable {
        var assetID: String
        var sourceItemID: Int?
        var installedDigest: String?
        var pendingDigest: String?
    }

    private struct IdleSelection: Equatable {
        var provider: String
        var assetID: String?
    }

    private let fileManager = FileManager.default
    private let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/com.apple.wallpaper", isDirectory: true)
    private let appSupport = LiveWallPaths.applicationSupportDirectory
    private var aerialDirectory: URL { root.appendingPathComponent("aerials", isDirectory: true) }
    private var videosDirectory: URL { aerialDirectory.appendingPathComponent("videos", isDirectory: true) }
    private var manifestURL: URL { aerialDirectory.appendingPathComponent("manifest/entries.json") }
    private var indexURL: URL { root.appendingPathComponent("Store/Index.plist") }
    private var backupDirectory: URL { appSupport.appendingPathComponent("aerial-lock-screen", isDirectory: true) }
    private var stateURL: URL { backupDirectory.appendingPathComponent("state.json") }
    private var indexBackupURL: URL { backupDirectory.appendingPathComponent("Index.original.plist") }

    var log: ((String) -> Void)?
    var onNotice: ((String, Bool) -> Void)?

    private var isLocked = false
    private var deferredReload = false
    private var operationGeneration = 0
    private var stateCreationTask: Task<State, Error>?
    private var lockUpdateTask: Task<Void, Never>?
    private var lockUpdateItemID: Int?
    private var lockUpdateGeneration = 0

    var isActive: Bool {
        guard let state = loadState(),
              let index = loadIndex() else { return false }
        return linkedAssetIDs(in: index).contains(state.assetID)
    }

    func screenDidLock(for item: WallpaperItem?) {
        isLocked = true
        if let item {
            if lockUpdateItemID != item.id || lockUpdateTask == nil {
                lockUpdateTask?.cancel()
                lockUpdateGeneration += 1
                let generation = lockUpdateGeneration
                lockUpdateItemID = item.id
                lockUpdateTask = Task { @MainActor [weak self] in
                    guard let self else { return }
                    _ = await self.update(for: item)
                    if self.lockUpdateGeneration == generation {
                        self.lockUpdateItemID = nil
                        self.lockUpdateTask = nil
                    }
                }
            }
        } else {
            lockUpdateTask?.cancel()
            lockUpdateGeneration += 1
            lockUpdateTask = nil
            lockUpdateItemID = nil
        }
        if isActive { terminateProcess(named: "WallpaperAgent") }
    }

    func screenDidUnlock() {
        isLocked = false
        // 用户已回到桌面时丢弃在途准备，避免解锁后再下载、编码或改写系统墙纸。
        operationGeneration += 1
        lockUpdateTask?.cancel()
        lockUpdateGeneration += 1
        lockUpdateTask = nil
        lockUpdateItemID = nil
        if deferredReload {
            deferredReload = false
            restartWallpaperRenderer()
        }
        // macOS 27 的 Aerial renderer 偶发在解锁过渡后卡住；解锁后仅重启 renderer。
        if isActive { terminateProcess(named: "WallpaperAerialsExtension") }
    }

    func restoreIfDisabled() {
        guard loadState() != nil else { return }
        Task { @MainActor in
            do { try await restore(reason: "启动时动态锁屏已关闭") }
            catch { report(error, context: "启动恢复") }
        }
    }

    /// 准备动态资源。失败时不改动当前选择，调用方继续走已有静态锁屏图回退。
    func update(for item: WallpaperItem) async -> UpdateOutcome {
        guard ProcessInfo.processInfo.operatingSystemVersion.majorVersion == 27 else {
            log?("动态锁屏：macOS 版本未验证，保留静态锁屏图")
            return .failed
        }
        guard let sourceURL = item.playableURL else {
            log?("动态锁屏：当前条目没有可播放的视频 URL")
            return .failed
        }

        operationGeneration += 1
        let operation = operationGeneration
        do {
            try Task.checkCancellation()
            var state = try await loadOrCreateState()
            try Task.checkCancellation()
            let slotURL = videosDirectory.appendingPathComponent("\(state.assetID).mov")
            guard fileManager.fileExists(atPath: slotURL.path) else {
                throw ManagerError.noDownloadedAerial
            }

            if state.sourceItemID == item.id, isActive {
                log?("动态锁屏：当前 Aerial 槽位已是条目 \(item.id)，跳过重编码")
                return .applied
            }

            var downloadedSourceURL: URL?
            if !sourceURL.isFileURL {
                let ext = sourceURL.pathExtension.isEmpty ? "mp4" : sourceURL.pathExtension
                let localURL = videosDirectory.appendingPathComponent(
                    ".livewall-source-\(UUID().uuidString).\(ext)"
                )
                downloadedSourceURL = localURL
                log?("动态锁屏：下载视频到临时文件，供 Aerial 转码")
                let downloadStartedAt = ProcessInfo.processInfo.systemUptime
                let downloadedBytes = try await FileDownloader.download(
                    sourceURL,
                    to: localURL,
                    timeout: 120,
                    maxBytes: 64 * 1024 * 1024
                )
                log?(String(
                    format: "动态锁屏：视频下载完成（%.1f 秒，%.1f MB）",
                    ProcessInfo.processInfo.systemUptime - downloadStartedAt,
                    Double(downloadedBytes) / 1_000_000
                ))
            }
            try Task.checkCancellation()
            defer {
                if let downloadedSourceURL { try? fileManager.removeItem(at: downloadedSourceURL) }
            }
            let temporaryURL = videosDirectory.appendingPathComponent(".livewall-\(UUID().uuidString).mov")
            defer { try? fileManager.removeItem(at: temporaryURL) }
            log?("动态锁屏：为条目 \(item.id) 编码 HEVC temporal 视频")
            let encodingStartedAt = ProcessInfo.processInfo.systemUptime
            try await AerialVideoEncoder.encode(
                source: downloadedSourceURL ?? sourceURL,
                destination: temporaryURL
            )
            log?(String(format: "动态锁屏：视频编码完成（%.1f 秒）", ProcessInfo.processInfo.systemUptime - encodingStartedAt))
            try Task.checkCancellation()
            guard operation == operationGeneration else { return .superseded }
            let (hasGroups, digest) = try await Task.detached(priority: .utility) {
                (Self.hasTemporalGroups(in: temporaryURL), try Self.sha256(of: temporaryURL))
            }.value
            guard hasGroups else { throw ManagerError.temporalMetadataMissing }
            state.pendingDigest = digest
            try saveState(state)
            try replaceFile(at: slotURL, with: temporaryURL)
            state.sourceItemID = item.id
            state.installedDigest = digest
            state.pendingDigest = nil
            try saveState(state)

            try updateLinkedSelection(assetID: state.assetID)
            // 锁屏事件触发的准备会在画面已出现后完成；立即重载 renderer，
            // 让动态 Aerial 替换静态回退图，无需等到解锁。
            restartWallpaperRenderer()
            log?("动态锁屏：Aerial 槽位 \(state.assetID) 已切换到条目 \(item.id)")
            return .applied
        } catch {
            if error is CancellationError { return .superseded }
            if operation != operationGeneration { return .superseded }
            report(error, context: "动态锁屏准备")
            return .failed
        }
    }

    /// 只在 linked 仍选中 LiveWall 使用的 Aerial 时恢复 Index；Apple 原视频始终尽力恢复。
    func restore(reason: String = "用户关闭锁屏预览", restoreOriginalSelection: Bool? = nil) async throws {
        operationGeneration += 1
        lockUpdateTask?.cancel()
        lockUpdateGeneration += 1
        lockUpdateTask = nil
        lockUpdateItemID = nil
        guard var state = loadState() else { return }
        let slotURL = videosDirectory.appendingPathComponent("\(state.assetID).mov")
        let originalURL = backupDirectory.appendingPathComponent("\(state.assetID).original.mov")

        if fileManager.fileExists(atPath: originalURL.path), fileManager.fileExists(atPath: slotURL.path) {
            let (currentDigest, originalDigest) = try await Task.detached(priority: .utility) {
                (try Self.sha256(of: slotURL), try Self.sha256(of: originalURL))
            }.value
            let ownsCurrentVideo = currentDigest == state.installedDigest
                || currentDigest == state.pendingDigest
            if ownsCurrentVideo, currentDigest != originalDigest {
                let temporaryURL = videosDirectory.appendingPathComponent(".livewall-restore-\(UUID().uuidString).mov")
                defer { try? fileManager.removeItem(at: temporaryURL) }
                try await Task.detached(priority: .utility) {
                    try FileManager.default.copyItem(at: originalURL, to: temporaryURL)
                }.value
                try replaceFile(at: slotURL, with: temporaryURL)
                log?("动态锁屏：已恢复 Apple Aerial 原视频 \(state.assetID)")
            }
        } else if state.installedDigest != nil || state.pendingDigest != nil {
            throw ManagerError.missingBackup
        }

        let shouldRestoreSelection = restoreOriginalSelection ?? isActive
        if shouldRestoreSelection, linkedAssetIDs(in: loadIndex() ?? [:]).contains(state.assetID),
           fileManager.fileExists(atPath: indexBackupURL.path),
           let originalIndex = loadIndex(at: indexBackupURL) {
            try writeIndex(originalIndex)
        }
        state.sourceItemID = nil
        state.installedDigest = nil
        state.pendingDigest = nil
        try saveState(state)
        if isLocked { deferredReload = true } else { restartWallpaperRenderer() }
        log?("动态锁屏：\(reason)；恢复 Apple 槽位与原锁屏选择")
    }

    // MARK: - 资源与状态

    private func loadOrCreateState() async throws -> State {
        if let state = loadState() { return state }
        if let stateCreationTask { return try await stateCreationTask.value }
        let task = Task { @MainActor in try await createInitialState() }
        stateCreationTask = task
        defer { stateCreationTask = nil }
        return try await task.value
    }

    private func createInitialState() async throws -> State {
        if let state = loadState() { return state }
        guard fileManager.fileExists(atPath: indexURL.path) else { throw ManagerError.missingIndex }
        guard let index = loadIndex() else { throw ManagerError.invalidIndex }
        guard fileManager.fileExists(atPath: manifestURL.path) else { throw ManagerError.malformedManifest }
        guard let manifest = try? JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any],
              let assets = manifest["assets"] as? [[String: Any]] else {
            throw ManagerError.malformedManifest
        }

        let selectedAerialID = idleSelections(in: index).first {
            $0.provider == "com.apple.wallpaper.choice.aerials"
        }?.assetID
        let availableURLs = try fileManager.contentsOfDirectory(
            at: videosDirectory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ).filter { $0.pathExtension.lowercased() == "mov" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }

        let candidateURLs = selectedAerialID.map { id in
            availableURLs.filter { $0.deletingPathExtension().lastPathComponent.caseInsensitiveCompare(id) == .orderedSame }
        } ?? []
        let candidates = candidateURLs + availableURLs.filter { !candidateURLs.contains($0) }
        guard let slot = candidates.first else { throw ManagerError.noDownloadedAerial }
        let assetID = slot.deletingPathExtension().lastPathComponent.uppercased()
        guard assets.contains(where: { ($0["id"] as? String)?.caseInsensitiveCompare(assetID) == .orderedSame }) else {
            throw ManagerError.missingManifestAsset(assetID)
        }

        try fileManager.createDirectory(at: backupDirectory, withIntermediateDirectories: true)
        let originalVideo = backupDirectory.appendingPathComponent("\(assetID).original.mov")
        if !fileManager.fileExists(atPath: originalVideo.path) {
            try await Task.detached(priority: .utility) {
                try FileManager.default.copyItem(at: slot, to: originalVideo)
            }.value
            log?("动态锁屏：已备份 Apple Aerial 原视频（\(slot.lastPathComponent)）")
        }
        if !fileManager.fileExists(atPath: indexBackupURL.path) {
            try fileManager.copyItem(at: indexURL, to: indexBackupURL)
            log?("动态锁屏：已备份系统 Index.plist")
        }
        let state = State(assetID: assetID, sourceItemID: nil, installedDigest: nil, pendingDigest: nil)
        try saveState(state)
        return state
    }

    private func loadState() -> State? {
        guard let data = try? Data(contentsOf: stateURL) else { return nil }
        return try? JSONDecoder().decode(State.self, from: data)
    }

    private func saveState(_ state: State) throws {
        try fileManager.createDirectory(at: backupDirectory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(state)
        try data.write(to: stateURL, options: .atomic)
    }

    private func loadIndex(at url: URL? = nil) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url ?? indexURL),
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any]
        else { return nil }
        return plist
    }

    private func writeIndex(_ index: [String: Any]) throws {
        let data = try PropertyListSerialization.data(fromPropertyList: index, format: .binary, options: 0)
        try data.write(to: indexURL, options: .atomic)
    }

    // MARK: - Index.plist linked 动态墙纸选择

    private func updateLinkedSelection(assetID: String) throws {
        guard var index = loadIndex() else { throw ManagerError.invalidIndex }
        if !fileManager.fileExists(atPath: indexBackupURL.path) {
            try fileManager.createDirectory(at: backupDirectory, withIntermediateDirectories: true)
            try fileManager.copyItem(at: indexURL, to: indexBackupURL)
        }
        let config = try PropertyListSerialization.data(
            fromPropertyList: ["assetID": assetID], format: .binary, options: 0
        )
        guard let options = firstEncodedOptionValues(in: index) else { throw ManagerError.invalidIndex }
        let choice: [String: Any] = [
            "Configuration": config,
            "Files": [],
            "Provider": "com.apple.wallpaper.choice.aerials",
        ]
        let linked: [String: Any] = [
            "LastSet": Date(), "LastUse": Date(),
            "Content": ["Choices": [choice], "Shuffle": "$null", "EncodedOptionValues": options],
        ]
        let container: [String: Any] = ["Type": "linked", "Linked": linked]
        index["AllSpacesAndDisplays"] = container
        index["SystemDefault"] = container
        index["Displays"] = [String: Any]()
        index["Spaces"] = [String: Any]()
        try writeIndex(index)
    }

    private func firstEncodedOptionValues(in value: Any) -> Data? {
        if let dictionary = value as? [String: Any] {
            if let data = dictionary["EncodedOptionValues"] as? Data { return data }
            for child in dictionary.values {
                if let data = firstEncodedOptionValues(in: child) { return data }
            }
        } else if let array = value as? [Any] {
            for child in array {
                if let data = firstEncodedOptionValues(in: child) { return data }
            }
        }
        return nil
    }

    private func linkedAssetIDs(in value: Any) -> Set<String> {
        var result = Set<String>()
        func walk(_ node: Any) {
            if let dictionary = node as? [String: Any] {
                if dictionary["Type"] as? String == "linked",
                   let linked = dictionary["Linked"] as? [String: Any],
                   let content = linked["Content"] as? [String: Any],
                   let choices = content["Choices"] as? [[String: Any]] {
                    for choice in choices where choice["Provider"] as? String == "com.apple.wallpaper.choice.aerials" {
                        if let data = choice["Configuration"] as? Data,
                           let configuration = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
                           let id = configuration["assetID"] as? String { result.insert(id) }
                    }
                }
                dictionary.values.forEach(walk)
            } else if let array = node as? [Any] { array.forEach(walk) }
        }
        walk(value)
        return result
    }

    private func idleSelections(in value: Any) -> [IdleSelection] {
        var selections: [IdleSelection] = []
        func walk(_ value: Any, key: String? = nil) {
            if key == "Idle", let idle = value as? [String: Any],
               let content = idle["Content"] as? [String: Any],
               let choices = content["Choices"] as? [[String: Any]] {
                for choice in choices {
                    guard let provider = choice["Provider"] as? String,
                          let data = choice["Configuration"] as? Data else { continue }
                    let config = (try? PropertyListSerialization.propertyList(from: data, options: [], format: nil))
                        as? [String: Any]
                    selections.append(IdleSelection(provider: provider, assetID: config?["assetID"] as? String))
                }
            }
            if let dictionary = value as? [String: Any] {
                for (childKey, childValue) in dictionary { walk(childValue, key: childKey) }
            } else if let array = value as? [Any] {
                array.forEach { walk($0, key: key) }
            }
        }
        walk(value)
        return selections
    }

    // MARK: - File safety / system refresh

    private func replaceFile(at target: URL, with staged: URL) throws {
        _ = try fileManager.replaceItemAt(target, withItemAt: staged)
    }

    nonisolated private static func sha256(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// 流式查找 MOV 中的 HEVC temporal sample group 标记，避免把数百 MB 视频读入内存。
    nonisolated private static func hasTemporalGroups(in url: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        let needles = [Data("tscl".utf8), Data("tsas".utf8)]
        var found = Set<String>()
        var carry = Data()
        while let chunk = try? handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            var data = carry
            data.append(chunk)
            for needle in needles where data.range(of: needle) != nil {
                found.insert(String(data: needle, encoding: .utf8)!)
            }
            if found.count == needles.count { return true }
            carry = Data(data.suffix(3))
        }
        return false
    }

    private func restartWallpaperRenderer() {
        terminateProcess(named: "WallpaperAerialsExtension")
        terminateProcess(named: "WallpaperAgent")
        log?("动态锁屏：已请求 macOS 重新载入 Aerial 资源")
    }

    private func terminateProcess(named name: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
        // Aerial renderer 常按需启动；不存在时无需向 run.sh 的终端打印误导性告警。
        process.arguments = ["-q", name]
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            log?("动态锁屏：无法重启 \(name)：\(error.localizedDescription)")
        }
    }

    private func report(_ error: Error, context: String) {
        log?("⚠️ \(context)失败：\(error.localizedDescription)；系统锁屏保留静态图")
        onNotice?("\(context)失败，已保留静态锁屏图", true)
    }
}
