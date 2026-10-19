import CryptoKit
import Foundation

/// 恢复只在独占实例锁已取得、配置与数据库尚未打开时执行。
public struct BackupRestoreService: Sendable {
    public struct Outcome: Sendable {
        public let restored: Bool
        public let backupDirectory: URL
    }

    private enum Phase: String, Codable { case prepared, applying, rollingBack, rolledBack, committed }
    private struct State: Codable {
        let version: Int
        let id: UUID
        var phase: Phase
        var originalDigest: Data?
    }
    // 仅保存固定文件名；不从外部备份读取路径，也不替换用户数据目录或实例锁。
    private static let originalNames = ["config.json", "user-library.sqlite3", ".user-library-key",
                                        "user-library.sqlite3-wal", "user-library.sqlite3-shm"]
    public let directory: URL
    private var pending: URL { directory.appendingPathComponent(".restore-pending", isDirectory: true) }
    public var hasPendingRestore: Bool { FileManager.default.fileExists(atPath: pending.path) }

    public init(directory: URL) { self.directory = directory }

    public func stage(_ archive: BackupArchive) async throws {
        _ = try await archive.validate()
        try Task.checkCancellation()
        guard !hasPendingRestore else { throw BackupError.pendingRestore }
        try PrivateFileAccess.secureDirectory(at: directory)
        let staging = directory.appendingPathComponent(".restore-stage-" + UUID().uuidString, isDirectory: true)
        try PrivateFileAccess.secureDirectory(at: staging)
        defer { try? FileManager.default.removeItem(at: staging) }
        try archive.write(to: staging.appendingPathComponent("backup.livewallbackup"))
        let state = State(version: 1, id: UUID(), phase: .prepared)
        try BackupFileIO.write(BackupFileIO.encode(state), to: staging.appendingPathComponent("state.plist"))
        try Task.checkCancellation()
        try FileManager.default.moveItem(at: staging, to: pending)
        try BackupFileIO.syncDirectory(directory)
    }

    public func applyPending() async throws -> Outcome? { try await applyPending(checkpoint: nil) }

    // 故障注入仅供定向测试使用，模拟进程在持久化边界被终止。
    enum Step: Equatable, Sendable {
        case originalSaved, replacing(String), sidecarsRemoved, verified, committed, rollingBack, rollbackFile(String)
    }
    enum Interrupted: Error { case simulated }

    func applyPending(checkpoint: (@Sendable (Step) throws -> Void)?) async throws -> Outcome? {
        guard hasPendingRestore else { return nil }
        let stateURL = pending.appendingPathComponent("state.plist")
        try BackupFileIO.requireRegularFile(stateURL)
        var state = try PropertyListDecoder().decode(State.self, from: Data(contentsOf: stateURL))
        guard state.version == 1 else { throw BackupError.unsupportedVersion }
        let backups = directory.appendingPathComponent("Backups", isDirectory: true)
        let backup = backups.appendingPathComponent("restore-" + state.id.uuidString, isDirectory: true)
        let originalURL = backup.appendingPathComponent("original.plist")
        let outcome = Outcome(restored: state.phase != .rollingBack && state.phase != .rolledBack, backupDirectory: backup)
        if state.phase == .committed || state.phase == .rolledBack {
            try finish()
            return outcome
        }
        if state.phase == .prepared {
            // 此阶段失败尚未改动正式文件，下次启动可重新捕获原状态。
            let archive = try BackupArchive.read(from: pending.appendingPathComponent("backup.livewallbackup"))
            _ = try await archive.validate()
            try PrivateFileAccess.secureDirectory(at: backups)
            try PrivateFileAccess.secureDirectory(at: backup)
            let original = try readOriginalFiles()
            let originalData = try BackupFileIO.encode(original)
            try BackupFileIO.write(originalData, to: originalURL)
            state.originalDigest = Data(SHA256.hash(data: originalData))
            // 健康数据另外生成可直接从菜单恢复的便携备份；损坏数据仍完整保留原始文件。
            if let portable = try? await portableBackup(original) {
                try portable.write(to: backup.appendingPathComponent("before-restore.livewallbackup"))
            }
            state.phase = .applying
            try BackupFileIO.write(BackupFileIO.encode(state), to: stateURL)
            try checkpoint?(.originalSaved)
        }
        if state.phase == .rollingBack {
            try rollback(from: originalURL, digest: state.originalDigest, checkpoint: checkpoint)
            state.phase = .rolledBack
            try BackupFileIO.write(BackupFileIO.encode(state), to: stateURL)
            try finish()
            return Outcome(restored: false, backupDirectory: backup)
        }
        // 替换前再次确认回退材料完整；材料丢失或损坏时不得继续覆盖正式文件。
        _ = try readOriginalBackup(at: originalURL, digest: state.originalDigest)
        do {
            let archive = try BackupArchive.read(from: pending.appendingPathComponent("backup.livewallbackup"))
            _ = try await archive.validate()
            for (name, data) in [("config.json", archive.settings), ("user-library.sqlite3", archive.database),
                                 (".user-library-key", archive.libraryKey)] {
                try BackupFileIO.write(data, to: directory.appendingPathComponent(name))
                try checkpoint?(.replacing(name))
            }
            try removeSidecars()
            try checkpoint?(.sidecarsRemoved)
            try await verifyInstalled()
            try checkpoint?(.verified)
        } catch is Interrupted {
            throw Interrupted.simulated
        } catch {
            // 先记录回退方向，再逐文件还原；回退本身被中断也能继续。
            state.phase = .rollingBack
            try BackupFileIO.write(BackupFileIO.encode(state), to: stateURL)
            try checkpoint?(.rollingBack)
            try rollback(from: originalURL, digest: state.originalDigest, checkpoint: checkpoint)
            state.phase = .rolledBack
            try BackupFileIO.write(BackupFileIO.encode(state), to: stateURL)
            try finish()
            return Outcome(restored: false, backupDirectory: backup)
        }
        state.phase = .committed
        try BackupFileIO.write(BackupFileIO.encode(state), to: stateURL)
        try checkpoint?(.committed)
        try finish()
        return Outcome(restored: true, backupDirectory: backup)
    }

    private func readOriginalFiles() throws -> [String: Data] {
        var files: [String: Data] = [:]
        for name in Self.originalNames {
            let url = directory.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: url.path) {
                try BackupFileIO.requireRegularFile(url)
                files[name] = try Data(contentsOf: url)
            }
        }
        return files
    }

    private func portableBackup(_ files: [String: Data]) async throws -> BackupArchive {
        guard files["config.json"] != nil, files["user-library.sqlite3"] != nil,
              files[".user-library-key"] != nil else { throw BackupError.invalidArchive }
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("livewall-original-" + UUID().uuidString)
        try PrivateFileAccess.secureDirectory(at: temporary)
        defer { try? FileManager.default.removeItem(at: temporary) }
        for (name, data) in files { try BackupFileIO.write(data, to: temporary.appendingPathComponent(name)) }
        let store = try WallpaperLibraryStore(databaseURL: temporary.appendingPathComponent("user-library.sqlite3"),
                                              keyURL: temporary.appendingPathComponent(".user-library-key"))
        do {
            _ = try await store.prepare(configURL: temporary.appendingPathComponent("config.json"))
            let snapshot = try await store.exportSnapshot()
            let settings = try JSONDecoder().decode(Preferences.self, from: Data(contentsOf: temporary.appendingPathComponent("config.json")))
            await store.close()
            return try BackupArchive(preferences: settings, snapshot: snapshot, appVersion: "自动备份")
        } catch {
            await store.close()
            throw error
        }
    }

    private func verifyInstalled() async throws {
        let store = try WallpaperLibraryStore(databaseURL: directory.appendingPathComponent("user-library.sqlite3"),
                                              keyURL: directory.appendingPathComponent(".user-library-key"))
        do {
            _ = try await store.prepare(configURL: directory.appendingPathComponent("config.json"))
            try await store.validateContents()
            await store.close()
        } catch {
            await store.close()
            throw error
        }
    }

    private func removeSidecars() throws {
        for name in Self.originalNames.suffix(2) {
            let url = directory.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: url.path) {
                try BackupFileIO.requireRegularFile(url)
                try FileManager.default.removeItem(at: url)
            }
        }
        try BackupFileIO.syncDirectory(directory)
    }

    private func readOriginalBackup(at url: URL, digest: Data?) throws -> [String: Data] {
        try BackupFileIO.requireRegularFile(url)
        let data = try Data(contentsOf: url)
        guard let digest, Data(SHA256.hash(data: data)) == digest else { throw BackupError.invalidArchive }
        let original = try PropertyListDecoder().decode([String: Data].self, from: data)
        guard Set(original.keys).isSubset(of: Set(Self.originalNames)) else { throw BackupError.invalidArchive }
        return original
    }

    private func rollback(from url: URL, digest: Data?, checkpoint: (@Sendable (Step) throws -> Void)?) throws {
        let original = try readOriginalBackup(at: url, digest: digest)
        for name in Self.originalNames {
            let target = directory.appendingPathComponent(name)
            if let data = original[name] { try BackupFileIO.write(data, to: target) }
            else if FileManager.default.fileExists(atPath: target.path) {
                try BackupFileIO.requireRegularFile(target)
                try FileManager.default.removeItem(at: target)
            }
            try checkpoint?(.rollbackFile(name))
        }
        try BackupFileIO.syncDirectory(directory)
    }

    private func finish() throws {
        // 原子移走整个事务目录；清理中断不会留下缺失 state.plist 的半个事务。
        let finished = directory.appendingPathComponent(".restore-finished-" + UUID().uuidString)
        try FileManager.default.moveItem(at: pending, to: finished)
        try BackupFileIO.syncDirectory(directory)
        try? FileManager.default.removeItem(at: finished)
    }
}
