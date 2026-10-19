import Foundation
import CryptoKit
@testable import LiveWallCore

private func backupItem(_ id: Int) -> WallpaperItem {
    WallpaperItem(id: id, title: "备份测试 \(id)", author: "测试作者", url: "https://example.test/\(id).mp4",
                  coverUrl: "https://example.test/\(id).jpg", durationSeconds: 42, tags: ["测试"], categoryIds: [1])
}

private func makeBackup(_ fixture: LibraryFixture, favorites: [Int] = [1, 2], disabled: [Int] = [3],
                        pin: WallpaperItem? = nil) async throws -> BackupArchive {
    var preferences = Preferences(localFolderPath: "/Volumes/离线磁盘/视频", intervalSeconds: 120,
                                  playbackOrder: .sequential, multiScreenPolicy: .perScreen,
                                  selectedCategoryID: 1, playFavorites: true, lockScreenPreview: false)
    preferences.perScreenSources.setItemID(2, for: 7)
    preferences.hotKeyOverrides["nextItem"] = HotKeyBinding(key: "J", modifiers: HotKeyBinding.command | HotKeyBinding.control)
    try fixture.writeLegacy(preferences)
    let store = try fixture.store()
    _ = try await store.prepare(configURL: fixture.config)
    for id in favorites.reversed() { _ = try await store.setFavorite(backupItem(id), enabled: true) }
    for id in disabled.reversed() { _ = try await store.setDisabled(backupItem(id), enabled: true) }
    if let pin { _ = try await store.setPinned(pin) }
    let snapshot = try await store.exportSnapshot()
    let archive = try BackupArchive(preferences: preferences, snapshot: snapshot, appVersion: "test")
    await store.close()
    return archive
}

private func originalFiles(_ fixture: LibraryFixture) throws -> [String: Data] {
    let names = ["config.json", "user-library.sqlite3", ".user-library-key", "user-library.sqlite3-wal", "user-library.sqlite3-shm"]
    var files: [String: Data] = [:]
    for name in names {
        let url = fixture.directory.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: url.path) { files[name] = try Data(contentsOf: url) }
    }
    return files
}

private func expectRestored(_ fixture: LibraryFixture, archive: BackupArchive, favorites: [Int] = [1, 2], disabled: Set<Int> = [3]) async throws {
    let store = try fixture.store()
    let index = try await store.prepare(configURL: fixture.config)
    expectEqual(try await store.orderedIDs(kind: .favorites), favorites, "恢复收藏顺序")
    expectEqual(index.disabledIDs, disabled, "恢复禁用")
    let settings = try JSONDecoder().decode(Preferences.self, from: archive.settings).sanitized()
    expectEqual(Preferences.loadSettings(from: fixture.config).sanitized(), settings, "恢复设置与每屏记忆")
    try await store.validateContents()
    await store.close()
}

private func mutatedArchive(_ archive: BackupArchive, _ edit: (inout [String: Any]) -> Void) throws -> BackupArchive {
    let data = try PropertyListEncoder().encode(archive)
    var object = try PropertyListSerialization.propertyList(from: data, format: nil) as! [String: Any]
    edit(&object)
    let changed = try PropertyListSerialization.data(fromPropertyList: object, format: .binary, options: 0)
    return try PropertyListDecoder().decode(BackupArchive.self, from: changed)
}

func backupTests() {
    suite("备份与恢复") {
        test("WAL 快照、完整条目、排序、配置与跨目录往返") {
            runLibraryTest {
                let source = LibraryFixture(), target = LibraryFixture()
                defer { source.clean(); target.clean() }
                let store = try source.store()
                try source.writeLegacy(Preferences())
                _ = try await store.prepare(configURL: source.config)
                _ = try await store.setFavorite(backupItem(1), enabled: true)
                _ = try await store.setFavorite(backupItem(2), enabled: true)
                expect(FileManager.default.fileExists(atPath: source.database.path + "-wal"), "快照时 WAL 仍存在")
                let snapshot = try await store.exportSnapshot()
                let archive = try BackupArchive(preferences: Preferences(), snapshot: snapshot, appVersion: "test")
                let file = source.directory.appendingPathComponent("export.livewallbackup")
                try archive.write(to: file)
                let read = try BackupArchive.read(from: file)
                let summary = try await read.validate()
                expectEqual(summary.favoriteCount, 2, "包含 WAL 中收藏")
                let permission = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber
                expectEqual(permission?.intValue, 0o600, "导出文件 0600")
                await store.close()
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(read)
                let outcome = try await service.applyPending()
                expectEqual(outcome?.restored, true, "跨目录恢复成功")
                try await expectRestored(target, archive: read, favorites: [2, 1], disabled: [])
                let restoredStore = try target.store()
                _ = try await restoredStore.prepare(configURL: target.config)
                expectEqual(try await restoredStore.item(id: 2), backupItem(2), "完整条目字段保留")
                await restoredStore.close()
                expect(try await service.applyPending() == nil, "已提交事务不重复恢复")
            }
        }
        test("空库与本地固定项独立恢复") {
            runLibraryTest {
                let source = LibraryFixture(), target = LibraryFixture()
                defer { source.clean(); target.clean() }
                let pin = WallpaperItem(id: -7, title: "本地视频", author: "", url: "file:///Volumes/missing/movie.mp4")
                let archive = try await makeBackup(source, favorites: [], disabled: [], pin: pin)
                let summary = try await archive.validate()
                expectEqual(summary.favoriteCount, 0, "空收藏")
                expect(summary.hasPinnedItem, "保留本地固定快照")
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(archive)
                _ = try await service.applyPending()
                let store = try target.store()
                let index = try await store.prepare(configURL: target.config)
                expectEqual(index.pinned, pin, "离线本地固定项不丢失")
                expectEqual(Preferences.loadSettings(from: target.config).localFolderPath, "/Volumes/离线磁盘/视频", "保留不可用路径")
                await store.close()
            }
        }
        test("正常设置、快捷键和每屏记忆往返；自动备份可用于撤销") {
            runLibraryTest {
                let source = LibraryFixture(), target = LibraryFixture(), undo = LibraryFixture()
                defer { source.clean(); target.clean(); undo.clean() }
                let archive = try await makeBackup(source, pin: backupItem(2))
                _ = try await makeBackup(target, favorites: [9], disabled: [], pin: nil)
                let beforeConfig = try Data(contentsOf: target.config)
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(archive)
                expectEqual(try Data(contentsOf: target.config), beforeConfig, "暂存不替换当前配置")
                expectThrows("拒绝导出到符号链接") {
                    let link = target.directory.appendingPathComponent("link.livewallbackup")
                    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target.config)
                    try archive.write(to: link)
                }
                let outcome = try await service.applyPending()!
                try await expectRestored(target, archive: archive)
                let automatic = try BackupArchive.read(from: outcome.backupDirectory.appendingPathComponent("before-restore.livewallbackup"))
                let undoService = BackupRestoreService(directory: undo.directory)
                try await undoService.stage(automatic)
                _ = try await undoService.applyPending()
                try await expectRestored(undo, archive: automatic, favorites: [9], disabled: [])
                for url in [outcome.backupDirectory, target.directory.appendingPathComponent("Backups")] {
                    let mode = try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber
                    expectEqual(mode?.intValue, 0o700, "自动备份目录 0700")
                }
                let external = target.directory.appendingPathComponent("用户选择的目录", isDirectory: true)
                try FileManager.default.createDirectory(at: external, withIntermediateDirectories: true)
                try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: external.path)
                try archive.write(to: external.appendingPathComponent("saved.livewallbackup"))
                let mode = try FileManager.default.attributesOfItem(atPath: external.path)[.posixPermissions] as? NSNumber
                expectEqual(mode?.intValue, 0o755, "导出不修改用户选择的父目录权限")
            }
        }
        test("拒绝损坏、不兼容、密钥错误与损坏记录") {
            runLibraryTest {
                let source = LibraryFixture()
                defer { source.clean() }
                let archive = try await makeBackup(source)
                expectThrows("拒绝新版容器") { try mutatedArchive(archive) { $0["version"] = 99 }.checkEnvelope() }
                expectThrows("拒绝摘要不符") { try mutatedArchive(archive) { $0["database"] = Data([1, 2, 3]) }.checkEnvelope() }
                let wrongKey = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
                let wrong = try BackupArchive(preferences: Preferences(), snapshot: .init(database: archive.database, key: wrongKey), appVersion: "test")
                do { _ = try await wrong.validate(); expect(false, "错配密钥应失败") }
                catch { expect(true, "错配密钥被拒绝") }
                let broken = try BackupArchive(preferences: Preferences(), snapshot: .init(database: Data([1, 2, 3]), key: archive.libraryKey), appVersion: "test")
                do { _ = try await broken.validate(); expect(false, "损坏 SQLite 应失败") }
                catch { expect(true, "损坏 SQLite 被拒绝") }
                let file = source.directory.appendingPathComponent("bad.livewallbackup")
                try Data([1, 2, 3]).write(to: file)
                expectThrows("非备份文件被拒绝") { _ = try BackupArchive.read(from: file) }
                let store = try source.store()
                _ = try await store.prepare(configURL: source.config)
                await store.close()
                try source.sql("UPDATE library_records SET payload=x'010203' WHERE id=1")
                let damagedStore = try source.store()
                _ = try await damagedStore.prepare(configURL: source.config)
                do { _ = try await damagedStore.exportSnapshot(); expect(false, "逐条解密应发现损坏") }
                catch { expect(true, "逐条解密发现损坏记录") }
                await damagedStore.close()
            }
        }
        test("当前数据库损坏或密钥丢失仍可恢复，原始现场保留") {
            runLibraryTest {
                for missingKey in [false, true] {
                    let source = LibraryFixture(), target = LibraryFixture()
                    defer { source.clean(); target.clean() }
                    let archive = try await makeBackup(source)
                    try PrivateFileAccess.secureDirectory(at: target.directory)
                    try Data("broken database".utf8).write(to: target.database)
                    try Data("broken config".utf8).write(to: target.config)
                    if !missingKey { try Data([1, 2, 3]).write(to: target.key) }
                    let before = try originalFiles(target)
                    let service = BackupRestoreService(directory: target.directory)
                    try await service.stage(archive)
                    let outcome = try await service.applyPending()!
                    let original = try PropertyListDecoder().decode([String: Data].self,
                        from: Data(contentsOf: outcome.backupDirectory.appendingPathComponent("original.plist")))
                    expectEqual(original, before, "损坏现场完整保留")
                    try await expectRestored(target, archive: archive)
                }
            }
        }
        test("原始库含未检查点 WAL 时自动备份仍可直接恢复") {
            runLibraryTest {
                let source = LibraryFixture(), old = LibraryFixture(), target = LibraryFixture()
                defer { source.clean(); old.clean(); target.clean() }
                let archive = try await makeBackup(source)
                try old.writeLegacy(Preferences())
                let oldStore = try old.store()
                _ = try await oldStore.prepare(configURL: old.config)
                _ = try await oldStore.setFavorite(backupItem(8), enabled: true)
                let files = try originalFiles(old)
                expect(files["user-library.sqlite3-wal"] != nil, "原始现场包含 WAL")
                await oldStore.close()
                try PrivateFileAccess.secureDirectory(at: target.directory)
                for (name, data) in files { try data.write(to: target.directory.appendingPathComponent(name)) }
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(archive)
                let outcome = try await service.applyPending()!
                let automatic = try BackupArchive.read(from: outcome.backupDirectory.appendingPathComponent("before-restore.livewallbackup"))
                expectEqual(try await automatic.validate().favoriteCount, 1, "自动备份包含 WAL 中收藏")
                try await service.stage(automatic)
                _ = try await service.applyPending()
                let restored = try target.store()
                _ = try await restored.prepare(configURL: target.config)
                expectEqual(try await restored.orderedIDs(kind: .favorites), [8], "原始 WAL 收藏可找回")
                await restored.close()
            }
        }
        test("逐阶段中断后继续恢复，不加载混合状态") {
            runLibraryTest {
                let steps: [BackupRestoreService.Step] = [.originalSaved, .replacing("config.json"),
                    .replacing("user-library.sqlite3"), .replacing(".user-library-key"), .sidecarsRemoved, .verified, .committed]
                for step in steps {
                    let source = LibraryFixture(), target = LibraryFixture()
                    defer { source.clean(); target.clean() }
                    let archive = try await makeBackup(source)
                    _ = try await makeBackup(target, favorites: [9], disabled: [])
                    let service = BackupRestoreService(directory: target.directory)
                    try await service.stage(archive)
                    do {
                        _ = try await service.applyPending { if $0 == step { throw BackupRestoreService.Interrupted.simulated } }
                        expect(false, "应模拟中断")
                    } catch is BackupRestoreService.Interrupted { expect(service.hasPendingRestore, "中断时保留事务") }
                    let outcome = try await service.applyPending()
                    expectEqual(outcome?.restored, true, "中断后完成恢复")
                    try await expectRestored(target, archive: archive)
                }
            }
        }
        test("替换失败回退；回退中断与失败后仍可继续") {
            runLibraryTest {
                for stopDuringRollback in [false, true] {
                    let source = LibraryFixture(), target = LibraryFixture()
                    defer { source.clean(); target.clean() }
                    let archive = try await makeBackup(source)
                    let old = try await makeBackup(target, favorites: [9], disabled: [])
                    let before = try originalFiles(target)
                    let service = BackupRestoreService(directory: target.directory)
                    try await service.stage(archive)
                    do {
                        let outcome = try await service.applyPending { step in
                            if step == .replacing("user-library.sqlite3") { throw BackupError.io }
                            if stopDuringRollback, step == .rollbackFile("config.json") {
                                throw BackupRestoreService.Interrupted.simulated
                            }
                        }
                        expectEqual(outcome?.restored, false, "写入失败自动回退")
                    } catch is BackupRestoreService.Interrupted {
                        expect(service.hasPendingRestore, "回退中断保留材料")
                        let outcome = try await service.applyPending()
                        expectEqual(outcome?.restored, false, "下次启动继续回退")
                    }
                    expectEqual(try originalFiles(target), before, "回退后原始文件逐字节相同")
                    try await expectRestored(target, archive: old, favorites: [9], disabled: [])
                }
            }
        }
        test("最终校验失败回退，回退写入失败则保留事务等待重试") {
            runLibraryTest {
                let source = LibraryFixture(), target = LibraryFixture()
                defer { source.clean(); target.clean() }
                let archive = try await makeBackup(source)
                let old = try await makeBackup(target, favorites: [9], disabled: [])
                let before = try originalFiles(target)
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(archive)
                do {
                    _ = try await service.applyPending { step in
                        if step == .sidecarsRemoved { try target.sql("UPDATE library_records SET payload=x'010203' WHERE id=1") }
                        if step == .rollingBack { throw BackupError.io }
                    }
                    expect(false, "回退写入失败应停止启动")
                } catch { expect(service.hasPendingRestore, "最终校验失败保留回退事务") }
                let outcome = try await service.applyPending()
                expectEqual(outcome?.restored, false, "重试回退成功")
                expectEqual(try originalFiles(target), before, "恢复原始文件而非混合状态")
                try await expectRestored(target, archive: old, favorites: [9], disabled: [])
            }
        }
        test("回退材料损坏时停止恢复，不覆盖正式文件") {
            runLibraryTest {
                let source = LibraryFixture(), target = LibraryFixture()
                defer { source.clean(); target.clean() }
                let archive = try await makeBackup(source)
                _ = try await makeBackup(target, favorites: [9], disabled: [])
                let before = try originalFiles(target)
                let service = BackupRestoreService(directory: target.directory)
                try await service.stage(archive)
                do {
                    _ = try await service.applyPending { if $0 == .originalSaved { throw BackupRestoreService.Interrupted.simulated } }
                } catch is BackupRestoreService.Interrupted {}
                let backups = target.directory.appendingPathComponent("Backups")
                let saved = try FileManager.default.contentsOfDirectory(at: backups, includingPropertiesForKeys: nil)[0]
                try PropertyListEncoder().encode([String: Data]()).write(to: saved.appendingPathComponent("original.plist"))
                do { _ = try await service.applyPending(); expect(false, "损坏材料应停止恢复") }
                catch { expect(service.hasPendingRestore, "损坏材料时保留恢复事务") }
                expectEqual(try originalFiles(target), before, "回退材料损坏未覆盖原数据")
            }
        }
    }
}
