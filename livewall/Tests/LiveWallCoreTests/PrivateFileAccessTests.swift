import Foundation
import LiveWallCore

func privateFileAccessTests() {
    suite("私有存储权限与旧缓存清理") {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("LiveWallPrivateStorage-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let legacy = root.appendingPathComponent("legacy", isDirectory: true)
        let cache = root.appendingPathComponent("DataCache", isDirectory: true)

        test("目录和文件权限限制为当前用户") {
            do {
                try PrivateFileAccess.secureDirectory(at: legacy)
                let file = legacy.appendingPathComponent("private.json")
                try Data("{}".utf8).write(to: file)
                try PrivateFileAccess.secureFile(at: file)
                let directoryMode = (try FileManager.default.attributesOfItem(atPath: legacy.path)[.posixPermissions] as? NSNumber)?.intValue
                let fileMode = (try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber)?.intValue
                expectEqual(directoryMode, PrivateFileAccess.directoryPermissions, "目录权限为 0700")
                expectEqual(fileMode, PrivateFileAccess.filePermissions, "文件权限为 0600")
            } catch {
                expect(false, "创建或读取权限失败：\(error)")
            }
        }

        test("删除旧缓存但保留配置") {
            do {
                try Data("config".utf8).write(to: legacy.appendingPathComponent("config.json"))
                for name in [
                    "catalog.remote-cache.index.json",
                    "catalog.remote-cache.index.json.sig",
                    "catalog.remote-cache.slice.json",
                    "cover-1.jpg",
                ] {
                    try Data(name.utf8).write(to: legacy.appendingPathComponent(name))
                }
                try Data("legacy".utf8).write(to: legacy.appendingPathComponent("catalog.remote-cache.json"))
                let removed = try PrivateFileAccess.removeLegacyDataCache(from: legacy)
                expectEqual(removed.count, 5, "清理已知格式的五个旧缓存文件")
                expect(FileManager.default.fileExists(atPath: legacy.appendingPathComponent("config.json").path), "配置保留在私有目录")
                expect(!FileManager.default.fileExists(atPath: legacy.appendingPathComponent("cover-1.jpg").path), "旧封面缓存被清理")
                expect(!FileManager.default.fileExists(atPath: legacy.appendingPathComponent("catalog.remote-cache.index.json").path), "旧清单缓存被清理")
            } catch {
                expect(false, "旧缓存清理失败：\(error)")
            }
        }

        test("旧缓存清理不触碰新缓存目录") {
            do {
                let name = "catalog.remote-cache.slice.json"
                let destination = cache.appendingPathComponent(name)
                try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
                try Data("new".utf8).write(to: destination)
                try Data("old".utf8).write(to: legacy.appendingPathComponent(name))
                _ = try PrivateFileAccess.removeLegacyDataCache(from: legacy)
                expectEqual(try String(contentsOf: destination, encoding: .utf8), "new", "新目录缓存保持原内容")
            } catch {
                expect(false, "缓存冲突检查失败：\(error)")
            }
        }
    }
}
