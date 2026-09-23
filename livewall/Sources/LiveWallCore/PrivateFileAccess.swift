import Foundation

/// LiveWall 私有落盘内容的 POSIX 权限与旧缓存迁移。
public enum PrivateFileAccess {

    public static let directoryPermissions = 0o700
    public static let filePermissions = 0o600

    public static func secureDirectory(at url: URL) throws {
        let attributes: [FileAttributeKey: Any] = [
            .posixPermissions: NSNumber(value: directoryPermissions),
        ]
        try FileManager.default.createDirectory(
            at: url,
            withIntermediateDirectories: true,
            attributes: attributes
        )
        try FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
    }

    public static func secureFile(at url: URL) throws {
        try FileManager.default.setAttributes(
            [.posixPermissions: NSNumber(value: filePermissions)],
            ofItemAtPath: url.path
        )
    }

    /// 收紧已有私有目录中的权限；符号链接不跟随，避免改到目录外目标。
    public static func secureTree(at root: URL) throws {
        try secureDirectory(at: root)
        guard let entries = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]
        ) else { return }

        for case let entry as URL in entries {
            let values = try entry.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { continue }
            if values.isDirectory == true {
                try secureDirectory(at: entry)
            } else {
                try secureFile(at: entry)
            }
        }
    }

    /// 清理旧版与配置混放的可再生成缓存，不触碰配置、用户恢复记录或系统备份。
    @discardableResult
    public static func removeLegacyDataCache(from legacyDirectory: URL) throws -> [String] {
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: legacyDirectory.path) else { return [] }

        let files = try fileManager.contentsOfDirectory(
            at: legacyDirectory,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
            options: [.skipsHiddenFiles]
        ).filter { isLegacyDataCacheFile($0.lastPathComponent) }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }

        var removed: [String] = []
        for file in files {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { continue }
            try fileManager.removeItem(at: file)
            removed.append(file.lastPathComponent)
        }
        return removed
    }

    private static func isLegacyDataCacheFile(_ name: String) -> Bool {
        switch name {
        case "catalog.remote-cache.index.json",
             "catalog.remote-cache.index.json.sig",
             "catalog.remote-cache.slice.json",
             "catalog.json",
             "catalog.remote-cache.json",
             "catalog.remote-cache.catalog.json":
            return true
        default:
            guard name.hasPrefix("cover-"),
                  ["jpg", "jpeg", "png", "heic"].contains(URL(fileURLWithPath: name).pathExtension.lowercased())
            else { return false }
            return true
        }
    }
}
