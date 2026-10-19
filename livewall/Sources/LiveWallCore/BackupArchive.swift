import CryptoKit
import Darwin
import Foundation

public enum BackupError: Error, LocalizedError {
    case invalidArchive, unsupportedVersion, pendingRestore, unsafeFile, io

    public var errorDescription: String? {
        switch self {
        case .invalidArchive: return "备份文件损坏或内容不完整"
        case .unsupportedVersion: return "此备份版本不受支持，请使用兼容的 LiveWall 版本"
        case .pendingRestore: return "已有待完成的恢复，请先重新打开 LiveWall"
        case .unsafeFile: return "备份路径必须是普通文件，不能使用符号链接"
        case .io: return "备份文件未能安全写入，请检查磁盘空间与目录权限"
        }
    }
}

/// 所有备份写入先创建 0600 临时文件，同目录原子替换，避免短暂暴露密钥。
enum BackupFileIO {
    static func write(_ data: Data, to url: URL) throws {
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".livewall-write-" + UUID().uuidString)
        let fd = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard fd >= 0 else { throw BackupError.io }
        defer { Darwin.close(fd); try? FileManager.default.removeItem(at: temporary) }
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0, errno == EINTR { continue }
                guard count > 0 else { throw BackupError.io }
                offset += count
            }
        }
        guard fsync(fd) == 0 else { throw BackupError.io }
        if FileManager.default.fileExists(atPath: url.path) { try requireRegularFile(url) }
        guard rename(temporary.path, url.path) == 0 else { throw BackupError.io }
        try syncDirectory(url.deletingLastPathComponent())
    }

    static func syncDirectory(_ url: URL) throws {
        let fd = Darwin.open(url.path, O_RDONLY | O_CLOEXEC)
        guard fd >= 0 else { throw BackupError.io }
        defer { Darwin.close(fd) }
        guard fsync(fd) == 0 else { throw BackupError.io }
    }

    static func requireRegularFile(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw BackupError.unsafeFile }
    }

    static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        return try encoder.encode(value)
    }
}

/// 免密码便携容器：密钥随密文一起携带，文件持有者即可恢复。
public struct BackupArchive: Codable, Sendable {
    public static let fileExtension = "livewallbackup"
    private static let maximumFileSize = 512 * 1024 * 1024
    public let format: String
    public let version: Int
    public let createdAt: Date
    public let appVersion: String
    public let settings: Data
    public let database: Data
    public let libraryKey: Data
    public let digest: Data

    public struct Summary: Sendable {
        public let favoriteCount: Int
        public let disabledCount: Int
        public let hasPinnedItem: Bool
    }

    public init(preferences: Preferences, snapshot: WallpaperLibraryStore.Snapshot, appVersion: String) throws {
        format = "LiveWall.Backup"
        version = 1
        createdAt = Date()
        self.appVersion = appVersion
        settings = try JSONEncoder().encode(preferences.sanitized())
        database = snapshot.database
        libraryKey = snapshot.key
        digest = Self.digest(settings: settings, database: database, key: libraryKey)
    }

    private static func digest(settings: Data, database: Data, key: Data) -> Data {
        var hash = SHA256()
        // 长度前缀确保三个独立字段的边界也参与校验。
        for data in [settings, database, key] {
            var length = UInt64(data.count).bigEndian
            withUnsafeBytes(of: &length) { hash.update(bufferPointer: $0) }
            hash.update(data: data)
        }
        return Data(hash.finalize())
    }

    public static func read(from url: URL) throws -> BackupArchive {
        try BackupFileIO.requireRegularFile(url)
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= maximumFileSize else { throw BackupError.invalidArchive }
        let archive: BackupArchive
        do { archive = try PropertyListDecoder().decode(Self.self, from: Data(contentsOf: url)) }
        catch { throw BackupError.invalidArchive }
        try archive.checkEnvelope()
        return archive
    }

    public func write(to url: URL) throws {
        try checkEnvelope()
        let data = try BackupFileIO.encode(self)
        guard data.count <= Self.maximumFileSize else { throw BackupError.invalidArchive }
        try BackupFileIO.write(data, to: url)
    }

    public func checkEnvelope() throws {
        guard format == "LiveWall.Backup" else { throw BackupError.invalidArchive }
        guard version == 1 else { throw BackupError.unsupportedVersion }
        guard libraryKey.count == 32, !database.isEmpty,
              digest == Self.digest(settings: settings, database: database, key: libraryKey),
              let object = try JSONSerialization.jsonObject(with: settings) as? [String: Any],
              object["userLibraryVersion"] as? Int == 1,
              ["favoriteItems", "disabledItems", "pinnedItem"].allSatisfy({ object[$0] == nil }) else {
            throw BackupError.invalidArchive
        }
        _ = try JSONDecoder().decode(Preferences.self, from: settings)
    }

    public func validate() async throws -> Summary {
        try checkEnvelope()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("livewall-validate-" + UUID().uuidString)
        try PrivateFileAccess.secureDirectory(at: directory)
        defer { try? FileManager.default.removeItem(at: directory) }
        try writePayload(to: directory)
        let store = try WallpaperLibraryStore(databaseURL: directory.appendingPathComponent("user-library.sqlite3"),
                                              keyURL: directory.appendingPathComponent(".user-library-key"))
        do {
            let index = try await store.prepare(configURL: directory.appendingPathComponent("config.json"))
            try await store.validateContents()
            await store.close()
            return Summary(favoriteCount: index.favoriteIDs.count, disabledCount: index.disabledIDs.count,
                           hasPinnedItem: index.pinned != nil)
        } catch {
            await store.close()
            throw error
        }
    }

    func writePayload(to directory: URL) throws {
        try BackupFileIO.write(settings, to: directory.appendingPathComponent("config.json"))
        try BackupFileIO.write(database, to: directory.appendingPathComponent("user-library.sqlite3"))
        try BackupFileIO.write(libraryKey, to: directory.appendingPathComponent(".user-library-key"))
    }
}
