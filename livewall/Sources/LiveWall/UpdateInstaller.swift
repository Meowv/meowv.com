import CryptoKit
import Foundation
import LiveWallCore

/// 把新版本 dmg 拉到下载目录 —— **到此为止，不安装**。
///
/// 为什么不直接替换 `/Applications` 里的自己：
///  1. 覆盖一个正在运行的 App 需要另一条 installer 进程（自替身 + 退出 + 落盘 + 重启），
///     那是一整套安装器，不是这个功能的体量；
///  2. 本 App 退出时要 `restoreUserWallpaper()` 把用户的原墙纸恢复回去，
///     被外部强行替换或杀掉时那一步就丢了，用户会以为壁纸被改坏；
///  3. `~/Downloads` 不需要管理员权限，装到 `/Applications` 则要弹系统认证框。
///
/// 所以这里的职责边界很清楚：**下载 + 校验 + 在 Finder 里选中**，剩下的交给用户拖。
enum UpdateInstaller {

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// 下载结果。
    struct Outcome {
        /// 落盘路径。
        let file: URL
        /// 实际字节数 —— 供调用方与清单里的 `sizeBytes` 对账（对不上只记日志，不阻断）。
        let byteCount: Int64
    }

    /// dmg 比视频大、也不该被 20 秒卡住，单独放宽。
    static let downloadTimeout: TimeInterval = 60

    /// dmg 的**单独**体积上限。
    ///
    /// 与 `FileDownloader.defaultMaxBytes`（64 MB，服务静态图与视频）分开：dmg 会随
    /// 资源增长，长到 64 MB 以上是完全正常的，而共用一个上限会让它变成一次
    /// 莫名其妙的「文件过大」失败。
    static let downloadMaxBytes: Int64 = 512 * 1024 * 1024

    static func downloadsDirectory() -> URL? {
        FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    }

    /// 下载并校验，返回落盘路径与实际大小。校验不符会**把文件删掉再抛错** ——
    /// 留一个坏文件在下载目录里比没有更糟：用户会拿它去装。
    @discardableResult
    static func download(_ feed: UpdateFeed) async throws -> Outcome {
        guard let directory = downloadsDirectory() else {
            throw Failure(message: "找不到下载目录")
        }
        let destination = directory.appendingPathComponent(feed.suggestedFileName)

        let byteCount: Int64
        do {
            byteCount = try await FileDownloader.download(
                feed.fileURL,
                to: destination,
                timeout: downloadTimeout,
                maxBytes: downloadMaxBytes
            )
        } catch {
            throw Failure(message: "下载失败：\(error.localizedDescription)")
        }

        // **无条件校验。** `sha256` 是必填字段（缺了或格式非法在解析阶段就被拒，
        // 根本走不到这里），所以刻意没有「服务端没给就跳过」这条路 ——
        // 那种写法会把「服务端漏填」悄悄降级成「不做校验」，正是要避免的。
        let actual: String
        do {
            actual = try sha256(of: destination)
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw Failure(message: "下载完成但无法读取校验：\(error.localizedDescription)")
        }
        guard feed.sha256Matches(actual) else {
            try? FileManager.default.removeItem(at: destination)
            throw Failure(message: "文件校验不符，已删除下载的文件")
        }

        return Outcome(file: destination, byteCount: byteCount)
    }

    /// 分块计算 SHA-256。
    ///
    /// **不一次性 `Data(contentsOf:)`**：dmg 可能几十 MB，而上限是 512 MB ——
    /// 为了一个摘要把整包读进常驻内存，对一个「常驻菜单栏、在意自身占用」的 App 是反讽。
    /// 分块后内存占用降到 1 MB 级别。
    private static func sha256(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
