import CryptoKit
import Darwin
import Foundation
import SQLite3

// 连接只由所属 actor 使用；包装类仅负责在任意释放线程关闭句柄。
private final class LibraryConnection: @unchecked Sendable {
    let handle: OpaquePointer
    init(_ handle: OpaquePointer) { self.handle = handle }
    deinit { sqlite3_close_v2(handle) }
}

/// SQLite 的明文列仅含 ID、所属列表和顺序；条目、固定快照和迁移备份均经过认证加密。
public actor WallpaperLibraryStore {
    public enum Kind: Int, Sendable { case favorites = 1, disabled = 2 }

    public struct Index: Sendable {
        public let favoriteIDs: Set<Int>
        public let disabledIDs: Set<Int>
        public let pinned: WallpaperItem?
    }

    public struct Change: Sendable {
        public let id: Int?
        public let isFavorite: Bool
        public let isDisabled: Bool
        public let pinned: WallpaperItem?
    }

    public struct Page: Sendable {
        public let items: [WallpaperItem]
        public let total: Int
        public let offset: Int
        public let nextOffset: Int?
        public let revision: UInt64
    }

    public enum StoreError: Error, LocalizedError {
        case invalidKey, database(String), malformedRecord, crypto, migrationConflict, unsupportedVersion, queryChanged
        public var errorDescription: String? {
            switch self {
            case .invalidKey: return "用户壁纸库密钥缺失或无效，请恢复同一备份中的数据库与密钥"
            case .database(let message): return "用户壁纸库数据库错误：\(message)"
            case .malformedRecord: return "用户壁纸库记录格式无效"
            case .crypto: return "用户壁纸库认证失败，请检查数据库与密钥是否属于同一备份"
            case .migrationConflict: return "用户壁纸库迁移与配置不一致，已保留原数据并停止加载"
            case .unsupportedVersion: return "用户壁纸库版本不受支持"
            case .queryChanged: return "壁纸列表已变化，请重新加载"
            }
        }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private let databaseURL: URL
    private let keyURL: URL
    private var connection: LibraryConnection?
    private var key: SymmetricKey?
    private var kinds: [Int: Kind] = [:]
    private var pinned: WallpaperItem?
    private var sequence: Int64 = 0
    private var revision: UInt64 = 0
    // 仅缓存最近解密的 512 条；全文检索索引只在内存中保存可搜索文本。
    private var cache: [Int: (item: WallpaperItem, stamp: UInt64)] = [:]
    private var clock: UInt64 = 0
    private var cacheAccesses: [(id: Int, stamp: UInt64)] = []
    private var cacheHead = 0
    public var decryptedCacheCount: Int { cache.count }
    private var searchText: [Int: String] = [:]
    private var searchIndexReady = false

    /// 初始化不触碰文件系统；所有 I/O 从 load() 开始在 actor 上执行。
    public init(databaseURL: URL, keyURL: URL) throws {
        self.databaseURL = databaseURL; self.keyURL = keyURL
    }

    /// 正式启动入口先核对配置版本和数据库存在性，避免丢失数据库后生成新的空库或密钥。
    public func prepare(configURL: URL) throws -> Index {
        if FileManager.default.fileExists(atPath: configURL.path) {
            let raw = try Data(contentsOf: configURL)
            guard let object = try JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw StoreError.migrationConflict }
            let version = try Self.configVersion(object)
            if version > 0, !FileManager.default.fileExists(atPath: databaseURL.path) { throw StoreError.migrationConflict }
        }
        try load()
        return try prepareMigration(configURL: configURL)
    }

    private static func configVersion(_ object: [String: Any]) throws -> Int {
        guard let value = object["userLibraryVersion"] else { return 0 }
        guard let version = value as? Int, (0...1).contains(version) else { throw StoreError.unsupportedVersion }
        return version
    }

    public func load() throws {
        guard connection == nil else { return }
        let exists = FileManager.default.fileExists(atPath: databaseURL.path)
        let material = try Self.loadKey(at: keyURL, databaseExists: exists)
        key = SymmetricKey(data: material)
        // 预建 0600 主文件，SQLite 创建的 WAL/SHM 继承主文件权限。
        if !exists {
            let fd = Darwin.open(databaseURL.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0o600)
            guard fd >= 0 else { throw StoreError.database("无法创建私有数据库") }
            Darwin.close(fd)
        }
        try Self.requireRegularFile(databaseURL)
        try PrivateFileAccess.secureFile(at: databaseURL)
        var pointer: OpaquePointer?
        guard sqlite3_open_v2(databaseURL.path, &pointer, SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let pointer else {
            if let pointer { sqlite3_close_v2(pointer) }
            throw StoreError.database("无法打开数据库")
        }
        connection = LibraryConnection(pointer)
        do {
            sqlite3_busy_timeout(pointer, 5_000)
            try exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON")
            try exec("CREATE TABLE IF NOT EXISTS library_metadata(key TEXT PRIMARY KEY, value BLOB NOT NULL)")
            let storedFormat = try metadata("format")
            if let version = storedFormat, version != Data("1".utf8) { throw StoreError.unsupportedVersion }
            if let check = try metadata("key_check") {
                guard storedFormat != nil,
                      try open(check, domain: "key-check") == Data("LiveWall user library".utf8) else { throw StoreError.crypto }
                guard try scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('library_records','library_pin')") == 2 else {
                    throw StoreError.malformedRecord
                }
            } else {
                guard storedFormat == nil else { throw StoreError.crypto }
                // 空文件允许恢复首次建库；已有未知表或认证信息缺失时不接管。
                if try scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT IN ('library_metadata')") > 0 {
                    throw StoreError.unsupportedVersion
                }
                try transaction {
                    try exec("CREATE TABLE library_records(id INTEGER PRIMARY KEY, kind INTEGER NOT NULL CHECK(kind IN (1,2)), sort_order INTEGER NOT NULL, payload BLOB NOT NULL)")
                    try exec("CREATE TABLE library_pin(singleton INTEGER PRIMARY KEY CHECK(singleton=1), id INTEGER NOT NULL, payload BLOB NOT NULL)")
                    try putMetadata("format", Data("1".utf8))
                    try putMetadata("key_check", seal(Data("LiveWall user library".utf8), domain: "key-check"))
                }
            }
            try exec("CREATE INDEX IF NOT EXISTS library_kind_order ON library_records(kind,sort_order DESC,id)")
            var loaded: [Int: Kind] = [:]
            try rows("SELECT id,kind FROM library_records") { stmt in
                guard let kind = Kind(rawValue: Int(sqlite3_column_int(stmt, 1))) else { throw StoreError.malformedRecord }
                loaded[Int(sqlite3_column_int64(stmt, 0))] = kind
            }
            let restoredPin = try readPin()
            sequence = try scalar("SELECT COALESCE(MAX(sort_order),0) FROM library_records")
            kinds = loaded; pinned = restoredPin
            try protectFiles()
        } catch {
            connection = nil; key = nil; kinds = [:]; pinned = nil
            throw error
        }
    }

    public func index() -> Index {
        Index(favoriteIDs: Set(kinds.compactMap { $0.value == .favorites ? $0.key : nil }),
              disabledIDs: Set(kinds.compactMap { $0.value == .disabled ? $0.key : nil }), pinned: pinned)
    }

    public func orderedIDs(kind: Kind) throws -> [Int] {
        var ids: [Int] = []
        try rows("SELECT id FROM library_records WHERE kind=\(kind.rawValue) ORDER BY sort_order DESC,id") {
            ids.append(Int(sqlite3_column_int64($0, 0)))
        }
        return ids
    }

    public func item(id: Int) throws -> WallpaperItem? {
        guard let kind = kinds[id] else { return nil }
        if let hit = cache[id] { remember(hit.item); return hit.item }
        var item: WallpaperItem?
        try rows("SELECT payload FROM library_records WHERE id=\(id)") {
            item = try decode(Self.blob($0, 0), id: id, domain: "item:\(kind.rawValue):\(id)")
        }
        if let item { remember(item) }
        return item
    }

    public func page(kind: Kind, offset: Int = 0, limit: Int = 200, query: String = "", expectedRevision: UInt64? = nil, locateID: Int? = nil) async throws -> Page {
        try Task.checkCancellation()
        if let expectedRevision, expectedRevision != revision { throw StoreError.queryChanged }
        let startRevision = revision
        let terms = query.split(whereSeparator: \.isWhitespace).map { String($0).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil) }
        let count = min(200, max(1, limit))
        var start = max(0, offset)
        if terms.isEmpty, let locateID, kinds[locateID] == kind {
            let ids = try orderedIDs(kind: kind)
            if let position = ids.firstIndex(of: locateID) { start = position / count * count }
        }
        let ids: [Int]
        let total: Int
        if terms.isEmpty {
            total = Int(try scalar("SELECT count(*) FROM library_records WHERE kind=\(kind.rawValue)"))
            var selected: [Int] = []
            try rows("SELECT id FROM library_records WHERE kind=\(kind.rawValue) ORDER BY sort_order DESC,id LIMIT \(count) OFFSET \(start)") {
                selected.append(Int(sqlite3_column_int64($0, 0)))
            }
            ids = selected
        } else {
            try await buildSearchIndex()
            let ordered = try orderedIDs(kind: kind)
            var matches: [Int] = []
            for (position, id) in ordered.enumerated() {
                if terms.allSatisfy({ searchText[id, default: ""].contains($0) }) { matches.append(id) }
                if position % 200 == 199 {
                    await Task.yield(); try Task.checkCancellation()
                    guard revision == startRevision else { throw StoreError.queryChanged }
                }
            }
            total = matches.count
            ids = Array(matches.dropFirst(start).prefix(count))
        }
        guard revision == startRevision else { throw StoreError.queryChanged }
        let items = try ids.compactMap { try item(id: $0) }
        return Page(items: items, total: total, offset: start, nextOffset: start + items.count < total ? start + items.count : nil, revision: revision)
    }

    public func setFavorite(_ item: WallpaperItem, enabled: Bool) throws -> Change {
        try set(item, kind: .favorites, enabled: enabled)
    }

    public func setDisabled(_ item: WallpaperItem, enabled: Bool) throws -> Change {
        try set(item, kind: .disabled, enabled: enabled)
    }

    public func setPinned(_ item: WallpaperItem?) throws -> Change {
        if let item {
            guard item.playableURL != nil, !(item.remoteURL != nil && kinds[item.id] == .disabled) else { throw StoreError.malformedRecord }
        }
        try transaction { try writePin(item) }
        pinned = item; revision &+= 1
        return change(id: item?.id)
    }

    /// 原始配置先作为密文备份与导入状态一同提交。核对后才原子清理 JSON，支持中途退出后重试。
    public func prepareMigration(configURL: URL) throws -> Index {
        guard connection != nil else { throw StoreError.database("条目库尚未打开") }
        let exists = FileManager.default.fileExists(atPath: configURL.path)
        let raw = exists ? try Data(contentsOf: configURL) : Data("{}".utf8)
        guard let object = try JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw StoreError.migrationConflict }
        let format = try Self.configVersion(object)
        let phase = try metadata("migration_phase").flatMap { String(data: $0, encoding: .utf8) }
        guard phase == nil || phase == "imported" || phase == "complete" else { throw StoreError.migrationConflict }
        if format > 0, phase == nil { throw StoreError.migrationConflict }
        let hash = Data(SHA256.hash(data: raw))
        var cleanObject = object
        ["favoriteItems", "disabledItems", "pinnedItem"].forEach { cleanObject.removeValue(forKey: $0) }
        cleanObject["userLibraryVersion"] = 1
        let cleaned = try JSONSerialization.data(withJSONObject: cleanObject, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        if phase == "imported" {
            // JSON 已清理、但最后一次元数据提交尚未完成，也可继续；其它改写必须人工处理。
            guard try metadata("migration_hash") == hash || metadata("migration_clean_hash") == hash,
                  let backup = try metadata("migration_backup") else { throw StoreError.migrationConflict }
            let original = try JSONDecoder().decode(Preferences.self, from: open(backup, domain: "legacy-config")).sanitized()
            let expectedPin = original.pinnedItem.flatMap { item in
                item.remoteURL != nil && Set(original.disabledItems.map(\.id)).contains(item.id) ? nil : item
            }
            guard try readAll(kind: .favorites) == original.favoriteItems,
                  try readAll(kind: .disabled) == original.disabledItems, try readPin() == expectedPin else {
                throw StoreError.migrationConflict
            }
        } else if phase == nil {
            guard kinds.isEmpty, pinned == nil else { throw StoreError.migrationConflict }
            for name in ["favoriteItems", "disabledItems"] {
                if let value = object[name], !(value is [Any]), !(value is NSNull) { throw StoreError.migrationConflict }
            }
            let legacy = try JSONDecoder().decode(Preferences.self, from: raw).sanitized()
            let favorites = legacy.favoriteItems
            let disabled = legacy.disabledItems
            let pin = legacy.pinnedItem.flatMap { item in
                item.remoteURL != nil && Set(disabled.map(\.id)).contains(item.id) ? nil : item
            }
            try transaction {
                guard try metadata("migration_phase") == nil else { throw StoreError.migrationConflict }
                try putMetadata("migration_backup", seal(raw, domain: "legacy-config"))
                try putMetadata("migration_hash", hash)
                try putMetadata("migration_clean_hash", Data(SHA256.hash(data: cleaned)))
                for (position, item) in favorites.enumerated() {
                    try write(item, kind: .favorites, order: Int64(favorites.count - position))
                }
                for (position, item) in disabled.enumerated() {
                    try write(item, kind: .disabled, order: Int64(disabled.count - position))
                }
                try writePin(pin)
                // 按实际写回的密文核对内容和顺序，事务失败不会清理原 JSON。
                guard try readAll(kind: .favorites) == favorites, try readAll(kind: .disabled) == disabled,
                      try readPin() == pin,
                      try metadata("migration_backup").map({ try open($0, domain: "legacy-config") }) == raw else {
                    throw StoreError.migrationConflict
                }
                try putMetadata("migration_phase", Data("imported".utf8))
            }
            for item in favorites { kinds[item.id] = .favorites }
            for item in disabled { kinds[item.id] = .disabled }
            pinned = pin; sequence = Int64(max(favorites.count, disabled.count)); revision &+= 1
        }
        // 完成后的数据库始终权威，旧客户端重新写入的条目不会覆盖它。
        let legacyNames = ["favoriteItems", "disabledItems", "pinnedItem"]
        if format != 1 || legacyNames.contains(where: { object[$0] != nil }) {
            if exists { guard try Data(contentsOf: configURL) == raw else { throw StoreError.migrationConflict } }
            else if FileManager.default.fileExists(atPath: configURL.path) { throw StoreError.migrationConflict }
            try PrivateFileAccess.secureDirectory(at: configURL.deletingLastPathComponent())
            try cleaned.write(to: configURL, options: .atomic)
            try PrivateFileAccess.secureFile(at: configURL)
        }
        try putMetadata("migration_phase", Data("complete".utf8))
        return index()
    }

    private func set(_ item: WallpaperItem, kind: Kind, enabled: Bool) throws -> Change {
        guard item.id > 0, item.remoteURL != nil else { throw StoreError.malformedRecord }
        let oldKind = kinds[item.id]
        if !enabled && oldKind != kind { return change(id: item.id) }
        let removePin = enabled && kind == .disabled && pinned?.remoteURL != nil && pinned?.id == item.id
        let order = sequence + 1
        try transaction {
            if enabled { try write(item, kind: kind, order: order) }
            else { try exec("DELETE FROM library_records WHERE id=\(item.id)") }
            if removePin { try writePin(nil) }
        }
        // 只有 COMMIT 成功后才能改变缓存、索引和 UI 可见状态。
        kinds[item.id] = enabled ? kind : nil
        cache.removeValue(forKey: item.id)
        searchText[item.id] = enabled ? Self.searchable(item) : nil
        if enabled { sequence = order }
        if removePin { pinned = nil }
        revision &+= 1
        return change(id: item.id)
    }

    private func change(id: Int?) -> Change {
        Change(id: id, isFavorite: id.map { kinds[$0] == .favorites } ?? false,
               isDisabled: id.map { kinds[$0] == .disabled } ?? false, pinned: pinned)
    }

    private func remember(_ item: WallpaperItem) {
        clock &+= 1
        cache[item.id] = (item, clock)
        cacheAccesses.append((item.id, clock))
        while cache.count > 512, cacheHead < cacheAccesses.count {
            let access = cacheAccesses[cacheHead]
            cacheHead += 1
            if cache[access.id]?.stamp == access.stamp { cache.removeValue(forKey: access.id) }
        }
        if cacheAccesses.count > 2048 {
            cacheAccesses = cacheAccesses.dropFirst(cacheHead).filter { cache[$0.id]?.stamp == $0.stamp }
            cacheHead = 0
        }
    }

    private static func searchable(_ item: WallpaperItem) -> String {
        ([item.title, item.author] + item.tags).joined(separator: "\n").folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    private func buildSearchIndex() async throws {
        guard !searchIndexReady else { return }
        let start = revision
        let ids = Array(kinds.keys)
        for (position, id) in ids.enumerated() {
            if searchText[id] == nil, let item = try item(id: id) { searchText[id] = Self.searchable(item) }
            if position % 200 == 199 {
                await Task.yield(); try Task.checkCancellation()
                guard revision == start else { throw StoreError.queryChanged }
            }
        }
        searchIndexReady = true
    }

    // MARK: - SQL

    private var db: OpaquePointer {
        get throws {
            guard let connection else { throw StoreError.database("数据库已关闭") }
            return connection.handle
        }
    }

    private func exec(_ sql: String) throws {
        guard sqlite3_exec(try db, sql, nil, nil, nil) == SQLITE_OK else { throw StoreError.database("SQL 执行失败") }
    }

    private func rows(_ sql: String, _ body: (OpaquePointer) throws -> Void) throws {
        var pointer: OpaquePointer?
        guard sqlite3_prepare_v2(try db, sql, -1, &pointer, nil) == SQLITE_OK, let pointer else { throw StoreError.database("SQL 准备失败") }
        defer { sqlite3_finalize(pointer) }
        while true {
            let result = sqlite3_step(pointer)
            if result == SQLITE_DONE { return }
            guard result == SQLITE_ROW else { throw StoreError.database("SQL 读取失败") }
            try body(pointer)
        }
    }

    private func scalar(_ sql: String) throws -> Int64 {
        var value: Int64 = 0
        try rows(sql) { value = sqlite3_column_int64($0, 0) }
        return value
    }

    private static func blob(_ stmt: OpaquePointer, _ column: Int32) throws -> Data {
        let count = Int(sqlite3_column_bytes(stmt, column))
        guard let bytes = sqlite3_column_blob(stmt, column), count > 0 else { throw StoreError.malformedRecord }
        return Data(bytes: bytes, count: count)
    }

    private func metadata(_ name: String) throws -> Data? {
        var value: Data?
        try rows("SELECT value FROM library_metadata WHERE key='\(name)'") { value = try Self.blob($0, 0) }
        return value
    }

    private func putMetadata(_ name: String, _ value: Data) throws {
        try bindBlob("INSERT OR REPLACE INTO library_metadata(key,value) VALUES('\(name)',?)", value)
    }

    private func bindBlob(_ sql: String, _ value: Data) throws {
        var pointer: OpaquePointer?
        guard sqlite3_prepare_v2(try db, sql, -1, &pointer, nil) == SQLITE_OK, let pointer else { throw StoreError.database("SQL 准备失败") }
        defer { sqlite3_finalize(pointer) }
        guard value.withUnsafeBytes({ sqlite3_bind_blob(pointer, 1, $0.baseAddress, Int32(value.count), Self.transient) }) == SQLITE_OK,
              sqlite3_step(pointer) == SQLITE_DONE else { throw StoreError.database("SQL 写入失败") }
    }

    private func write(_ item: WallpaperItem, kind: Kind, order: Int64) throws {
        let payload = try seal(JSONEncoder().encode(item), domain: "item:\(kind.rawValue):\(item.id)")
        try bindBlob("INSERT OR REPLACE INTO library_records(id,kind,sort_order,payload) VALUES(\(item.id),\(kind.rawValue),\(order),?)", payload)
    }

    private func writePin(_ item: WallpaperItem?) throws {
        try exec("DELETE FROM library_pin")
        if let item {
            try bindBlob("INSERT INTO library_pin(singleton,id,payload) VALUES(1,\(item.id),?)", seal(JSONEncoder().encode(item), domain: "pin:\(item.id)"))
        }
    }

    private func readPin() throws -> WallpaperItem? {
        var pin: WallpaperItem?
        try rows("SELECT id,payload FROM library_pin") {
            let id = Int(sqlite3_column_int64($0, 0))
            pin = try decode(Self.blob($0, 1), id: id, domain: "pin:\(id)")
        }
        return pin
    }

    private func readAll(kind: Kind) throws -> [WallpaperItem] {
        var result: [WallpaperItem] = []
        try rows("SELECT id,payload FROM library_records WHERE kind=\(kind.rawValue) ORDER BY sort_order DESC,id") {
            let id = Int(sqlite3_column_int64($0, 0))
            result.append(try decode(Self.blob($0, 1), id: id, domain: "item:\(kind.rawValue):\(id)"))
        }
        return result
    }

    private func transaction(_ body: () throws -> Void) throws {
        try exec("BEGIN IMMEDIATE")
        do { try body(); try exec("COMMIT") }
        catch { try? exec("ROLLBACK"); throw error }
    }

    private func protectFiles() throws {
        for suffix in ["", "-wal", "-shm"] {
            let url = URL(fileURLWithPath: databaseURL.path + suffix)
            if FileManager.default.fileExists(atPath: url.path) { try PrivateFileAccess.secureFile(at: url) }
        }
    }

    // MARK: - Crypto

    private func seal(_ data: Data, domain: String) throws -> Data {
        guard let key else { throw StoreError.invalidKey }
        let box = try AES.GCM.seal(data, using: key, authenticating: Data("LiveWall.user-library.v1:\(domain)".utf8))
        guard let combined = box.combined else { throw StoreError.crypto }
        return Data([1]) + combined
    }

    private func open(_ data: Data, domain: String) throws -> Data {
        guard let key, data.first == 1 else { throw StoreError.crypto }
        do {
            return try AES.GCM.open(AES.GCM.SealedBox(combined: data.dropFirst()), using: key,
                                    authenticating: Data("LiveWall.user-library.v1:\(domain)".utf8))
        } catch { throw StoreError.crypto }
    }

    private func decode(_ data: Data, id: Int, domain: String) throws -> WallpaperItem {
        let item = try JSONDecoder().decode(WallpaperItem.self, from: open(data, domain: domain))
        guard item.id == id, item.playableURL != nil else { throw StoreError.malformedRecord }
        return item
    }

    private static func requireRegularFile(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw StoreError.invalidKey }
    }

    private static func loadKey(at url: URL, databaseExists: Bool) throws -> Data {
        if FileManager.default.fileExists(atPath: url.path) {
            try requireRegularFile(url)
            let bytes = try Data(contentsOf: url)
            guard bytes.count == 32 else { throw StoreError.invalidKey }
            try PrivateFileAccess.secureFile(at: url)
            return bytes
        }
        guard !databaseExists else { throw StoreError.invalidKey }
        try PrivateFileAccess.secureDirectory(at: url.deletingLastPathComponent())
        let material = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        let fd = Darwin.open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw StoreError.invalidKey }
        defer { Darwin.close(fd) }
        let written = material.withUnsafeBytes { Darwin.write(fd, $0.baseAddress, material.count) }
        guard written == material.count, Darwin.fsync(fd) == 0 else { throw StoreError.invalidKey }
        let directory = Darwin.open(url.deletingLastPathComponent().path, O_RDONLY | O_DIRECTORY)
        guard directory >= 0 else { throw StoreError.invalidKey }
        defer { Darwin.close(directory) }
        guard Darwin.fsync(directory) == 0 else { throw StoreError.invalidKey }
        return material
    }
}
